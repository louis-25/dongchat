# Supabase 이전 기획 초안 비판적 리뷰

- 대상: `docs/superpowers/specs/2026-10-13-supabase-migration-draft.md`
- 리뷰어: Cursor worker (읽기 전용)
- 일자: 2026-10-13
- 근거: `server/src/**`, `client/src/**`, `client/package.json` + Supabase 공식 문서(확인된 URL만 근거로 표기)

---

## 1. 총평

방향(비용 최소화 + `services/` 교체 경계 + RLS/RPC + Broadcast)은 타당하나, **현재 초안만으로는 “언제든 NestJS로 되돌리기”를 달성했다고 보기 어렵다.**  
보안·Realtime 읽음 수·단계별 컷오버가 섹션 2~7에 미정인 채 구현에 들어가면 실패 확률이 높다.  
**확정 spec으로 올리기 전에 차단 이슈(특히 단계 2 이후 이중 백엔드 공존, `unreadCount`/읽음 시드, Admin `role` 권한 경계)를 문서에 고정해야 한다.**

---

## 2. 발견사항 목록

### 🔴 차단

#### R1. 작업 분할 단계 2(인증만 Supabase) 이후 앱이 동작하지 않음
- **위치:** 초안 §5 작업 분할 1→2→3→4; 현재 `server/src/auth/*`, `server/src/chat/chat.gateway.ts`, `client/src/auth.ts` / `lib/api-client.ts`
- **문제:** 단계 2에서 NextAuth·JWT를 Supabase Auth로 바꾸면 NestJS 소켓/REST는 여전히 `NEXTAUTH_SECRET` 기반 JWT·**int userId**를 기대한다. 초안은 브리지(이중 로그인, 토큰 교환, ID 매핑)를 정의하지 않았다.
- **실패 시나리오:** 이메일 로그인 성공 직후 채팅 `join_room`이 Unauthorized로 끊기고, axios `/chat`·`/friends`도 401. “각각 검증 후 다음”이 성립하지 않아 단계 2 머지 순간부터 메인 플로우가 죽는다.
- **제안 수정:** (a) 인증+채팅을 한 컷오버로 묶거나, (b) Nest 잔존 기간 동안 Supabase JWT 검증·uuid↔legacy id 브리지를 명시하거나, (c) feature flag로 REST/소켓을 단계별로 끈 채 UI를 부분 비활성화. “각 단계 후 앱 동작” 정의를 DoD로 문서화.

#### R2. Broadcast Realtime과 `unreadCount`/읽음 계약이 불완전
- **위치:** 초안 §4.5, §4.1 `RoomEvents`; 현재 `ChatMessageService.toView`/`computeUnread`, `useChatMessages.ts`(readState + `unreadCount`)
- **문제:** 지금 서버는 메시지 View에 `unreadCount`를 넣어 주고, 클라는 `read_update`로 readState를 갱신해 재계산한다. Broadcast `realtime.broadcast_changes()`는 **행 NEW/OLD**만 보내고 `unreadCount`를 포함하지 않는다(공식 예시도 INSERT/UPDATE/DELETE 페이로드). 초안은 `chat_room_participants` 변경을 같은 채널로 보낸다고만 하고, (1) 입장 시 전 참여자 `last_read` 시드, (2) `initial_messages` 대체 fetch 순서, (3) UPDATE를 `message_edited` vs `message_deleted` vs `read_update`로 매핑하는 규칙을 빠뜨렸다.
- **실패 시나리오:** 방 입장 직후 내 메시지에 `unreadCount`가 0이거나(시드 없음)·전원 미열람으로 표시되거나, soft delete UPDATE가 수정 이벤트로 처리되어 UI가 깨진다. 구독 전에 도착한 INSERT를 놓치면 메시지 누락.
- **제안 수정:** §5 Realtime에 명시 — `subscribeRoom` 전 `fetchMessages` + `listParticipants`(또는 RPC)로 readState 시드 → private 채널 구독 → `mark_read`. Broadcast 핸들러에서 table/op별 도메인 이벤트로 변환. `unreadCount`는 **클라 재계산만** 단일 소스로 고정(서버 View 필드 의존 제거). 근거: [Subscribing to Database Changes](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes.md), [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization.md).

#### R3. Admin `role` / Data API 노출이 RLS 상세 전에 위험
- **위치:** 초안 §4.3 `profiles.role`, §4.4(개요만); 현재 `users.controller.ts` `@Roles(ADMIN)`, `UserRole`
- **문제:** A안은 클라이언트가 Data API에 직접 붙는다. `profiles.role`에 대한 `UPDATE`를 `authenticated`에 열어 두면 누구나 ADMIN 승격 가능. `user_metadata`/`raw_user_meta_data`에 role을 넣고 가입 트리거로 복사하는 패턴도 클라이언트 변조에 취약하다. 초안은 “role은 profiles”만 적고 **누가 UPDATE 가능한지·JWT claim 주입 여부**가 없다.
- **실패 시나리오:** 로그인 사용자가 `supabase.from('profiles').update({ role: 'ADMIN' })` 후 `listUsers` RPC/정책을 통과해 전체 유저·PII 열람.
- **제안 수정:** `role` 컬럼 UPDATE는 service_role/관리자 RPC만. 가능하면 Auth Hook으로 JWT claim 주입 후 RLS는 claim 또는 서버만 읽는 `user_roles` 테이블 사용([Custom Claims & RBAC](https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac.md)). **권한에 `user_metadata` 사용 금지**를 확정 결정으로 명시. GRANT는 최소 권한([Hardening Data API](https://supabase.com/docs/guides/database/hardening-data-api.md)).

#### R4. `realtime.messages` RLS를 “방 멤버만”으로 구체화하지 않음
- **위치:** 초안 §4.5; §4.7 realtime 스키마 잠금 언급
- **문제:** 공식 문서의 느슨한 예시는 `using (true)`로 authenticated 전원 수신을 허용한다. 채팅은 topic `room:<id>`마다 **멤버십 조인**이 필수. 또한 private 채널·Dashboard “Allow public access” 비활성·`setAuth()`가 초안에 없다. JWT 캐시로 멤버 제거 후에도 연결 유지되는 특성도 미언급.
- **실패 시나리오:** RLS가 `true`이거나 멤버십 검사가 빠지면 타 방 topic을 추측해 메시지 Broadcast를 수신. 강퇴/차단 후에도 JWT 만료까지 수신 지속([Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization.md) caution).
- **제안 수정:** `realtime.messages` SELECT/INSERT 정책을 `realtime.topic()` + `chat_room_participants` EXISTS로 작성. `ALTER TABLE realtime.messages ENABLE RLS`는 넣지 말 것(문서 경고). 클라이언트 `channel(..., { config: { private: true } })` + `realtime.setAuth()`. 멤버십 변경 시 짧은 JWT TTL 또는 강제 re-auth.

---

### 🟠 중요

#### I1. “NestJS로 언제든 교체” 경계가 SQL·Edge로 새어 나감
- **위치:** 초안 §1 필수 제약, §4.1~4.6
- **문제:** `services/` ESLint 경계는 클라 교체에는 유효하나, 비즈니스 규칙·Realtime·푸시가 **Postgres RPC/트리거/Edge Function**에 고정된다. Nest 복귀 시 SQL을 TS로 재이식 + 소켓 게이트웨이 재구축이 필요해 “services 내부만 교체”보다 크다.
- **실패 시나리오:** “백엔드만 Nest로” 결정 시 `edit_message`/`mark_read`/broadcast 트리거/`send-push`를 동시에 다시 짜야 하고, 스키마는 Postgres에 묶인 채 MySQL Nest 스택과 불일치.
- **제안 수정:** 목표를 “클라 `services/` 교체로 **HTTP/WS 백엔드** 교체 가능”으로 재정의하거나, Nest 복귀 시에도 **Postgres는 유지**한다고 명시. RPC 목록을 “이식 체크리스트”로 두고 도메인 규칙을 의사코드/테스트로 이중화.

#### I2. 로그인 식별자 변경(username → email)이 유지 기능과 충돌
- **위치:** 초안 §2; 현재 `AuthService.validateUser(username)`, 가입/친구 검색은 username
- **문제:** Supabase Auth 기본은 email+password. 기존 UX·친구 요청 DTO는 username. 초안은 profiles.username 유지라 했지만 **가입/로그인 UI·유일성·카카오 username 충돌** 설계가 없다.
- **실패 시나리오:** 카카오 nickname이 username으로 들어가 email 계정과 충돌하거나, 사용자가 email로 로그인·username으로 친구 추가를 혼동.
- **제안 수정:** Auth 식별자=email(또는 phone), 표시/검색=`profiles.username`을 분리. 가입 시 username 필수·unique. 카카오는 `auth.identities` + profiles 트리거로 매핑(§4 인증에서 상세).

#### I3. SECURITY DEFINER 트리거/`is_room_member` 노출 위험
- **위치:** 초안 §4.4~4.5; 공식 Broadcast 예시는 `security definer` 트리거
- **문제:** `broadcast_changes` 트리거·헬퍼 RPC가 DEFINER이면 `search_path` 고정·EXECUTE 권한 최소화가 필수. Data API에 헬퍼가 노출되면 오용 가능. GRANT 누락/과다 모두 장애.
- **실패 시나리오:** `search_path` 미고정 DEFINER가 악의적 객체로 하이재킹되거나, `is_room_member`가 과도하게 GRANT되어 정보 유출. 반대로 GRANT 없으면 2026-10-30 이후 API 42501([changelog](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically), [hardening](https://supabase.com/docs/guides/database/hardening-data-api.md)).
- **제안 수정:** 모든 DEFINER에 `SET search_path = ''`(또는 고정 스키마). 트리거 함수는 `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`. 테이블/RPC GRANT를 마이그레이션에 테이블 생성과 함께 명시(초안 §4.7 방향은 올바름 — 스키마 섹션에 체크리스트로 승격).

#### I4. Database Webhook → Edge `send-push`의 인증·한도
- **위치:** 초안 §4.6; Free 플랜 Edge 50만 invocations/월([pricing](https://supabase.com/pricing))
- **문제:** Webhook이 service_role로 구독을 읽으면, URL/시크릿 검증 없이 호출 가능하면 임의 푸시 스팸. 메시지마다 1 invocation + Realtime 메시지 증가.
- **실패 시나리오:** Webhook URL 유출로 푸시 폭탄; 활발한 그룹방에서 Edge/Realtime 쿼터 소진 후 푸시·실시간 중단. 로컬은 `localhost` 대신 `host.docker.internal` 필요([Database Webhooks](https://supabase.com/docs/guides/database/webhooks.md)).
- **제안 수정:** Webhook 공유 비밀 헤더 검증, 발신자 제외·멤버만, 실패 재시도/데드레터. Free 한도(Realtime 2M messages/월, peak 200 connections, Edge 500k)를 §1 제약에 수치로 넣고 읽음 Broadcast fan-out 비용을 계산.

#### I5. Free 플랜 운영 리스크(일시정지·SMTP·용량)
- **위치:** 초안 §1 “월 0원”, §4.7 SMTP; [billing](https://supabase.com/docs/guides/platform/billing-on-supabase.md), [email template changelog](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
- **문제:** Free는 비활성 1주 후 프로젝트 pause, DB 500MB, 기본 SMTP는 신규 Free에서 템플릿 커스터마이즈 불가(커스텀 SMTP 시 가능 — 초안 요지는 맞음). “프로덕션 0원”과 pause는 충돌.
- **실패 시나리오:** 취미 배포 후 1주 미접속으로 DB pause → 로그인/채팅 전면 장애. 확인 메일 UX를 바꾸려다 막힘.
- **제안 수정:** pause·한도를 DEPLOYMENT 리스크로 명시. 외부 SMTP(유료/프리티어) 필요 여부를 인증 섹션에서 결정.

#### I6. 소켓 이벤트·에러 계약 일부 누락
- **위치:** 초안 §3 소켓 목록 vs §4.1 `RoomEvents`; `chat.gateway.ts`의 `join_error`, `message_error`, `initial_messages`
- **문제:** `RoomEvents`에 `message_error`/`join_error`/`initial_messages`가 없다. 클라는 `message_error`로 토스트, REST는 `{ code, message }`([error-handler.ts](client/src/lib/error-handler.ts)).
- **실패 시나리오:** RPC 오류가 PostgREST 형태로만 올라와 한글 매핑·재시도 UX가 깨짐.
- **제안 수정:** services 계층에서 기존 `code` 유지를 계약으로 고정. Realtime 경로에도 `message_error` 상당 콜백 정의.

#### I7. 단계 1만 “앱 미변경”이고 3·4 사이 부분 동작 정의 부재
- **위치:** 초안 §5
- **문제:** 친구·방만 Supabase, 채팅은 Nest인 혼합 상태가 가능한지 불명(동일 사용자 ID 체계 필요).
- **실패 시나리오:** 단계 3에서 uuid 방 ID를 만든 뒤 Nest 채팅은 int roomId라 연결 불가.
- **제안 수정:** ID 체계 전환 시점을 한 단계로 고정하거나, 혼합 모드를 명시적으로 금지.

---

### 🟡 사소

#### M1. `sender` 문자열 덴ormalization
- **위치:** 초안 §4.3 messages; `message.entity.ts` `sender`
- **문제:** 스키마에 `sender_id`만 적시. 현재 UI/인앱알림은 `sender` 문자열 사용(`useInAppNotification.ts`).
- **실패 시나리오:** join 없이 profiles를 추가 조회하거나 표시명이 비어 알림이 `undefined: ...`.
- **제안 수정:** `sender_username` 스냅샷 컬럼 또는 View/RPC에서 embed.

#### M2. Next 16 `proxy.ts` 표현
- **위치:** 초안 §4.2
- **문제:** “구현 시 문서 확인”은 좋으나, 미확인 상태로 삭제 목록에 next-auth만 있고 세션 갱신 실패 시 전면 로그아웃 위험.
- **제안 수정:** §4 인증에서 `@supabase/ssr` + Next 16 공식 패턴 URL을 확정 후 삭제 목록과 묶기. (구체 API는 구현 시 context7/공식 문서 재확인 — 본 리뷰에서 Next 16 proxy 명칭은 **미확인**)

#### M3. pgTAP·과설계 소지
- **위치:** 초안 §4.2 `supabase/tests`, §5.1
- **문제:** RLS 테스트는 가치 있으나 초안 단계에서 pgTAP 필수화는 범위 확장. YAGNI 관점에서는 핵심 정책 몇 개 SQL 테스트부터.
- **제안 수정:** “멤버십·메시지 INSERT·Admin role·realtime topic” 최소 세트만 1차 필수.

#### M4. OBSERVER 역할
- **위치:** `user.entity.ts` `UserRole.OBSERVER`; 컨트롤러에서 실질 미사용
- **문제:** 초안 profiles.role에 포함할지 불명.
- **제안 수정:** 사용 계획 없으면 enum에서 제외해 YAGNI. 있으면 RLS에 읽기 전용 정책.

---

## 3. 기획 초안이 놓친 기능/요구사항

코드에는 있으나 초안 유지 목록·services API에 없거나 약하게만 언급된 것:

| 현재 코드 | 초안 상태 | 비고 |
|---|---|---|
| REST `GET /chat` cursor 페이지네이션 (`chat.controller.ts`) | `fetchMessages(before)`로 암시 | 멤버십 assert·limit 기본 30 명시 필요 |
| `initial_messages` + 입장 시 `markRead` (`chat.gateway.ts`) | Realtime 개요만 | 입장 시퀀스 필수 |
| `join_error` / `message_error` + `code` | 미기재 | 에러 계약 |
| 인앱 토스트 (`useInAppNotification.ts`) — 다른 방/hidden 탭 | 미기재 | Realtime `message` 구독과 연동 |
| 메시지 View의 `replyTo` 임베드·삭제 시 빈 메시지 | soft delete·답장만 언급 | reply payload shape |
| `sender` 표시명 컬럼 | `sender_id`만 | 위 M1 |
| Friend 양방향 중복 검사·receiver만 accept/block | request/accept/block 나열 | RLS/RPC 규칙 필요 |
| 1:1 방 참여자 정확히 2명 (`chat.rooms.service.ts`) | createRoom만 | RPC 검증 |
| Admin users `page/limit/sort/order` | `listUsers`만 | 페이지네이션 |
| Push `unsubscribe(endpoint)` · VAPID | subscribe/unsubscribe 암시 | Edge와 클라 VAPID 공개키 |
| Kakao `provider`/`providerId` upsert | “카카오 OAuth”만 | identity 링크 |
| Refresh 토큰 큐·storage 규칙 (`api-client.ts`, `useAuth`) | 세션 갱신 한 줄 | Supabase session 저장 위치 재정의 |
| `OBSERVER` 역할 | 미언급 | M4 |
| 방 나가기/친구 차단 해제 | 현코드에도 거의 없음 | 초안 “차단”만 — 기대치 정리 |

---

## 4. 동의하는 핵심 결정과 그 이유

1. **A안 + `services/` 교체 경계 + ESLint 제한** — Nest 복귀 시 클라 타점 최소화에 가장 실용적. Orval/axios/socket 제거와 정합.
2. **직접 UPDATE 대신 RPC로 수정/삭제/읽음/방생성** — PostgREST는 컬럼 단위 RLS가 어렵다는 판단이 맞음. 소유권·마스킹(`content=''`)과 맞음.
3. **Broadcast from Database(권장) + private 채널** — 공식 권장과 일치; Postgres Changes보다 확장·인가에 유리([subscribing docs](https://supabase.com/docs/guides/realtime/subscribing-to-database-changes.md)).
4. **기존 MySQL 데이터 미이전** — 범위 축소에 동의. uuid 전환 비용을 감수하는 대신 마이그레이션 복잡도 감소.
5. **Data API 명시적 GRANT·realtime 스키마 잠금·Free SMTP 템플릿 제한 인지** — 2026 플랫폼 변경과 대체로 일치(GRANT: [changelog 45329](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically); realtime 정책만 허용: [authorization](https://supabase.com/docs/guides/realtime/authorization.md); SMTP: [changelog 46599](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)).
6. **로컬 `supabase start` → 클라우드 `db push`** — 마이그레이션 단일 소스에 동의.

---

## 부록: 중점 관점 요약

| 관점 | 판정 |
|---|---|
| (a) Nest 교체 용이성 | 부분 달성 — 클라는 OK, 서버 로직은 SQL/Edge에 고착. 목표 문구 수정 필요. |
| (b) Supabase 보안 | 방향은 맞으나 RLS/GRANT/DEFINER/role/realtime 정책이 미작성이라 구현 전 차단. |
| (c) Broadcast + 읽음 수 | 개념만 있고 시드·매핑·unread 단일 소스 없어 정합성 미달. |
| (d) 작업 분할 | 단계 2가 치명적. 컷오버/브리지 재설계 필요. |
| (e) Free 한도 | Realtime·Edge·pause·500MB 미반영. |
| (f) YAGNI | services 경계·RPC는 적절. pgTAP 전부·과잉 추상은 축소 여지. |

---

## 문서 확인 상태

| 주장 | 상태 | URL |
|---|---|---|
| Broadcast from DB + private channel | 확인 | https://supabase.com/docs/guides/realtime/subscribing-to-database-changes.md |
| `realtime.messages` RLS, 스키마 잠금, JWT 캐시 | 확인 | https://supabase.com/docs/guides/realtime/authorization.md |
| Data API GRANT + RLS 이중 층 | 확인 | https://supabase.com/docs/guides/database/hardening-data-api.md |
| 2026-10-30 신규 테이블 자동 노출 중단 | 확인 | https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically |
| role은 DB/Auth Hook, metadata 권한 사용 주의 | 확인(권장 패턴) | https://supabase.com/docs/guides/database/postgres/custom-claims-and-role-based-access-control-rbac.md |
| profiles + raw_user_meta_data 트리거 예 | 확인 | https://supabase.com/docs/guides/auth/managing-user-data.md |
| Free Realtime/Edge 한도 | 확인 | https://supabase.com/pricing , https://supabase.com/docs/guides/platform/billing-on-supabase.md |
| Free 기본 SMTP 템플릿 커스터마이즈 제한 | 확인 | https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier |
| Database Webhooks / host.docker.internal | 확인 | https://supabase.com/docs/guides/database/webhooks.md |
| Next 16 `proxy.ts` 세션 갱신 API | 미확인 | — |
| Edge Function 런타임 한도 | 확인 | https://supabase.com/docs/guides/functions/limits.md |
