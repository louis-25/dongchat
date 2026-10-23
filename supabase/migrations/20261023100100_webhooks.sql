-- 수신 웹훅(스펙 2026-10-23-webhooks-design.md §2~4).
-- 관리 함수는 대시보드 SQL Editor 전용(JWT 없음 → auth.uid() null이라 로그인 전제 RPC는 쓰지 않고 직접 넣는다).
-- 메시지 저장은 Edge Function(service_role)만.
create table private.webhooks (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.chat_rooms (id) on delete cascade,
  bot_id uuid not null unique references public.profiles (id) on delete cascade,
  name text not null,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index webhooks_room_id_idx on private.webhooks (room_id);
revoke all on table private.webhooks from public, anon, authenticated;

create or replace function private.new_webhook_token() returns text
language sql volatile set search_path = ''
as $$ select 'dch_' || encode(extensions.gen_random_bytes(32), 'hex') $$;

create or replace function private.hash_webhook_token(p_token text) returns text
language sql immutable set search_path = ''
as $$ select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') $$;

create or replace function private.webhook_name(p_name text) returns text
language plpgsql immutable set search_path = ''
as $$
declare
  v_name text := btrim(coalesce(p_name, ''));
begin
  if char_length(v_name) not between 1 and 20 then
    raise exception 'VALIDATION_FAILED' using hint = '웹훅 이름은 1~20자여야 합니다.';
  end if;
  return v_name;
end;
$$;

-- 로그인할 수 없는 봇 계정(이메일·비밀번호·세션 없음). 프로필은 handle_new_user 트리거가 만든다.
-- 토큰 칼럼들은 ''로 채운다: GoTrue는 이 칼럼이 NULL이면 사용자 목록 전체를 500으로 실패한다(대시보드 Users 화면).
create or replace function private.create_bot(p_name text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := gen_random_uuid();
begin
  insert into auth.users (instance_id, id, aud, role, confirmation_token, recovery_token, email_change_token_new, email_change,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated', '', '', '', '',
          jsonb_build_object('provider', 'webhook', 'providers', jsonb_build_array('webhook')),
          jsonb_build_object('username', 'bot_' || substr(replace(v_id::text, '-', ''), 1, 16), 'nickname', p_name),
          now(), now());
  update public.profiles set is_bot = true where id = v_id;
  return v_id;
end;
$$;

create or replace function private.attach_webhook(p_room_id bigint, p_name text) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_bot uuid := private.create_bot(p_name);
  v_token text := private.new_webhook_token();
begin
  insert into public.chat_room_participants (room_id, user_id) values (p_room_id, v_bot);
  perform private.add_system_message(p_room_id, p_name || '님이 들어왔어요');
  insert into private.webhooks (room_id, bot_id, name, token_hash)
  values (p_room_id, v_bot, p_name, private.hash_webhook_token(v_token));
  return v_token;
end;
$$;

-- 기존 그룹 방에 봇을 넣는다. 토큰은 이때 한 번만 보인다.
create or replace function public.create_webhook(p_name text, p_room_id bigint) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := private.webhook_name(p_name);
begin
  if not coalesce((select is_group from public.chat_rooms where id = p_room_id for update), false) then
    raise exception 'VALIDATION_FAILED' using hint = '그룹 채팅방에만 웹훅을 만들 수 있습니다.';
  end if;
  return private.attach_webhook(p_room_id, v_name);
end;
$$;

-- 새 그룹 방(이름 = 웹훅 이름, 방장 = 첫 사용자)을 만들고 사용자들과 봇을 넣는다.
create or replace function public.create_webhook(p_name text, p_usernames text[]) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_name text := private.webhook_name(p_name);
  v_names text[];
  v_ids uuid[];
  v_room bigint;
begin
  select coalesce(array_agg(n order by ord), '{}') into v_names
  from (
    select lower(btrim(u)) as n, min(ord) as ord
    from unnest(coalesce(p_usernames, '{}'::text[])) with ordinality as t(u, ord)
    where btrim(coalesce(u, '')) <> ''
    group by lower(btrim(u))
  ) s;
  select coalesce(array_agg(p.id order by array_position(v_names, p.username)), '{}') into v_ids
  from public.profiles p where p.username = any(v_names) and not p.is_bot;
  if cardinality(v_names) = 0 or cardinality(v_ids) <> cardinality(v_names) then
    raise exception 'VALIDATION_FAILED' using hint = '존재하지 않는 사용자가 포함되어 있습니다.';
  end if;

  insert into public.chat_rooms (name, is_group, created_by) values (v_name, true, v_ids[1]) returning id into v_room;
  insert into public.chat_room_participants (room_id, user_id) select v_room, uid from unnest(v_ids) as uid;
  return private.attach_webhook(v_room, v_name);
end;
$$;

-- 토큰만 새로 발급(봇·이전 메시지 유지)
create or replace function public.rotate_webhook(p_id bigint) returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_token text := private.new_webhook_token();
begin
  update private.webhooks set token_hash = private.hash_webhook_token(v_token) where id = p_id;
  if not found then
    raise exception 'VALIDATION_FAILED' using hint = '웹훅을 찾을 수 없습니다.';
  end if;
  return v_token;
end;
$$;

-- 봇을 방에서 빼고 웹훅을 지운다. 봇 프로필은 남긴다(이전 메시지의 보낸 사람 이름 유지).
create or replace function public.delete_webhook(p_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_hook private.webhooks;
begin
  select * into v_hook from private.webhooks where id = p_id for update;
  if not found then
    raise exception 'VALIDATION_FAILED' using hint = '웹훅을 찾을 수 없습니다.';
  end if;
  -- 이미 강퇴됐으면 안내를 다시 남기지 않는다. 안내는 봇이 아직 멤버일 때 넣어야 방 채널로 전달된다.
  if exists (select 1 from public.chat_room_participants where room_id = v_hook.room_id and user_id = v_hook.bot_id) then
    perform private.add_system_message(v_hook.room_id, v_hook.name || '님이 나갔어요');
    delete from public.chat_room_participants where room_id = v_hook.room_id and user_id = v_hook.bot_id;
  end if;
  delete from private.webhooks where id = p_id;  -- 봇만 남았던 방이면 위 삭제로 이미 cascade
end;
$$;

-- Edge Function이 2,000자 이하로 나눈 조각을 봇 이름으로 저장한다. 실시간·푸시는 기존 메시지 트리거.
create or replace function public.webhook_post(p_token text, p_parts text[]) returns int
language plpgsql security definer set search_path = ''
as $$
declare
  v_hook private.webhooks;
  v_part text;
begin
  select * into v_hook from private.webhooks where token_hash = private.hash_webhook_token(p_token) for update;
  if not found or not exists (
    select 1 from public.chat_room_participants where room_id = v_hook.room_id and user_id = v_hook.bot_id
  ) then
    raise exception 'WEBHOOK_INVALID' using hint = '웹훅 토큰이 올바르지 않습니다.';
  end if;
  if coalesce(cardinality(p_parts), 0) not between 1 and 10
     or exists (select 1 from unnest(p_parts) as u where char_length(coalesce(u, '')) not between 1 and 2000) then
    raise exception 'VALIDATION_FAILED' using hint = '메시지는 1~2,000자 조각 1~10개여야 합니다.';
  end if;

  foreach v_part in array p_parts loop
    insert into public.messages (room_id, sender_id, content) values (v_hook.room_id, v_hook.bot_id, v_part);
  end loop;
  update private.webhooks set last_used_at = now() where id = v_hook.id;
  return cardinality(p_parts);
end;
$$;

revoke execute on function private.new_webhook_token(), private.hash_webhook_token(text), private.webhook_name(text),
  private.create_bot(text), private.attach_webhook(bigint, text) from public, anon, authenticated, service_role;
revoke execute on function public.create_webhook(text, bigint), public.create_webhook(text, text[]),
  public.rotate_webhook(bigint), public.delete_webhook(bigint) from public, anon, authenticated, service_role;
revoke execute on function public.webhook_post(text, text[]) from public, anon, authenticated;
grant execute on function public.webhook_post(text, text[]) to service_role;
