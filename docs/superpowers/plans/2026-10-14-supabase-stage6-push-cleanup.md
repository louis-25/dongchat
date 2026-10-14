# Supabase 이전 6단계(웹 푸시 + 정리) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 새 메시지 웹 푸시를 Supabase(트리거 → pg_net → Edge Function `send-push` → web-push)로 옮기고, NestJS `server/`·axios·socket.io·Orval 등 이전 백엔드 흔적을 지운 뒤 개발·배포 문서를 Supabase 기준으로 다시 쓴다. 이 단계가 끝나면 브랜치 병합 준비가 된다.

**Architecture:** `messages` AFTER INSERT 트리거가 Vault에 저장된 웹훅 URL·비밀로 `net.http_post({messageId})`를 비동기 호출한다. Edge Function은 비밀을 검증하고, service role로 `public.push_targets(messageId)`(참여자 − 발신자 − 정지 사용자, 구독·제목·본문 포함)를 받아 `web-push`의 `generateRequestDetails`로 암호화한 요청을 `fetch`로 보낸다(`sendNotification`은 Node https를 써서 Deno에서 http 엔드포인트·일부 환경에서 실패 — 스파이크로 확인). 404/410이면 구독을 지운다. 클라이언트는 `services/push.ts`의 `register_push_subscription` RPC(엔드포인트 소유권 이전 포함)로 저장하고, 로그아웃 시 이 브라우저 구독을 지운다.

**Tech Stack:** Supabase CLI 2.120.0(로컬 edge-runtime 1.77.4 / Deno 2.1), `npm:web-push@3.6.7`, `npm:@supabase/supabase-js@2.117.2`, pg_net, supabase_vault, Next.js 16, Node 24.

**Spec:** `docs/superpowers/specs/2026-10-13-supabase-migration-design.md` (§2.2 삭제·추가, §3.3, §10 푸시, §11, §12-6단계, §13)

## 스파이크로 확인한 사실(2026-10-14, 로컬)

- `npm:web-push@3.6.7`이 edge-runtime에서 로드된다. `generateRequestDetails` + `fetch`로 보낸 요청을 Node에서 RFC 8291로 복호화하면 원문(`{"title":"t","body":"안녕"}`)이 나온다. 410 응답 코드가 그대로 전달된다. `SUPABASE_SERVICE_ROLE_KEY` 환경 변수가 주입된다.
- DB 컨테이너의 pg_net은 `http://kong:8000/functions/v1/<name>`으로 함수에 닿는다. 함수 컨테이너는 `http://host.docker.internal:<port>`로 호스트에 닿는다.
- Windows 로컬에서는 함수 코드 변경이 핫 리로드되지 않는다 → `docker restart supabase_edge_runtime_dongchat`. 새 함수 디렉터리 추가나 `config.toml` 변경은 `supabase stop && supabase start`.

## Global Constraints

- pnpm, 명령은 `client/`에서(마이그레이션·pgTAP·Supabase CLI는 저장소 루트). 새 클라 의존성 없음, 제거만(axios, socket.io-client, orval, openapi-typescript-codegen).
- 비밀(VAPID 개인키, 웹훅 비밀)은 저장소에 넣지 않는다: 로컬은 gitignore된 `supabase/.env`, 운영은 `supabase secrets set` + Vault. 클라에는 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`만.
- 푸시 대상(§10): 방 참여자 − 발신자 − 정지 사용자(`private.user_access.banned_until`·`auth.users.banned_until` 미래). 삭제된 메시지는 보내지 않는다.
- payload(§10, 현행 동일 + URL만 새 라우트): `{title: 방 이름 ?? 발신자 표시명, body: content, data: {roomId, url: '/chat/rooms?room=<roomId>'}}`.
- 웹훅 미설정 환경(Vault 값 없음)에서는 트리거가 아무것도 하지 않는다(메시지 전송은 항상 성공).
- `@supabase/*`, `@/lib/supabase/*` import 경계 유지. Edge Function(`supabase/functions/**`)은 클라 tsc·lint 대상이 아니다.
- 각 Task 완료 조건: 명시된 테스트 + `pnpm exec tsc --noEmit` + `pnpm lint`(에러 0, 경고 ≤ 5). 기준선: `pnpm test` 31 pass, pgTAP 140.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 받는 사람: 발신자 본인·정지 사용자·이미 나간 사람에게는 가지 않고, 같은 사람이 여러 기기(구독 여러 개)면 모두에게 간다. → Task 1 pgTAP(`push_targets`) + Task 2 통합 스크립트
2. 공용 브라우저: A가 로그아웃하면 이 브라우저 구독이 지워지고, B가 같은 브라우저에서 켜면 구독이 B로 넘어간다(A의 메시지가 B 화면에 뜨지 않음). → Task 1 pgTAP(`register_push_subscription`) + Task 3 로그아웃 정리 + Task 2 스크립트
3. 만료된 구독(410/404)은 자동으로 지워지고, 웹훅 비밀 없이 함수를 호출하면 401이며, 임의의 http 주소를 구독으로 등록해도 운영에서는 보내지 않는다(SSRF 방지: https만, 로컬만 http 허용). → Task 2 스크립트
4. 알림을 누르면 그 방이 선택된 채팅 탭이 열린다(이미 열린 창이 있으면 그 창으로). → Task 3 단위 테스트(`roomIdFromSearch`) + Task 6 브라우저
5. 정리 후 앱 전체가 그대로 동작한다(옛 NestJS 주소·axios·socket 의존 없음, 빌드 성공, 기존 브라우저 확인 회귀 없음). → Task 4 grep·build + Task 6 회귀(chat 27, admin 31)

---

## File Structure

```
supabase/
  migrations/<ts>_push.sql                     # pg_net, push_targets, register_push_subscription, 트리거
  tests/database/110_push.test.sql
  functions/send-push/index.ts                 # Edge Function
  config.toml                                  # [functions.send-push] verify_jwt=false, [edge_runtime.secrets]
  seed.sql                                     # 로컬 Vault 웹훅 URL·비밀
  .env.example                                 # + PUSH_WEBHOOK_SECRET, PUSH_ALLOW_HTTP, VAPID_*
client/
  scripts/verify-push.mjs                      # 웹훅→함수→가짜 푸시 서버(복호화) 통합 검증
  src/services/push.ts                         # registerPushSubscription / removePushSubscription / removeThisBrowserPush
  src/services/auth.ts                         # signOut 전에 이 브라우저 구독 정리
  src/hooks/usePushNotification.ts             # 전체 교체(Supabase)
  src/lib/push-url.ts (+ .test.ts)             # roomIdFromSearch
  src/app/(protected)/chat/[menu]/_components/ChatRooms/index.tsx   # ?room= 선택
  src/app/(protected)/chat/[menu]/page.tsx     # 떠도는 ";" 제거
  public/service-worker.js                     # 알림 클릭 시 기존 창 이동
  package.json / pnpm-lock.yaml                # 의존성 제거, verify 스크립트
  .env.local.example                           # NEXT_PUBLIC_API_URL 제거
  AGENTS.md                                    # 전체 교체
삭제: server/, docker-compose.yml, test-login.json, test-register.json, PUSH_NOTIFICATION_SETUP.md,
      client/orval.config.ts, client/src/lib/api-client.ts, client/src/lib/api/, client/src/lib/models/,
      client/src/config/, client/src/services/{app,users,push}/ (Orval)
문서: README.md, DEV_SETUP.md, DEPLOYMENT.md, AGENTS.md(루트) 전체 교체
```

---

### Task 1: 푸시 DB 계층(대상 선정·구독 등록·웹훅 트리거)

**Files:**
- Create: `supabase/tests/database/110_push.test.sql`
- Create: `supabase/migrations/<timestamp>_push.sql` (CLI 생성)
- Modify: `supabase/seed.sql` (끝에 Vault 값 추가)

**Interfaces:**
- Produces:
  - `public.push_targets(p_message_id bigint) returns table(endpoint text, p256dh text, auth text, title text, body text, room_id bigint)` — `service_role`만 EXECUTE
  - `public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void` — `authenticated`, 활성 세션, 같은 endpoint가 있으면 호출자에게 소유권 이전
  - 트리거 `messages_push`(AFTER INSERT) → `net.http_post(url := vault 'push_webhook_url', body := {messageId}, headers := {Content-Type, x-webhook-secret: vault 'push_webhook_secret'})`, 둘 중 하나라도 없으면 무동작

- [ ] **Step 1: 실패하는 pgTAP** — `supabase/tests/database/110_push.test.sql`

```sql
begin;
select plan(14);

select tests.create_user('pu_alice@test.com', '{"username":"pu_alice"}');
select tests.create_user('pu_bob@test.com', '{"username":"pu_bob"}');
select tests.create_user('pu_carol@test.com', '{"username":"pu_carol"}');
select tests.create_user('pu_dave@test.com', '{"username":"pu_dave"}');
select tests.create_user('pu_erin@test.com', '{"username":"pu_erin"}');

-- 구독: bob 2기기, carol 1, alice(발신자) 1
select tests.login_as(tests.uid('pu_bob@test.com'));
select lives_ok($$ select public.register_push_subscription('https://push.test/bob1', 'k', 'a') $$, '본인 구독 등록');
select throws_ok($$ select public.register_push_subscription('javascript:alert(1)', 'k', 'a') $$, 'P0001', 'VALIDATION_FAILED', '형식이 아닌 endpoint 거부');
select public.register_push_subscription('https://push.test/bob2', 'k', 'a');
reset role;
select tests.login_as(tests.uid('pu_carol@test.com'));
select public.register_push_subscription('https://push.test/carol', 'k', 'a');
reset role;
select tests.login_as(tests.uid('pu_erin@test.com'));
select public.register_push_subscription('https://push.test/erin', 'k', 'a');
reset role;
select tests.login_as(tests.uid('pu_alice@test.com'));
select public.register_push_subscription('https://push.test/alice', 'k', 'a');
select public.create_room('pu_room', true, array['pu_bob', 'pu_carol', 'pu_erin']);
insert into public.messages (room_id, content) values (tests.room_id('pu_room'), '푸시');
select throws_ok(
  format('select * from public.push_targets(%s)', (select max(id) from public.messages)),
  '42501', null, '일반 사용자는 push_targets 호출 불가');
reset role;

-- 1·2·3: 대상 = 참여자 − 발신자, 기기별 구독, 제목·본문
select is(
  (select array_agg(endpoint order by endpoint) from public.push_targets((select max(id) from public.messages))),
  array['https://push.test/bob1', 'https://push.test/bob2', 'https://push.test/carol', 'https://push.test/erin'],
  '발신자 제외, 여러 기기 모두');
select is((select distinct title from public.push_targets((select max(id) from public.messages))), 'pu_room', '제목 = 방 이름');
select is((select distinct body from public.push_targets((select max(id) from public.messages))), '푸시', '본문 = 내용');

-- 4·5: 정지 사용자 제외 — 대시보드 Ban(auth.users)과 앱 정지(private.user_access) 둘 다
update auth.users set banned_until = now() + interval '1 day' where id = tests.uid('pu_carol@test.com');
select is(
  (select array_agg(endpoint order by endpoint) from public.push_targets((select max(id) from public.messages))),
  array['https://push.test/bob1', 'https://push.test/bob2', 'https://push.test/erin'],
  '대시보드 Ban 사용자 제외');
insert into private.user_access (user_id, banned_until) values (tests.uid('pu_erin@test.com'), now() + interval '1 day');
select is(
  (select array_agg(endpoint order by endpoint) from public.push_targets((select max(id) from public.messages))),
  array['https://push.test/bob1', 'https://push.test/bob2'],
  '앱 정지 사용자 제외');

-- service_role(Edge Function)은 대상 조회·만료 구독 삭제가 가능해야 한다
set local role service_role;
select lives_ok(
  format('select * from public.push_targets(%s); delete from public.push_subscriptions where endpoint = %L',
         (select max(id) from public.messages), 'https://push.test/none'),
  'service_role: push_targets 실행·구독 삭제 권한');
reset role;

-- 5: 삭제된 메시지는 보내지 않음
update public.messages set deleted_at = now(), content = '' where id = (select max(id) from public.messages);
select is((select count(*)::int from public.push_targets((select max(id) from public.messages))), 0, '삭제된 메시지 대상 없음');

-- 6·7: 공용 브라우저 — dave가 bob의 endpoint를 등록하면 dave 소유로 넘어간다
select tests.login_as(tests.uid('pu_dave@test.com'));
select public.register_push_subscription('https://push.test/bob1', 'k2', 'a2');
reset role;
select is((select user_id from public.push_subscriptions where endpoint = 'https://push.test/bob1'), tests.uid('pu_dave@test.com'), '같은 endpoint는 등록한 사람에게 이전');
select is((select p256dh from public.push_subscriptions where endpoint = 'https://push.test/bob1'), 'k2', '키 갱신');

-- 웹훅 트리거 — Vault 값이 있을 때만 요청 큐에 쌓인다.
-- seed의 로컬 값을 먼저 지우고(vault.secrets.name은 unique) 테스트 값을 만든다 → 트리거가 읽는 값은 하나뿐(롤백으로 복원).
delete from vault.secrets where name in ('push_webhook_url', 'push_webhook_secret');
select tests.login_as(tests.uid('pu_alice@test.com'));
insert into public.messages (room_id, content) values (tests.room_id('pu_room'), '설정 전');
reset role;
select is(
  (select count(*)::int from net.http_request_queue where url = 'http://push.test/hook'),
  0, 'Vault 미설정이면 웹훅 없음(전송은 성공)');
select vault.create_secret('http://push.test/hook', 'push_webhook_url');
select vault.create_secret('s3cret', 'push_webhook_secret');
select tests.login_as(tests.uid('pu_alice@test.com'));
insert into public.messages (room_id, content) values (tests.room_id('pu_room'), '설정 후');
reset role;
select ok(
  exists(select 1 from net.http_request_queue
         where url = 'http://push.test/hook' and headers ->> 'x-webhook-secret' = 's3cret'
           and convert_from(body, 'utf8')::jsonb ? 'messageId'),
  'Vault 설정 시 messageId와 비밀 헤더로 웹훅');

select * from finish();
rollback;
```

(`net.http_request_queue.body`는 bytea, `headers`는 jsonb — 로컬 pg_net에서 확인.)

(assertion 14개: 등록·형식 거부·일반 사용자 호출 거부 3, 대상 배열·제목·본문 3, 정지 2원천 2, service_role 1, 삭제 메시지 1, 소유권 이전 2, 웹훅 2.)

- [ ] **Step 2: 실패 확인**

Run(저장소 루트): `npx -y supabase@2.120.0 test db 2>&1 | grep -E "110_push|Result"`
Expected: FAIL — `register_push_subscription`/`push_targets` 없음(함수 미존재 오류로 계획 수 불일치).

- [ ] **Step 3: 마이그레이션** — `npx -y supabase@2.120.0 migration new push` → 출력 파일에 작성:

```sql
create extension if not exists pg_net with schema extensions;

-- 푸시 대상(스펙 §10): 방 참여자 − 발신자 − 정지 사용자, 기기(구독)별 한 행. Edge Function(service role) 전용.
create or replace function public.push_targets(p_message_id bigint)
returns table (endpoint text, p256dh text, auth text, title text, body text, room_id bigint)
language sql stable security definer set search_path = ''
as $$
  select s.endpoint, s.p256dh, s.auth,
         coalesce(r.name, sp.nickname, sp.username, '새 메시지') as title,
         m.content as body,
         m.room_id
  from public.messages m
  join public.chat_rooms r on r.id = m.room_id
  left join public.profiles sp on sp.id = m.sender_id
  join public.chat_room_participants p on p.room_id = m.room_id and p.user_id is distinct from m.sender_id
  join public.push_subscriptions s on s.user_id = p.user_id
  join auth.users u on u.id = p.user_id
  left join private.user_access a on a.user_id = p.user_id
  where m.id = p_message_id
    and m.deleted_at is null
    and coalesce(a.banned_until, '-infinity'::timestamptz) <= now()
    and coalesce(u.banned_until, '-infinity'::timestamptz) <= now();
$$;
revoke execute on function public.push_targets(bigint) from public, anon, authenticated;
grant execute on function public.push_targets(bigint) to service_role;
-- Edge Function이 410/404 구독을 지운다(기본 권한에 기대지 않고 명시)
grant select, delete on table public.push_subscriptions to service_role;

-- 구독 등록. endpoint는 그 브라우저만 아는 값이므로 제시한 사람이 그 브라우저의 현재 사용자다 →
-- 다른 사용자 소유였다면 넘겨받는다(공용 브라우저에서 이전 사용자 메시지가 뜨지 않게).
create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_active_session();
  -- endpoint는 http(s) URL(운영 발송은 Edge Function이 https만 허용), 키는 base64url
  if coalesce(p_endpoint, '') !~ '^https?://[^\s]+$' or char_length(p_endpoint) > 2000
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{1,200}$'
     or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{1,200}$' then
    raise exception 'VALIDATION_FAILED' using hint = '푸시 구독 정보가 올바르지 않습니다.';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
revoke execute on function public.register_push_subscription(text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;

-- 새 메시지 → 웹훅(pg_net, 비동기). URL·비밀은 환경별 Vault 값(로컬은 seed.sql, 운영은 DEPLOYMENT.md).
-- 미설정이거나 실패해도 메시지 INSERT는 깨지지 않는다.
create or replace function private.messages_push() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_webhook_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('messageId', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
  );
  return null;
exception when others then
  raise warning 'push webhook failed: %', sqlerrm;
  return null;
end;
$$;
revoke execute on function private.messages_push() from public, anon, authenticated;
create trigger messages_push after insert on public.messages
  for each row execute function private.messages_push();
```

Run: `npx -y supabase@2.120.0 migration up`

- [ ] **Step 4: 통과 확인**

Run: `npx -y supabase@2.120.0 test db 2>&1 | tail -2`
Expected: `Files=12, Tests=154 ... Result: PASS`.

- [ ] **Step 5: 로컬 Vault 값** — `supabase/seed.sql` 끝에 추가하고, 지금 DB에도 한 번 적용

```sql
-- 로컬 웹 푸시 웹훅(메시지 트리거 → Edge Function). 비밀은 supabase/.env의 PUSH_WEBHOOK_SECRET과 같아야 한다.
-- 운영 값은 DEPLOYMENT.md의 "웹 푸시" 절차로 별도 설정한다.
select vault.create_secret('http://kong:8000/functions/v1/send-push', 'push_webhook_url');
select vault.create_secret('local-dev-push-secret', 'push_webhook_secret');
```

Run: `docker exec supabase_db_dongchat psql -U postgres -c "select vault.create_secret('http://kong:8000/functions/v1/send-push', 'push_webhook_url'); select vault.create_secret('local-dev-push-secret', 'push_webhook_secret');"`
Expected: 두 개의 uuid 출력. (pgTAP 110은 트랜잭션 안에서 이 값을 지웠다가 롤백하므로 영향 없음 — Step 4 재실행으로 확인.)

- [ ] **Step 6: 보안 점검과 커밋**

Run: `npx -y supabase@2.120.0 db advisors --local 2>&1 | grep -o '"detail":"[^"]*"' | grep -v "tests\." `
Expected: 출력 없음(새 함수 경고 없음).

```bash
git add supabase/migrations/*_push.sql supabase/tests/database/110_push.test.sql supabase/seed.sql
git commit -m "feat(push): 푸시 대상 선정·구독 등록 RPC와 메시지 웹훅 트리거(pg_net·Vault, pgTAP)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Edge Function `send-push`와 통합 검증

**Files:**
- Create: `supabase/functions/send-push/index.ts`
- Modify: `supabase/config.toml` (`[functions.send-push]`, `[edge_runtime.secrets]`)
- Modify: `supabase/.env.example`
- Create: `client/scripts/verify-push.mjs`
- 로컬 전용(커밋 안 함): `supabase/.env`에 VAPID·웹훅 비밀 추가(값은 `server/.env`에서 이동)

**Interfaces:**
- Consumes: Task 1 `push_targets`, `register_push_subscription`, 트리거, Vault 값
- Produces: `POST /functions/v1/send-push` — 헤더 `x-webhook-secret` 불일치 시 401, 본문 `{messageId}` → `{sent, statuses}`; 대상별 web push(TTL 60), 404/410이면 구독 삭제, `PUSH_ALLOW_HTTP !== "true"`이면 https가 아닌 endpoint는 보내지 않음

- [ ] **Step 1: 실패하는 통합 스크립트** — `client/scripts/verify-push.mjs`

```js
// 웹 푸시 계약 검증: 메시지 → DB 웹훅 → Edge Function → (가짜) 푸시 서비스. 받은 요청을 RFC 8291로 복호화해 내용을 확인한다.
// 전제(로컬): supabase/.env에 PUSH_WEBHOOK_SECRET=local-dev-push-secret, PUSH_ALLOW_HTTP=true, VAPID_* 설정,
// seed의 Vault 웹훅 값, 시드 admin. 함수 컨테이너가 host.docker.internal:54999로 이 스크립트의 서버에 접속한다.
//   SUPABASE_PUBLISHABLE_KEY=... PUSH_WEBHOOK_SECRET=local-dev-push-secret node scripts/verify-push.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { once } from "node:events";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const HOOK_SECRET = process.env.PUSH_WEBHOOK_SECRET;
assert.ok(KEY && HOOK_SECRET, "SUPABASE_PUBLISHABLE_KEY, PUSH_WEBHOOK_SECRET 환경 변수가 필요합니다.");
const PORT = 54999;

// ---- 가짜 푸시 서비스 + RFC 8291(aes128gcm) 복호화 ----
const b64u = (b) => Buffer.from(b).toString("base64url");
const device = () => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { ecdh, authSecret: crypto.randomBytes(16) };
};
const decrypt = ({ ecdh, authSecret }, body) => {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPub = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), asPub]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", ecdh.computeSecret(asPub), authSecret, info, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return JSON.parse(pt.subarray(0, pt.lastIndexOf(2)).toString());
};
const received = [];
const server = http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ path: req.url, body: Buffer.concat(chunks), headers: req.headers });
      res.statusCode = req.url.startsWith("/gone/") ? 410 : 201;
      res.end();
    });
  })
  .listen(PORT);
await once(server, "listening"); // 포트 충돌이면 여기서 EADDRINUSE로 실패
const waitFor = async (match, label, ms = 15000) => {
  for (let t = 0; t < ms; t += 200) {
    const hit = received.find(match);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.fail(`푸시 미수신: ${label}`);
};

// ---- 사용자 ----
const fresh = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = Date.now().toString(36);
async function signUp(tag) {
  const client = fresh();
  const username = `${tag}_${stamp}`.slice(0, 20);
  const { data, error } = await client.auth.signUp({
    email: `${username}@test.local`,
    password: "password123",
    options: { data: { username } },
  });
  assert.equal(error, null, error?.message);
  return { client, id: data.user.id, username };
}
const ok = async (query) => {
  const { data, error } = await query;
  assert.equal(error, null, error?.message);
  return data;
};
const subscribe = async (u, path, dev) =>
  ok(
    u.client.rpc("register_push_subscription", {
      p_endpoint: `http://host.docker.internal:${PORT}${path}`,
      p_p256dh: b64u(dev.ecdh.getPublicKey()),
      p_auth: b64u(dev.authSecret),
    }),
  );

try {
  // 비밀 없이 호출 → 401 (Review Focus 3)
  const unauth = await fetch(`${URL}/functions/v1/send-push`, { method: "POST", body: "{}" });
  assert.equal(unauth.status, 401, "웹훅 비밀 없으면 401");

  const u1 = await signUp("vp1");
  const u2 = await signUp("vp2");
  const u3 = await signUp("vp3");
  const dev2 = device();
  const dev3 = device();
  await subscribe(u2, `/ok/${stamp}`, dev2);
  await subscribe(u3, `/gone/${stamp}`, dev3);
  await subscribe(u1, `/sender/${stamp}`, device());
  const roomId = await ok(
    u1.client.rpc("create_room", { p_name: "push", p_is_group: true, p_usernames: [u2.username, u3.username] }),
  );

  // 메시지 → u2에게 푸시, 내용 복호화 (Review Focus 1)
  await ok(u1.client.from("messages").insert({ room_id: roomId, content: "푸시 테스트" }));
  const hit = await waitFor((r) => r.path === `/ok/${stamp}`, "u2");
  assert.equal(hit.headers["content-encoding"], "aes128gcm");
  assert.match(String(hit.headers.authorization), /^vapid t=/);
  assert.deepEqual(decrypt(dev2, hit.body), {
    title: "push",
    body: "푸시 테스트",
    data: { roomId, url: `/chat/rooms?room=${roomId}` },
  });
  await waitFor((r) => r.path === `/gone/${stamp}`, "u3(410)");
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(!received.some((r) => r.path === `/sender/${stamp}`), "발신자에게는 보내지 않음");
  assert.equal((await ok(u3.client.from("push_subscriptions").select("id"))).length, 0, "410 응답 구독은 삭제");

  // 공용 브라우저: u1이 u2의 endpoint를 등록하면 u1 소유 (Review Focus 2)
  await subscribe(u1, `/ok/${stamp}`, dev2);
  assert.equal((await ok(u2.client.from("push_subscriptions").select("id"))).length, 0, "이전 사용자 구독은 넘어감");

  // 정리(실패는 드러낸다)
  for (const u of [u1, u2, u3]) await ok(u.client.rpc("leave_room", { p_room_id: roomId }));
  await ok(u1.client.from("push_subscriptions").delete().like("endpoint", `%${stamp}`));
  console.log("verify-push: OK");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
```

- [ ] **Step 2: 실패 확인**

Run(`client/`): `SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH PUSH_WEBHOOK_SECRET=local-dev-push-secret node scripts/verify-push.mjs 2>&1 | grep -E "Assertion|OK|Error" | head -3`
Expected: FAIL — `웹훅 비밀 없으면 401`(함수가 없어 404).

- [ ] **Step 3: 로컬 비밀 이동** — `server/.env`의 `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`를 `supabase/.env`로 옮기고(값을 화면에 출력하지 않는다), 아래 키를 추가한다. 클라 `client/.env.local`의 `NEXT_PUBLIC_VAPID_PUBLIC_KEY`와 `VAPID_PUBLIC_KEY`가 같은지 확인한다.

```bash
grep -E '^VAPID_(PUBLIC|PRIVATE)_KEY=' server/.env >> supabase/.env
printf 'VAPID_SUBJECT=mailto:admin@dongchat.local\nPUSH_WEBHOOK_SECRET=local-dev-push-secret\nPUSH_ALLOW_HTTP=true\n' >> supabase/.env
grep -c -E '^(VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY|VAPID_SUBJECT|PUSH_WEBHOOK_SECRET|PUSH_ALLOW_HTTP)=' supabase/.env
```
Expected: `5`. (`server/.env`에 VAPID 값이 없으면 `npx -y web-push generate-vapid-keys`로 새로 만들고 `client/.env.local`의 공개키도 갱신한다 — Ruling 기록.)

`supabase/.env.example` 끝에 추가:

```bash
# 웹 푸시(Edge Function send-push가 사용). 생성: npx -y web-push generate-vapid-keys
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@dongchat.local
# DB 웹훅 비밀. 로컬 seed.sql의 Vault 값과 같아야 한다.
PUSH_WEBHOOK_SECRET=local-dev-push-secret
# 로컬 검증(가짜 푸시 서버)용 http endpoint 허용. 운영에서는 설정하지 않는다.
PUSH_ALLOW_HTTP=true
```

- [ ] **Step 4: 함수 설정** — `supabase/config.toml`

`# [edge_runtime.secrets]`와 `# secret_key = "env(SECRET_VALUE)"` 두 줄을 아래로 교체:

```toml
[edge_runtime.secrets]
VAPID_PUBLIC_KEY = "env(VAPID_PUBLIC_KEY)"
VAPID_PRIVATE_KEY = "env(VAPID_PRIVATE_KEY)"
VAPID_SUBJECT = "env(VAPID_SUBJECT)"
PUSH_WEBHOOK_SECRET = "env(PUSH_WEBHOOK_SECRET)"
PUSH_ALLOW_HTTP = "env(PUSH_ALLOW_HTTP)"

# DB 트리거(pg_net)가 JWT 없이 x-webhook-secret으로 호출한다 → 함수가 직접 검증.
[functions.send-push]
verify_jwt = false
```

- [ ] **Step 5: 함수** — `supabase/functions/send-push/index.ts`

```ts
// 새 메시지 웹 푸시(스펙 §10). DB 트리거(pg_net)가 x-webhook-secret과 함께 { messageId }를 보낸다.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import webpush from "npm:web-push@3.6.7";

type Target = { endpoint: string; p256dh: string; auth: string; title: string; body: string; room_id: number };

const env = (name: string) => Deno.env.get(name) ?? "";
const SECRET = env("PUSH_WEBHOOK_SECRET");
const ALLOW_HTTP = env("PUSH_ALLOW_HTTP") === "true"; // 로컬 검증 전용
const vapidDetails = {
  subject: env("VAPID_SUBJECT") || "mailto:admin@dongchat.local",
  publicKey: env("VAPID_PUBLIC_KEY"),
  privateKey: env("VAPID_PRIVATE_KEY"),
};
const MISSING = ["PUSH_WEBHOOK_SECRET", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(
  (name) => !env(name),
);
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

// 운영은 https만 허용해 임의 내부 주소 호출(SSRF)을 막는다. 파싱 실패도 거부.
const allowedEndpoint = (endpoint: string) => {
  try {
    const { protocol } = new URL(endpoint);
    return protocol === "https:" || (ALLOW_HTTP && protocol === "http:");
  } catch {
    return false;
  }
};

// 대상 하나의 실패(잘못된 키·네트워크)가 나머지 발송을 막지 않도록 전부 이 안에서 처리하고 상태 코드만 돌려준다(0 = 미발송).
async function send(t: Target): Promise<number> {
  if (!allowedEndpoint(t.endpoint)) return 0;
  try {
    const payload = JSON.stringify({
      title: t.title,
      body: t.body,
      data: { roomId: t.room_id, url: `/chat/rooms?room=${t.room_id}` },
    });
    // sendNotification은 Node https를 써서 Deno에서 불안정 → 요청만 만들고 fetch로 보낸다(스파이크로 확인).
    const req = webpush.generateRequestDetails({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, {
      vapidDetails,
      TTL: 60,
    });
    const res = await fetch(req.endpoint, { method: req.method, headers: req.headers, body: req.body });
    if (res.status === 404 || res.status === 410) {
      await admin.from("push_subscriptions").delete().eq("endpoint", t.endpoint); // 만료된 구독 정리
    }
    return res.status;
  } catch {
    return 0;
  }
}

Deno.serve(async (req) => {
  if (MISSING.length > 0) return new Response(`missing config: ${MISSING.join(", ")}`, { status: 500 });
  if (req.method !== "POST" || req.headers.get("x-webhook-secret") !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const messageId = body?.messageId;
  if (!Number.isSafeInteger(messageId) || messageId <= 0) return new Response("bad request", { status: 400 });

  const { data, error } = await admin.rpc("push_targets", { p_message_id: messageId });
  if (error) return new Response(error.message, { status: 500 });
  const targets = Array.isArray(data) ? (data as Target[]) : [];
  // ponytail: 동시 발송 수 제한 없음 — 한 방 구독이 수백 개가 되면 배치로 나눌 것.
  const statuses = await Promise.all(targets.map(send));
  return Response.json({ attempted: statuses.length, delivered: statuses.filter((s) => s >= 200 && s < 300).length });
});
```

- [ ] **Step 6: 반영(새 함수·설정) 후 통과 확인** (저장소 루트)

Run: `npx -y supabase@2.120.0 stop; npx -y supabase@2.120.0 start | tail -1` 후 `client/`에서 Step 2 명령.
Expected: `verify-push: OK`.

- [ ] **Step 7: 커밋**

```bash
git add supabase/functions/send-push/index.ts supabase/config.toml supabase/.env.example client/scripts/verify-push.mjs
git commit -m "feat(push): Edge Function send-push(웹훅 비밀·https 제한·만료 구독 정리)와 복호화 통합 검증

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 클라이언트 푸시 전환(구독 저장·로그아웃 정리·알림 클릭)

**Files:**
- Create: `client/src/services/push.ts`
- Create: `client/src/lib/push-url.ts`, `client/src/lib/push-url.test.ts`
- Modify: `client/src/services/auth.ts` (`signOut`)
- Modify: `client/src/hooks/usePushNotification.ts` (전체 교체)
- Modify: `ChatRooms/index.tsx` (`?room=`)
- Modify: `client/src/app/(protected)/chat/[menu]/page.tsx` (`<PushNotificationButton />;` 의 `;` 제거)
- Modify: `client/public/service-worker.js` (`notificationclick`)

**Interfaces:**
- Consumes: Task 1 `register_push_subscription`; 4단계 `useChat().setPickedRoomId`
- Produces:
  - `services/push.ts`: `registerPushSubscription(sub: PushSubscription): Promise<void>`, `removePushSubscription(endpoint: string): Promise<void>`, `removeThisBrowserPush(): Promise<void>`
  - `lib/push-url.ts`: `roomIdFromSearch(search: string): number | null`

- [ ] **Step 1: 실패하는 단위 테스트** — `client/src/lib/push-url.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { roomIdFromSearch } from "./push-url.ts";

test("알림 URL의 ?room=을 방 id로 읽는다", () => {
  assert.equal(roomIdFromSearch("?room=42"), 42);
  assert.equal(roomIdFromSearch("?x=1&room=7"), 7);
  assert.equal(roomIdFromSearch(""), null);
  assert.equal(roomIdFromSearch("?room=abc"), null);
  assert.equal(roomIdFromSearch("?room=0"), null);
  assert.equal(roomIdFromSearch("?room=-3"), null);
});
```

Run: `pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|Cannot find"` → FAIL(`Cannot find module ... push-url.ts`).

- [ ] **Step 2: 구현** — `client/src/lib/push-url.ts`

```ts
// 푸시 알림 클릭 URL(/chat/rooms?room=<id>)에서 열 방 id를 읽는다. 잘못된 값은 무시(null).
export const roomIdFromSearch = (search: string): number | null => {
  const id = Number(new URLSearchParams(search).get("room"));
  return Number.isInteger(id) && id > 0 ? id : null;
};
```

Run: `pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"` → tests 32, pass 32.

- [ ] **Step 3: 푸시 서비스** — `client/src/services/push.ts`

```ts
import { createClient } from "@/lib/supabase/client";
import { toDomainError } from "./errors";

// 웹 푸시 구독 경계. 발송은 서버(DB 웹훅 → Edge Function)가 한다.
export async function registerPushSubscription(sub: PushSubscription): Promise<void> {
  const { endpoint, keys } = sub.toJSON(); // keys.p256dh·auth는 base64url
  const { error } = await createClient().rpc("register_push_subscription", {
    p_endpoint: endpoint ?? "",
    p_p256dh: keys?.p256dh ?? "",
    p_auth: keys?.auth ?? "",
  });
  if (error) throw toDomainError(error);
}

export async function removePushSubscription(endpoint: string): Promise<void> {
  const { error } = await createClient().from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw toDomainError(error);
}

// 로그아웃 시 이 브라우저 구독을 지운다(공용 브라우저에 이전 사용자 메시지가 뜨지 않게). 실패해도 로그아웃은 진행.
export async function removeThisBrowserPush(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  await removePushSubscription(subscription.endpoint).catch(() => undefined);
  await subscription.unsubscribe().catch(() => undefined);
}
```

- [ ] **Step 4: 로그아웃 정리** — `client/src/services/auth.ts`

import 추가: `import { removeThisBrowserPush } from "./push";`
`signOut` 본문을 교체:

```ts
export async function signOut(scope: "local" | "global" = "local"): Promise<void> {
  await removeThisBrowserPush().catch(() => undefined); // 세션이 살아 있을 때 먼저(구독 행 삭제는 RLS상 본인 세션 필요)
  await createClient().auth.signOut({ scope });
}
```

- [ ] **Step 5: 구독 훅** — `client/src/hooks/usePushNotification.ts` 전체 교체

```ts
"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import useAuth from "@/hooks/useAuth";
import { registerPushSubscription, removePushSubscription } from "@/services/push";

// VAPID 공개키(base64url) → Uint8Array
const urlBase64ToUint8Array = (base64: string): Uint8Array<ArrayBuffer> => {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

const isPushSupported = () => "serviceWorker" in navigator && "PushManager" in window;
const noSubscribe = () => () => {};

/** 웹 푸시 구독 훅. 구독 정보는 Supabase(services/push)에 저장하고, 발송은 서버가 한다. */
export function usePushNotification() {
  const { user } = useAuth();
  // 서버 렌더·hydration 때는 false, 브라우저에서만 실제 값(불일치 없음, effect 안 setState 없음)
  const isSupported = useSyncExternalStore(noSubscribe, isPushSupported, () => false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const checkSubscription = useCallback(async () => {
    if (!isSupported || !user) return;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    setIsSubscribed(!!subscription);
  }, [isSupported, user]);

  useEffect(() => {
    void checkSubscription();
  }, [checkSubscription]);

  const subscribe = useCallback(async () => {
    if (!isSupported || !user || isLoading) return false;
    const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidPublicKey) {
      console.error("[Push] NEXT_PUBLIC_VAPID_PUBLIC_KEY가 설정되지 않았습니다.");
      return false;
    }
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js");
      await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
      await registerPushSubscription(subscription);
      setIsSubscribed(true);
      return true;
    } catch (error) {
      console.error("[Push] 구독 실패:", error);
      setIsSubscribed(false);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user, isLoading]);

  const unsubscribe = useCallback(async () => {
    if (!isSupported || isLoading) return false;
    setIsLoading(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await removePushSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      return true;
    } catch (error) {
      console.error("[Push] 구독 해제 실패:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, isLoading]);

  return { isSupported, isSubscribed, isLoading, subscribe, unsubscribe, checkSubscription };
}
```

(이 훅을 쓰는 버튼 컴포넌트의 반환값 사용법은 기존과 같다.)

- [ ] **Step 6: 알림 클릭으로 방 열기** — `ChatRooms/index.tsx`

import 추가: `import { roomIdFromSearch } from "@/lib/push-url";`
`const { setViewingRoom } = useChat();`를 `const { setViewingRoom, setPickedRoomId } = useChat();`로 바꾸고, 기존 `useEffect`(setViewingRoom) 위에 추가:

```tsx
  // 푸시 알림 클릭(/chat/rooms?room=<id>)으로 들어오면 그 방을 고른다
  useEffect(() => {
    const roomId = roomIdFromSearch(window.location.search);
    if (roomId !== null) setPickedRoomId(roomId);
  }, [setPickedRoomId]);
```

`client/src/app/(protected)/chat/[menu]/page.tsx`: `<PushNotificationButton />;{menu === "friends" && <FriendsTab />}`에서 `;`를 지운다(화면에 ";"가 보이던 버그).

`client/public/service-worker.js`의 `notificationclick` 리스너 본문을 교체:

```js
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/chat/rooms';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 이미 열린 앱 창이 있으면 그 창을 알림의 방으로 이동시키고 포커스(이동이 막히면 포커스만), 없으면 새 창
      const target = new URL(url, self.location.origin).href;
      const client = clientList.find((c) => c.url === target) || clientList[0];
      if (!client) return clients.openWindow ? clients.openWindow(target) : undefined;
      const go = client.url === target ? Promise.resolve(client) : client.navigate(target).catch(() => client);
      return go.then((c) => (c || client).focus());
    })
  );
});
```

- [ ] **Step 7: 타입·린트·테스트·잔존 참조**

Run: `pnpm exec tsc --noEmit; pnpm lint; pnpm test 2>&1 | grep -E "^ℹ (pass|fail)"; grep -rn "getAccessToken\|BASE_URL" src --include=*.ts --include=*.tsx | grep -v "src/lib/api-client.ts\|src/config/\|src/services/\(app\|users\|push\)/"`
Expected: tsc 출력 없음, lint 에러 0(경고 ≤ 5), 32 pass, grep 결과 없음.

- [ ] **Step 8: 커밋**

```bash
git add client/src/services/push.ts client/src/services/auth.ts client/src/lib/push-url.ts client/src/lib/push-url.test.ts client/src/hooks/usePushNotification.ts "client/src/app/(protected)/chat/[menu]" client/public/service-worker.js
git commit -m "feat(push): 클라 구독 저장을 Supabase로, 로그아웃 시 이 브라우저 구독 정리, 알림 클릭으로 방 열기

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 이전 백엔드·의존성 제거

**Files:**
- Modify: `client/next.config.ts` (NestJS rewrite·`@/config` import 제거)
- Delete: `client/scripts/verify-message-ux.mjs`(socket.io 기반), `client/scripts/fix-query-key.mjs`(Orval 전제)
- Delete: `server/`, `docker-compose.yml`, `test-login.json`, `test-register.json`, `PUSH_NOTIFICATION_SETUP.md`, `client/orval.config.ts`, `client/src/lib/api-client.ts`, `client/src/lib/api/`, `client/src/lib/models/`, `client/src/config/`, `client/src/services/app/`, `client/src/services/users/`, `client/src/services/push/` (Orval 디렉터리 — Task 3의 `services/push.ts` 파일과 다름)
- Modify: `client/package.json`, `client/pnpm-lock.yaml`, `client/.env.local.example`

- [ ] **Step 1: 남은 참조 확인(삭제 전)**

Run: `grep -rln -E "lib/api-client|lib/api/|lib/models/|@/config|services/(app|users|push)/|socket\.io|axios|orval|localhost:4000" client --include=*.ts --include=*.tsx --include=*.mjs --include=*.js --include=*.json --exclude-dir=node_modules --exclude-dir=.next | grep -v -E "^client/src/(lib/api-client.ts|lib/api/|lib/models/|config/|services/(app|users|push)/)"`
Expected: `client/next.config.ts`, `client/scripts/verify-message-ux.mjs`, `client/scripts/fix-query-key.mjs`, `client/package.json`(의존성) 만. 다른 파일이 나오면 그 파일을 먼저 Supabase 서비스로 옮긴다(Ruling 기록).

`client/next.config.ts`에서 `@/config` import와 `/api/messages/*` → NestJS rewrite 블록을 지운다(Supabase로 옮긴 뒤 쓰는 곳 없음). 남는 설정이 없으면 `const nextConfig: NextConfig = {};`만 남긴다.

- [ ] **Step 2: 로컬 비밀 보존 확인** — Task 2 Step 3에서 VAPID를 옮겼는지 다시 확인(삭제 후에는 복구 불가).

Run: `grep -c -E '^(VAPID_PUBLIC_KEY|VAPID_PRIVATE_KEY)=' supabase/.env`
Expected: `2`.

- [ ] **Step 3: 삭제** (저장소 루트)

```bash
git rm -rq server docker-compose.yml test-login.json test-register.json PUSH_NOTIFICATION_SETUP.md client/orval.config.ts client/scripts/verify-message-ux.mjs client/scripts/fix-query-key.mjs client/src/lib/api-client.ts client/src/lib/api client/src/lib/models client/src/config client/src/services/app client/src/services/users client/src/services/push
rm -rf server
```

(`server/`의 추적되지 않는 파일 — `.env`, `node_modules`, `dist` — 도 지운다. 비밀은 Step 2에서 옮겼다.)

- [ ] **Step 4: 의존성·스크립트·env 예시** (`client/`)

```bash
pnpm remove axios socket.io-client orval openapi-typescript-codegen
```

`package.json` `scripts`에서 `generate:api` 줄을 지우고 아래를 추가:

```json
    "verify": "node scripts/verify-auth.mjs && node scripts/verify-social.mjs && node scripts/verify-chat.mjs && node scripts/verify-admin.mjs && node scripts/verify-push.mjs"
```

`.env.local.example`에서 `# (6단계에서 제거) 기존 NestJS 주소 …` 주석과 `NEXT_PUBLIC_API_URL=` 줄을 지운다. 로컬 `client/.env.local`에서도 `NEXT_PUBLIC_API_URL` 줄을 지운다(커밋 안 함).

- [ ] **Step 5: 확인**

Run: `pnpm exec tsc --noEmit; pnpm lint; pnpm test 2>&1 | grep -E "^ℹ (pass|fail)"; pnpm build 2>&1 | tail -3; grep -rn -E "axios|socket\.io|orval|NEXT_PUBLIC_API_URL|localhost:4000|@/config" src scripts next.config.ts .env.local.example package.json`
Expected: tsc 출력 없음, lint 에러 0(경고 ≤ 5), 32 pass, build 성공, grep 결과 없음.

- [ ] **Step 6: 커밋**

```bash
git add -A server docker-compose.yml test-login.json test-register.json PUSH_NOTIFICATION_SETUP.md client
git commit -m "chore: NestJS server·Orval·axios·socket.io 제거, verify 스크립트 묶음

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 개발·배포 문서와 에이전트 지침

**Files:**
- Modify(전체 교체): `README.md`, `DEV_SETUP.md`, `DEPLOYMENT.md`, `AGENTS.md`, `client/AGENTS.md`

문서는 코드가 아니므로 테스트 대신 "문서의 명령이 실제로 동작하는가"를 Step 3에서 확인한다.

- [ ] **Step 1: 문서 작성** — 각 파일을 아래 내용으로 교체한다.

`README.md`

```markdown
# dongchat

친구·1:1/그룹 채팅(실시간, 읽음 수, 답장·수정·삭제), 웹 푸시, 관리자 모더레이션(정지·강제 로그아웃·강퇴·방 열람)을 갖춘 채팅 앱.

- 클라이언트: Next.js 16 (`client/`) — Vercel
- 백엔드: Supabase (Postgres + RLS/RPC, Auth(이메일·카카오), Realtime Broadcast, Edge Function) (`supabase/`)

로컬 개발은 [DEV_SETUP.md](DEV_SETUP.md), 배포는 [DEPLOYMENT.md](DEPLOYMENT.md), 설계는 `docs/superpowers/specs/2026-10-13-supabase-migration-design.md`.
```

`DEV_SETUP.md`

````markdown
# 로컬 개발 환경

## 준비물
- Node 24 (`.nvmrc`), pnpm, Docker Desktop

## 최초 1회
```bash
git clone <repo> && cd dongchat
cd client && pnpm install && cd ..

# 비밀 파일(gitignore됨) 만들고 값 채우기
cp supabase/.env.example supabase/.env          # 카카오 키, VAPID 키, 웹훅 비밀
cp client/.env.local.example client/.env.local  # Supabase URL·publishable key, VAPID 공개키

# 로컬 Supabase(Postgres·Auth·Realtime·Edge Functions)
npx -y supabase@2.120.0 start
npx -y supabase@2.120.0 status -o env   # PUBLISHABLE_KEY를 client/.env.local에 넣는다
```

`supabase start`가 마이그레이션과 `supabase/seed.sql`(테스트 계정, 로컬 푸시 웹훅 Vault 값)을 적용한다.
시드 계정: `admin@dongchat.local`(관리자), `alice@dongchat.local`, `bob@dongchat.local` — 비밀번호 `password123`.

- VAPID 키: `npx -y web-push generate-vapid-keys` → 공개키는 두 env 파일에, 개인키는 `supabase/.env`에만.
- 카카오: 개발자 콘솔에서 비즈 앱 전환 + 이메일 필수 동의, Redirect URI `http://localhost:54321/auth/v1/callback`.

## 매일
```bash
npx -y supabase@2.120.0 start      # 이미 떠 있으면 생략
cd client && pnpm dev               # http://localhost:3000
```
Studio: http://127.0.0.1:54323 (테이블·SQL·사용자). 메일(이메일 확인 사용 시): http://127.0.0.1:54324.

## 검증
```bash
cd client
pnpm exec tsc --noEmit && pnpm lint && pnpm test
SUPABASE_PUBLISHABLE_KEY=<키> PUSH_WEBHOOK_SECRET=local-dev-push-secret pnpm verify   # 로컬 Supabase 대상 통합 검증
cd .. && npx -y supabase@2.120.0 test db                                              # pgTAP
```

## 알아 둘 것
- DB 변경: `npx -y supabase@2.120.0 migration new <이름>` → SQL 작성 → `migration up`(데이터 유지) 또는 `db reset`(초기화+seed). 변경 후 `supabase gen types --local --lang typescript --schema public > client/src/lib/supabase/database.types.ts`.
- Edge Function 코드 수정은 Windows에서 핫 리로드되지 않는다: `docker restart supabase_edge_runtime_dongchat`. 새 함수·`config.toml` 변경은 `supabase stop && supabase start`.
- 강제 로그아웃·정지 수동 테스트: Studio SQL에서 `private.user_access`의 `sessions_revoked_at = now()` / `banned_until` 설정(관리자 화면 `/admin/users`로도 가능).
````

`DEPLOYMENT.md`

````markdown
# 배포 (Supabase Free + Vercel Hobby)

## 1. Supabase 프로젝트
1. supabase.com에서 프로젝트 생성(리전: 서울 `ap-northeast-2`). DB 비밀번호 보관.
2. 저장소 루트에서:
   ```bash
   npx -y supabase@2.120.0 login
   npx -y supabase@2.120.0 link --project-ref <ref>
   npx -y supabase@2.120.0 db push                 # migrations 적용(seed는 적용 안 됨)
   ```
3. 관리자 지정(Studio SQL): `insert into private.user_roles (user_id, role) select id, 'ADMIN' from auth.users where email = '<관리자 이메일>';` (가입 후)
4. Authentication 설정
   - Site URL: `https://<vercel 도메인>`, Redirect URLs: `https://<vercel 도메인>/auth/callback`
   - JWT 만료 600초(로컬 `config.toml`과 동일), 최소 비밀번호 6자
   - 카카오 provider: REST API 키/Secret 입력. 카카오 콘솔 Redirect URI에 `https://<ref>.supabase.co/auth/v1/callback` 추가
   - **실사용자 전 커스텀 SMTP 연결 필수**: 기본 SMTP는 시간당 2통. 연결 전에는 이메일 확인을 끈 상태로 운영한다.
5. Realtime 설정: "Allow public access" 끄기(비공개 채널만).

## 2. 웹 푸시
```bash
npx -y supabase@2.120.0 functions deploy send-push --no-verify-jwt
npx -y supabase@2.120.0 secrets set VAPID_PUBLIC_KEY=<공개키> VAPID_PRIVATE_KEY=<개인키> VAPID_SUBJECT=mailto:<연락 메일> PUSH_WEBHOOK_SECRET=<임의의 긴 값>
```
Studio SQL에서 웹훅 값(Vault) 설정 — 비밀은 위 `PUSH_WEBHOOK_SECRET`과 같은 값:
```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'push_webhook_url');
select vault.create_secret('<PUSH_WEBHOOK_SECRET 값>', 'push_webhook_secret');
```
`PUSH_ALLOW_HTTP`는 운영에 설정하지 않는다(https 구독만 발송).

## 3. Vercel
- Root Directory: `client`, Framework: Next.js, Install: `pnpm install`
- 환경 변수: `NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY=<공개키>`
- secret/service role 키는 Vercel에 넣지 않는다.

## 4. 배포 후 확인
1. 가입·로그인(이메일, 카카오) → 친구 추가 → 방 생성 → 두 브라우저로 메시지·읽음 수 확인
2. 알림 허용 후 다른 계정이 보낸 메시지가 푸시로 오는지, 알림 클릭 시 그 방이 열리는지
3. 관리자 `/admin/users`에서 정지·강제 로그아웃이 대상 화면에 즉시 반영되는지

## 무료 플랜 한도와 위험 (배포 전 공식 페이지에서 다시 확인: https://supabase.com/pricing , https://vercel.com/pricing — 이 문서 작성 2026-10-14)
- **Supabase Free: 7일 무활동 시 프로젝트 일시 정지**(대시보드에서 재개), 활성 Free 프로젝트 2개까지. 데모용이면 주의.
- **Vercel Hobby: 개인·비상업 용도 한정.** 상업 서비스로 운영하려면 Pro가 필요하다.
- DB 용량·Edge Function 호출 수·Realtime 메시지 수(수신자 수만큼 계산)·동시 연결 수에 월 한도가 있다 — 위 가격 페이지의 현재 값을 기준으로 판단한다.
- 방마다 Realtime 채널을 연다 — 사용자당 참여 방이 수백 개가 되면 user 채널 단일 구독으로 바꿔야 한다(스펙 §8.4).
- 백업: Free는 자동 백업 없음 → 중요해지면 `supabase db dump`를 주기적으로.

## NestJS로 되돌리려면
Postgres(스키마·함수)는 그대로 두고 `client/src/services/` 내부만 fetch/socket.io로 바꾼다. 이벤트 이름·payload는 스펙 §8.1 표를 따른다(스펙 §6 이식 체크리스트).
````

`AGENTS.md`(루트)

```markdown
# AGENTS.md

이 저장소에서 코드를 작성·수정할 때 따르는 규칙입니다.

## 구조
- `client/` — Next.js 16 프론트엔드. 세부 규칙은 [client/AGENTS.md](client/AGENTS.md).
- `supabase/` — 백엔드: `migrations/`(스키마·RLS·RPC·트리거), `tests/database/`(pgTAP), `functions/`(Edge Function), `seed.sql`.
- 설계 기준 문서: `docs/superpowers/specs/2026-10-13-supabase-migration-design.md`.

## 백엔드 (Supabase)
- DB 변경은 항상 마이그레이션으로: 테이블·함수 생성과 함께 명시적 GRANT/REVOKE, 모든 public 테이블 RLS.
- 함수는 `security definer`이면 `set search_path = ''`와 스키마 한정 이름, `revoke execute from public, anon`.
- 권한 판단은 DB(`private.is_active_session()`, `private.is_admin()`, RLS)가 한다. 클라 검사는 표시용.
- RPC 에러는 `raise exception '<CODE>' using hint = '<사용자 메시지>'`. 코드는 스펙 §5.5.
- 변경 후 `npx -y supabase@2.120.0 test db`와 `db advisors --local` 확인, 새 동작에는 pgTAP을 먼저 쓴다.

## 프론트엔드 (React / Next.js)
- **`/vercel-react-best-practices`**, **`/vercel-composition-patterns`**, **`/vercel-react-view-transitions`**, **`/frontend-design`** 스킬을 참고한다. 적용 대상: `client/`.

## 라이브러리·프레임워크 코드 작성 규칙
라이브러리나 프레임워크 관련 코드를 작성할 때는 **항상 context7 MCP를 참고**하여 최신 API 스펙에 기반해 작성합니다.
- 사용 도구: `mcp__plugin_context7_context7__resolve-library-id` → `mcp__plugin_context7_context7__get-library-docs`
```

`client/AGENTS.md`

```markdown
# client/AGENTS.md — 프론트엔드 가이드

루트 [AGENTS.md](../AGENTS.md)의 규칙 위에 프론트엔드 고유 규칙을 정의합니다.

## 기술 스택
- Next.js 16 (App Router, `proxy.ts`) / React 19 / TypeScript, pnpm
- Supabase: `@supabase/supabase-js`, `@supabase/ssr`(쿠키 세션) — 버전 고정
- TanStack React Query v5(서버 상태), shadcn/ui + Tailwind v4, react-hook-form + yup/zod, sonner

## 계층과 경계 (백엔드 교체 경계)
```
app/, components/   UI — Supabase를 모른다
  hooks/            React Query 훅, ChatProvider(Realtime 구독 허브)
    services/       순수 async 함수 + subscribe 함수, types/domain.ts 타입 반환 ★교체 경계
    lib/supabase/   브라우저·서버 클라이언트
```
- `@supabase/*`, `@/lib/supabase/*` import는 `src/services/**`, `src/lib/supabase/**`, `src/proxy.ts`, `src/app/auth/callback/**`에서만(ESLint로 강제).
- `database.types.ts`는 services 내부 전용. services는 `types/domain.ts`로 변환해 반환하고, 에러는 `DomainError {code, message}`로 던진다(`services/errors.ts`).
- PostgREST SELECT 문자열과 row→domain 매퍼는 `services/mappers.ts`(상대 경로·type-only import만 — Node 테스트·통합 스크립트가 직접 import).
- 표시명은 `displayName()`(nickname ?? username). 사용자 알림은 `useToast`, 확인은 `confirm()`, `alert()` 금지.

## 실시간 규칙
- `ChatProvider`(`(protected)` 레이아웃)가 참여 방마다 `room:<id>`, 본인 `user:<uuid>` 비공개 채널을 구독한다. 관리자 열람은 `watchRoom(id)`.
- 채널 (재)구독(`SUBSCRIBED`)마다 스냅샷을 다시 받아 id로 병합한다. 상태 규칙은 `lib/chat-state.ts`(순수 함수, 단위 테스트).
- 같은 토픽 재구독은 `lib/topic-gate.ts`를 거친다(realtime-js가 해제 중인 채널을 돌려주는 문제).

## React 규칙
- effect 본문에서 동기 setState 금지, 렌더 중 ref 읽기/쓰기 금지(React 19 hooks lint).
- 훅이 돌려주는 함수는 렌더마다 같아야 한다(의존성에 넣는 경우 effect가 반복된다 — `useToast` 사례).

## 명령
```bash
pnpm dev | pnpm build | pnpm lint | pnpm test     # test = node --test (src/**/*.test.ts)
pnpm verify                                        # 로컬 Supabase 통합 검증(DEV_SETUP.md 참고)
```
```

- [ ] **Step 2: 남은 옛 안내 확인**

Run: `grep -rn -E "NestJS|nest |MySQL|NextAuth|axios|socket\.io|Orval|generate:api|localhost:4000" README.md DEV_SETUP.md DEPLOYMENT.md AGENTS.md client/AGENTS.md`
Expected: `DEPLOYMENT.md`의 "NestJS로 되돌리려면" 절과 그 안의 `socket.io`만 남는다.

- [ ] **Step 3: 문서 명령 검증** — `DEV_SETUP.md`의 "검증" 블록을 그대로 실행한다.
Expected: tsc·lint·test 통과, `pnpm verify` 마지막 줄 `verify-push: OK`, pgTAP `Result: PASS`.

- [ ] **Step 3b: 스펙의 푸시 URL 계약 갱신** — `docs/superpowers/specs/2026-10-13-supabase-migration-design.md` §10 payload의 `url: '/chat/<roomId>'`를 `url: '/chat/rooms?room=<roomId>'`(채팅 탭 + 방 선택, 6단계 확정)로 바꾼다. 파일의 줄바꿈 형식(CRLF/LF 혼재)을 보존하도록 바이트 단위로 치환한다.

- [ ] **Step 4: 커밋**

```bash
git add README.md DEV_SETUP.md DEPLOYMENT.md AGENTS.md client/AGENTS.md docs/superpowers/specs/2026-10-13-supabase-migration-design.md
git commit -m "docs: Supabase 기준 개발·배포 가이드와 에이전트 지침으로 교체

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 전체 검증과 브라우저 확인

**Files:** 없음(문제 발견 시 해당 Task 수정 후 재검증·커밋)

- [ ] **Step 1: 자동 검증 전체** — `client/`에서 `pnpm exec tsc --noEmit; pnpm lint; pnpm test; pnpm build`, `SUPABASE_PUBLISHABLE_KEY=… PUSH_WEBHOOK_SECRET=local-dev-push-secret pnpm verify`, 루트에서 `npx -y supabase@2.120.0 test db`(alice·bob 테스트 방 정리 후).
Expected: 32 pass, build 성공, verify 5종 OK, pgTAP 154.

- [ ] **Step 2: 회귀 브라우저 확인** — `pnpm dev` 재시작(삭제된 모듈 캐시 정리) 후, 4단계 채팅 체크리스트(27)와 5단계 관리자 체크리스트(31)를 같은 자동화로 다시 실행(세션 scratch의 playwright-core 스크립트). 추가로:
  1. 채팅 탭 상단에 ";" 문자가 보이지 않는다.
  2. `/chat/rooms?room=<존재하는 방 id>`로 직접 열면 그 방이 선택된다(Review Focus 4).
  3. [알림 활성화] 버튼이 보이고 누르면 오류 없이 상태가 바뀌거나(지원 환경), 미지원 환경에서는 버튼이 비활성/숨김이다(headless Chrome은 푸시 서비스가 없어 실제 수신은 확인하지 않는다 — Task 2 통합 스크립트가 발송 경로를 검증).
- [ ] **Step 3: 사용자 수동 확인 요청(실제 푸시 수신)** — 일반 Chrome에서 alice로 [알림 활성화] → 탭을 닫거나 다른 창으로 이동 → bob이 메시지 전송 → OS 알림 표시 → 클릭 시 그 방이 선택된 채팅 탭. (자동화 불가 항목, 결과를 사용자에게 받는다.)
- [ ] **Step 4: 마무리** — 테스트 데이터 정리, dev 서버 유지.

---

## 계획 리뷰 반영 (Codex, `docs/superpowers/reviews/2026-10-14-stage6-plan-review-codex.md`)

| # | 지적 | 반영 |
|---|---|---|
| C1 | `next.config.ts`가 삭제할 `@/config`(NestJS rewrite) import → 빌드 실패 | 수용 — Task 4 Step 1에 수정 추가, grep 범위 확대 |
| C2 | socket.io·Orval 전제 스크립트 잔존 | 수용 — `verify-message-ux.mjs`, `fix-query-key.mjs` 삭제 |
| C3 | `useState(isPushSupported)` SSR/hydration 불일치 | 수용 — `useSyncExternalStore`(서버 스냅샷 false) |
| C4 | pgTAP Vault 값이 seed와 충돌 | 기각 — 테스트가 생성 전에 두 name을 지우고 `vault.secrets.name`은 unique라 결정적(주석으로 명시) |
| I1 | service_role 권한 명시·검증 없음 | 수용 — 마이그레이션에 GRANT, pgTAP `set local role service_role` |
| I2 | 앱 정지(private) 원천 미검증 | 수용 — erin 픽스처 + assertion |
| I3·I5 | 입력 검증 약함, 한 행 실패가 전체 중단 | 수용 — SQL 정규식 검증, `new URL()` 파싱, 대상별 try 안에서 요청 생성 |
| I4 | 환경 변수 누락·잘못된 본문 처리 | 수용 — 누락 시 500(목록 표시), POST·양의 정수 아니면 400/401, `Array.isArray` |
| I6 | 강제 로그아웃 시 DB 구독 잔존 | 기각 — `removeThisBrowserPush`가 DB 삭제 실패와 무관하게 브라우저 구독을 해제 → endpoint 소멸 → 다음 발송 410 → 행 삭제. 브라우저가 닫혀 있던 경우는 그 사용자 본인 기기 |
| I7 | SW `navigate` 실패 시 포커스 미보장 | 수용 — 절대 URL, 같은 URL 창 우선, navigate 실패 시 포커스, 없으면 openWindow |
| I8 | verify-push 준비·정리 불안정 | 수용 — `once(listening)`, `server.close` 대기, `process.exit` 제거, 정리 실패 노출 |
| I9 | 스펙 §10 URL과 불일치 | 수용 — Task 5 Step 3b 스펙 갱신 |
| I10 | 무료 한도 수치 고정·Vercel 비상업 제한 누락 | 수용 — 공식 페이지 링크·작성일, Hobby 비상업·Free 2개 프로젝트 명시 |
| Minor | 동시 발송 제한, 메시지당 Vault 조회 비용, 픽스처 확대 | 보류 — 함수에 ponytail 주석, 규모가 커지면 배치·outbox |

## Self-Review 결과

- 스펙 §10: 트리거(pg_net 비동기) + 비밀 헤더(Vault) → Edge Function(비밀 검증 401, service role 대상 조회, 참여자−발신자−정지, web-push, 410/404 삭제) → Task 1·2. payload 현행 동일(URL만 새 라우트) → Task 2. 클라 `usePushNotification`·서비스워커 유지, 저장만 `services/push` → Task 3. §13 "Deno npm:web-push 호환, 로컬 webhook 주소" → 스파이크로 확인(위 절).
- §2.2 삭제 목록(server, axios, socket.io-client, orval, openapi-typescript-codegen, lib/api, lib/models, api-client, Orval services) → Task 4. next-auth·jotai·`src/auth.ts`·`api/auth/[...nextauth]`·`store/auth.ts`는 2단계에서 이미 제거됨.
- §12-6: ESLint 경계(2단계 완료), AGENTS.md/DEPLOYMENT.md 갱신(커스텀 SMTP·pause·한도) → Task 5, 통합 스크립트 → verify-push + `pnpm verify`.
- 스펙과 다른 결정(Ruling 후보): 구독 저장을 직접 upsert 대신 `register_push_subscription` RPC(엔드포인트 소유권 이전·검증), 로그아웃 시 이 브라우저 구독 해제, 운영 https 전용 발송(SSRF 방지).
