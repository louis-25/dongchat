-- 이모티콘 메시지. sticker = 이미지 id(그림은 클라 public/stickers/<id>.svg).
-- content에는 '(이모티콘)'을 넣어 푸시 알림·방 목록·답장 미리보기가 그대로 동작하게 한다.
alter table public.messages add column sticker text
  constraint messages_sticker_id check (sticker ~ '^[a-z0-9_]{1,32}$');
grant insert (sticker) on table public.messages to authenticated;

create or replace function private.message_event(p_op text, p_old public.messages, p_new public.messages)
returns table (event text, payload jsonb)
language sql immutable set search_path = ''
as $$
  select 'message',
         jsonb_build_object('id', p_new.id, 'roomId', p_new.room_id, 'senderId', p_new.sender_id,
                            'content', p_new.content, 'replyToId', p_new.reply_to_id, 'createdAt', p_new.created_at,
                            'sticker', p_new.sticker)
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
  if v_msg.sticker is not null then
    raise exception 'VALIDATION_FAILED' using hint = '이모티콘은 수정할 수 없어요.';
  end if;
  update public.messages set content = v_content, edited_at = now() where id = p_id;
end;
$$;
