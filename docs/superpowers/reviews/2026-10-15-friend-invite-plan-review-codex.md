# 친구 초대 링크 계획 검토 (Codex)

**판정: ready with fixes.** 현재 모바일 UI 구조와는 대체로 맞고, 제시한 SQL의 `#variable_conflict use_column`, 표현식 unique index에 대한 `ON CONFLICT DO NOTHING`, `FOR UPDATE`, 그리고 `reset role` 뒤의 transaction-local `current_setting('t.code')` 사용은 모두 유효하다. 다만 아래 항목을 반영한 뒤 구현을 시작해야 한다.

## Critical

- 없음.

## Important

- **Task 1 / Step 3 `accept_invite`, 계획 220–228행 — 동시 수락의 `already` 값이 거짓으로 고정된다.** 같은 사용자가 두 탭에서 관계가 없는 초대를 동시에 수락하면, 둘 다 행을 못 찾고 두 번째 INSERT는 `friends_pair_key`(표현식 unique index, 실제 정의: `supabase/migrations/20261013061608_friends.sql:11`)에서 `ON CONFLICT DO NOTHING`이 된다. 그런데 계획은 충돌 여부와 무관하게 `return query select v_name, false`를 하므로 두 번째 사용자에게도 “친구가 됐어요”를 보여 준다. `INSERT ... ON CONFLICT DO NOTHING` 직후 `FOUND`를 검사해 충돌이면 `already = true`를 반환하고, 별도 세션 두 개로 이 경합을 검증하는 pgTAP/통합 테스트를 추가한다.

- **Task 1 / Step 1 pgTAP, 계획 111–176행 — 명시한 “양방향 PENDING/BLOCKED” 계약을 실제로 검증하지 않는다.** PENDING은 Carol→Alice 한 방향만(137–142행), BLOCKED는 Alice→Dave 한 방향만(146–152행) 만들고 있다. 스펙 §3은 각각 어느 방향이든이라고 하므로, 반대 방향에서 수락했을 때 `ACCEPTED` 및 `FRIEND_BLOCKED`인지 검증하지 못해 향후 pair 조회/상태 변경 회귀가 통과한다. 반대 방향 PENDING과 BLOCKED fixture/assertion을 추가하고 `plan(18)`을 실제 assertion 수에 맞게 올린다.

- **Task 1 / Step 1 “노출 범위”, 계획 167–169행 — `preview_invite`의 반환 필드 privacy가 테스트되지 않는다.** 현재 계획은 초대자의 `username` 값만 확인한다. 실제 의도는 함수 시그니처의 이름·사진 세 필드만 노출하는 것이며(계획 181–195행), 현재 `profiles` RLS는 인증 사용자에게 프로필 SELECT를 허용한다(`supabase/migrations/20261013060943_foundation.sql:89–90`). 향후 preview 쿼리에 `id`/민감 필드가 추가돼도 이 테스트는 잡지 못한다. `columns_are` 등으로 정확히 `username, nickname, avatar_url`만 반환함을 확인하고, 닉네임·avatar fixture도 값으로 검증한다.

- **Task 2 / Step 2 `shareOrCopy`, 계획 334–347행 — Clipboard API가 없는 환경에서 거짓 성공 토스트가 난다.** `nav.clipboard?.writeText(...)`는 clipboard가 `undefined`이면 아무 일도 하지 않은 뒤 무조건 `"copied"`를 반환한다. `InviteButton`은 이를 “초대 링크를 복사했어요”로 표시하므로 실제로 링크를 얻지 못한 사용자를 오도한다(계획 485행). clipboard 부재면 명시적으로 예외/`unavailable`을 반환해 오류 토스트를 보이고, 해당 단위 테스트를 추가한다; `AbortError`는 현재처럼 복사 없이 `cancelled`로 끝내면 된다.

## Minor

- **Task 2 / 검증 기준, 계획 18·361행 — Node 테스트 기준선이 현재 코드와 다르다.** 현재 `client/src/**/*.test.ts`의 `test(`는 56개인데 계획은 58개 및 “58+5”라고 적었다. 반면 DB는 `select plan(...)` 합계가 실제 179라서 계획의 179+18=197 계산은 맞다. 프런트 기준선을 56(따라서 새 5개 뒤 61)로 고치거나, 단순 개수 대신 명령 종료 코드와 새 테스트명을 성공 조건으로 적는다.

- **Task 3 / Step 4 및 Task 5 / Step 1, 계획 436–461·571행 — Suspense는 필요하지만 검증 범위가 불완전하다.** `useNextParam()`은 `useSearchParams()`를 사용하므로 login/join의 가장 가까운 Suspense로 감싸야 하는 점은 맞다. 그러나 Next 16.0.10의 동적 `/invite/[code]`도 현재처럼 클라이언트 `useParams()`를 사용한다(`client/src/app/(protected)/chat/rooms/[id]/page.tsx:3,16`이 같은 패턴); Task 5는 login/join만 빌드 확인 대상으로 적어 초대 route prerender 오류를 놓칠 수 있다. `pnpm build` 전체 성공을 게이트로 유지하고 `/invite/[code]`도 명시적으로 확인하며, login/join page에서 `<Suspense fallback={...}>` 안에 AuthShell·두 Form 모두 들어가도록 구현 상세를 적는다.

- **Task 3 / `safeNext` 테스트·Task 5 브라우저 테스트, 계획 286–322·580행 — 허용/거부 정책의 회귀 테스트가 proxy·callback에 연결되어 있지 않다.** 순수 함수 테스트는 있지만 proxy의 pathname+query 보존, callback의 same validator 사용, Kakao `redirectTo`의 인코딩은 단위 테스트 범위 밖이고 헤드리스는 `//evil.com` 하나만 확인한다. 현재 proxy matcher는 `/invite/...`를 제외하지 않아 보호 자체는 적용된다(`client/src/proxy.ts:8–12`); 계획의 matcher 변경도 필요 없다. `/\\evil.com`, `/login?next=…`, `/auth/callback`, query가 있는 invite와 Kakao callback의 `next`를 포함한 요청 수준 테스트를 추가하고, `safeNext`는 URL 파싱 후 origin/path를 fail-closed로 검증해 percent-encoded 구분자 같은 정규화 차이도 거부한다.

- **Task 1 / Task 2의 새 오류 계약, 계획 15행 및 257행 — 설계 §4의 `error-handler` 확장·오류 메시지 테스트가 누락되어 문서와 불일치한다.** 현 구현의 `toDomainError`는 P0001의 hint를 message로 보존한다(`client/src/services/errors.ts:27–32`)라 화면 동작은 가능하며, 따라서 `error-handler.ts`를 꼭 바꿀 필요는 없다. 다만 설계가 요구한 `INVITE_NOT_FOUND`/`FRIEND_BLOCKED` 메시지 단위 테스트를 추가하거나, hint 전달을 계약으로 삼아 설계와 계획을 같은 내용으로 정정한다.

## 확인한 정상 항목

- `#variable_conflict use_column`은 현행 `list_my_rooms`에도 같은 방식으로 쓰인다(`supabase/migrations/20261015082423_room_list.sql:10–16`); 계획의 RETURNS TABLE 함수 배치도 문법상 맞다.
- `tests.login_as()`와 `set_config(..., true)`는 모두 최상위 `begin` 트랜잭션 안에서 동작하고 `reset role`은 custom GUC를 지우지 않는다(`supabase/tests/database/000_helpers.sql:38–50`). 따라서 계획의 `t.code`/`t.new` 전달은 role 전환 때문에 깨지지 않는다.
- `preview_invite`는 private table을 직접 노출하지 않고 함수 반환도 세 프로필 필드로 제한해 설계의 기본 privacy 방향에 맞는다. 단, 위의 반환 컬럼 회귀 테스트는 추가되어야 한다.

---

## Claude 판정 (2026-10-15)

검증: 수정한 계획의 마이그레이션 + pgTAP 22개를 로컬 DB 롤백 트랜잭션에서 실행 → 22/22 ok.

| 항목 | 판정 | 조치 |
|---|---|---|
| I1 동시 수락 already | 반영 | INSERT 직후 `not found`를 already로 반환. 두 세션 경합 테스트는 pgTAP 단일 세션으로 재현 불가 → 로직이 한 줄이라 생략(ruling). |
| I2 양방향 PENDING/BLOCKED | 반영 | 초대자→수신자 대기 요청, 초대자가 차단한 경우 fixture·assertion 추가(plan 22). |
| I3 미리보기 반환 컬럼 | 반영 | `pg_get_function_result`로 `TABLE(username, nickname, avatar_url)` 고정. |
| I4 클립보드 없음 거짓 성공 | 반영 | `shareOrCopy`가 `unavailable` 반환(부재·거부), 버튼은 링크를 토스트로 직접 보여 줌. 단위 테스트 추가. |
| M1 테스트 기준선 56 | 기각 | `pnpm test`는 `../supabase/functions/**/*.test.ts`까지 포함해 실제 58. |
| M2 Suspense·빌드 범위 | 기각 | Task 5 Step 1이 `pnpm build` 전체를 게이트로 둔다. |
| M3 safeNext URL 파싱 | 기각 | `/`로 시작하고 `//`·`/\`가 아니면 같은 출처 경로다. 퍼센트 인코딩된 경로도 같은 사이트 안이라 외부로 나가지 않는다. 헤드리스에 `/login?next=//evil.com` 확인 유지. |
| M4 error-handler 문서 불일치 | 반영(문서) | 설계 §4를 "hint가 사용자 문구 계약, error-handler 변경 없음"으로 정정. |
