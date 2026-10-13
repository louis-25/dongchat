# Supabase 백엔드 이전 기획 초안 비판적 리뷰

## 1. 총평

방향 자체는 타당하지만, 현 초안 그대로는 “언제든 NestJS로 교체”와 단계별 정상 동작을 보장하지 못하므로 확정하면 안 된다.
우선 API/도메인 계약과 인증 전환 방식을 고정하고, RLS·RPC·Realtime의 권한/정합성 명세를 실행 가능한 SQL과 테스트로 내려야 한다.
특히 UUID 전환과 읽음 모델, 관리자 권한, Free 플랜의 운영 중단 가능성을 설계 결정으로 승격해야 한다.

## 2. 발견사항 목록

### 🔴 차단

1. **위치:** 초안 §2(클라이언트 직접 Data API), §4.1, §5 단계 2~4  
   **문제:** `services/`로 Supabase import를 숨기는 것만으로는 NestJS 교체 경계가 되지 않는다. 권한 규칙은 PostgreSQL RLS/RPC/트리거에, 인증·세션·Realtime 의미는 Supabase에 이미 들어가므로, 후일 NestJS가 같은 SQL 함수와 Supabase Realtime을 계속 호출하지 않는 한 동작을 재구현해야 한다.  
   **구체적 실패 시나리오:** NestJS로 복귀할 때 `markRead`, 방 생성, 친구 수락의 권한·원자성·에러 계약을 새 API에서 다시 구현한다. 서비스 함수의 반환 타입이 PostgREST 행/오류와 채널 payload에 맞물려 있어 UI도 함께 수정되고, 교체가 사실상 재마이그레이션이 된다.  
   **제안 수정:** 먼저 `domain` DTO·오류 코드·cursor·`RoomEvents`를 Supabase 타입과 분리해 명세/계약 테스트로 고정한다. `services`에는 `ChatRepository`/`RealtimePort`/`AuthPort` 구현을 주입하고, Supabase와 NestJS adapter를 각각 만들 수 있게 한다. 더 강한 교체 보장이 필요하면 지금부터 BFF/Nest 호환 HTTP 계약을 단일 진입점으로 두고 Supabase adapter가 그 계약을 구현하게 한다.

2. **위치:** 초안 §5 단계 2(인증) → 단계 3(친구·방·사용자)  
   **문제:** Supabase Auth로 먼저 로그인 UI와 세션을 바꾸면, 아직 살아 있는 NestJS REST/Socket.IO는 기존 Nest JWT(`sub`가 int, `role` 포함)를 요구한다. 전환 중 두 토큰을 어떻게 공존/교환할지가 없다.  
   **구체적 실패 시나리오:** 단계 2 배포 뒤 사용자는 Supabase 세션으로 로그인하지만, 기존 `/friends`, `/chat/rooms`, Socket.IO handshake는 Nest JWT가 없어 401/Unauthorized가 된다. 즉 3·4단계가 끝날 때까지 앱 핵심 화면이 동작하지 않는다.  
   **제안 수정:** 기능 플래그 기반의 한 번에 전환하거나, 임시 token-exchange/BFF adapter를 명시해 기존 API에 검증 가능한 Nest JWT를 공급한다. 각 단계의 “로그인·친구·방·채팅이 실제로 되는가” E2E 통과 조건과 롤백 절차를 작업 분할에 추가한다.

3. **위치:** 초안 §4.3~4.5(스키마/RPC/Realtime), 현재 `server/src/chat/chat-message.service.ts:72-112, 156-207`, `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/hooks/useChatMessages.ts:35-46, 125-134`  
   **문제:** `last_read_message_id`와 cursor/안읽은 수의 순서 키가 정의되지 않았다. 사용자만 UUID로 적었지만 메시지도 UUID가 되면 `<` 비교가 성립하지 않으며, Broadcast는 비내구성·순서 미보장이라 `read_update`와 새 메시지의 도착 순서를 신뢰할 수 없다.  
   **구체적 실패 시나리오:** 재연결 중 메시지 105 수신보다 `last_read=105`가 먼저 오거나 read 이벤트 하나를 놓치면 발신자 화면의 안읽은 수가 0/과대 상태로 고정된다. UUID 메시지 ID에 대해 마지막 읽은 값을 비교하면 “이후 메시지” 판정과 무한스크롤 cursor도 임의 순서가 된다.  
   **제안 수정:** 메시지에 불변의 단조 증가 `bigint sequence`(표시 ID는 UUID여도 됨)를 두고 `(created_at, id)` 같은 안정 cursor와 `last_read_sequence`을 명세한다. `mark_read` RPC는 `greatest(existing, requested/latest)`로 단조 갱신하고, 입장/재연결 시 REST 조회로 메시지와 모든 참여자의 read watermark 스냅샷을 먼저 동기화한 뒤 채널을 구독한다. 이벤트에는 sequence/version을 넣어 오래된 read 이벤트를 버리고, unread 계산·동시 송신·재연결 pgTAP/E2E를 추가한다.

### 🟠 중요

4. **위치:** 초안 §4.4(권한), §4.7(Data API GRANT)  
   **문제:** “RLS + RPC”만 있고 테이블/함수별 `GRANT`와 `REVOKE` 매트릭스가 없다. RLS policy는 권한 부여가 아니며, 신규 public 테이블은 명시적 GRANT가 없으면 Data API가 42501로 실패한다. 반대로 넓은 `authenticated` UPDATE/EXECUTE를 주면 의도한 RPC 전용 제어가 깨진다.  
   **구체적 실패 시나리오:** 배포 후 `profiles/messages` select가 모두 permission denied가 되거나, 편의를 위해 `GRANT UPDATE ON ALL TABLES`를 추가해 클라이언트가 `sender_id`, `deleted_at`, `role`, 다른 사용자의 read pointer를 직접 바꾼다.  
   **제안 수정:** 마이그레이션에 역할×테이블×동작의 최소 권한표를 넣고, 직접 SELECT/INSERT가 필요한 것만 `authenticated`에 GRANT한다. UPDATE/DELETE는 필요한 테이블에서도 전부 회수하고 RPC execute만 허용한다. `anon`/`PUBLIC` 함수 execute를 명시적으로 revoke하고, CI에서 anon·다른 방 사용자·본인 각각으로 GRANT/RLS 부정 테스트를 한다. 근거: [RLS: grants와 policy는 별도 계층](https://supabase.com/docs/guides/database/postgres/row-level-security), [Data API 자동 노출 변경 공지](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

5. **위치:** 초안 §4.3 `profiles.role`, §4.4 관리자/권한 설계 부재, 현재 `server/src/users/users.controller.ts:15-49`, `server/src/common/guards/roles.guard.ts:8-23`  
   **문제:** 현재 관리자 사용자 목록은 서버 JWT의 `ADMIN` role guard로 보호되지만, 새 설계는 role의 신뢰 원천과 변경 주체가 없다. `profiles`를 사용자가 update할 수 있거나 `user_metadata`를 RLS 권한 판단에 쓰면 자기 자신을 ADMIN으로 만들 수 있다.  
   **구체적 실패 시나리오:** 프로필 편집 정책이 `auth.uid() = id`인 상태에서 클라이언트가 `role='ADMIN'`을 update하고 `listUsers`를 실행해 전 사용자 프로필·푸시 endpoint를 조회한다.  
   **제안 수정:** role은 클라이언트 쓰기 불가한 별도 authorization 테이블 또는 `raw_app_meta_data`에만 저장하고, 승격은 운영자 전용 server/admin 작업으로 제한한다. `user_metadata`는 권한 판단에 절대 쓰지 않으며 admin RPC는 호출자 권한을 함수 본문에서 재검증한다. 근거: [RLS의 user_metadata/app_metadata 구분](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth Users의 user_metadata 경고](https://supabase.com/docs/guides/auth/users).

6. **위치:** 초안 §4.4 `is_room_member`, RPC, §4.5 Broadcast trigger  
   **문제:** RLS policy에서 참여자 테이블을 읽는 helper는 재귀 RLS를 피하려고 `SECURITY DEFINER`가 될 가능성이 높지만, 함수 소유자·`search_path`·EXECUTE 회수·함수 본문의 호출자 검증이 명세되지 않았다. Broadcast trigger 예시도 `SECURITY DEFINER`를 사용하므로 같은 위험이 있다.  
   **구체적 실패 시나리오:** migration으로 만든 definer 함수가 기본 `PUBLIC EXECUTE`를 유지하고 방 ID만 인자로 받으면, 인증된 사용자가 임의 방의 멤버십/메시지 정보를 반환하는 RPC를 호출하거나 search path shadowing으로 의도 밖 함수를 실행한다.  
   **제안 수정:** invoker가 가능한 함수는 기본 invoker로 둔다. definer가 필요한 policy helper는 비노출 schema에 두고 `security definer set search_path = ''`, 모든 relation schema qualification, `revoke execute ... from public, anon`, 최소 role grant를 SQL 표준으로 강제한다. 외부 RPC는 `auth.uid()`와 방 멤버/소유권을 함수 내부에서 다시 확인하며, helper 자체는 Data API에 노출하지 않는다. 근거: [Database functions 보안 지침](https://supabase.com/docs/guides/database/functions).

7. **위치:** 초안 §4.5 Realtime  
   **문제:** private 채널 선언만으로 수신 권한이 생기지 않는다. `realtime.messages`의 broadcast `SELECT`(수신; 필요 시 INSERT/송신) policy, `private: true`, 접속 JWT 갱신, 멤버십 철회 뒤 정책 cache 무효화가 빠져 있다.  
   **구체적 실패 시나리오:** 정책이 없으면 방 멤버도 join/수신하지 못해 채팅이 정적 화면이 된다. 반대로 topic 검증 없는 넓은 SELECT policy면 `room:<다른 방 UUID>` 구독으로 타인 메시지를 받는다. 방에서 제거된 사용자는 이미 연결된 경우 JWT 만료/갱신 전까지 계속 이벤트를 받을 수 있다.  
   **제안 수정:** topic suffix와 `chat_room_participants`를 매칭하는 `realtime.messages` SELECT policy를 정확히 정의하고 클라이언트에서 `private: true` 및 access-token 갱신을 구현한다. 멤버 제거 시 강제 세션/채널 재연결 또는 짧은 JWT TTL을 설계하고, 허용·거부·철회 중 연결 케이스를 E2E로 검증한다. 근거: [Realtime Authorization](https://supabase.com/docs/guides/realtime/authorization), [Broadcast 설정](https://supabase.com/docs/guides/realtime/broadcast).

8. **위치:** 초안 §4.6, 현재 `server/src/push/push.service.ts:67-147`, `client/src/hooks/usePushNotification.ts:69-176`  
   **문제:** webhook→Edge Function의 인증·비밀 관리·중복 전달(idempotency)·실패 재시도·410/404 구독 정리 요구사항이 빠져 있다. service/secret key는 RLS를 우회하므로 “service role로 조회”만으로는 안전한 설계가 아니다.  
   **구체적 실패 시나리오:** webhook URL/헤더가 노출되면 공격자가 임의 payload로 푸시를 대량 발송한다. webhook 재시도 또는 동일 INSERT 처리로 중복 푸시가 가고, 만료 endpoint가 남아 모든 새 메시지에서 실패 호출 비용이 누적된다.  
   **제안 수정:** Edge Function은 전용 webhook secret 또는 Vault의 secret key로 요청을 인증하고, secret를 SQL/저장소에 평문으로 두지 않는다. event/message ID idempotency 저장·재시도/관측성·만료 subscription 제거를 명세하며, 서비스 키는 Function 내부에서만 사용한다. 근거: [Database Webhooks](https://supabase.com/docs/guides/database/webhooks), [secret key와 webhook 보안](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

9. **위치:** 초안 §1·§4.7·§5  
   **문제:** “월 0원”만 목표로 두고 Free 플랜 상한과 중단 시 UX/운영 절차가 없다. Broadcast는 메시지와 읽음 이벤트가 모두 과금 메시지이며, Free는 Realtime 월 200만 메시지·피크 200 연결, DB 500 MB, egress 5 GB이고, 내장 Auth 이메일은 시간당 2통이며 저활동 프로젝트는 7일 후 pause될 수 있다.  
   **구체적 실패 시나리오:** 읽음 이벤트를 방 입장·각 메시지마다 전체 방으로 broadcast하면 활동량이 작은 그룹 채팅도 예상보다 빨리 quota를 소진한다. 테스트/데모 중 이메일 가입을 반복해 429가 나거나, 저활동 서비스가 pause되어 540을 반환해 로그인·채팅이 동시에 멈춘다.  
   **제안 수정:** 페이지 진입 시 한 번만 읽음 update하고 동일 watermark 이벤트를 억제하며, usage dashboard 경보·quota 초과/540 안내·백업/복구 runbook을 배포 정의에 넣는다. 이메일 가입 방식은 custom SMTP/테스트 계정 정책을 결정하고, 용량·Realtime·egress 임계치를 사전에 측정한다. 근거: [Free quotas](https://supabase.com/docs/guides/platform/billing-on-supabase), [Auth rate limit](https://supabase.com/docs/guides/auth/rate-limits), [Free project pausing](https://supabase.com/docs/guides/platform/free-project-pausing).

### 🟡 사소

10. **위치:** 초안 §4.7 첫 번째 항목  
   **문제:** “2026-10-30부터 모든 프로젝트”라는 표현은 현재(2026-10-13) 시점에는 미래이며, 공식 공지는 새 프로젝트 기본 전환이 2026-05-30부터이고 기존 프로젝트 강제가 2026-10-30이라고 구분한다.  
   **구체적 실패 시나리오:** 팀이 현 시점 배포에서는 GRANT가 필요 없다고 오해해 신규 프로젝트의 Data API 호출이 즉시 42501로 실패한다.  
   **제안 수정:** 날짜가 아니라 “모든 migration은 명시적 최소 GRANT/REVOKE를 포함”을 불변 규칙으로 쓰고, project 생성 설정과 실제 권한 smoke test를 CI에 넣는다. 근거: [공식 변경 공지](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically).

11. **위치:** 초안 §4.3 `profiles.username unique`, §2 카카오 OAuth  
   **문제:** 표시명/친구 검색용 username의 생성·변경·정규화·동시성 충돌 규칙이 없다. 현재도 카카오 nickname을 username hint로 사용한다(`server/src/auth/auth.service.ts:145-165`).  
   **구체적 실패 시나리오:** 같은 카카오 nickname 두 명이 가입하면 profile trigger의 unique violation으로 OAuth 가입만 실패하거나, 대소문자/공백 변형 계정이 친구 검색에서 혼동된다.  
   **제안 수정:** Auth 사용자 생성과 profile 초기화를 원자적으로 다루고, username 정책(대소문자 정규화, 예약어, 충돌 시 재선택 UI, 변경 권한)을 §4 인증/스키마에 명시한다.

## 3. 기획 초안이 놓친 기능/요구사항

- **관리자 목록의 페이지네이션·정렬·상한:** 현재 `server/src/users/users.controller.ts:24-49`는 page/limit(최대 100)/sort/order와 총 개수를 제공한다. `listUsers (admin)`만으로는 UI 계약이 사라진다.
- **푸시 구독의 upsert와 만료 구독 청소:** 현재는 `(userId, endpoint)` 기존 행을 갱신하고 404/410이면 삭제한다(`server/src/push/push.service.ts:35-64, 99-126`). 새 `push_subscriptions`에도 unique key와 정리 작업이 필요하다.
- **메시지 표현 계약:** 현재는 삭제 메시지의 content를 빈 문자열로 마스킹하고, 답장 대상 삭제 시에도 reply preview를 빈 문자열로 보존하며, `message`/`content` 하위호환 필드를 함께 낸다(`server/src/chat/chat-message.service.ts:75-112`). domain DTO에 이를 명시하지 않으면 UI 교체 중 삭제/답장 렌더링이 깨진다.
- **방 입장 시 최신 페이지 조회와 즉시 읽음 처리:** 서버는 멤버십 검증 후 최신 30개를 보내고 최신 메시지까지 read pointer를 갱신한다(`server/src/chat/chat.gateway.ts:88-123`). Realtime은 이 초기 상태를 대체하지 않으므로 fetch+구독 순서/누락 복구가 필요하다.
- **권한 오류의 사용자 노출 계약:** 기존 gateway는 `CHAT_FORBIDDEN`, `CHAT_ROOM_NOT_FOUND` 같은 코드를 `message_error`로 보낸다(`server/src/chat/chat.gateway.ts:38-49, 125-204`). RPC/PostgREST 오류를 그대로 노출하지 말고 domain 오류로 매핑해야 한다.
- **서비스 워커/VAPID 공개키 및 브라우저 구독 UX:** 현재 client는 service worker 등록, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, 구독 상태 검사·해제를 가진다(`client/src/hooks/usePushNotification.ts:41-184`). Edge Function만으로는 이 사용자 측 구성과 key rotation 계획이 충족되지 않는다.

## 4. 동의하는 핵심 결정과 그 이유

- UI가 provider SDK를 직접 import하지 않고 서비스 경계를 둔 결정은 옳다. 다만 위의 port/DTO 계약까지 확장해야 실제 교체 경계가 된다.
- RLS를 기본 보안선으로 두고 수정·삭제·읽음·방 생성을 RPC로 모으려는 결정은 컬럼 단위 권한 한계를 피하는 적절한 방향이다.
- Postgres Changes 대신 Database-trigger Broadcast를 채택한 것은 대규모 구독에서 더 제어 가능하며, DB 변경과 이벤트를 가깝게 둘 수 있다. 단, 권한 policy와 재동기화가 선행 조건이다.
- 기존 MySQL을 이관하지 않고 새로 시작하는 결정은 UUID/권한 모델을 깨끗하게 정리할 수 있어 현 범위에서는 YAGNI에 부합한다. 반대로 초기에 별도 custom schema, 복잡한 metadata 권한 캐시, 다단계 webhook 재시도 플랫폼까지 만들 필요는 없다.
