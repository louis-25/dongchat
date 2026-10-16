-- 이모티콘을 푸시 알림·채팅 목록 미리보기에서 그림으로 보이도록 sticker id를 함께 돌려준다.
-- 반환 열이 바뀌므로 drop 후 재생성(열을 뒤에 추가 → 예전 클라·Edge Function은 무시).
drop function public.push_targets(bigint);
create function public.push_targets(p_message_id bigint)
returns table (endpoint text, p256dh text, auth text, title text, body text, room_id bigint, sticker text)
language sql stable security definer set search_path = ''
as $$
  select s.endpoint, s.p256dh, s.auth,
         coalesce(r.name, sp.nickname, sp.username, '새 메시지') as title,
         m.content as body,
         m.room_id,
         m.sticker
  from public.messages m
  join public.chat_rooms r on r.id = m.room_id
  left join public.profiles sp on sp.id = m.sender_id
  join public.chat_room_participants p on p.room_id = m.room_id and p.user_id is distinct from m.sender_id
  join public.push_subscriptions s on s.user_id = p.user_id
  join auth.users u on u.id = p.user_id
  left join private.user_access a on a.user_id = p.user_id
  where m.id = p_message_id
    and m.deleted_at is null
    and coalesce(a.banned_until, '-infinity'::timestamptz) <= now()
    and coalesce(u.banned_until, '-infinity'::timestamptz) <= now();
$$;
revoke execute on function public.push_targets(bigint) from public, anon, authenticated;
grant execute on function public.push_targets(bigint) to service_role;

drop function public.list_my_rooms();
create function public.list_my_rooms()
returns table (
  room_id bigint, name text, is_group boolean, created_at timestamptz, member_count int,
  last_message_id bigint, last_message_content text, last_message_deleted boolean,
  last_message_sender_id uuid, last_message_at timestamptz, unread_count int, last_message_sticker text
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
             and m.deleted_at is null),
         case when lm.deleted_at is null then lm.sticker end
  from public.chat_room_participants me
  join public.chat_rooms r on r.id = me.room_id
  left join lateral (
    select m.id, m.content, m.deleted_at, m.sender_id, m.created_at, m.sticker
    from public.messages m where m.room_id = r.id
    order by m.id desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(lm.created_at, r.created_at) desc, r.id desc;
end;
$$;
revoke execute on function public.list_my_rooms() from public, anon;
grant execute on function public.list_my_rooms() to authenticated;
