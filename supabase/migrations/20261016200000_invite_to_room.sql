-- 기존 단체방에 초대. 멤버 누구나, 단체방만, 아이디로(create_room과 같은 규칙). 이미 있는 사람은 건너뛴다.
-- 새 멤버는 예전 대화도 본다(메시지 RLS = 방 멤버).
create or replace function public.invite_to_room(p_room_id bigint, p_usernames text[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_names text[];
  v_ids uuid[];
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
  select coalesce(array_agg(p.id), '{}') into v_ids from public.profiles p where p.username = any(v_names);
  if cardinality(v_names) = 0 or cardinality(v_ids) <> cardinality(v_names) then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '존재하지 않는 사용자가 포함되어 있습니다.';
  end if;

  insert into public.chat_room_participants (room_id, user_id)
  select p_room_id, uid from unnest(v_ids) as uid
  on conflict do nothing;
end;
$$;
revoke execute on function public.invite_to_room(bigint, text[]) from public, anon;
grant execute on function public.invite_to_room(bigint, text[]) to authenticated;

-- 추가된 사람(목록에 새 방) + 방 채널(기존 멤버의 인원·참여자 갱신)
create or replace function private.participants_added_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_payload jsonb := jsonb_build_object('roomId', new.room_id, 'userId', new.user_id);
begin
  perform private.broadcast('user:' || new.user_id, 'member_added', v_payload);
  perform private.broadcast('room:' || new.room_id, 'member_added', v_payload);
  return null;
end;
$$;
