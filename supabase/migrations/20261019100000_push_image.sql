-- 사진 메시지 푸시에 사진을 붙인다: 경로를 돌려주면 send-push가 서명 URL을 만든다. 반환 열이 바뀌어 drop 후 재생성.
drop function public.push_targets(bigint);
create function public.push_targets(p_message_id bigint)
returns table (endpoint text, p256dh text, auth text, title text, body text, room_id bigint, sticker text, image_path text)
language sql stable security definer set search_path = ''
as $$
  select s.endpoint, s.p256dh, s.auth,
         coalesce(r.name, sp.nickname, sp.username, '새 메시지') as title,
         m.content as body,
         m.room_id,
         m.sticker,
         m.image_path
  from public.messages m
  join public.chat_rooms r on r.id = m.room_id
  left join public.profiles sp on sp.id = m.sender_id
  join public.chat_room_participants p on p.room_id = m.room_id and p.user_id is distinct from m.sender_id and not p.muted
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
