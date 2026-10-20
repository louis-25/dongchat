-- 사진 여러 장을 메시지 하나로(최대 10장). image_paths에 전부, image_path는 첫 장(푸시·공지·검색·예전 앱 호환).
-- 예전 앱이 image_path만 넣는 경우를 위해 image_paths는 비어 있을 수 있다(화면은 image_path 한 장으로 본다).
alter table public.messages add column image_paths text[];

create or replace function private.valid_image_paths(p_paths text[], p_room_id bigint) returns boolean
language sql immutable set search_path = ''
as $$
  select cardinality(p_paths) between 1 and 10
     and not exists (
       select 1 from unnest(p_paths) as p
       where p is null or p !~ '^[0-9]{1,18}/[0-9a-f-]{36}\.jpg$' or split_part(p, '/', 1) <> p_room_id::text
     );
$$;
revoke execute on function private.valid_image_paths(text[], bigint) from public, anon;
grant execute on function private.valid_image_paths(text[], bigint) to authenticated;

update public.messages set image_paths = array[image_path] where image_path is not null;

alter table public.messages add constraint messages_image_paths check (
  image_paths is null or (private.valid_image_paths(image_paths, room_id) and image_path = image_paths[1]));
grant insert (image_paths) on table public.messages to authenticated;

create or replace function private.message_event(p_op text, p_old public.messages, p_new public.messages)
returns table (event text, payload jsonb)
language sql immutable set search_path = ''
as $$
  select 'message',
         jsonb_build_object('id', p_new.id, 'roomId', p_new.room_id, 'senderId', p_new.sender_id,
                            'content', p_new.content, 'replyToId', p_new.reply_to_id, 'createdAt', p_new.created_at,
                            'sticker', p_new.sticker, 'imagePath', p_new.image_path, 'kind', p_new.kind,
                            'imagePaths', to_jsonb(p_new.image_paths))
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
