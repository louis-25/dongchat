# Stage 6 구현 코드 리뷰 (Codex)

검토 범위: `9ac66bdc..HEAD` 및 Stage 6 계획·명세·이전 계획 리뷰의 수용 항목.

## Critical

- **[C1] HTTPS만 확인해서 사용자 입력 endpoint를 내부망으로 요청할 수 있다.**
  - 위치: `supabase/functions/send-push/index.ts:21-44`
  - 실패 시나리오: 공격자가 자신의 구독 endpoint를 `https://127.0.0.1/`, `https://[::1]/`, 사설 RFC1918 주소 또는 내부 서비스 DNS로 등록한 뒤, 자신이 참여한 방에 메시지가 쓰이게 한다. `allowedEndpoint`는 scheme만 검사하므로 Edge Function의 service-role 실행 환경이 그 주소로 `fetch`하며, 내부 서비스 탐색·요청(SSRF)이 가능하다. `PUSH_ALLOW_HTTP`를 실수로 운영에 설정하면 범위는 더 넓어진다.
  - 제안 수정: endpoint host를 신뢰할 수 있는 Web Push provider allowlist로 제한하는 것이 가장 안전하다. 범용 endpoint를 허용해야 하면 URL 파싱 뒤 localhost·loopback·link-local·사설/예약 IP와 내부 DNS 해석 결과를 모두 거부하고, redirect도 차단하며, 이를 Edge 통합 테스트로 고정한다. scheme 검사만으로는 SSRF 방어가 아니다.

## Important

- **[I1] 이전 계획 리뷰에서 수용한 강제 로그아웃/정지 뒤 구독 정리가 구현되지 않았다.**
  - 위치: `client/src/services/auth.ts:53-55`, `client/src/services/push.ts:21-27`, `supabase/migrations/20261013061851_admin.sql:70-103`, `supabase/migrations/20261013061725_push_subscriptions.sql:18-20`
  - 실패 시나리오: 관리자가 `admin_ban` 또는 `admin_force_logout`을 실행하면 Realtime 수신 측은 `signOut()`을 호출하지만, `removeThisBrowserPush()`의 RLS DELETE는 이미 `private.is_active_session()`이 false라 거부된다. catch 뒤 브라우저만 unsubscribe되어 DB 행은 남고, 서비스 워커는 그 브라우저에 이전 계정의 메시지 본문을 계속 표시한다.
  - 제안 수정: 접근을 박탈하는 DB 경로(`admin_ban`, `admin_force_logout`, 필요 시 `auth.sessions` 삭제 trigger)에서 대상 사용자의 `push_subscriptions`를 server-side로 삭제한다. revoke/ban 상태에서 DB 행이 사라지고 이후 푸시 대상에서 제외되는 pgTAP·통합 회귀 테스트를 추가한다.

- **[I2] 발송 fetch에 시간 제한·동시성 제한이 없어 하나의 악성/고장 endpoint가 invocation을 붙잡는다.**
  - 위치: `supabase/functions/send-push/index.ts:44, 67`
  - 실패 시나리오: 구독자가 응답을 끝내지 않는 HTTPS endpoint를 등록하면 해당 `fetch`는 종료 보장 없이 대기한다. `Promise.all`은 모든 target의 완료를 기다리므로 한 방에 많은 구독이 있을 때 Edge Function의 연결·메모리를 소진하거나 함수 timeout까지 점유해 장애 관측과 재시도를 어렵게 만든다.
  - 제안 수정: 각 `fetch`에 짧은 `AbortSignal.timeout()`을 적용하고, 제한된 worker pool/배치로 fan-out한다. timeout·한 target의 실패가 나머지 target의 성공과 응답 완료를 막지 않는 통합 테스트를 추가한다.

## Minor

- **[M1] 새로 수정한 파일에 후행 공백이 남아 저장소의 diff hygiene 검사가 실패한다.**
  - 위치: `client/public/service-worker.js:70-80`, `client/src/hooks/usePushNotification.ts:3-83`, `client/src/services/auth.ts:4, 54, 67-76`
  - 실패 시나리오: CI 또는 pre-commit에서 `git diff --check`를 품질 게이트로 사용하면 Stage 6 diff가 실패한다. 현재 `git diff --check 9ac66bdc..HEAD`가 위 추가 행들을 trailing whitespace로 보고한다.
  - 제안 수정: 해당 파일을 LF/후행 공백 없이 재저장하고 merge 전 `git diff --check 9ac66bdc..HEAD`가 무출력인지 확인한다.

## 확인한 사항

- `push_targets`는 sender·soft-deleted message·`private.user_access`/`auth.users`의 미래 ban을 제외하고, service role에만 실행 권한을 부여한다. `register_push_subscription`의 endpoint takeover와 404/410 정리도 코드·pgTAP/통합 스크립트에 반영되어 있다.
- 이전 계획 리뷰의 `next.config.ts` Nest rewrite, Orval/socket 검증 스크립트, hydration 초기값, Vault fixture 격리, 입력 검증, service-role 권한, URL 계약 갱신은 반영된 것을 확인했다.
- `git diff --stat`으로 대규모 `server/`·생성 코드 삭제는 통계만 확인했고, 비삭제 변경 파일을 중심으로 검토했다. 구현자가 보고한 tsc/lint/pgTAP/통합·build 결과는 재실행하지 않았다.
