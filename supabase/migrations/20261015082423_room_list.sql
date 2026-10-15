-- 채팅 목록 요약과 1:1 방 열기(모바일 UI 개편 스펙 §5).

-- 내가 참여한 방의 요약: 마지막 메시지(삭제 포함)·안 읽은 수(남이 보낸, 삭제 안 된, 내 읽음 위치 이후)·인원 수.
create or replace function public.list_my_rooms()
returns table (
  room_id bigint, name text, is_group boolean, created_at timestamptz, member_count int,
  last_message_id bigint, last_message_content text, last_message_deleted boolean,
  last_message_sender_id uuid, last_message_at timestamptz, unread_count int
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_active_session();
  return query
  select r.id, r.name, r.is_group, r.created_at,
         (select count(*)::int from public.chat_room_participants c where c.room_id = r.id),
         lm.id,
         case when lm.deleted_at is null then lm.content end,
         lm.id is not null and lm.deleted_at is not null,
         lm.sender_id, lm.created_at,
         (select count(*)::int from public.messages m
           where m.room_id = r.id
             and m.id > coalesce(me.last_read_message_id, 0)
             and m.sender_id is distinct from auth.uid()
             and m.deleted_at is null)
  from public.chat_room_participants me
  join public.chat_rooms r on r.id = me.room_id
  left join lateral (
    select m.id, m.content, m.deleted_at, m.sender_id, m.created_at
    from public.messages m where m.room_id = r.id
    order by m.id desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(lm.created_at, r.created_at) desc, r.id desc;
end;
$$;
revoke execute on function public.list_my_rooms() from public, anon;
grant execute on function public.list_my_rooms() to authenticated;

-- 친구와의 1:1 방을 연다: 두 사람이 모두 남아 있는 1:1 방이 있으면 그 방, 없으면 새로 만든다.
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
  from public.profiles p where p.username = lower(trim(coalesce(p_username, '')));
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
