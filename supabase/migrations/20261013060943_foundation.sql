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
