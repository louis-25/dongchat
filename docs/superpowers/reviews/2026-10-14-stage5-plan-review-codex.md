# Stage 5 관리자 계획 리뷰 (Codex)

## Critical

### 1. 중복 `watchRoom` 해제가 아직 남아 있는 구독까지 제거한다

- 위치: Task 4 / Step 2 (`watchRoom`)
- 실패 시나리오: 같은 방 상세가 중첩 렌더되거나 Strict Mode/빠른 전환으로 `watchRoom(42)`가 두 번 호출되면 `watched`는 `[42, 42]`이 된다. 첫 cleanup은 `indexOf`의 한 항목만 제거해도 되지만, 렌더/cleanup 순서에 따라 한 소비자가 남았는데도 배열이 `[]`가 될 수 있으며 diff effect가 `room:42`를 해제한다. 인터페이스가 명시한 “여러 번 호출 가능”과 맞지 않고, 남은 상세 화면은 이후 Realtime을 받지 못한다.
- 제안: `Map<number, number>` 참조 수(증가/감소) 또는 `Set` + 호출별 토큰을 사용해 마지막 소비자가 해제할 때만 topic을 제거한다. 이 동작을 Strict Mode 및 같은 id 두 소비자 테스트로 검증한다.

### 2. 방 삭제/퇴장 Realtime이 관리자 방 목록을 갱신하지 않는다

- 위치: Task 4 / Step 6, Task 5 / Step 2-7
- 실패 시나리오: 관리자가 보고 있는 방에서 마지막 참여자가 나가 방이 삭제되면 관리자 `watchRoom`은 `member_removed`를 받지만 `ChatProvider.emit`은 `ROOMS_QUERY_KEY`(관리자 자신의 방)만 invalidate한다. `ADMIN_ROOMS_QUERY_KEY`는 강퇴 mutation 성공 때만 invalidate되므로, 다른 사용자의 나가기/삭제 후 `/admin/rooms` 목록과 선택 상세가 그대로 남는다. 따라서 계획이 요구한 “목록에서 사라지면 선택 해제”와 브라우저 확인 7번이 성립하지 않는다.
- 제안: 관리자 방 페이지/상세에서 해당 방의 `member_removed`를 받아 `ADMIN_ROOMS_QUERY_KEY`를 invalidate하고, 응답에서 선택 id가 없으면 선택을 해제한다. 페이지가 삭제로 범위를 벗어난 경우도 마지막 유효 페이지를 다시 요청하도록 처리한다.

### 3. `admin_list_users`의 정지 상태가 실제 활성 세션 판정과 다르다

- 위치: Task 1 / Step 3 및 Task 3 / Step 2 (전제 RPC `admin_list_users`)
- 실패 시나리오: `private.is_active_session()`은 `auth.users.banned_until`과 `private.user_access.banned_until` 둘 다 확인하지만, 실제 RPC는 후자(`a.banned_until`)만 `bannedUntil`으로 반환한다. Studio/Auth의 기본 ban으로 사용자를 정지하면 UI는 “정상”과 정지 버튼을 표시하지만 DB는 모든 데이터 접근을 막는다. `admin_unban`도 private 값만 비워 이 상태를 해제하지 못한다.
- 제안: RPC에서 두 시각 중 실제 유효한 더 늦은 값을 반환하고, 어떤 ban 원천을 UI가 해제할 수 있는지 정책을 명시한다. 기본 Auth ban을 지원하지 않을 것이라면 관리자 화면 및 검증 스크립트에서 그 전제를 강제/문서화한다.

## Important

### 4. 보호 레이아웃으로 Provider를 옮기면 인증 확정 전 `useRooms`가 실행된다

- 위치: Task 4 / Step 1
- 실패 시나리오: `ChatProvider`는 `useAuth()`와 무관하게 즉시 `useRooms()`를 호출하며, `useRooms`에는 `enabled: !!user`가 없다. 세션/`get_me()`가 아직 확정되지 않은 첫 렌더에서 `listRooms()`가 실행되면 무세션/만료 세션 오류가 `['rooms']` 쿼리에 남고, 관리자 페이지를 포함한 모든 `(protected)` 경로가 불필요하게 방 목록 요청·Realtime 구독 후보 처리를 수행한다. 이는 기존 채팅 전용 배치보다 범위를 넓힌 부작용이다.
- 제안: `useRooms`에 명시적 `enabled`를 추가해 인증된 user id가 있을 때만 호출하고, 로그아웃/사용자 변경 시 방 캐시와 구독을 즉시 비운다. `ProtectedLayout`의 `useAuth`와 Provider가 같은 로딩 상태에서 어떻게 동작하는지도 테스트한다.

### 5. 관리자 가드는 로딩 중/`user === null`에서 무한 공백이며, 비관리자 redirect 조건도 불완전하다

- 위치: Task 3 / Step 1
- 실패 시나리오: `isLoading` 중에도 `!user?.isAdmin`으로 `null`을 반환하므로 관리자 URL이 빈 화면으로 보인다. 로딩이 끝나 `user === null`인 경우에는 이 layout effect가 redirect하지 않으며 부모 `useAuth`의 별도 effect에 우연히 의존한다. 인증 오류·캐시 전환 때 의도한 “관리자 화면을 보이지 않고 `/chat/friends`” 경로가 layout 자체에서 보장되지 않는다.
- 제안: `isLoading`에는 로딩 UI를, 인증 완료 후 `user === null`에는 로그인 흐름을, `user && !isAdmin`에는 채팅 redirect를 명시적으로 분리한다. `router.replace` 중에도 children을 렌더하지 않게 유지한다.

### 6. `verify-admin.mjs` 정리가 불완전하여 반복 실행 시 계약 검증이 불안정해진다

- 위치: Task 2 / Step 1 및 Task 5 / Step 3
- 실패 시나리오: script는 만든 group을 남긴 채 u1을 강제 로그아웃하고, 1:1도 u2만 나가게 해 u1이 남은 방·메시지·test users·`user_access` 행을 계속 축적한다. 반복 실행 후 `recent()`의 limit 100 밖으로 대상이 밀리면 `find(u1.id)`가 `undefined`가 되어 key assertion이 실패하며, 이후 pgTAP가 전역 조건을 검사하는 경우에도 테스트 fixture가 오염된다.
- 제안: `try/finally`로 생성한 user/room/access를 service-role/허용된 관리 SQL로 완전히 제거하거나, 각 검증을 고유 id 조건으로 제한한다. 특히 Task 5의 DB 테스트 전에는 모든 verifier fixture와 삭제 메시지를 제거하도록 실제 명령을 계획에 넣는다.

### 7. 방 목록 페이지 범위가 줄면 잘못된 페이지 번호와 빈 목록에 머문다

- 위치: Task 4 / Step 6
- 실패 시나리오: page 3을 보고 있을 때 마지막 방들이 삭제되어 totalPages가 1이 되면 화면은 `3 / 1`, 빈 목록, 비활성 다음 버튼이 된다. 사용자가 이전을 반복해야 회복하며 선택 해제 요구도 UX적으로 불완전하다.
- 제안: fetch 결과의 `total/page/limit`으로 유효 페이지를 계산해 범위 밖이면 마지막 페이지를 요청하거나, 페이지 변경/목록 invalidation 시 선택과 페이지를 함께 정규화한다. effect 안의 동기 `setState`는 React hooks lint 규칙에 걸릴 수 있으므로 query key/이벤트 경로에서 설계한다.

## Minor

### 8. 관리자 열람의 `mark_read` 불호출은 구현상 맞지만 회귀 테스트가 없다

- 위치: Task 4 / Step 3, Step 5
- 실패 시나리오: 현재 `useChatMessages`의 `sync`, message event, visibility event는 모두 `markReadIfOpen`을 거치고 `isViewing`이 false이면 호출하지 않는다. 그러나 관리자 RoomDetail이 실수로 `setViewingRoom`을 추가하거나 guard가 바뀌어도 Node 통합 script는 UI hook 경로를 실행하지 않아 잡지 못한다.
- 제안: `markRead` mock을 둔 hook/component 테스트를 추가해 admin RoomDetail 마운트·Realtime·visibility 어느 경로도 호출하지 않음을 검증한다.

### 9. 정지 기간 테스트 수와 기대값은 맞지만 시간대 경계 검증이 부족하다

- 위치: Task 1 / Step 1, Step 4
- 실패 시나리오: 제시한 UTC 기준 `1d/7d/30d/permanent` 기대값은 올바르고 기존 28개에 두 test를 더해 30 pass가 맞다. 다만 UI는 로컬 `toLocaleString()`을 사용하므로 사용자가 보는 “1일” 종료 시각이 시간대/DST 경계에서 의도와 다른지 확인할 근거가 없다.
- 제안: 최소한 저장값은 UTC ISO, 표시값은 로컬 시간이라는 정책을 문서/테스트에 명시하고 만료 정확히 같은 시각에는 정상이라는 경계도 test한다.

### 10. React hooks lint에 대한 사전 확인 항목이 부족하다

- 위치: Task 4 / Step 2, Step 5
- 실패 시나리오: 계획의 `useEffect(() => watchRoom(...))`은 effect에서 state를 간접 변경한다. 현재 제시 코드만으로는 `set-state-in-effect`가 반드시 잡히는지 단정할 수 없지만, React 19 hooks 규칙/Strict Mode에서 재구독·cleanup 순서가 민감한 핵심 경로다.
- 제안: 구현 직후 `pnpm lint` 결과를 단순 통과 기준으로 두지 말고 Strict Mode에서 mount/unmount 및 중복 watch를 검증한다. 필요하면 watcher 등록을 이벤트/외부 store 또는 참조 수 기반 구독 API로 분리한다.

## 확인한 사항

- 현행 `useChatMessages`의 모든 `markRead` 호출 경로는 `markReadIfOpen → isViewing(id) && visibility` guard를 지난다. RoomDetail 계획은 `setViewingRoom`을 호출하지 않으므로 정상적인 unmount/route 전환에서는 관리자 비멤버 열람이 `mark_read`를 호출하지 않는다.
- RLS는 관리자에게 `messages` 및 `chat_room_participants` SELECT를 허용하고, realtime topic gate도 관리자 `room:<id>` 수신을 허용한다. 따라서 `participants: []`인 AdminRoom을 `Room`으로 매핑해 `fetchMessages`/`listParticipants`를 재사용하는 방향 자체는 가능하다.
- 현 기준 `client`의 `pnpm test`는 실제로 28 pass였고, Task 1의 신규 test 두 개를 더하면 계획의 30 pass 기대값은 일치한다. `PERMANENT_BAN`의 9999년 ISO 값과 제시한 날짜 산술 기대값도 맞는다.
- `MessageItem`의 계획된 `readOnly` 변경은 답장·수정·삭제·unread count를 모두 숨기는 조건으로 연결되어 있다. 다만 위의 구독/목록 갱신 결함을 먼저 해결해야 Stage 5의 실시간 열람 요구를 충족한다.
