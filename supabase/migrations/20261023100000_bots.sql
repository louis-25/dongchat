-- 웹훅 봇(스펙 2026-10-23-webhooks-design.md §2). 로그인할 수 없는 계정이라 사람 전용 경로에서는 없는 사용자로 취급한다.
-- 웹훅을 지워도 봇 프로필은 남으므로(이전 메시지의 보낸 사람 유지) 웹훅 테이블이 아닌 이 칼럼으로 판단한다.
alter table public.profiles add column is_bot boolean not null default false;  -- 사용자 update grant 없음(nickname, avatar_url만)

create or replace function public.send_friend_request(p_username text) returns public.friends
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_row public.friends;
begin
  perform private.require_active_session();
  select id into v_target from public.profiles where username = lower(trim(coalesce(p_username, ''))) and not is_bot;
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
revoke execute on function public.send_friend_request(text) from public, anon;
grant execute on function public.send_friend_request(text) to authenticated;

create or replace function public.open_direct_room(p_username text) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_other_name text;
  v_room bigint;
begin
  perform private.require_active_session();

  select p.id, p.username into v_other, v_other_name
  from public.profiles p where p.username = lower(trim(coalesce(p_username, ''))) and not p.is_bot;
  if v_other is null then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '존재하지 않는 사용자입니다.';
  end if;
  if v_other = v_me then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '자기 자신과는 대화할 수 없습니다.';
  end if;

  -- 두 사람이 동시에 눌러도 방이 하나만 생기도록 쌍 단위로 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended(
    'dm:' || least(v_me::text, v_other::text) || ':' || greatest(v_me::text, v_other::text), 0));

  select r.id into v_room
  from public.chat_rooms r
  where not r.is_group
    and exists (select 1 from public.chat_room_participants a where a.room_id = r.id and a.user_id = v_me)
    and exists (select 1 from public.chat_room_participants b where b.room_id = r.id and b.user_id = v_other)
  order by r.id desc limit 1;
  if v_room is not null then
    return v_room;
  end if;

  return public.create_room(null, false, array[v_other_name]);
end;
$$;
revoke execute on function public.open_direct_room(text) from public, anon;
grant execute on function public.open_direct_room(text) to authenticated;

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
  where p.username = any(v_names) and not p.is_bot;

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
revoke execute on function public.create_room(text, boolean, text[]) from public, anon;
grant execute on function public.create_room(text, boolean, text[]) to authenticated;

create or replace function public.invite_to_room(p_room_id bigint, p_usernames text[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_names text[];
  v_ids uuid[];
  v_added text[];
begin
  perform private.require_active_session();
  if not private.is_room_member(p_room_id) then
    raise exception 'CHAT_FORBIDDEN' using hint = '참여 중인 방이 아닙니다.';
  end if;
  if not (select is_group from public.chat_rooms where id = p_room_id) then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '1:1 채팅방에는 초대할 수 없어요.';
  end if;

  select coalesce(array_agg(distinct lower(trim(u))), '{}')
  into v_names
  from unnest(coalesce(p_usernames, '{}'::text[])) as u
  where trim(u) <> '';
  select coalesce(array_agg(p.id), '{}') into v_ids from public.profiles p where p.username = any(v_names) and not p.is_bot;
  if cardinality(v_names) = 0 or cardinality(v_ids) <> cardinality(v_names) then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '존재하지 않는 사용자가 포함되어 있습니다.';
  end if;

  with added as (
    insert into public.chat_room_participants (room_id, user_id)
    select p_room_id, uid from unnest(v_ids) as uid
    on conflict do nothing
    returning user_id
  )
  select array_agg(private.display_name(user_id) order by private.display_name(user_id)) into v_added from added;
  if v_added is not null then
    perform private.add_system_message(p_room_id,
      private.display_name(auth.uid()) || '님이 ' || array_to_string(v_added, ', ') || '님을 초대했어요');
  end if;
end;
$$;
revoke execute on function public.invite_to_room(bigint, text[]) from public, anon;
grant execute on function public.invite_to_room(bigint, text[]) to authenticated;

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
  select count(*) into v_total from public.profiles where not is_bot;
  execute format($q$
    select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select p.id, p.username, p.nickname, u.email,
             p.created_at as "createdAt",
             exists (select 1 from private.user_roles r where r.user_id = p.id) as "isAdmin",
             greatest(a.banned_until, u.banned_until) as "bannedUntil"
      from public.profiles p
      join auth.users u on u.id = p.id
      left join private.user_access a on a.user_id = p.id
      where not p.is_bot
      order by p.%I %s, p.id
      limit %s offset %s
    ) t $q$, v_sort, v_order, v_limit, (v_page - 1) * v_limit)
  into v_items;
  return jsonb_build_object('items', v_items, 'total', v_total, 'page', v_page, 'limit', v_limit);
end;
$$;

-- 다음 방장은 사람 중에서. 사람이 없으면(봇만 남아도) 방을 지운다(웹훅도 cascade).
create or replace function private.participants_after_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_next uuid;
begin
  -- 방 행을 잠가 동시 퇴장을 직렬화한다(둘 다 서로를 남은 멤버로 보고 빈 방이 남는 것 방지).
  perform 1 from public.chat_rooms where id = old.room_id for update;

  select p.user_id into v_next
  from public.chat_room_participants p
  join public.profiles pr on pr.id = p.user_id
  where p.room_id = old.room_id and not pr.is_bot
  order by p.joined_at, p.user_id
  limit 1;

  if v_next is null then
    delete from public.chat_rooms where id = old.room_id;
  else
    update public.chat_rooms set created_by = v_next
    -- created_by가 NULL인 경우: 방장 계정 삭제 시 FK(on delete set null)가 이 트리거보다 먼저 적용된다.
    -- 봇이 방장인 경우(이전 버전에서 넘어감)도 사람에게 돌려준다.
    where id = old.room_id
      and (created_by is null or created_by = old.user_id
           or exists (select 1 from public.profiles b where b.id = created_by and b.is_bot));
  end if;
  return null;
end;
$$;
revoke execute on function private.participants_after_delete() from public, anon, authenticated;
