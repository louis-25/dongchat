# Stage 5 관리자 구현 리뷰 (Codex)

## Critical

- 없음.

## Important

### 1. user 채널의 재시도마다 인증·방 목록 RPC를 다시 호출한다

- 위치: `client/src/services/realtime.ts:28-31`, `client/src/components/chat-provider.tsx:109-114`
- 실패 시나리오: 정상 사용자가 지하철·절전 복귀 등으로 Realtime 연결을 잃으면, 라이브러리의 각 `CHANNEL_ERROR`/`TIMED_OUT` 재시도와 이후 `SUBSCRIBED`마다 `get_me`와 `listRooms`가 차례로 다시 실행된다. 진행 중인 요청은 React Query가 합칠 수 있지만, 재시도 간격보다 요청이 짧으면 매 회 두 요청이 발생하므로 연결 불안정 상태에서 불필요한 서버 요청·UI 재렌더가 누적된다.
- 제안: user 채널별 재확인은 최초 `SUBSCRIBED` 및 오류 상태 진입 시 한 번만 실행하도록 ref 기반 in-flight/짧은 cooldown을 둔다. 성공 후에는 플래그를 해제해 다음 실제 재연결에서만 다시 확인하고, 권한 거부임이 확인되면 `useAuth`의 `AUTH_SESSION_REVOKED` 처리로 즉시 종료한다.

### 2. 수용한 I6과 달리 verifier가 만든 사용자·접근 레코드를 정리하지 않는다

- 위치: `client/scripts/verify-admin.mjs:44-45`, `client/scripts/verify-admin.mjs:128-135`
- 실패 시나리오: 스크립트는 성공해도 매 실행마다 `auth.users`/`profiles` 두 행과 `user_access` 행을 남긴다. 특히 107행의 Realtime 대기 등 중간 assertion이 실패하면 방 정리조차 건너뛰므로 로컬 검증 DB가 계속 오염되고, 실패 재현·시드 기반 목록 검증의 신뢰성이 떨어진다.
- 제안: 생성 직후부터 `try/finally`로 감싸고, 테스트 전용 service-role 정리 경로(또는 전용 관리 SQL)를 통해 생성한 auth 사용자와 관련 데이터를 항상 제거한다. service role을 쓰지 않는다면 최소한 실패해도 방/참여자/접근 레코드는 `finally`에서 제거하고, 남는 auth 사용자는 명시적으로 문서화한다.

## Minor

### 1. 외부 삭제로 현재 페이지가 범위를 벗어나도 방 목록 페이지 번호를 보정하지 않는다

- 위치: `client/src/app/(protected)/admin/rooms/page.tsx:13-24`, `56-65`
- 실패 시나리오: 관리자가 3페이지를 보는 동안 다른 사용자가 마지막 방들을 삭제해 총 페이지가 1이 되면, 새 목록은 비어 선택은 풀리지만 화면은 `3 / 1`로 남는다. 관리자는 이전 버튼을 수동으로 여러 번 눌러야 유효한 목록으로 돌아온다.
- 제안: 조회 결과의 total로 현재 페이지가 초과했음을 표시하고 마지막 유효 페이지를 재조회하도록 보정한다. React effect의 동기 state 변경을 피하려면 조회 성공 경로/페이지 이동 상태기를 통해 보정하거나, 최소한 범위 이탈 안내와 마지막 페이지 이동 버튼을 제공한다.

## 확인한 사항

- C2: `RoomDetail`이 `member_removed` 시 관리자 방 목록 query를 무효화하고, 페이지는 목록에 없는 `pickedId`를 파생 선택에서 제거한다. 마지막 멤버 퇴장·강퇴 시 상세가 안내 화면으로 돌아가는 경로는 구현됐다.
- C3: `admin_list_users`/`admin_unban`은 `security definer`, `search_path = ''`, `private.require_admin()`을 유지하고, `private.user_access`와 `auth.users.banned_until` 중 늦은 값을 표시하며 해제 시 둘 다 비운다. 기존 함수 시그니처라 이전 migration의 authenticated grant/revoke도 유지된다.
- 읽기 전용 상세는 `setViewingRoom`을 호출하지 않고 `MessageList`/`MessageItem`의 수정·삭제·답장·읽지 않음 수를 숨긴다. `watchRoom`은 route unmount cleanup을 반환하며, 참여 중인 방과 겹쳐도 실제 채널은 Set 기반으로 하나만 유지된다.
- 비관리자 화면은 admin layout에서 렌더하지 않고 채팅으로 이동하며, 실제 데이터와 동작은 RPC의 `require_admin()` 및 RLS가 차단한다. `git diff --check`도 통과했다.
