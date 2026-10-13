# Supabase 이전 1단계(기반: DB) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로컬 Supabase에 dongchat의 전체 DB 계층(스키마·권한·헬퍼·RPC·트리거·Realtime 수신 정책·시드)을 마이그레이션으로 만들고 pgTAP으로 검증한다. 앱 코드(client/server)는 건드리지 않는다(타입 생성 파일 1개 제외).

**Architecture:** `public`(Data API 노출: 테이블+RPC)과 `private`(비노출: 권한 헬퍼·역할·접근 제어 데이터)로 스키마를 나눈다. 모든 접근은 `private.is_active_session()`을 거치고, 쓰기는 컬럼 단위 GRANT + RLS 또는 `security definer` RPC로만 한다. Realtime은 트리거가 `realtime.send`로 송출하고 `realtime.messages` SELECT 정책이 `private.can_receive_topic()`으로 수신을 제한한다.

**Tech Stack:** Supabase CLI 2.120.0(`npx -y supabase@2.120.0`), Postgres 17(Supabase 로컬 스택), pgTAP(`supabase test db`), Docker.

**Spec:** `docs/superpowers/specs/2026-10-13-supabase-migration-design.md` (본 계획은 §3, §4, §5, §8.1~8.2, §9의 DB 부분, §11 DB 테스트, §12-1단계를 구현)

## Global Constraints

- CLI는 항상 `npx -y supabase@2.120.0 ...`로 실행(버전 고정). 저장소 루트(`C:\Exception\Project\louis-25\dongchat`)에서 실행. 아래 명령의 `supabase`는 이 형태를 뜻한다.
- 새 마이그레이션 파일은 반드시 `supabase migration new <name>`으로 만든다(파일명 직접 작성 금지). 생성된 경로를 그대로 사용.
- PK: `bigint generated always as identity`(사용자만 `uuid` = `auth.users.id`). 시각 `timestamptz`, 문자열 `text`. 모든 FK에 인덱스.
- `public` 테이블은 전부 RLS 활성 + `revoke all ... from anon, authenticated` 후 최소 GRANT. `anon`은 어떤 테이블도 접근 불가.
- 모든 정책은 `to authenticated`, `auth.uid()`·헬퍼는 `(select ...)`로 감싼다.
- 모든 함수: `set search_path = ''`, 객체는 스키마 한정. `security definer` 함수는 `revoke execute ... from public, anon` 후 필요한 역할에만 GRANT.
- RPC 에러: `raise exception '<CODE>' using hint = '<사용자 메시지>'` (SQLSTATE P0001). 코드 목록은 spec §5.5.
- username 형식: `^[a-z0-9_]{3,20}$`(소문자 정규화). 메시지 길이 1~2000자(삭제 시 `''`).
- JWT 만료 600초.
- `realtime` 스키마 객체에 `ALTER`/`ENABLE RLS` 금지. 정책 생성만 허용.
- `raw_user_meta_data`는 초기 username/nickname 결정에만 사용, 권한 판단 금지.
- 각 Task는 `supabase test db`가 전부 통과해야 완료. 커밋은 Task마다.

## Review Focus

1. 잘못된 토픽 문자열(`room:abc`, `room:` + 19자리 이상 숫자, `user:` + 비UUID) — 오류 없이 `false`(수신 거부). → Task 8 테스트
2. 대소문자·공백이 섞인 username(`"  Alice "`) — 가입 트리거와 `is_username_available`이 같은 정규화 결과를 낸다. → Task 2 테스트
3. Studio에서 참여자 행을 직접 삭제(방장/마지막 멤버) — RPC 경로와 동일하게 방장 승계·방 삭제가 일어난다. → Task 3 테스트
4. 비멤버 관리자 — 열람은 되지만 `mark_read`·메시지 INSERT는 거부된다. → Task 4 테스트
5. 과거 시각의 `banned_until`(정지 만료) — 정상 접근으로 복귀한다. → Task 2 테스트

---

## File Structure

```
supabase/
  config.toml                                   # supabase init 생성 + jwt_expiry 수정
  seed.sql                                      # 로컬 테스트 계정(admin/alice/bob) + 관리자 지정
  migrations/
    <ts>_foundation.sql                         # private 스키마, profiles, user_roles, user_access, 세션/관리자 헬퍼, 가입 트리거, is_username_available
    <ts>_rooms.sql                              # chat_rooms, participants, messages 테이블, is_room_member, RLS, create/leave/kick, 승계 트리거
    <ts>_message_rpcs.sql                       # edit/delete_message, mark_read
    <ts>_friends.sql                            # friends + RPC
    <ts>_push_subscriptions.sql                 # push_subscriptions
    <ts>_admin.sql                              # admin_* RPC
    <ts>_realtime.sql                           # can_receive_topic, realtime.messages 정책, 송출 트리거
  tests/database/
    000_helpers.sql                             # tests 스키마: create_user / uid / login_as / room_id (커밋되어 남음)
    010_foundation.test.sql
    020_rooms.test.sql
    030_messages.test.sql
    040_friends.test.sql
    050_push.test.sql
    060_admin.test.sql
    070_realtime.test.sql
client/src/lib/supabase/database.types.ts      # supabase gen types 출력(2단계부터 services가 사용)
```

---

### Task 1: Supabase 로컬 초기화 + 환경 가정 검증 + 테스트 헬퍼

**Files:**
- Create: `supabase/config.toml` (CLI 생성), `supabase/tests/database/000_helpers.sql`
- Modify: `supabase/config.toml` (`[auth] jwt_expiry`), `.gitignore`

**Interfaces:**
- Produces (테스트 헬퍼, 이후 모든 테스트가 사용):
  - `tests.create_user(p_email text, p_meta jsonb default '{}', p_provider text default 'email') returns uuid` — auth.users + auth.sessions 1행 생성
  - `tests.uid(p_email text) returns uuid`
  - `tests.session_of(p_user uuid) returns uuid`
  - `tests.login_as(p_user uuid, p_iat timestamptz default now() - interval '1 minute') returns void` — 호출 전 반드시 `reset role;`
  - `tests.room_id(p_name text) returns bigint`

- [ ] **Step 1: 초기화**

```bash
npx -y supabase@2.120.0 init
```
Expected: `supabase/config.toml` 생성. IDE 설정 질문이 나오면 기본값(N).

- [ ] **Step 2: config 수정**

`supabase/config.toml`에서 `project_id`를 `"dongchat"`으로, `[auth]` 섹션의 `jwt_expiry`를 `600`으로 바꾼다. `[api] schemas`에 `private`가 **없는지** 확인(기본 `["public", "graphql_public"]`).

```toml
project_id = "dongchat"
...
[auth]
jwt_expiry = 600
```

`.gitignore`에 추가:
```
supabase/.branches
supabase/.temp
supabase/.env
```

- [ ] **Step 3: 스택 기동**

```bash
npx -y supabase@2.120.0 start
```
Expected: 마지막에 `API URL: http://127.0.0.1:54321`, `DB URL: postgresql://postgres:postgres@127.0.0.1:54322/postgres`, publishable key 출력. (첫 실행은 이미지 다운로드로 수 분 소요)

- [ ] **Step 4: 환경 가정 검증 (spec §13)** — 결과를 이 계획 파일 하단 "검증 기록"에 적는다.

```bash
npx -y supabase@2.120.0 db query --local "select pg_get_function_identity_arguments('realtime.send'::regproc) as send_args, pg_get_function_identity_arguments('realtime.topic'::regproc) as topic_args, has_function_privilege('postgres','realtime.send(jsonb,text,text,boolean)','execute') as can_send, has_table_privilege('postgres','auth.sessions','select') as can_read_sessions, has_table_privilege('postgres','auth.users','select') as can_read_users"
```
Expected: `send_args`에 `payload jsonb, event text, topic text, private boolean` 형태, `topic_args` 빈 문자열, 세 권한 모두 `t`. (`send_args`가 다르면 `can_send`의 시그니처를 실제 값으로 바꿔 재실행하고, Task 8 `private.broadcast`의 `realtime.send` 호출 인자 순서를 실제 시그니처에 맞춘다.)

```bash
npx -y supabase@2.120.0 db query --local "begin; create function public._probe() returns trigger language plpgsql as 'begin return null; end'; create trigger _probe after delete on auth.sessions for each row execute function public._probe(); create policy _probe on realtime.messages for select to authenticated using (false); rollback;"
```
Expected: 오류 없이 종료 → **auth.sessions 트리거 가능 / realtime.messages 정책 생성 가능**.
- auth.sessions 트리거에서 권한 오류 → Task 8의 "Step 3b"(세션 삭제 트리거)를 건너뛴다(spec §9 대체 경로: 토큰 갱신 실패).
- realtime.messages 정책에서 권한 오류 → 중단하고 사용자에게 보고(설계 전제 붕괴).

- [ ] **Step 5: 테스트 헬퍼 작성** — `supabase/tests/database/000_helpers.sql`

```sql
-- 테스트 헬퍼. rollback 하지 않고 커밋해 이후 테스트 파일에서 재사용한다(db reset 시 사라지고 다음 실행에서 재생성).
begin;

create schema if not exists tests;
grant usage on schema tests to authenticated;

create or replace function tests.create_user(
  p_email text,
  p_meta jsonb default '{}'::jsonb,
  p_provider text default 'email'
) returns uuid
language plpgsql
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', p_email,
          p_meta, jsonb_build_object('provider', p_provider, 'providers', jsonb_build_array(p_provider)), now(), now());
  insert into auth.sessions (id, user_id, created_at, updated_at)
  values (gen_random_uuid(), v_id, now(), now());
  return v_id;
end;
$$;

create or replace function tests.uid(p_email text) returns uuid
language sql stable security definer set search_path = ''
as $$ select id from auth.users where email = p_email $$;

create or replace function tests.session_of(p_user uuid) returns uuid
language sql stable security definer set search_path = ''
as $$ select id from auth.sessions where user_id = p_user order by created_at limit 1 $$;

-- 호출 전 반드시 `reset role;` (authenticated 상태에서는 role 전환 불가)
create or replace function tests.login_as(
  p_user uuid,
  p_iat timestamptz default now() - interval '1 minute'
) returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', p_user,
    'role', 'authenticated',
    'session_id', tests.session_of(p_user),
    'iat', extract(epoch from p_iat)::bigint
  )::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

grant execute on function tests.uid(text), tests.session_of(uuid) to authenticated;

select plan(1);
select pass('test helpers installed');
select * from finish();
commit;
```

> `tests.room_id`는 `public.chat_rooms`가 생긴 뒤 Task 3 Step 0에서 추가한다(SQL 함수 본문은 생성 시 테이블 존재를 검증하므로).

- [ ] **Step 6: 실행**

```bash
npx -y supabase@2.120.0 test db
```
Expected: `000_helpers.sql .. ok`, `All tests successful.`

- [ ] **Step 7: Commit**

```bash
git add supabase/config.toml supabase/tests/database/000_helpers.sql .gitignore docs/superpowers/plans/2026-10-13-supabase-stage1-foundation.md
git commit -m "chore(supabase): 로컬 초기화, jwt 만료 600초, pgTAP 테스트 헬퍼"
```

---

### Task 2: foundation — profiles, 역할·접근 제어, 세션 헬퍼, 가입 트리거

**Files:**
- Create: `supabase/migrations/<ts>_foundation.sql` (`supabase migration new foundation`)
- Test: `supabase/tests/database/010_foundation.test.sql`

**Interfaces:**
- Consumes: Task 1 헬퍼.
- Produces:
  - 테이블 `public.profiles(id uuid, username text, nickname text, avatar_url text, created_at, updated_at)`
  - 테이블 `private.user_roles(user_id uuid, role text)`, `private.user_access(user_id uuid, banned_until timestamptz, sessions_revoked_at timestamptz, reason text, updated_at timestamptz)`
  - `private.set_updated_at() returns trigger`
  - `private.is_active_session() returns boolean`, `private.is_admin() returns boolean`, `private.require_active_session() returns void`(실패 시 `AUTH_SESSION_REVOKED`)
  - `private.handle_new_user() returns trigger` + 트리거 `on_auth_user_created`
  - `public.is_username_available(p_username text) returns boolean` (anon 실행 가능)

- [ ] **Step 1: 실패하는 테스트 작성** — `supabase/tests/database/010_foundation.test.sql`

```sql
begin;
select plan(24);

-- 사용자 준비 (postgres 권한)
select tests.create_user('alice@test.com', '{"username":"  Alice "}');
select tests.create_user('weird@test.com', '{"username":"no!"}');
select tests.create_user('kakao@test.com', '{"name":"카카오유저","avatar_url":"https://img/k.png"}', 'kakao');
select tests.create_user('bob@test.com', '{"username":"bob"}');

-- 1~4: 가입 트리거
select is((select username from public.profiles where id = tests.uid('alice@test.com')), 'alice', '공백·대문자 username은 정규화된다');
select matches((select username from public.profiles where id = tests.uid('weird@test.com')), '^user_[0-9a-f]{8}$', '형식 불일치 username은 user_xxxxxxxx로 대체');
select matches((select username from public.profiles where id = tests.uid('kakao@test.com')), '^kakao_[0-9a-f]{8}$', '카카오는 kakao_xxxxxxxx');
select is((select nickname from public.profiles where id = tests.uid('kakao@test.com')), '카카오유저', '카카오 이름은 nickname');

-- 5~7: is_username_available (Review Focus 2)
select is(public.is_username_available('  ALICE '), false, '정규화 후 중복이면 false');
select is(public.is_username_available('new_user'), true, '미사용 username은 true');
select is(public.is_username_available('a!'), false, '형식 불일치는 false');

-- 8: anon은 profiles 접근 불가, 함수는 호출 가능
set local role anon;
select throws_ok($$ select count(*) from public.profiles $$, '42501', null, 'anon은 profiles 조회 불가');
select is(public.is_username_available('another'), true, 'anon도 username 확인 가능');
reset role;

-- 10~14: 로그인 사용자
select tests.login_as(tests.uid('alice@test.com'));
select is(private.is_active_session(), true, '정상 세션은 활성');
select is((select count(*)::int from public.profiles), 4, '로그인 사용자는 전체 프로필 조회');
select lives_ok($$ update public.profiles set nickname = '앨리스' where id = tests.uid('alice@test.com') $$, '본인 nickname 수정');
select throws_ok($$ update public.profiles set username = 'hacker' where id = tests.uid('alice@test.com') $$, '42501', null, 'username 수정 불가(컬럼 권한)');
update public.profiles set nickname = 'pwned' where id = tests.uid('bob@test.com');
reset role;
select isnt((select nickname from public.profiles where id = tests.uid('bob@test.com')), 'pwned', '타인 프로필 수정은 0행');

-- 15~16: private 접근 불가 / 관리자 판정
select tests.login_as(tests.uid('alice@test.com'));
select throws_ok($$ select * from private.user_roles $$, '42501', null, 'private.user_roles 직접 조회 불가');
select is(private.is_admin(), false, '일반 사용자는 관리자 아님');
reset role;
insert into private.user_roles (user_id, role) values (tests.uid('alice@test.com'), 'ADMIN');
select tests.login_as(tests.uid('alice@test.com'));
select is(private.is_admin(), true, 'user_roles ADMIN이면 관리자');
reset role;

-- 18~22: is_active_session 차단 경로
insert into private.user_access (user_id, banned_until) values (tests.uid('bob@test.com'), now() + interval '1 day');
select tests.login_as(tests.uid('bob@test.com'));
select is(private.is_active_session(), false, 'user_access 정지 중이면 비활성');
select is((select count(*)::int from public.profiles), 0, '비활성 세션은 프로필도 0행');
reset role;
update private.user_access set banned_until = now() - interval '1 minute' where user_id = tests.uid('bob@test.com');
select tests.login_as(tests.uid('bob@test.com'));
select is(private.is_active_session(), true, '정지 만료 후 복귀 (Review Focus 5)');
reset role;
update private.user_access set sessions_revoked_at = now() where user_id = tests.uid('bob@test.com');
select tests.login_as(tests.uid('bob@test.com'), now() - interval '1 minute');
select is(private.is_active_session(), false, '강제 로그아웃 이전 발급 토큰은 비활성');
reset role;
select tests.login_as(tests.uid('bob@test.com'), now() + interval '1 minute');
select is(private.is_active_session(), true, '강제 로그아웃 이후 발급 토큰은 활성');
reset role;

-- 23~24: 세션 삭제(Studio) / 대시보드 Ban
delete from auth.sessions where user_id = tests.uid('alice@test.com');
select tests.login_as(tests.uid('alice@test.com'));
select is(private.is_active_session(), false, 'auth.sessions 행 삭제 시 즉시 비활성');
reset role;
update auth.users set banned_until = now() + interval '1 day' where id = tests.uid('kakao@test.com');
select tests.login_as(tests.uid('kakao@test.com'));
select is(private.is_active_session(), false, 'auth.users.banned_until(대시보드 Ban)도 존중');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인**

```bash
npx -y supabase@2.120.0 test db
```
Expected: `010_foundation.test.sql` FAIL (`relation "public.profiles" does not exist` 또는 `function tests...`/`private.is_active_session does not exist`).

- [ ] **Step 3: 마이그레이션 작성**

```bash
npx -y supabase@2.120.0 migration new foundation
```
생성된 `supabase/migrations/<ts>_foundation.sql`에:

```sql
-- ============ private 스키마 (Data API 비노출) ============
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;   -- RLS 정책에서 private 헬퍼 호출용

create or replace function private.set_updated_at() returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============ profiles ============
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,20}$'),
  nickname text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_username_key on public.profiles (username);
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (nickname, avatar_url) on table public.profiles to authenticated;

-- ============ 역할·접근 제어 (private) ============
create table private.user_roles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role = 'ADMIN')
);
create table private.user_access (
  user_id uuid primary key references auth.users (id) on delete cascade,
  banned_until timestamptz,
  sessions_revoked_at timestamptz,
  reason text,
  updated_at timestamptz not null default now()
);
create trigger user_access_set_updated_at before update on private.user_access
  for each row execute function private.set_updated_at();
revoke all on table private.user_roles, private.user_access from public, anon, authenticated;

-- ============ 세션·관리자 헬퍼 ============
-- 활성 세션: JWT session_id가 auth.sessions에 있고, 정지/강제 로그아웃 대상이 아님
create or replace function private.is_active_session() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from auth.sessions s
    join auth.users u on u.id = s.user_id
    left join private.user_access a on a.user_id = s.user_id
    where s.id = nullif(auth.jwt() ->> 'session_id', '')::uuid
      and s.user_id = auth.uid()
      and (u.banned_until is null or u.banned_until <= now())
      and (a.banned_until is null or a.banned_until <= now())
      and (a.sessions_revoked_at is null
           or to_timestamp((auth.jwt() ->> 'iat')::bigint) > a.sessions_revoked_at)
  );
$$;

create or replace function private.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_active_session()
     and exists (select 1 from private.user_roles r where r.user_id = auth.uid() and r.role = 'ADMIN');
$$;

create or replace function private.require_active_session() returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_active_session() then
    raise exception 'AUTH_SESSION_REVOKED' using hint = '세션이 만료되었거나 접근이 제한되었습니다.';
  end if;
end;
$$;

revoke execute on function private.is_active_session(), private.is_admin(), private.require_active_session() from public, anon;
grant execute on function private.is_active_session(), private.is_admin(), private.require_active_session() to authenticated;

-- ============ profiles 정책 ============
create policy profiles_select on public.profiles for select to authenticated
  using ((select private.is_active_session()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select private.is_active_session()))
  with check (id = (select auth.uid()));

-- ============ 가입 트리거 ============
-- 예외를 최소화한다(트리거 실패 = 가입 실패). 이메일 가입 경합으로 unique 충돌할 때만 실패.
create or replace function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_suffix text := substr(replace(new.id::text, '-', ''), 1, 8);
  v_requested text := lower(trim(coalesce(new.raw_user_meta_data ->> 'username', '')));
  v_username text;
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', 'email') = 'kakao' then
    v_username := 'kakao_' || v_suffix;
  elsif v_requested ~ '^[a-z0-9_]{3,20}$' then
    v_username := v_requested;
  else
    v_username := 'user_' || v_suffix;
  end if;

  insert into public.profiles (id, username, nickname, avatar_url)
  values (
    new.id,
    v_username,
    nullif(coalesce(new.raw_user_meta_data ->> 'nickname', new.raw_user_meta_data ->> 'name', new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'), '')
  );
  return new;
end;
$$;
revoke execute on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ============ 가입 전 username 확인 (anon 허용) ============
create or replace function public.is_username_available(p_username text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select lower(trim(coalesce(p_username, ''))) ~ '^[a-z0-9_]{3,20}$'
     and not exists (select 1 from public.profiles p where p.username = lower(trim(p_username)));
$$;
revoke execute on function public.is_username_available(text) from public;
grant execute on function public.is_username_available(text) to anon, authenticated;
```

- [ ] **Step 4: 적용 후 통과 확인**

```bash
npx -y supabase@2.120.0 db reset
npx -y supabase@2.120.0 test db
```
Expected: `000_helpers.sql .. ok`, `010_foundation.test.sql .. ok`, `All tests successful.`

- [ ] **Step 5: 실제 Auth 가입 경로 검증** (트리거가 auth 서비스 권한으로도 동작하는지)

```bash
npx -y supabase@2.120.0 status -o env
```
출력의 `PUBLISHABLE_KEY`(또는 `ANON_KEY`) 값을 `<KEY>`로 사용:
```bash
curl -s -X POST "http://127.0.0.1:54321/auth/v1/signup" -H "apikey: <KEY>" -H "Content-Type: application/json" -d "{\"email\":\"probe@test.com\",\"password\":\"password123\",\"data\":{\"username\":\"Probe_1\"}}"
npx -y supabase@2.120.0 db query --local "select username from public.profiles p join auth.users u on u.id = p.id where u.email = 'probe@test.com'"
```
Expected: 가입 응답에 `"id"`/`"email":"probe@test.com"`, 조회 결과 `probe_1`. 실패(`Database error saving new user`)면 Postgres 로그 확인: `docker logs supabase_db_dongchat --tail 50`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations supabase/tests/database/010_foundation.test.sql
git commit -m "feat(db): profiles, 역할·접근 제어, 활성 세션 헬퍼, 가입 트리거"
```

---

### Task 3: rooms — 방·참여자·메시지 테이블, 멤버십, 방 생성/나가기/강퇴, 방장 승계

**Files:**
- Create: `supabase/migrations/<ts>_rooms.sql` (`supabase migration new rooms`)
- Modify: `supabase/tests/database/000_helpers.sql` (`tests.room_id` 추가)
- Test: `supabase/tests/database/020_rooms.test.sql`

**Interfaces:**
- Consumes: `private.is_active_session()`, `private.is_admin()`, `private.require_active_session()`, `private.set_updated_at()`, `public.profiles`.
- Produces:
  - 테이블 `public.chat_rooms(id bigint, name text, is_group boolean, created_by uuid, created_at, updated_at)`
  - 테이블 `public.chat_room_participants(room_id bigint, user_id uuid, last_read_message_id bigint, joined_at timestamptz)` PK(room_id, user_id)
  - 테이블 `public.messages(id bigint, room_id bigint, sender_id uuid, content text, reply_to_id bigint, edited_at, deleted_at, created_at)`
  - `private.is_room_member(p_room_id bigint) returns boolean`
  - `public.create_room(p_name text, p_is_group boolean, p_usernames text[]) returns bigint`
  - `public.leave_room(p_room_id bigint) returns void`
  - `public.kick_member(p_room_id bigint, p_user_id uuid) returns void`
  - 트리거 `participants_after_delete`(방장 승계·빈 방 삭제)

- [ ] **Step 0: 헬퍼에 `tests.room_id` 추가** — `000_helpers.sql`의 `tests.login_as` 정의 앞에 넣고 grant 목록에 `tests.room_id(text)` 추가:

```sql
create or replace function tests.room_id(p_name text) returns bigint
language sql stable security definer set search_path = ''
as $$ select id from public.chat_rooms where name = p_name order by id desc limit 1 $$;
```
```sql
grant execute on function tests.uid(text), tests.session_of(uuid), tests.room_id(text) to authenticated;
```

- [ ] **Step 1: 실패하는 테스트 작성** — `supabase/tests/database/020_rooms.test.sql`

```sql
begin;
select plan(22);

select tests.create_user('alice@test.com', '{"username":"alice"}');
select tests.create_user('bob@test.com', '{"username":"bob"}');
select tests.create_user('carol@test.com', '{"username":"carol"}');
select tests.create_user('dave@test.com', '{"username":"dave"}');   -- 관리자
select tests.create_user('eve@test.com', '{"username":"eve"}');     -- 외부인
insert into private.user_roles values (tests.uid('dave@test.com'), 'ADMIN');

-- 1~5: create_room 검증
select tests.login_as(tests.uid('alice@test.com'));
select lives_ok($$ select public.create_room('dm', false, array['Bob']) $$, '1:1 방 생성(대소문자 무시)');
select throws_ok($$ select public.create_room('bad', false, array['bob','carol']) $$, 'P0001', 'ROOM_INVALID_PARTICIPANTS', '1:1에 2명 초과 불가');
select throws_ok($$ select public.create_room('bad', true, array['ghost']) $$, 'P0001', 'ROOM_INVALID_PARTICIPANTS', '없는 사용자 불가');
select throws_ok($$ select public.create_room('bad', true, array['alice']) $$, 'P0001', 'ROOM_INVALID_PARTICIPANTS', '본인만으로는 불가');
select lives_ok($$ select public.create_room('grp', true, array['bob','carol']) $$, '그룹방 생성');
select is((select created_by from public.chat_rooms where id = tests.room_id('grp')), tests.uid('alice@test.com'), '생성자가 방장');
select is((select count(*)::int from public.chat_room_participants where room_id = tests.room_id('grp')), 3, '그룹 참여자 3명');
select throws_ok($$ insert into public.chat_rooms (name) values ('x') $$, '42501', null, '방 직접 INSERT 불가');
reset role;

-- 9~11: 가시성
select tests.login_as(tests.uid('eve@test.com'));
select is((select count(*)::int from public.chat_rooms), 0, '외부인은 방 0개');
select is((select count(*)::int from public.chat_room_participants), 0, '외부인은 참여자 0행');
reset role;
select tests.login_as(tests.uid('dave@test.com'));
select is((select count(*)::int from public.chat_rooms), 2, '관리자는 모든 방 열람');
reset role;

-- 12~16: 강퇴
select tests.login_as(tests.uid('bob@test.com'));
select throws_ok(format('select public.kick_member(%s, %L)', tests.room_id('grp'), tests.uid('carol@test.com')), 'P0001', 'ROOM_KICK_FORBIDDEN', '방장 아닌 멤버는 강퇴 불가');
reset role;
select tests.login_as(tests.uid('alice@test.com'));
select throws_ok(format('select public.kick_member(%s, %L)', tests.room_id('dm'), tests.uid('bob@test.com')), 'P0001', 'ROOM_KICK_FORBIDDEN', '1:1 방은 강퇴 불가');
select throws_ok(format('select public.kick_member(%s, %L)', tests.room_id('grp'), tests.uid('alice@test.com')), 'P0001', 'ROOM_KICK_FORBIDDEN', '본인 강퇴 불가');
select lives_ok(format('select public.kick_member(%s, %L)', tests.room_id('grp'), tests.uid('carol@test.com')), '방장은 강퇴 가능');
reset role;
select tests.login_as(tests.uid('carol@test.com'));
select is((select count(*)::int from public.chat_rooms where name = 'grp'), 0, '강퇴된 사용자는 방이 안 보임');
reset role;

-- 17~19: 나가기 + 방장 승계 + 빈 방 삭제
select tests.login_as(tests.uid('eve@test.com'));
select throws_ok(format('select public.leave_room(%s)', tests.room_id('grp')), 'P0001', 'CHAT_FORBIDDEN', '비참여자는 나가기 불가');
reset role;
select tests.login_as(tests.uid('alice@test.com'));
select lives_ok(format('select public.leave_room(%s)', tests.room_id('grp')), '방장 나가기');
reset role;
select is((select created_by from public.chat_rooms where name = 'grp'), tests.uid('bob@test.com'), '남은 멤버에게 방장 승계');

-- 20: Studio 직접 삭제도 동일 처리 (Review Focus 3)
delete from public.chat_room_participants where room_id = tests.room_id('grp') and user_id = tests.uid('bob@test.com');
select is((select count(*)::int from public.chat_rooms where name = 'grp'), 0, '마지막 멤버 삭제 시 방 삭제');

-- 21~22: 비활성 세션
insert into private.user_access (user_id, sessions_revoked_at) values (tests.uid('alice@test.com'), now());
select tests.login_as(tests.uid('alice@test.com'), now() - interval '1 minute');
select throws_ok($$ select public.create_room('late', true, array['bob']) $$, 'P0001', 'AUTH_SESSION_REVOKED', '강제 로그아웃 후 RPC 거부');
select is((select count(*)::int from public.chat_rooms), 0, '강제 로그아웃 후 방 조회 0');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인**

```bash
npx -y supabase@2.120.0 test db
```
Expected: `020_rooms.test.sql` FAIL (`function public.create_room(...) does not exist`).

- [ ] **Step 3: 마이그레이션 작성** — `npx -y supabase@2.120.0 migration new rooms` 후:

```sql
-- ============ 테이블 ============
create table public.chat_rooms (
  id bigint generated always as identity primary key,
  name text,
  is_group boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_rooms_created_by_idx on public.chat_rooms (created_by);
create trigger chat_rooms_set_updated_at before update on public.chat_rooms
  for each row execute function private.set_updated_at();

create table public.chat_room_participants (
  room_id bigint not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_message_id bigint,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index chat_room_participants_user_id_idx on public.chat_room_participants (user_id);

create table public.messages (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.chat_rooms (id) on delete cascade,
  sender_id uuid default auth.uid() references public.profiles (id) on delete set null,
  content text not null,
  reply_to_id bigint references public.messages (id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_content_length check (deleted_at is not null or char_length(content) between 1 and 2000)
);
create index messages_room_id_id_idx on public.messages (room_id, id desc);
create index messages_sender_id_idx on public.messages (sender_id);
create index messages_reply_to_id_idx on public.messages (reply_to_id);

alter table public.chat_rooms enable row level security;
alter table public.chat_room_participants enable row level security;
alter table public.messages enable row level security;
revoke all on table public.chat_rooms, public.chat_room_participants, public.messages from anon, authenticated;
grant select on table public.chat_rooms, public.chat_room_participants, public.messages to authenticated;
grant insert (room_id, content, reply_to_id) on table public.messages to authenticated;

-- ============ 멤버십 헬퍼 ============
create or replace function private.is_room_member(p_room_id bigint) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_active_session()
     and exists (
       select 1 from public.chat_room_participants p
       where p.room_id = p_room_id and p.user_id = auth.uid()
     );
$$;
revoke execute on function private.is_room_member(bigint) from public, anon;
grant execute on function private.is_room_member(bigint) to authenticated;

-- ============ 정책 ============
create policy chat_rooms_select on public.chat_rooms for select to authenticated
  using ((select private.is_room_member(id)) or (select private.is_admin()));
create policy chat_room_participants_select on public.chat_room_participants for select to authenticated
  using ((select private.is_room_member(room_id)) or (select private.is_admin()));
create policy messages_select on public.messages for select to authenticated
  using ((select private.is_room_member(room_id)) or (select private.is_admin()));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.is_room_member(room_id))
    and (
      reply_to_id is null
      or exists (select 1 from public.messages r where r.id = reply_to_id and r.room_id = messages.room_id)
    )
  );

-- ============ 참여자 삭제 후처리 (RPC·Studio 공통) ============
create or replace function private.participants_after_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_next uuid;
begin
  select p.user_id into v_next
  from public.chat_room_participants p
  where p.room_id = old.room_id
  order by p.joined_at, p.user_id
  limit 1;

  if v_next is null then
    delete from public.chat_rooms where id = old.room_id;
  else
    update public.chat_rooms set created_by = v_next
    where id = old.room_id and created_by is not distinct from old.user_id;
  end if;
  return null;
end;
$$;
revoke execute on function private.participants_after_delete() from public, anon, authenticated;
create trigger participants_after_delete after delete on public.chat_room_participants
  for each row execute function private.participants_after_delete();

-- ============ RPC ============
create or replace function public.create_room(p_name text, p_is_group boolean, p_usernames text[])
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_is_group boolean := coalesce(p_is_group, false);
  v_names text[];
  v_found int;
  v_others uuid[];
  v_room bigint;
begin
  perform private.require_active_session();

  select coalesce(array_agg(distinct lower(trim(u))), '{}')
  into v_names
  from unnest(coalesce(p_usernames, '{}'::text[])) as u
  where trim(u) <> '';

  select count(*), coalesce(array_agg(p.id) filter (where p.id <> v_me), '{}')
  into v_found, v_others
  from public.profiles p
  where p.username = any(v_names);

  if v_found <> cardinality(v_names) then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '존재하지 않는 사용자가 포함되어 있습니다.';
  end if;
  if cardinality(v_others) = 0 then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '대화 상대를 한 명 이상 선택하세요.';
  end if;
  if not v_is_group and cardinality(v_others) <> 1 then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '1:1 채팅방은 정확히 2명이어야 합니다.';
  end if;

  insert into public.chat_rooms (name, is_group, created_by)
  values (nullif(trim(p_name), ''), v_is_group, v_me)
  returning id into v_room;

  insert into public.chat_room_participants (room_id, user_id)
  select v_room, uid from unnest(array_append(v_others, v_me)) as uid;

  return v_room;
end;
$$;

create or replace function public.leave_room(p_room_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_active_session();
  delete from public.chat_room_participants where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'CHAT_FORBIDDEN' using hint = '참여 중인 방이 아닙니다.';
  end if;
end;
$$;

create or replace function public.kick_member(p_room_id bigint, p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.chat_rooms;
begin
  perform private.require_active_session();
  select * into v_room from public.chat_rooms where id = p_room_id;
  if not found then
    raise exception 'CHAT_ROOM_NOT_FOUND' using hint = '방을 찾을 수 없습니다.';
  end if;
  if p_user_id = auth.uid()
     or not v_room.is_group
     or not (coalesce(v_room.created_by = auth.uid(), false) or private.is_admin()) then
    raise exception 'ROOM_KICK_FORBIDDEN' using hint = '강퇴할 권한이 없습니다.';
  end if;
  delete from public.chat_room_participants where room_id = p_room_id and user_id = p_user_id;
  if not found then
    raise exception 'CHAT_FORBIDDEN' using hint = '방 참여자가 아닙니다.';
  end if;
end;
$$;

revoke execute on function public.create_room(text, boolean, text[]), public.leave_room(bigint), public.kick_member(bigint, uuid) from public, anon;
grant execute on function public.create_room(text, boolean, text[]), public.leave_room(bigint), public.kick_member(bigint, uuid) to authenticated;
```

- [ ] **Step 4: 통과 확인**

```bash
npx -y supabase@2.120.0 db reset
npx -y supabase@2.120.0 test db
```
Expected: 모든 파일 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/database
git commit -m "feat(db): 방·참여자·메시지 테이블, 멤버십 RLS, 방 생성/나가기/강퇴, 방장 승계"
```

---

### Task 4: 메시지 쓰기 규칙과 RPC (전송·수정·삭제·읽음)

**Files:**
- Create: `supabase/migrations/<ts>_message_rpcs.sql` (`supabase migration new message_rpcs`)
- Test: `supabase/tests/database/030_messages.test.sql`

**Interfaces:**
- Consumes: Task 3 테이블·`private.is_room_member`, `private.require_active_session`.
- Produces:
  - `public.edit_message(p_id bigint, p_content text) returns void`
  - `public.delete_message(p_id bigint) returns void` (content=''로 마스킹)
  - `public.mark_read(p_room_id bigint) returns bigint` (갱신 후 값, 변경 없으면 기존 값 그대로 반환·UPDATE 안 함)

- [ ] **Step 1: 실패하는 테스트 작성** — `supabase/tests/database/030_messages.test.sql`

```sql
begin;
select plan(21);

select tests.create_user('alice@test.com', '{"username":"alice"}');
select tests.create_user('bob@test.com', '{"username":"bob"}');
select tests.create_user('dave@test.com', '{"username":"dave"}');
select tests.create_user('eve@test.com', '{"username":"eve"}');
insert into private.user_roles values (tests.uid('dave@test.com'), 'ADMIN');

select tests.login_as(tests.uid('alice@test.com'));
select public.create_room('dm', false, array['bob']);
select public.create_room('other', false, array['eve']);
reset role;

-- 1~6: INSERT 규칙
select tests.login_as(tests.uid('alice@test.com'));
select lives_ok(format($$ insert into public.messages (room_id, content) values (%s, 'hi') $$, tests.room_id('dm')), '멤버는 메시지 전송');
select is((select sender_id from public.messages where content = 'hi'), tests.uid('alice@test.com'), 'sender_id는 auth.uid() 기본값');
select throws_ok(format($$ insert into public.messages (room_id, content, sender_id) values (%s, 'spoof', %L) $$, tests.room_id('dm'), tests.uid('bob@test.com')), '42501', null, 'sender_id 지정 불가(컬럼 권한)');
select throws_ok(format($$ insert into public.messages (room_id, content) values (%s, '') $$, tests.room_id('dm')), '23514', null, '빈 메시지 불가');
insert into public.messages (room_id, content) values (tests.room_id('other'), 'other-room');
select throws_ok(format($$ insert into public.messages (room_id, content, reply_to_id) values (%s, 'x', %s) $$, tests.room_id('dm'), (select id from public.messages where content = 'other-room')), '42501', null, '다른 방 메시지에 답장 불가');
select lives_ok(format($$ insert into public.messages (room_id, content, reply_to_id) values (%s, 'reply', %s) $$, tests.room_id('dm'), (select id from public.messages where content = 'hi')), '같은 방 답장 가능');
reset role;

-- 7~8: 비멤버
select tests.login_as(tests.uid('eve@test.com'));
select throws_ok(format($$ insert into public.messages (room_id, content) values (%s, 'intrude') $$, tests.room_id('dm')), '42501', null, '비멤버 전송 불가');
select is((select count(*)::int from public.messages where room_id = tests.room_id('dm')), 0, '비멤버는 메시지 0개');
reset role;

-- 9~11: 관리자 열람만 (Review Focus 4)
select tests.login_as(tests.uid('dave@test.com'));
select is((select count(*)::int from public.messages where room_id = tests.room_id('dm')), 2, '관리자는 메시지 열람');
select throws_ok(format($$ insert into public.messages (room_id, content) values (%s, 'admin') $$, tests.room_id('dm')), '42501', null, '관리자도 비멤버면 전송 불가');
select throws_ok(format('select public.mark_read(%s)', tests.room_id('dm')), 'P0001', 'CHAT_FORBIDDEN', '관리자 열람은 읽음 처리 안 됨');
reset role;

-- 12~16: 수정·삭제
select tests.login_as(tests.uid('bob@test.com'));
select throws_ok(format('select public.edit_message(%s, %L)', (select id from public.messages where content = 'hi'), 'hack'), 'P0001', 'CHAT_FORBIDDEN', '타인 메시지 수정 불가');
reset role;
select tests.login_as(tests.uid('alice@test.com'));
select throws_ok(format('select public.edit_message(%s, %L)', (select id from public.messages where content = 'hi'), ''), 'P0001', 'VALIDATION_FAILED', '빈 내용으로 수정 불가');
select lives_ok(format('select public.edit_message(%s, %L)', (select id from public.messages where content = 'hi'), 'hello'), '본인 메시지 수정');
select ok((select edited_at is not null from public.messages where content = 'hello'), 'edited_at 기록');
select lives_ok(format('select public.delete_message(%s)', (select id from public.messages where content = 'hello')), '본인 메시지 삭제');
reset role;
select is((select content from public.messages where deleted_at is not null), '', '삭제 시 content 마스킹');
select tests.login_as(tests.uid('alice@test.com'));
select throws_ok(format('select public.edit_message(%s, %L)', (select id from public.messages where deleted_at is not null), 'revive'), 'P0001', 'MESSAGE_NOT_FOUND', '삭제된 메시지 수정 불가');
select throws_ok(format($$ update public.messages set content = 'x' where room_id = %s $$, tests.room_id('dm')), '42501', null, '메시지 직접 UPDATE 불가');
reset role;

-- 19~20: 읽음
select tests.login_as(tests.uid('bob@test.com'));
select is(public.mark_read(tests.room_id('dm')), (select max(id) from public.messages where room_id = tests.room_id('dm')), 'mark_read는 최신 id');
select is(public.mark_read(tests.room_id('dm')), (select max(id) from public.messages where room_id = tests.room_id('dm')), '반복 호출해도 단조(값 유지)');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인** — `npx -y supabase@2.120.0 test db` → `030_messages` FAIL(`function public.edit_message ... does not exist`). (INSERT 관련 assertion은 이미 통과할 수 있음)

- [ ] **Step 3: 마이그레이션 작성** — `npx -y supabase@2.120.0 migration new message_rpcs` 후:

```sql
create or replace function public.edit_message(p_id bigint, p_content text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_msg public.messages;
  v_content text := trim(coalesce(p_content, ''));
begin
  perform private.require_active_session();
  if char_length(v_content) not between 1 and 2000 then
    raise exception 'VALIDATION_FAILED' using hint = '메시지는 1~2000자여야 합니다.';
  end if;
  select * into v_msg from public.messages where id = p_id for update;
  if not found or v_msg.deleted_at is not null then
    raise exception 'MESSAGE_NOT_FOUND' using hint = '메시지를 찾을 수 없습니다.';
  end if;
  if v_msg.sender_id is distinct from auth.uid() or not private.is_room_member(v_msg.room_id) then
    raise exception 'CHAT_FORBIDDEN' using hint = '본인 메시지만 수정할 수 있습니다.';
  end if;
  update public.messages set content = v_content, edited_at = now() where id = p_id;
end;
$$;

create or replace function public.delete_message(p_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_msg public.messages;
begin
  perform private.require_active_session();
  select * into v_msg from public.messages where id = p_id for update;
  if not found or v_msg.deleted_at is not null then
    raise exception 'MESSAGE_NOT_FOUND' using hint = '메시지를 찾을 수 없습니다.';
  end if;
  if v_msg.sender_id is distinct from auth.uid() or not private.is_room_member(v_msg.room_id) then
    raise exception 'CHAT_FORBIDDEN' using hint = '본인 메시지만 삭제할 수 있습니다.';
  end if;
  update public.messages set deleted_at = now(), content = '' where id = p_id;
end;
$$;

-- 읽음 위치는 단조 증가. 값이 같으면 UPDATE하지 않아 불필요한 read_update 송출을 막는다.
create or replace function public.mark_read(p_room_id bigint) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_current bigint;
  v_latest bigint;
begin
  perform private.require_active_session();
  select last_read_message_id into v_current
  from public.chat_room_participants
  where room_id = p_room_id and user_id = auth.uid()
  for update;
  if not found then
    raise exception 'CHAT_FORBIDDEN' using hint = '참여 중인 방이 아닙니다.';
  end if;

  select max(id) into v_latest from public.messages where room_id = p_room_id;
  if v_latest is null or v_latest <= coalesce(v_current, 0) then
    return v_current;
  end if;

  update public.chat_room_participants set last_read_message_id = v_latest
  where room_id = p_room_id and user_id = auth.uid();
  return v_latest;
end;
$$;

revoke execute on function public.edit_message(bigint, text), public.delete_message(bigint), public.mark_read(bigint) from public, anon;
grant execute on function public.edit_message(bigint, text), public.delete_message(bigint), public.mark_read(bigint) to authenticated;
```

- [ ] **Step 4: 통과 확인** — `npx -y supabase@2.120.0 db reset && npx -y supabase@2.120.0 test db` → 전부 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/database/030_messages.test.sql
git commit -m "feat(db): 메시지 수정·삭제(마스킹)·읽음(단조 증가) RPC"
```

---

### Task 5: friends

**Files:**
- Create: `supabase/migrations/<ts>_friends.sql` (`supabase migration new friends`)
- Test: `supabase/tests/database/040_friends.test.sql`

**Interfaces:**
- Produces:
  - 테이블 `public.friends(id bigint, requester_id uuid, receiver_id uuid, status text, created_at, updated_at)`
  - `public.send_friend_request(p_username text) returns public.friends`
  - `public.respond_friend_request(p_id bigint, p_action text) returns void` (`ACCEPT`/`BLOCK`, 대소문자 무시)

- [ ] **Step 1: 실패하는 테스트 작성** — `supabase/tests/database/040_friends.test.sql`

```sql
begin;
select plan(11);

select tests.create_user('alice@test.com', '{"username":"alice"}');
select tests.create_user('bob@test.com', '{"username":"bob"}');
select tests.create_user('eve@test.com', '{"username":"eve"}');

select tests.login_as(tests.uid('alice@test.com'));
select lives_ok($$ select public.send_friend_request(' BOB ') $$, '친구 요청(정규화)');
select throws_ok($$ select public.send_friend_request('alice') $$, 'P0001', 'FRIEND_SELF_REQUEST', '본인 요청 불가');
select throws_ok($$ select public.send_friend_request('ghost') $$, 'P0001', 'FRIEND_USER_NOT_FOUND', '없는 사용자');
select throws_ok($$ select public.send_friend_request('bob') $$, 'P0001', 'FRIEND_DUPLICATE', '중복 요청 불가');
select throws_ok($$ insert into public.friends (requester_id, receiver_id) values (tests.uid('alice@test.com'), tests.uid('eve@test.com')) $$, '42501', null, '직접 INSERT 불가');
select throws_ok($$ select public.respond_friend_request((select id from public.friends limit 1), 'ACCEPT') $$, 'P0001', 'CHAT_FORBIDDEN', '요청자는 수락 불가');
reset role;

select tests.login_as(tests.uid('bob@test.com'));
select throws_ok($$ select public.send_friend_request('alice') $$, 'P0001', 'FRIEND_DUPLICATE', '반대 방향 중복 불가');
select throws_ok($$ select public.respond_friend_request((select id from public.friends limit 1), 'maybe') $$, 'P0001', 'VALIDATION_FAILED', '잘못된 action');
select lives_ok($$ select public.respond_friend_request((select id from public.friends limit 1), 'accept') $$, '수신자 수락');
select is((select status from public.friends limit 1), 'ACCEPTED', '상태 ACCEPTED');
reset role;

select tests.login_as(tests.uid('eve@test.com'));
select is((select count(*)::int from public.friends), 0, '제3자는 친구 관계 안 보임');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인** — `npx -y supabase@2.120.0 test db` → `040_friends` FAIL.

- [ ] **Step 3: 마이그레이션 작성** — `npx -y supabase@2.120.0 migration new friends` 후:

```sql
create table public.friends (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friends_not_self check (requester_id <> receiver_id)
);
-- 양방향 중복 차단
create unique index friends_pair_key on public.friends (least(requester_id, receiver_id), greatest(requester_id, receiver_id));
create index friends_requester_id_idx on public.friends (requester_id);
create index friends_receiver_id_idx on public.friends (receiver_id);
create trigger friends_set_updated_at before update on public.friends
  for each row execute function private.set_updated_at();

alter table public.friends enable row level security;
revoke all on table public.friends from anon, authenticated;
grant select on table public.friends to authenticated;

create policy friends_select on public.friends for select to authenticated
  using (
    (select auth.uid()) in (requester_id, receiver_id)
    and (select private.is_active_session())
  );

create or replace function public.send_friend_request(p_username text) returns public.friends
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_row public.friends;
begin
  perform private.require_active_session();
  select id into v_target from public.profiles where username = lower(trim(coalesce(p_username, '')));
  if v_target is null then
    raise exception 'FRIEND_USER_NOT_FOUND' using hint = '사용자를 찾을 수 없습니다.';
  end if;
  if v_target = v_me then
    raise exception 'FRIEND_SELF_REQUEST' using hint = '본인에게 친구 요청을 보낼 수 없습니다.';
  end if;
  insert into public.friends (requester_id, receiver_id) values (v_me, v_target)
  returning * into v_row;
  return v_row;
exception
  when unique_violation then
    raise exception 'FRIEND_DUPLICATE' using hint = '이미 친구 요청이 존재합니다.';
end;
$$;

create or replace function public.respond_friend_request(p_id bigint, p_action text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text := case upper(trim(coalesce(p_action, '')))
                     when 'ACCEPT' then 'ACCEPTED'
                     when 'BLOCK' then 'BLOCKED'
                   end;
begin
  perform private.require_active_session();
  if v_status is null then
    raise exception 'VALIDATION_FAILED' using hint = 'action은 ACCEPT 또는 BLOCK이어야 합니다.';
  end if;
  update public.friends set status = v_status
  where id = p_id and receiver_id = auth.uid();
  if not found then
    raise exception 'CHAT_FORBIDDEN' using hint = '요청을 받은 사용자만 응답할 수 있습니다.';
  end if;
end;
$$;

revoke execute on function public.send_friend_request(text), public.respond_friend_request(bigint, text) from public, anon;
grant execute on function public.send_friend_request(text), public.respond_friend_request(bigint, text) to authenticated;
```

- [ ] **Step 4: 통과 확인** — `npx -y supabase@2.120.0 db reset && npx -y supabase@2.120.0 test db`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/database/040_friends.test.sql
git commit -m "feat(db): 친구 요청·응답 RPC, 양방향 중복 차단"
```

---

### Task 6: push_subscriptions

**Files:**
- Create: `supabase/migrations/<ts>_push_subscriptions.sql` (`supabase migration new push_subscriptions`)
- Test: `supabase/tests/database/050_push.test.sql`

**Interfaces:**
- Produces: 테이블 `public.push_subscriptions(id bigint, user_id uuid default auth.uid(), endpoint text unique, p256dh text, auth text, created_at, updated_at)` — 클라는 `upsert(..., { onConflict: 'endpoint' })`로 저장(2단계 이후).

- [ ] **Step 1: 실패하는 테스트 작성** — `supabase/tests/database/050_push.test.sql`

```sql
begin;
select plan(6);

select tests.create_user('alice@test.com', '{"username":"alice"}');
select tests.create_user('bob@test.com', '{"username":"bob"}');

select tests.login_as(tests.uid('alice@test.com'));
select lives_ok($$ insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push/a', 'k', 'a') $$, '본인 구독 저장');
select lives_ok($$ insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push/a', 'k2', 'a2')
                   on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth $$, '같은 endpoint upsert');
select is((select p256dh from public.push_subscriptions where endpoint = 'https://push/a'), 'k2', 'upsert 반영');
select throws_ok(format($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (%L, 'https://push/b', 'k', 'a') $$, tests.uid('bob@test.com')), '42501', null, '타인 user_id로 저장 불가');
reset role;

select tests.login_as(tests.uid('bob@test.com'));
select is((select count(*)::int from public.push_subscriptions), 0, '타인 구독 안 보임');
select throws_ok($$ insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push/a', 'x', 'y')
                    on conflict (endpoint) do update set p256dh = excluded.p256dh $$, '42501', null, '타인 endpoint 덮어쓰기 불가');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인** — `npx -y supabase@2.120.0 test db` → `050_push` FAIL.

- [ ] **Step 3: 마이그레이션 작성** — `npx -y supabase@2.120.0 migration new push_subscriptions` 후:

```sql
create table public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);
create trigger push_subscriptions_set_updated_at before update on public.push_subscriptions
  for each row execute function private.set_updated_at();

alter table public.push_subscriptions enable row level security;
revoke all on table public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;

create policy push_subscriptions_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_session()))
  with check (user_id = (select auth.uid()) and (select private.is_active_session()));
```

- [ ] **Step 4: 통과 확인** — `npx -y supabase@2.120.0 db reset && npx -y supabase@2.120.0 test db`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/database/050_push.test.sql
git commit -m "feat(db): 푸시 구독 테이블(본인 행만, endpoint upsert)"
```

---

### Task 7: 관리자 RPC (사용자·방 목록, 정지/해제, 강제 로그아웃)

**Files:**
- Create: `supabase/migrations/<ts>_admin.sql` (`supabase migration new admin`)
- Test: `supabase/tests/database/060_admin.test.sql`

**Interfaces:**
- Consumes: `private.is_admin()`, `private.user_roles`, `private.user_access`, `public.profiles`, `public.chat_rooms`, `public.chat_room_participants`.
- Produces:
  - `public.admin_list_users(p_page int default 1, p_limit int default 20, p_sort text default 'created_at', p_order text default 'desc') returns jsonb` → `{items:[{id, username, nickname, email, createdAt, isAdmin, bannedUntil}], total, page, limit}`
  - `public.admin_list_rooms(p_page int default 1, p_limit int default 20) returns jsonb` → `{items:[{id, name, isGroup, createdBy, ownerUsername, memberCount, createdAt}], total, page, limit}`
  - `public.admin_ban(p_user_id uuid, p_until timestamptz, p_reason text default null) returns void`
  - `public.admin_unban(p_user_id uuid) returns void`
  - `public.admin_force_logout(p_user_id uuid) returns void`

- [ ] **Step 1: 실패하는 테스트 작성** — `supabase/tests/database/060_admin.test.sql`

```sql
begin;
select plan(13);

select tests.create_user('dave@test.com', '{"username":"dave"}');
select tests.create_user('alice@test.com', '{"username":"alice"}');
select tests.create_user('bob@test.com', '{"username":"bob"}');
insert into private.user_roles values (tests.uid('dave@test.com'), 'ADMIN');

-- 1~3: 비관리자 거부
select tests.login_as(tests.uid('alice@test.com'));
select throws_ok($$ select public.admin_list_users() $$, 'P0001', 'ADMIN_FORBIDDEN', '비관리자 목록 조회 불가');
select throws_ok(format('select public.admin_ban(%L, now() + interval ''1 day'')', tests.uid('bob@test.com')), 'P0001', 'ADMIN_FORBIDDEN', '비관리자 정지 불가');
select throws_ok(format('select public.admin_force_logout(%L)', tests.uid('bob@test.com')), 'P0001', 'ADMIN_FORBIDDEN', '비관리자 강제 로그아웃 불가');
select public.create_room('grp', true, array['bob']);
reset role;

-- 4~8: 목록
select tests.login_as(tests.uid('dave@test.com'));
select is((public.admin_list_users(1, 2, 'username', 'asc') ->> 'total')::int, 3, 'total');
select is(jsonb_array_length(public.admin_list_users(1, 2, 'username', 'asc') -> 'items'), 2, 'limit 적용');
select is(public.admin_list_users(1, 2, 'username', 'asc') -> 'items' -> 0 ->> 'username', 'alice', '정렬 asc');
select is((public.admin_list_users(1, 1000) ->> 'limit')::int, 100, 'limit 상한 100');
select is((public.admin_list_rooms() -> 'items' -> 0 ->> 'memberCount')::int, 2, '방 멤버 수');

-- 9~13: 정지/해제/강제 로그아웃
select throws_ok(format('select public.admin_ban(%L, now() + interval ''1 day'')', tests.uid('dave@test.com')), 'P0001', 'VALIDATION_FAILED', '본인 정지 불가');
select throws_ok(format('select public.admin_ban(%L, now() - interval ''1 day'')', tests.uid('bob@test.com')), 'P0001', 'VALIDATION_FAILED', '과거 시각 정지 불가');
select lives_ok(format('select public.admin_ban(%L, now() + interval ''1 day'', %L)', tests.uid('bob@test.com'), '스팸'), '정지');
select lives_ok(format('select public.admin_force_logout(%L)', tests.uid('alice@test.com')), '강제 로그아웃');
reset role;
select tests.login_as(tests.uid('bob@test.com'));
select is(private.is_active_session(), false, '정지된 사용자 비활성');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인** — `npx -y supabase@2.120.0 test db` → `060_admin` FAIL.

- [ ] **Step 3: 마이그레이션 작성** — `npx -y supabase@2.120.0 migration new admin` 후:

```sql
create or replace function private.require_admin() returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_active_session();
  if not private.is_admin() then
    raise exception 'ADMIN_FORBIDDEN' using hint = '관리자만 접근할 수 있습니다.';
  end if;
end;
$$;
revoke execute on function private.require_admin() from public, anon, authenticated;

create or replace function public.admin_list_users(
  p_page int default 1, p_limit int default 20, p_sort text default 'created_at', p_order text default 'desc'
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_sort text := case when p_sort in ('created_at', 'username', 'updated_at') then p_sort else 'created_at' end;
  v_order text := case when lower(coalesce(p_order, '')) = 'asc' then 'asc' else 'desc' end;
  v_items jsonb;
  v_total bigint;
begin
  perform private.require_admin();
  select count(*) into v_total from public.profiles;
  execute format($q$
    select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select p.id, p.username, p.nickname, u.email,
             p.created_at as "createdAt",
             exists (select 1 from private.user_roles r where r.user_id = p.id) as "isAdmin",
             a.banned_until as "bannedUntil"
      from public.profiles p
      join auth.users u on u.id = p.id
      left join private.user_access a on a.user_id = p.id
      order by p.%I %s, p.id
      limit %s offset %s
    ) t $q$, v_sort, v_order, v_limit, (v_page - 1) * v_limit)
  into v_items;
  return jsonb_build_object('items', v_items, 'total', v_total, 'page', v_page, 'limit', v_limit);
end;
$$;

create or replace function public.admin_list_rooms(p_page int default 1, p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_items jsonb;
  v_total bigint;
begin
  perform private.require_admin();
  select count(*) into v_total from public.chat_rooms;
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_items from (
    select r.id, r.name, r.is_group as "isGroup", r.created_by as "createdBy",
           o.username as "ownerUsername",
           (select count(*) from public.chat_room_participants p where p.room_id = r.id) as "memberCount",
           r.created_at as "createdAt"
    from public.chat_rooms r
    left join public.profiles o on o.id = r.created_by
    order by r.id desc
    limit v_limit offset (v_page - 1) * v_limit
  ) t;
  return jsonb_build_object('items', v_items, 'total', v_total, 'page', v_page, 'limit', v_limit);
end;
$$;

create or replace function public.admin_ban(p_user_id uuid, p_until timestamptz, p_reason text default null) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user_id = auth.uid() then
    raise exception 'VALIDATION_FAILED' using hint = '본인은 정지할 수 없습니다.';
  end if;
  if p_until is null or p_until <= now() then
    raise exception 'VALIDATION_FAILED' using hint = '정지 종료 시각은 미래여야 합니다.';
  end if;
  insert into private.user_access (user_id, banned_until, reason)
  values (p_user_id, p_until, p_reason)
  on conflict (user_id) do update set banned_until = excluded.banned_until, reason = excluded.reason;
end;
$$;

create or replace function public.admin_unban(p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin();
  update private.user_access set banned_until = null, reason = null where user_id = p_user_id;
end;
$$;

create or replace function public.admin_force_logout(p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin();
  insert into private.user_access (user_id, sessions_revoked_at) values (p_user_id, now())
  on conflict (user_id) do update set sessions_revoked_at = excluded.sessions_revoked_at;
end;
$$;

revoke execute on function
  public.admin_list_users(int, int, text, text), public.admin_list_rooms(int, int),
  public.admin_ban(uuid, timestamptz, text), public.admin_unban(uuid), public.admin_force_logout(uuid)
  from public, anon;
grant execute on function
  public.admin_list_users(int, int, text, text), public.admin_list_rooms(int, int),
  public.admin_ban(uuid, timestamptz, text), public.admin_unban(uuid), public.admin_force_logout(uuid)
  to authenticated;
```

- [ ] **Step 4: 통과 확인** — `npx -y supabase@2.120.0 db reset && npx -y supabase@2.120.0 test db`.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/database/060_admin.test.sql
git commit -m "feat(db): 관리자 RPC(사용자·방 목록, 정지/해제, 강제 로그아웃)"
```

---

### Task 8: Realtime — 수신 정책과 이벤트 송출 트리거

**Files:**
- Create: `supabase/migrations/<ts>_realtime.sql` (`supabase migration new realtime`)
- Test: `supabase/tests/database/070_realtime.test.sql`

**Interfaces:**
- Consumes: `private.is_room_member`, `private.is_admin`, `private.is_active_session`, 모든 테이블.
- Produces (spec §8.1 이벤트 계약 — 4단계 클라이언트가 의존):
  - `private.can_receive_topic(p_topic text) returns boolean`
  - `private.message_event(p_op text, p_old public.messages, p_new public.messages) returns table(event text, payload jsonb)` — 이벤트 매핑(순수 함수)
  - `private.broadcast(p_topic text, p_event text, p_payload jsonb) returns void` — 실패해도 예외를 삼키고 WARNING
  - 정책 `dongchat_receive_broadcasts` on `realtime.messages`
  - 트리거: `messages_broadcast`, `participants_read_broadcast`, `participants_removed_broadcast`, `user_access_broadcast`, (조건부) `on_auth_session_deleted`
  - 이벤트: `room:<id>` → `message` `{id, roomId, senderId, content, replyToId, createdAt}` / `message_deleted` `{id, roomId}` / `message_edited` `{id, roomId, content, editedAt}` / `read_update` `{roomId, userId, lastReadMessageId}` / `member_removed` `{roomId, userId}`; `user:<uuid>` → `member_removed` `{roomId, userId}` / `force_logout` `{reason, sessionId?}`

- [ ] **Step 1: 실패하는 테스트 작성** — `supabase/tests/database/070_realtime.test.sql`

```sql
begin;
select plan(17);

select tests.create_user('alice@test.com', '{"username":"alice"}');
select tests.create_user('bob@test.com', '{"username":"bob"}');
select tests.create_user('dave@test.com', '{"username":"dave"}');
select tests.create_user('eve@test.com', '{"username":"eve"}');
insert into private.user_roles values (tests.uid('dave@test.com'), 'ADMIN');
select tests.login_as(tests.uid('alice@test.com'));
select public.create_room('grp', true, array['bob']);
reset role;

-- 1~9: 토픽 수신 권한 (Review Focus 1)
select tests.login_as(tests.uid('alice@test.com'));
select is(private.can_receive_topic('room:' || tests.room_id('grp')), true, '멤버는 방 토픽 수신');
select is(private.can_receive_topic('user:' || tests.uid('alice@test.com')), true, '본인 user 토픽 수신');
select is(private.can_receive_topic('user:' || tests.uid('bob@test.com')), false, '타인 user 토픽 거부');
select is(private.can_receive_topic('room:abc'), false, '형식 불일치 거부');
select is(private.can_receive_topic('room:99999999999999999999999'), false, 'bigint 초과 숫자도 오류 없이 거부');
select is(private.can_receive_topic('user:not-a-uuid'), false, '비UUID user 토픽 거부');
select is(private.can_receive_topic(null), false, 'null 거부');
reset role;
select tests.login_as(tests.uid('eve@test.com'));
select is(private.can_receive_topic('room:' || tests.room_id('grp')), false, '비멤버 거부');
reset role;
select tests.login_as(tests.uid('dave@test.com'));
select is(private.can_receive_topic('room:' || tests.room_id('grp')), true, '관리자 열람 수신');
reset role;

-- 10~13: 이벤트 매핑
select is((select event from private.message_event('INSERT', null,
  row(1, 7, null, 'hi', null, null, null, now())::public.messages)), 'message', 'INSERT → message');
select is((select event from private.message_event('UPDATE',
  row(1, 7, null, 'hi', null, null, null, now())::public.messages,
  row(1, 7, null, '', null, null, now(), now())::public.messages)), 'message_deleted', 'deleted_at 설정 → message_deleted');
select is((select event from private.message_event('UPDATE',
  row(1, 7, null, 'hi', null, null, null, now())::public.messages,
  row(1, 7, null, 'hello', null, now(), null, now())::public.messages)), 'message_edited', '내용 변경 → message_edited');
select is((select payload ->> 'roomId' from private.message_event('INSERT', null,
  row(1, 7, null, 'hi', null, null, null, now())::public.messages)), '7', 'payload에 roomId');

-- 14~17: 송출 트리거가 원 트랜잭션을 깨지 않음 (파티션이 없어 send가 실패해도 성공)
select tests.login_as(tests.uid('alice@test.com'));
select lives_ok(format($$ insert into public.messages (room_id, content) values (%s, 'rt') $$, tests.room_id('grp')), '메시지 INSERT + 송출');
select lives_ok(format('select public.mark_read(%s)', tests.room_id('grp')), '읽음 + 송출');
select lives_ok(format('select public.kick_member(%s, %L)', tests.room_id('grp'), tests.uid('bob@test.com')), '강퇴 + 송출');
reset role;
select lives_ok(format($$ insert into private.user_access (user_id, sessions_revoked_at) values (%L, now()) $$, tests.uid('bob@test.com')), '강제 로그아웃 + 송출');

select * from finish();
rollback;
```

> `row(...)::public.messages`의 필드 순서는 Task 3 테이블 정의 순서(id, room_id, sender_id, content, reply_to_id, edited_at, deleted_at, created_at)를 따른다.

- [ ] **Step 2: 실패 확인** — `npx -y supabase@2.120.0 test db` → `070_realtime` FAIL(`function private.can_receive_topic does not exist`).

- [ ] **Step 3: 마이그레이션 작성** — `npx -y supabase@2.120.0 migration new realtime` 후:

```sql
-- ============ 수신 권한 ============
-- 정규식으로 형식을 먼저 걸러 캐스트 오류를 막는다(room id 최대 18자리 → bigint 안전).
create or replace function private.can_receive_topic(p_topic text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    case
      when p_topic ~ '^room:[0-9]{1,18}$' then
        private.is_room_member(split_part(p_topic, ':', 2)::bigint) or private.is_admin()
      when p_topic ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        private.is_active_session() and split_part(p_topic, ':', 2) = auth.uid()::text
      else false
    end,
    false);
$$;
revoke execute on function private.can_receive_topic(text) from public, anon;
grant execute on function private.can_receive_topic(text) to authenticated;

-- realtime 스키마에는 정책만 추가한다(ALTER/ENABLE RLS 금지). 클라 송신(INSERT) 정책은 만들지 않는다.
create policy dongchat_receive_broadcasts on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select private.can_receive_topic((select realtime.topic())))
  );

-- ============ 송출 ============
-- 송출 실패(예: 일별 파티션 미생성)가 원 트랜잭션을 깨지 않도록 예외를 삼킨다.
create or replace function private.broadcast(p_topic text, p_event text, p_payload jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform realtime.send(p_payload, p_event, p_topic, true);
exception when others then
  raise warning 'realtime.send failed (topic=%, event=%): %', p_topic, p_event, sqlerrm;
end;
$$;
revoke execute on function private.broadcast(text, text, jsonb) from public, anon, authenticated;

create or replace function private.message_event(p_op text, p_old public.messages, p_new public.messages)
returns table (event text, payload jsonb)
language sql immutable set search_path = ''
as $$
  select 'message',
         jsonb_build_object('id', p_new.id, 'roomId', p_new.room_id, 'senderId', p_new.sender_id,
                            'content', p_new.content, 'replyToId', p_new.reply_to_id, 'createdAt', p_new.created_at)
  where p_op = 'INSERT'
  union all
  select 'message_deleted', jsonb_build_object('id', p_new.id, 'roomId', p_new.room_id)
  where p_op = 'UPDATE' and p_old.deleted_at is null and p_new.deleted_at is not null
  union all
  select 'message_edited',
         jsonb_build_object('id', p_new.id, 'roomId', p_new.room_id, 'content', p_new.content, 'editedAt', p_new.edited_at)
  where p_op = 'UPDATE'
    and not (p_old.deleted_at is null and p_new.deleted_at is not null)
    and (p_new.content is distinct from p_old.content or p_new.edited_at is distinct from p_old.edited_at);
$$;
revoke execute on function private.message_event(text, public.messages, public.messages) from public, anon, authenticated;

create or replace function private.messages_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v record;
begin
  for v in select * from private.message_event(tg_op, case when tg_op = 'UPDATE' then old end, new) loop
    perform private.broadcast('room:' || new.room_id, v.event, v.payload);
  end loop;
  return null;
end;
$$;
create trigger messages_broadcast after insert or update on public.messages
  for each row execute function private.messages_broadcast();

create or replace function private.participants_read_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.last_read_message_id is distinct from old.last_read_message_id then
    perform private.broadcast('room:' || new.room_id, 'read_update',
      jsonb_build_object('roomId', new.room_id, 'userId', new.user_id, 'lastReadMessageId', new.last_read_message_id));
  end if;
  return null;
end;
$$;
create trigger participants_read_broadcast after update of last_read_message_id on public.chat_room_participants
  for each row execute function private.participants_read_broadcast();

create or replace function private.participants_removed_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_payload jsonb := jsonb_build_object('roomId', old.room_id, 'userId', old.user_id);
begin
  perform private.broadcast('room:' || old.room_id, 'member_removed', v_payload);
  perform private.broadcast('user:' || old.user_id, 'member_removed', v_payload);
  return null;
end;
$$;
create trigger participants_removed_broadcast after delete on public.chat_room_participants
  for each row execute function private.participants_removed_broadcast();

create or replace function private.user_access_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.banned_until is not null and new.banned_until > now()
     and (tg_op = 'INSERT' or old.banned_until is distinct from new.banned_until) then
    perform private.broadcast('user:' || new.user_id, 'force_logout', jsonb_build_object('reason', 'banned'));
  elsif new.sessions_revoked_at is not null
     and (tg_op = 'INSERT' or old.sessions_revoked_at is distinct from new.sessions_revoked_at) then
    perform private.broadcast('user:' || new.user_id, 'force_logout', jsonb_build_object('reason', 'revoked'));
  end if;
  return null;
end;
$$;
create trigger user_access_broadcast after insert or update on private.user_access
  for each row execute function private.user_access_broadcast();

revoke execute on function private.messages_broadcast(), private.participants_read_broadcast(),
  private.participants_removed_broadcast(), private.user_access_broadcast() from public, anon, authenticated;
```

- [ ] **Step 3b: (Task 1 Step 4에서 auth.sessions 트리거가 가능했을 때만) 세션 삭제 통지** — 같은 마이그레이션 파일 끝에 추가:

```sql
create or replace function private.session_deleted_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.broadcast('user:' || old.user_id, 'force_logout',
    jsonb_build_object('reason', 'session_deleted', 'sessionId', old.id));
  return null;
end;
$$;
revoke execute on function private.session_deleted_broadcast() from public, anon, authenticated;
create trigger on_auth_session_deleted after delete on auth.sessions
  for each row execute function private.session_deleted_broadcast();
```

- [ ] **Step 4: 통과 확인** — `npx -y supabase@2.120.0 db reset && npx -y supabase@2.120.0 test db` → 전부 ok.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations supabase/tests/database/070_realtime.test.sql
git commit -m "feat(db): Realtime 수신 정책(토픽↔멤버십)과 이벤트 송출 트리거"
```

---

### Task 9: 시드, 보안 점검, 타입 생성

**Files:**
- Create: `supabase/seed.sql`, `client/src/lib/supabase/database.types.ts`
- Modify: (advisors 결과에 따라) 해당 마이그레이션

**Interfaces:**
- Produces:
  - 로컬 계정(비밀번호 모두 `password123`): `admin@dongchat.local`(username `admin`, ADMIN), `alice@dongchat.local`(`alice_dev`), `bob@dongchat.local`(`bob_dev`)
  - `client/src/lib/supabase/database.types.ts` — `Database` 타입(2단계 services 전용)

- [ ] **Step 1: 시드 작성** — `supabase/seed.sql`

```sql
-- 로컬 개발 전용 계정. 비밀번호: password123
-- GoTrue는 토큰 컬럼이 NULL이면 로그인 시 오류가 나므로 빈 문자열로 채운다.
do $$
declare
  v_user record;
begin
  for v_user in
    select * from (values
      ('00000000-0000-0000-0000-00000000a001'::uuid, 'admin@dongchat.local', 'admin'),
      ('00000000-0000-0000-0000-00000000b001'::uuid, 'alice@dongchat.local', 'alice'),
      ('00000000-0000-0000-0000-00000000b002'::uuid, 'bob@dongchat.local', 'bob')
    ) as t(id, email, username)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated', v_user.email,
      extensions.crypt('password123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('username', v_user.username), now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_user.id, v_user.id::text,
            jsonb_build_object('sub', v_user.id::text, 'email', v_user.email, 'email_verified', true),
            'email', now(), now(), now());
  end loop;
end $$;

insert into private.user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000a001', 'ADMIN');
```

- [ ] **Step 2: 시드 적용 + 로그인·RPC 실동작 확인**

```bash
npx -y supabase@2.120.0 db reset
npx -y supabase@2.120.0 status -o env
```
`<KEY>` = 출력의 publishable(anon) 키.
```bash
curl -s -X POST "http://127.0.0.1:54321/auth/v1/token?grant_type=password" -H "apikey: <KEY>" -H "Content-Type: application/json" -d "{\"email\":\"admin@dongchat.local\",\"password\":\"password123\"}"
```
Expected: `access_token` 포함 JSON. 그 값을 `<TOKEN>`으로:
```bash
curl -s -X POST "http://127.0.0.1:54321/rest/v1/rpc/admin_list_users" -H "apikey: <KEY>" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d "{}"
curl -s "http://127.0.0.1:54321/rest/v1/profiles?select=username" -H "apikey: <KEY>"
```
Expected: 첫 번째는 `{"items":[...3명...],"total":3,...}`. 두 번째(토큰 없음=anon)는 권한 오류(`permission denied` / 42501) 또는 빈 결과가 **아닌** 오류 응답. Data API 경로·`private` 비노출도 함께 확인:
```bash
curl -s -X POST "http://127.0.0.1:54321/rest/v1/rpc/is_active_session" -H "apikey: <KEY>" -H "Authorization: Bearer <TOKEN>" -H "Content-Type: application/json" -d "{}"
```
Expected: `PGRST202`(함수 없음) — `private` 함수는 API에서 보이지 않는다.

- [ ] **Step 3: 보안·성능 점검**

```bash
npx -y supabase@2.120.0 db advisors --local --type all --level warn
```
Expected: 0건. 경고가 나오면 해당 마이그레이션을 수정하고 `db reset` → `test db` → 재점검. 의도된 예외(`is_username_available`의 anon 실행 허용, `public` 스키마의 security definer RPC 노출)는 이 계획 하단 "검증 기록"에 사유와 함께 기록한다.

- [ ] **Step 4: 타입 생성**

```bash
npx -y supabase@2.120.0 gen types --local --lang typescript --schema public > client/src/lib/supabase/database.types.ts
```
Expected: 파일에 `export type Database =`와 `profiles`, `messages`, `create_room` 등이 포함. `private` 스키마는 포함하지 않는다.

- [ ] **Step 5: 전체 재검증**

```bash
npx -y supabase@2.120.0 db reset
npx -y supabase@2.120.0 test db
npx -y supabase@2.120.0 migration list --local
```
Expected: 테스트 전부 ok, 마이그레이션 7개가 Local 열에 표시.

- [ ] **Step 6: Commit**

```bash
git add supabase/seed.sql client/src/lib/supabase/database.types.ts supabase/migrations docs/superpowers/plans/2026-10-13-supabase-stage1-foundation.md
git commit -m "feat(db): 로컬 시드(admin/alice/bob), advisors 점검, DB 타입 생성"
```

---

## 검증 기록 (실행 중 채움)

| 항목 | 결과 | 비고 |
|---|---|---|
| `realtime.send` 인자 | `payload jsonb, event text, topic text, private boolean`, postgres EXECUTE 가능 | Task 1 Step 4 (PG 17.11) |
| `realtime.topic()` 존재 | 있음(인자 없음) | Task 1 Step 4 |
| postgres의 `auth.sessions`/`auth.users` SELECT | 둘 다 가능 | Task 1 Step 4 |
| `auth.sessions` 트리거 생성 가능 | 가능 → Task 8 Step 3b 수행 | psql begin/rollback 프로브 |
| `realtime.messages` 정책 생성 가능 | 가능 | psql begin/rollback 프로브 |
| 정책 내 헬퍼의 `authenticated` EXECUTE 필요 | GRANT 유지 상태로 전 테스트 통과(회수 실험은 안 함) | Task 2~8 |
| 실제 Auth 가입 → profiles 생성 | `Probe_1` → `probe_1` 생성 확인 | Task 2 Step 5 |
| advisors 의도된 예외 | `--level warn` 결과 0건(예외 기록 불필요) | Task 9 Step 3 |
