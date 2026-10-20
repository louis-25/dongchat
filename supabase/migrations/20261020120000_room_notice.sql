-- 방 공지: 방마다 글 메시지 하나를 상단에 건다. 참여자 누구나 등록·내리기(카톡과 같음).
-- 등록·내리기는 입장·퇴장과 같은 시스템 메시지로 남기고, 방 채널로 notice_updated를 보낸다.
-- 공지 메시지를 지우면 공지도 내려간다(delete_message).
alter table public.chat_rooms add column notice_message_id bigint references public.messages (id) on delete set null;
create index chat_rooms_notice_message_id_idx on public.chat_rooms (notice_message_id);

create or replace function public.set_room_notice(p_room_id bigint, p_message_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_msg public.messages;
begin
  perform private.require_active_session();
  if not private.is_room_member(p_room_id) then
    raise exception 'CHAT_FORBIDDEN' using hint = '참여 중인 방이 아닙니다.';
  end if;
  if p_message_id is not null then
    select * into v_msg from public.messages where id = p_message_id;
    if not found or v_msg.room_id <> p_room_id or v_msg.deleted_at is not null then
      raise exception 'MESSAGE_NOT_FOUND' using hint = '메시지를 찾을 수 없습니다.';
    end if;
    if v_msg.kind <> 'user' or v_msg.sticker is not null or v_msg.image_path is not null then
      raise exception 'VALIDATION_FAILED' using hint = '글 메시지만 공지로 등록할 수 있어요.';
    end if;
  end if;

  update public.chat_rooms set notice_message_id = p_message_id where id = p_room_id;
  perform private.add_system_message(p_room_id,
    private.display_name(auth.uid()) || case when p_message_id is null then '님이 공지를 내렸어요' else '님이 공지를 등록했어요' end);
  perform private.broadcast('room:' || p_room_id, 'notice_updated',
    jsonb_build_object('roomId', p_room_id, 'messageId', p_message_id));
end;
$$;
revoke execute on function public.set_room_notice(bigint, bigint) from public, anon;
grant execute on function public.set_room_notice(bigint, bigint) to authenticated;

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
  -- 화면은 message_deleted 때 공지를 다시 받는다
  update public.chat_rooms set notice_message_id = null where id = v_msg.room_id and notice_message_id = p_id;
end;
$$;
