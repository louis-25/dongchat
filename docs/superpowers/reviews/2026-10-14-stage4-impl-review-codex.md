# Stage 4 채팅 구현 리뷰

## Critical

발견 사항 없음.

## Important

### 1. 삭제된 현재 세션의 강제 로그아웃 통지를 무시할 수 있음

- 위치: `client/src/components/chat-provider.tsx:103`, `client/src/services/auth.ts:66`
- 실패 시나리오: 관리자가 현재 기기의 `auth.sessions` 행을 삭제하면 서버는
  `force_logout { sessionId }`를 보낸다. 이벤트가 도착하기 전에 클라이언트의
  세션 캐시가 비워진 경우 `getCurrentSessionId()`는 `null`을 반환하고,
  `e.sessionId !== null` 비교가 참이 되어 핸들러가 반환한다. 그 결과 현재
  기기가 로그인 화면으로 이동하지 않아, 명세 §9의 세션 삭제 즉시 로그아웃이
  보장되지 않는다.
- 제안: 로그인 직후 JWT의 `session_id`를 `ref`에 보관하고, `force_logout`의
  `sessionId`는 그 캐시된 값과 비교한다. `sessionId`가 없는 ban/revoked 이벤트는
  현재처럼 즉시 처리하고, 현재 세션 삭제/다른 기기 삭제/로컬 sign-out 중 수신을
  각각 검증하는 테스트를 추가한다.

### 2. 진행 중인 스냅샷이 이미 처리한 멤버 퇴장을 되돌려 unread 수가 틀어질 수 있음

- 위치: `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/hooks/useChatMessages.ts:74-85, 131-135, 209-215`
- 실패 시나리오: 방 A의 `fetchMessages`/`listParticipants` 요청이 진행 중일 때
  다른 참여자가 나가거나 강퇴된다. `member_removed` 이벤트는 먼저 도착해
  `participants`에서 그 사용자를 제거하지만, 뒤늦게 도착한 이전
  `listParticipants` 응답이 81행에서 오래된 전체 배열을 다시 대입한다.
  `current.participants`가 room-query의 최신 참여자보다 우선하므로 다음 재연결
  전까지 떠난 사용자가 unread 계산에 다시 포함될 수 있다.
- 제안: 방별 snapshot generation/abort token을 두어 최신 요청만 참여자 스냅샷을
  적용하거나, snapshot 도착 동안의 member add/remove 델타를 재적용한다. 요청 중
  멤버 제거 후 이전 응답이 완료되는 순서의 hook 테스트를 추가한다.

## Minor

### 1. `mark_read` 성공 후 로컬 읽음 상태를 낙관적으로 올리지 않음

- 위치: `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/hooks/useChatMessages.ts:56-60`
- 실패 시나리오: 방을 열어 `mark_read` RPC는 성공했지만, 자신의 `read_update`
  Broadcast가 일시적인 연결 공백에서 누락되면 `readState`는 이전 스냅샷 값에
  머문다. 이어서 수신한 메시지의 내 메시지 unread 표기가 잠시 또는 다음 sync까지
  과거 값으로 보일 수 있다.
- 제안: `markRead`가 반환한 id가 `null`이 아니면 `update(id, s => ({ ...s,
  readState: bumpRead(s.readState, userId, returnedId) }))`를 적용하고, 이후
  Broadcast는 단조 병합만 하게 한다.

### 2. 핵심 lifecycle 경쟁 조건을 자동 테스트가 재현하지 않음

- 위치: `client/src/components/chat-provider.tsx:69-107`, `client/src/services/realtime.ts:12-31`, `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/hooks/useChatMessages.ts:71-139`
- 실패 시나리오: 현재 headless 브라우저 확인은 정상 흐름을 폭넓게 다루지만,
  StrictMode의 mount→cleanup→mount, 같은 topic의 remove 중 재구독, 이벤트와
  snapshot의 역순 완료, 강퇴 중 in-flight snapshot은 결정적으로 재현하지 않는다.
  이 경로는 회귀 시 컴파일·lint·순수 함수 테스트만으로는 검출되지 않는다.
- 제안: 주입 가능한 fake Realtime 채널과 지연 가능한 메시지/참여자 서비스로
  provider/hook 테스트를 추가해 위 순서를 고정한다. 특히 `createTopicGate`가
  close 완료 전 재-open하지 않는 것과 stale participant snapshot을 검증한다.

## 확인한 사항

- 이전 계획 리뷰의 동일 topic 재구독 경쟁은 `createTopicGate`와
  `removeChannel` 완료 대기로 반영되어 StrictMode cleanup 뒤의 재구독 경로를
  보호한다.
- `useToast`는 모듈 단일 객체를 반환하므로 `sync` effect 의존성이 렌더마다
  바뀌는 무한 스냅샷 요청 문제는 해소됐다.
- `mergeSnapshot`은 겹치는 최신 페이지에서 기존 과거 이력을 병합하고,
  snapshot 중 받은 더 최신 메시지(id > top)를 보존한다.
- snapshot 참여자와 `readState`를 `toViews`에 전달해 초기 unread 숫자를
  숨기고, `seedReadState`/`bumpRead`가 단조 증가를 유지한다.
- `member_added`, room/user `member_removed`, `subscribed` 재동기화,
  메시지 edit/delete, 페이지 prepend 시 scroll offset 보존, 서비스 경계와
  mapper dedupe를 diff 및 관련 단위 테스트 기준으로 확인했다.
