# Stage 6 구현 계획 리뷰 (Codex)

## Critical

- **Task 4 / Step 1·3·5 — `next.config.ts`가 삭제할 `@/config`를 계속 import한다.** 현재 `client/next.config.ts`는 `BASE_URL`을 import하여 `/api/messages/*`를 NestJS로 rewrite한다. 계획의 참조 grep은 `client/src`, `client/scripts`만 검사하고 이 파일을 수정·삭제 목록에도 넣지 않아, `client/src/config/` 삭제 직후 `pnpm build`가 모듈을 찾지 못한다. **수정:** `next.config.ts`의 NestJS rewrite와 import를 제거(또는 Supabase에 맞게 재설계)하고, Task 4의 파일 목록·사전/사후 grep에 `next.config.ts`를 포함한다.

- **Task 4 / Step 1·3·4 — 삭제할 socket.io/Orval 의존 스크립트가 남는다.** `client/scripts/verify-message-ux.mjs`는 `socket.io-client`와 `http://localhost:4000`을 사용하고, `fix-query-key.mjs`는 Orval 생성물을 전제로 한다. 따라서 Step 1의 기대값은 이미 성립하지 않고 `pnpm remove socket.io-client` 뒤에는 전자가 실행 불가이며, 최종 grep도 실패한다. **수정:** 두 스크립트를 Supabase 검증으로 재작성하거나 삭제 대상으로 명시하고, `package.json`의 `verify`/문서에서의 참조까지 함께 정리한 뒤 lockfile 변경을 `pnpm remove` 결과로 확인한다.

- **Task 3 / Step 5 — SSR과 첫 hydration 사이에 `isSupported`가 달라질 수 있다.** `useState(isPushSupported)`는 lazy initializer를 서버 렌더와 브라우저 첫 렌더에서 각각 실행한다. 서버는 `false`, 지원 브라우저는 첫 client render가 `true`라서 `PushNotificationButton`의 존재가 달라지고 hydration mismatch가 난다. **수정:** 초기값은 항상 `false`로 두고 `useEffect`에서 지원 여부를 계산해 `setIsSupported`한다(그 effect 뒤에만 구독 확인).

- **Task 1 / Step 1·3 — pgTAP의 Vault 전제와 새 seed가 충돌한다.** Task 1 Step 5가 `push_webhook_*`를 seed에 영구 생성하지만 테스트 시작 시 이를 삭제하지 않는다. 이후 `vault.create_secret`은 같은 name의 기존 비밀과 공존/충돌할 수 있고, `vault.decrypted_secrets where name = ...`에는 순서가 없으므로 트리거가 `http://push.test/hook` 대신 seed의 Kong URL을 읽어 마지막 assertion이 비결정적으로 실패한다. **수정:** 테스트 시작에서 두 name의 기존 secret을 정리하고(권한이 필요한 경우 테스트 helper/owner 사용), 생성 후 정확히 하나인지 확인한다; 또는 trigger가 id를 명시적으로 관리할 수 있게 vault 값을 갱신하는 안전한 helper를 둔다.

## Important

- **Task 1 / Step 1·3 — 권한 테스트가 실제 Edge 경로를 보장하지 않는다.** 테스트는 authenticated 거부만 확인할 뿐, `service_role`이 `push_targets`를 실행할 수 있는지, Edge가 만료 구독을 `DELETE`할 테이블 권한이 있는지는 검증하지 않는다. 기본 Supabase role grant에 의존하면 권한을 강화한 환경에서 `permission denied`가 되어 모든 푸시 또는 410 정리가 실패한다. **수정:** migration에 필요한 `service_role` EXECUTE/DELETE(필요 시 schema USAGE)를 명시하고 `set role service_role` pgTAP assertion 및 Edge 통합 assertion을 추가한다.

- **Task 1 / Step 1 — 차단 대상 테스트가 한 원천만 검증한다.** 구현은 `private.user_access.banned_until`과 `auth.users.banned_until`을 모두 필터하지만 pgTAP은 후자만 업데이트한다. private 정지 사용자가 계속 푸시를 받는 회귀를 놓친다. **수정:** 별도 사용자를 `private.user_access`에서 미래 시각으로 정지한 뒤 대상 배열에서 제외됨을 확인하고, plan(11)을 그 assertion 수에 맞춰 증가시킨다.

- **Task 1 / Step 3 — 구독 입력이 사실상 빈 문자열만 막는다.** 임의 문자열 endpoint와 깨진/과도한 `p256dh`·`auth`가 저장되고, `generateRequestDetails`가 `try` 밖에서 예외를 내면 한 개의 악성 행이 `Promise.all` 전체를 500으로 만든다. **수정:** URL을 파싱해 허용 protocol/최대 길이를 검사하고 key를 base64url 및 합리적 길이로 검증한다; Edge에서도 요청 생성까지 각 대상의 try/catch 안에 넣어 잘못된 한 행을 상태값으로 격리한다.

- **Task 2 / Step 4·5 — 필수 secret/입력/대상 오류가 제어되지 않는다.** 누락된 `VAPID_*` 또는 `SUPABASE_*`, JSON 아닌 본문, `messageId`가 없는 본문, `data === null`은 throw 또는 `.map` TypeError로 끝난다. `env(...)` 값이 빠진 상태에서 config가 시작되는 경우도 명시적으로 실패시키지 않아 원인을 파악하기 어렵다. **수정:** 시작 시 필수 환경변수를 검증해 명확한 500을 반환하고, POST·JSON object·양의 safe integer를 400으로 검증하며, `Array.isArray(data)`를 확인한다; 배포/로컬 시작 전 secret 존재 검증 명령도 추가한다.

- **Task 2 / Step 5 — HTTPS guard가 문자열 prefix뿐이다.** `startsWith("https://")`는 URL 형식·hostname을 검증하지 않고 잘못된 값은 `generateRequestDetails`/fetch에서 throw한다. 비밀이 유출되거나 DB가 오염된 경우 fan-out 전체가 중단될 수 있다. **수정:** `new URL()`로 파싱하고 `protocol === "https:"`(로컬 플래그일 때만 `http:`)만 허용하며, parse/생성/fetch를 대상별 try/catch로 감싼다.

- **Task 3 / Step 4 — 강제 로그아웃·정지에서 기존 구독을 신뢰성 있게 지우지 못한다.** `removeThisBrowserPush`는 먼저 RLS DELETE를 시도한다. `get_me` 실패, ban, session revoke 이후에는 `require_active_session()` 때문에 삭제가 거부되고, catch 뒤 브라우저 unsubscribe만 되어 DB 행은 남아 해당 브라우저에 이전 사용자 알림이 계속 표시될 수 있다. **수정:** 사용자 접근을 박탈하는 DB 경로에서 해당 사용자의 `push_subscriptions`를 server-side로 제거하고, client는 최선 노력 unsubscribe를 유지한다; revoke/ban 상태에서의 회귀 테스트를 추가한다.

- **Task 3 / Step 6 — `client.navigate()`의 대상 선택이 안전하지 않다.** `includeUncontrolled: true`로 찾은 모든 창에 `navigate`를 호출하지만 `WindowClient.navigate`는 same-origin·제어 상태 제약 때문에 실패할 수 있고, 실패하면 이미 열린 창의 focus도 보장되지 않는다. **수정:** URL을 same-origin 절대 URL로 만들고, 제어 가능한 client만 navigate→focus 하며, 제어 불가 client는 focus 또는 `openWindow` fallback을 사용한다. 이미 정확한 URL의 창을 우선 focus하는 test도 추가한다.

- **Task 2 / Step 1·6 — 통합 검증의 준비·정리가 불안정하다.** 가짜 서버는 `.listen(PORT)` 완료를 기다리지 않고, `finally`에서 `server.close()` callback을 기다리지 않은 채 강제 `process.exit(0)`한다. 포트 충돌/늦은 pg_net 전달/cleanup RPC 실패가 간헐적으로 성공 또는 불명확한 실패가 될 수 있다. **수정:** `await once(server, "listening")`, timeout 진단, `await new Promise(resolve => server.close(resolve))`를 사용하고 `process.exit`는 제거한다; DB cleanup은 각 테스트 사용자의 endpoint만 삭제하고 실패를 표면화한다.

- **Task 5 / Step 1 — 명세와 payload URL이 불일치한다.** 바인딩 명세 §10은 `data.url: '/chat/<roomId>'`인데 plan은 `/chat/rooms?room=<roomId>`로 변경한다. 기능상 새 라우트가 맞더라도 명세 갱신 없이 구현하면 계약·수동 검증 기준이 갈라진다. **수정:** 먼저 spec의 URL 계약을 새 라우트로 변경하고, Edge payload·service worker·`roomIdFromSearch` 테스트를 동일한 canonical URL에 맞춘다.

- **Task 5 / Step 1 — 무료 플랜 수치를 고정해 문서가 곧 낡는다.** 현재 계획의 `월 Edge Function 50만`, Realtime 200만/200 같은 수치는 배포 시점의 공식 가격 페이지와 대조 절차가 없고, Vercel Hobby의 비상업적 개인 사용 제한도 빠져 있다. **수정:** 정확한 수치 대신 공식 pricing/limits 링크와 확인 날짜를 적고, Supabase Free의 7일 무활동 pause·2 active projects, Vercel Hobby의 non-commercial 제한을 운영 적합성 판단 항목으로 명시한다.

## Minor

- **Task 1 / Step 3 — 대상 함수가 정지 상태를 `now()`로 평가하지만 테스트는 sender/방 탈퇴·private ban 조합을 넓게 다루지 않는다.** 핵심 join은 맞지만, 멤버 삭제 및 두 ban 원천을 함께 넣은 회귀가 없으면 향후 join 변경을 잡기 어렵다. **수정:** sender 제외, 여러 기기, 탈퇴, private/auth ban, deleted message를 각각 독립 fixture로 검증한다.

- **Task 1 / Step 3 — 메시지마다 Vault 조회 두 번과 HTTP enqueue가 동기 insert 경로에 들어간다.** pg_net 전송은 비동기지만 Vault 조회·queue insert는 각 message row마다 수행되어 bulk insert/활성 방에서 지연과 warning 로그가 커질 수 있다. **수정:** 현재의 "메시지 전송 실패는 삼킴" 방침을 유지하되 관측용 warning/metric과 bulk-insert 성능 기준을 계획에 적고, 필요 시 statement trigger/outbox 전환 기준을 문서화한다.

- **Task 2 / Step 5 — `Promise.all`은 수신자 수 제한 없이 외부 요청을 동시에 낸다.** 한 방의 구독이 많으면 Edge memory/socket을 급격히 사용한다. **수정:** 동시성 제한 또는 batch 처리와 timeout을 두고, `sent`가 시도 수인지 성공 수인지 응답 계약을 명확히 한다.

## 확인한 사항

- 계획의 pgTAP assertion 수는 현재 작성된 assertion만 세면 `plan(11)`과 일치한다. 다만 Vault 격리 및 private-ban/service-role assertion을 추가하면 plan 수를 함께 조정해야 한다.
- `push_targets`의 participant join, sender 제외, soft-deleted message 제외 및 두 ban 원천 조건은 계획 SQL에 들어 있으며, `net.http_request_queue.body`의 bytea 변환과 headers jsonb 접근도 제시된 형태가 맞다.
- `PushSubscription.toJSON()`에서 사용하는 `keys.p256dh`/`keys.auth` 경로는 올바르다. 삭제 대상과의 충돌은 `src/services/push/` 디렉터리와 새 `src/services/push.ts` 파일 사이에는 없다.
- 현재 저장소에서는 `next.config.ts`, `verify-message-ux.mjs`, `fix-query-key.mjs`가 cleanup 누락임을 직접 확인했다. 공식 최신 문서는 Supabase Free의 7일 inactivity pause/2 active projects와 Vercel Hobby의 비상업적 개인 사용 제한을 안내한다.
