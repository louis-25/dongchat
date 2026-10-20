-- 단체방 입장·퇴장 안내(시스템 메시지). 보낸 사람 없음, 문장은 당시 이름으로 content에 저장.
-- 초대·강퇴·나가기 RPC가 같은 트랜잭션에서 넣는다. 사용자는 kind를 쓸 수 없다(컬럼 grant 없음).
-- 안 읽은 수·푸시에서는 빼고, 방 목록 미리보기에는 보인다. 수정·삭제는 기존 RPC의 본인 검사로 막힌다.
alter table public.messages add column kind text not null default 'user'
  constraint messages_kind check (kind in ('user', 'system'));

create or replace function private.display_name(p_user_id uuid) returns text
language sql stable security definer set search_path = ''
as $$
  select coalesce(nickname, username) from public.profiles where id = p_user_id;
$$;
revoke execute on function private.display_name(uuid) from public, anon, authenticated;

create or replace function private.add_system_message(p_room_id bigint, p_content text) returns void
language sql security definer set search_path = ''
as $$
  insert into public.messages (room_id, sender_id, content, kind) values (p_room_id, null, p_content, 'system');
$$;
revoke execute on function private.add_system_message(bigint, text) from public, anon, authenticated;

create or replace function private.message_event(p_op text, p_old public.messages, p_new public.messages)
returns table (event text, payload jsonb)
language sql immutable set search_path = ''
as $$
  select 'message',
         jsonb_build_object('id', p_new.id, 'roomId', p_new.room_id, 'senderId', p_new.sender_id,
                            'content', p_new.content, 'replyToId', p_new.reply_to_id, 'createdAt', p_new.created_at,
                            'sticker', p_new.sticker, 'imagePath', p_new.image_path, 'kind', p_new.kind)
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

create or replace function public.invite_to_room(p_room_id bigint, p_usernames text[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_names text[];
  v_ids uuid[];
  v_added text[];
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

  with added as (
    insert into public.chat_room_participants (room_id, user_id)
    select p_room_id, uid from unnest(v_ids) as uid
    on conflict do nothing
    returning user_id
  )
  select array_agg(private.display_name(user_id) order by private.display_name(user_id)) into v_added from added;
  if v_added is not null then
    perform private.add_system_message(p_room_id,
      private.display_name(auth.uid()) || '님이 ' || array_to_string(v_added, ', ') || '님을 초대했어요');
  end if;
end;
$$;

-- 나가는 사람이 아직 멤버일 때 넣어야 남은 사람들의 방 채널로 전달된다(송출은 트리거, 수신자는 그대로).
create or replace function public.leave_room(p_room_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_active_session();
  if not private.is_room_member(p_room_id) then
    raise exception 'CHAT_FORBIDDEN' using hint = '참여 중인 방이 아닙니다.';
  end if;
  if (select is_group from public.chat_rooms where id = p_room_id) then
    perform private.add_system_message(p_room_id, private.display_name(auth.uid()) || '님이 나갔어요');
  end if;
  delete from public.chat_room_participants where room_id = p_room_id and user_id = auth.uid();
end;
$$;

create or replace function public.kick_member(p_room_id bigint, p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.chat_rooms;
begin
  perform private.require_active_session();
  select * into v_room from public.chat_rooms where id = p_room_id;
  if not found then
    raise exception 'CHAT_ROOM_NOT_FOUND' using hint = '방을 찾을 수 없습니다.';
  end if;
  if p_user_id = auth.uid()
     or not v_room.is_group
     or not (coalesce(v_room.created_by = auth.uid(), false) or private.is_admin()) then
    raise exception 'ROOM_KICK_FORBIDDEN' using hint = '강퇴할 권한이 없습니다.';
  end if;
  delete from public.chat_room_participants where room_id = p_room_id and user_id = p_user_id;
  if not found then
    raise exception 'CHAT_FORBIDDEN' using hint = '방 참여자가 아닙니다.';
  end if;
  perform private.add_system_message(p_room_id,
    private.display_name(auth.uid()) || '님이 ' || private.display_name(p_user_id) || '님을 내보냈어요');
end;
$$;

create or replace function public.list_my_rooms()
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
             and m.kind = 'user'
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

create or replace function public.push_targets(p_message_id bigint)
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
    and m.kind = 'user'
    and m.deleted_at is null
    and coalesce(a.banned_until, '-infinity'::timestamptz) <= now()
    and coalesce(u.banned_until, '-infinity'::timestamptz) <= now();
$$;
