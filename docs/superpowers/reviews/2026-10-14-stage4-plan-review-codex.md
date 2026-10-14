# Stage 4 채팅 계획 리뷰

검토 기준은 설계 명세 §5.4, §8.3, §9와 현재 `@supabase/realtime-js@2.117.2` 구현이다. 코드 변경은 하지 않았으며, 아래 항목을 반영한 뒤 구현을 시작하는 것이 안전하다.

## Critical

### 1. 방 채널 제거 직후 같은 topic 재구독이 유실된다

- 위치: Task 4 Step 2 `listen` cleanup, Task 5 Step 2 `ChatProvider`의 room diff / cleanup
- 실패 시나리오: 방 목록 refetch 또는 React StrictMode의 effect cleanup→재실행에서 `unsubscribe()`가 `void supabase.removeChannel(channel)`을 호출하고 Map에서 즉시 삭제한다. 다음 effect가 같은 `room:<id>`를 생성하면 realtime-js `channel()`은 아직 teardown되지 않은 기존 channel을 반환한다. 그 channel은 `unsubscribe` 중이라 `subscribe()`가 새 join/callback을 등록하지 않고, 뒤늦은 teardown은 topic을 제거한다. 결과적으로 해당 방은 이후 영구적으로 재구독되지 않고 snapshot도 받지 못한다.
- 근거: 2.117.2 `RealtimeClient.channel()`은 동일 topic을 `getChannels()`에서 찾아 그대로 반환하며, `removeChannel()`은 `await channel.unsubscribe()`가 성공한 뒤에만 teardown한다.
- 수정 제안: room subscription의 상태를 `active/leaving`과 `Promise<void>`로 관리해 제거 완료 후에만 동일 topic을 새로 만들거나, 제거 대상 채널을 Map에 남긴 채 `await removeChannel` 후 최신 desired-set을 다시 reconcile한다. StrictMode mount/unmount/mount와 방 제거 후 즉시 재추가를 자동 테스트에 넣는다.

### 2. snapshot 교체가 fetch 중 받은 Realtime 메시지를 버린다

- 위치: Task 3 Step 3 `mergeSnapshot`, Task 5 Step 5 `sync`
- 실패 시나리오: 재연결 직후 snapshot 요청이 id 100~129를 읽고, 응답 전에 broadcast id 130을 받아 state에 병합한다. 응답 처리 시 `last=130`, `latest[0]=100`이면 병합이라 안전하지만, 반대 순서(기존 state가 1~2, broadcast id 130 수신, snapshot이 100~129)에서는 updater가 기존 마지막을 130으로 본다. 더 흔하게 broadcast가 updater와 다른 batching 순서로 처리되어 `last=2`일 때 `latest[0] > last`이고 latest가 30개면 `replaced=true`가 되어 id 130을 통째로 제거할 수 있다. DB event와 fetch의 순서는 보장되지 않는다.
- 수정 제안: subscribe 완료 시점의 event watermark/generation을 저장하고, snapshot을 적용할 때 snapshot 이후 들어온 메시지는 반드시 다시 합친다. 교체 조건도 snapshot의 최댓값보다 큰 현재 메시지가 있으면 교체하지 말고 최신 페이지와 그 tail을 합치도록 한다. `fetchMessages` 지연 중 message event를 주입하는 훅 테스트를 추가한다.

### 3. 읽음 snapshot의 참여자와 화면의 참여자가 달라 unread가 틀린다

- 위치: Task 5 Step 5 `sync`, 마지막 `toViews` 호출
- 실패 시나리오: `sync`는 `listParticipants()` 결과로 `readState`만 갱신하지만, `toViews`에는 React Query의 오래된 `room.participants`를 전달한다. 새 초대/나가기/강퇴와 room-cache refetch 사이에는 새 참여자는 분모에 없고, 떠난 참여자는 계속 분모에 남는다. 따라서 §8.3의 “snapshot(메시지 + 참여자 last_read) 후 unread 계산”을 충족하지 못한다.
- 수정 제안: `RoomState`에 snapshot participants를 저장하고 `toViews`에 그것을 우선 전달하거나, snapshot 성공 시 room query cache를 같은 participants로 원자적으로 갱신한다. 참가자 변경 직후 첫 snapshot에서 unread를 검증하는 테스트를 추가한다.

## Important

### 4. 이미 떠난 방도 늦은 sync 응답으로 mark_read 된다

- 위치: Task 5 Step 5 `sync`, 입장 effect와 `markReadIfVisible`
- 실패 시나리오: A 방 진입 후 `fetchMessages/listParticipants`가 진행 중인 상태에서 B 방으로 이동하거나 A에서 강퇴된다. A 응답이 나중에 오면 `sync(A)`는 현재 선택/열람 여부를 확인하지 않고 visible인 것만 보고 `markRead(A)`를 호출한다. 명세의 조건인 “메시지 수신 && 탭 visible && 그 방이 열려 있음”을 어기며, 강퇴 직후에는 불필요한 권한 오류도 발생한다.
- 수정 제안: 현재 room id와 per-room sync generation을 ref로 보관하고, 응답 적용 및 `markRead` 직전에 generation과 실제 viewing room이 일치하는지 확인한다. room switch/자기 member_removed 중 in-flight fetch 테스트를 추가한다.

### 5. 자기 세션 삭제 force_logout를 무시할 수 있다

- 위치: Task 4 Step 4 `getCurrentSessionId`, Task 5 Step 2 user-channel force_logout 처리
- 실패 시나리오: 서버가 이 탭의 `auth.sessions` row를 삭제한 뒤 local auth가 먼저 세션을 비우면, event의 `sessionId`는 존재하지만 `getCurrentSessionId()`는 `null`이다. 계획의 `e.sessionId !== null` 비교는 이를 “다른 기기”로 오인하여 toast/signOut을 건너뛴다. §9는 자기 세션 삭제를 즉시 로그아웃으로 처리해야 한다.
- 수정 제안: 로그인 시 session id를 provider ref에 보관해 local session이 사라져도 비교하고, `session_deleted`는 cached id와 같을 때 처리한다. own-session deletion, other-device deletion, local signOut 중 delivery를 각각 테스트한다.

### 6. self member_removed는 즉시 선택 해제·구독 해제가 아니다

- 위치: Task 5 Step 2 user-channel handler 및 room `member_removed` 처리
- 실패 시나리오: 자기 자신은 participants DELETE 후 room 수신 권한을 잃어 room event를 못 받을 수 있으므로 user event가 유일한 신호다. 현재 handler는 invalidate만 하고, refetch가 끝날 때까지 선택한 방/화면 state/room channel을 유지한다. 네트워크 지연이나 refetch 실패 시 스펙 §8.3의 “방 목록 제거, 구독 해제, 열려 있으면 닫기”가 수행되지 않는다.
- 수정 제안: user `member_removed`가 self이면 즉시 `setPickedRoomId(null)`, `setViewingRoom(null)`, 해당 unsubscribe와 local message state 폐기를 한 뒤 background refetch한다. 해당 방을 열어 둔 자기 강퇴 테스트를 추가한다.

### 7. 상단에서 과거 페이지를 연속 자동 로드할 수 있다

- 위치: Task 5 Step 6 `MessageList.handleScroll` / `useLayoutEffect`
- 실패 시나리오: 사용자가 `scrollTop < 40`에서 `loadOlder`를 호출한다. 새 페이지 뒤 `keep-offset`은 이전 top 위치(대개 0)를 유지하고, programmatic `scrollTop` 변경의 scroll event가 발생하면 `loadingOlder`가 false가 된 뒤 다시 `onLoadOlder()`를 호출한다. 페이지가 있는 동안 사용자의 추가 스크롤 없이 연쇄 요청할 수 있다.
- 수정 제안: load를 시작한 top-edge transition을 ref로 latch하고 사용자가 threshold 밖으로 나갔다가 다시 들어올 때만 다음 요청을 허용하거나, prepend 후 한 프레임 동안 scroll trigger를 억제한다. 2페이지 이상인 top-load와 빈 페이지 뒤 재진입을 DOM 테스트로 검증한다.

## Minor

### 8. test gate가 계획의 핵심 reconnect/race를 검증하지 않는다

- 위치: Task 2 Step 6~7, Task 3 Step 1, Task 6 Step 1~2
- 실패 시나리오: `verify-chat.mjs`는 최초 `SUBSCRIBED`와 event 계약만 확인한다. channel rejoin에서 `SUBSCRIBED`가 다시 callback 되는 동작 자체는 realtime-js에서 기대할 수 있으나, 계획의 `subscribe → SUBSCRIBED → snapshot → merge → mark_read` 재수행·동시 이벤트 보존·동일-topic unsubscribe race는 전혀 실행하지 않는다. Task 3 순수 함수 test도 hook/provider의 in-flight ordering을 재현하지 못한다.
- 수정 제안: fake realtime channel을 주입 가능한 서비스로 만들고 (1) rejoin callback 2회, (2) remove 중 재구독, (3) snapshot과 event 교차, (4) hidden→visible 및 room switch를 component/hook test로 추가한다. 실제 두 브라우저 수동 확인에는 절전/네트워크 offline-online도 명시한다.

### 9. snapshot 직후 mark_read의 결과를 local readState에 반영하지 않는다

- 위치: Task 5 Step 5 `markReadIfVisible`
- 실패 시나리오: 자신의 `read_update` broadcast가 RLS/연결 공백으로 늦거나 유실되면 서버에는 읽음이 반영돼도 자신의 화면 `readState`는 이전 snapshot 값으로 남는다. 특히 재접속 직후 unread UI가 잠시 오래된 값으로 보일 수 있다.
- 수정 제안: `markRead`의 반환 id가 null이 아니면 local state도 `bumpRead(me, id)`로 즉시 갱신하고, 이후 broadcast는 단조 병합만 하게 한다. 이는 다른 참여자의 unread 계산에도 일관적이다.

### 10. 매퍼의 profiles/replyTargets 중복 계약과 테스트가 없다

- 위치: Task 2 Step 4 `toMessagePage`, Step 1 매퍼 테스트
- 실패 시나리오: 같은 발신자가 30개 메시지를 보내면 `profiles`와 동일 reply target이 중복 배열로 누적된다. 현재 UI의 record 변환은 우연히 덮어쓰지만, `MessagePage`가 “수집” 결과라는 API 계약은 불필요하게 커지고 후속 소비자가 중복을 표시할 위험이 있다.
- 수정 제안: id 기준 dedupe를 mapper 경계에서 명시하고, 중복 sender/reply가 있는 test와 deleted reply의 mapper 결과를 추가한다.

## 확인한 사항

- Task 4의 `subscribeRoom`은 실제로 `onSubscribed`를 전달하므로 `SUBSCRIBED`를 `RoomEvent`로 변환하는 코드는 빠져 있지 않다. realtime-js 2.117.2도 join 성공 callback을 rejoin 경로에서 재사용하므로 재연결 시 callback 수신을 전제로 하는 설계 자체는 타당하다.
- 제시된 Task 2 매퍼 assertions와 구현(`fromMessagePayload`의 `editedAt/deletedAt: null`, code-point 길이 계산)은 서로 일치한다. 확인한 계획 코드에는 React hooks v6의 명백한 `set-state-in-effect`/render 중 ref write lint error는 없었으나, 위 lifecycle 경합은 lint가 잡지 못한다.
