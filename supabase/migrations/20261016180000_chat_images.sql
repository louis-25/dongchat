-- 사진 메시지. 비공개 버킷 chat-images, 경로 `<room_id>/<uuid>.jpg`.
-- 읽기·올리기는 그 방 멤버(읽기는 관리자 열람 포함), 지우기는 올린 사람. 화면은 서명 URL로 읽는다.
-- content에는 '(사진)'을 넣어 푸시 알림·방 목록·답장 미리보기가 그대로 동작하게 한다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5 * 1024 * 1024, array['image/jpeg'])
on conflict (id) do nothing;

-- 경로 첫 폴더 → 방 id(형식이 아니면 null → 정책 거부)
create or replace function private.image_room_id(p_name text) returns bigint
language sql immutable set search_path = ''
as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9]{1,18}$' then split_part(p_name, '/', 1)::bigint end;
$$;
revoke execute on function private.image_room_id(text) from public, anon;
grant execute on function private.image_room_id(text) to authenticated;

create policy chat_images_select on storage.objects for select to authenticated
  using (bucket_id = 'chat-images'
         and ((select private.is_room_member(private.image_room_id(name))) or (select private.is_admin())));
create policy chat_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-images' and (select private.is_room_member(private.image_room_id(name))));
create policy chat_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'chat-images' and owner_id = (select auth.uid())::text);

alter table public.messages add column image_path text
  constraint messages_image_path check (
    image_path ~ '^[0-9]{1,18}/[0-9a-f-]{36}\.jpg$' and split_part(image_path, '/', 1) = room_id::text);
grant insert (image_path) on table public.messages to authenticated;

create or replace function private.message_event(p_op text, p_old public.messages, p_new public.messages)
returns table (event text, payload jsonb)
language sql immutable set search_path = ''
as $$
  select 'message',
         jsonb_build_object('id', p_new.id, 'roomId', p_new.room_id, 'senderId', p_new.sender_id,
                            'content', p_new.content, 'replyToId', p_new.reply_to_id, 'createdAt', p_new.created_at,
                            'sticker', p_new.sticker, 'imagePath', p_new.image_path)
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
  if v_msg.sticker is not null or v_msg.image_path is not null then
    raise exception 'VALIDATION_FAILED' using hint = '이모티콘·사진은 수정할 수 없어요.';
  end if;
  update public.messages set content = v_content, edited_at = now() where id = p_id;
end;
$$;
