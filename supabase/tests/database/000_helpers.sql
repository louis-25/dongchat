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
