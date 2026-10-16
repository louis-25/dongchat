-- 방별 알림 끄기. 본인 설정만, 다른 멤버에게는 보이지 않는다(list_my_rooms로 내 값만 내려준다).
alter table public.chat_room_participants add column muted boolean not null default false;

create or replace function public.set_room_muted(p_room_id bigint, p_muted boolean) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_active_session();
  update public.chat_room_participants set muted = coalesce(p_muted, false)
  where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'CHAT_FORBIDDEN' using hint = '참여 중인 방이 아닙니다.';
  end if;
end;
$$;
revoke execute on function public.set_room_muted(bigint, boolean) from public, anon;
grant execute on function public.set_room_muted(bigint, boolean) to authenticated;

-- 알림 끈 참여자는 푸시 대상에서 제외
create or replace function public.push_targets(p_message_id bigint)
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
  join public.chat_room_participants p on p.room_id = m.room_id and p.user_id is distinct from m.sender_id and not p.muted
  join public.push_subscriptions s on s.user_id = p.user_id
  join auth.users u on u.id = p.user_id
  left join private.user_access a on a.user_id = p.user_id
  where m.id = p_message_id
    and m.deleted_at is null
    and coalesce(a.banned_until, '-infinity'::timestamptz) <= now()
    and coalesce(u.banned_until, '-infinity'::timestamptz) <= now();
$$;

drop function public.list_my_rooms();
create function public.list_my_rooms()
returns table (
  room_id bigint, name text, is_group boolean, created_at timestamptz, member_count int,
  last_message_id bigint, last_message_content text, last_message_deleted boolean,
  last_message_sender_id uuid, last_message_at timestamptz, unread_count int, last_message_sticker text,
  muted boolean
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
         case when lm.deleted_at is null then lm.sticker end,
         me.muted
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
