-- ============ 기존 RPC: 투표 메시지는 수정·공지 불가, 실시간 payload에 pollId ============
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
  if v_msg.sticker is not null or v_msg.image_path is not null or v_msg.poll_id is not null then
    raise exception 'VALIDATION_FAILED' using hint = '이모티콘·사진·투표는 수정할 수 없어요.';
  end if;
  update public.messages set content = v_content, edited_at = now() where id = p_id;
end;
$$;

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
    if v_msg.kind <> 'user' or v_msg.sticker is not null or v_msg.image_path is not null or v_msg.poll_id is not null then
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

create or replace function private.message_event(p_op text, p_old public.messages, p_new public.messages)
returns table (event text, payload jsonb)
language sql immutable set search_path = ''
as $$
  select 'message',
         jsonb_build_object('id', p_new.id, 'roomId', p_new.room_id, 'senderId', p_new.sender_id,
                            'content', p_new.content, 'replyToId', p_new.reply_to_id, 'createdAt', p_new.created_at,
                            'sticker', p_new.sticker, 'imagePath', p_new.image_path, 'kind', p_new.kind,
                            'imagePaths', to_jsonb(p_new.image_paths), 'pollId', p_new.poll_id)
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
