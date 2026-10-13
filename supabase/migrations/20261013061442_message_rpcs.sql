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
