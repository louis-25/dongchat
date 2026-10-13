-- ============ 수신 권한 ============
-- 정규식으로 형식을 먼저 걸러 캐스트 오류를 막는다(room id 최대 18자리 → bigint 안전).
create or replace function private.can_receive_topic(p_topic text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    case
      when p_topic ~ '^room:[0-9]{1,18}$' then
        private.is_room_member(split_part(p_topic, ':', 2)::bigint) or private.is_admin()
      when p_topic ~ '^user:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        private.is_active_session() and split_part(p_topic, ':', 2) = auth.uid()::text
      else false
    end,
    false);
$$;
revoke execute on function private.can_receive_topic(text) from public, anon;
grant execute on function private.can_receive_topic(text) to authenticated;

-- realtime 스키마에는 정책만 추가한다(ALTER/ENABLE RLS 금지). 클라 송신(INSERT) 정책은 만들지 않는다.
create policy dongchat_receive_broadcasts on realtime.messages for select to authenticated
  using (
    realtime.messages.extension = 'broadcast'
    and (select private.can_receive_topic((select realtime.topic())))
  );

-- ============ 송출 ============
-- 송출 실패(예: 일별 파티션 미생성)가 원 트랜잭션을 깨지 않도록 예외를 삼킨다.
create or replace function private.broadcast(p_topic text, p_event text, p_payload jsonb) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform realtime.send(p_payload, p_event, p_topic, true);
exception when others then
  raise warning 'realtime.send failed (topic=%, event=%): %', p_topic, p_event, sqlerrm;
end;
$$;
revoke execute on function private.broadcast(text, text, jsonb) from public, anon, authenticated;

create or replace function private.message_event(p_op text, p_old public.messages, p_new public.messages)
returns table (event text, payload jsonb)
language sql immutable set search_path = ''
as $$
  select 'message',
         jsonb_build_object('id', p_new.id, 'roomId', p_new.room_id, 'senderId', p_new.sender_id,
                            'content', p_new.content, 'replyToId', p_new.reply_to_id, 'createdAt', p_new.created_at)
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
revoke execute on function private.message_event(text, public.messages, public.messages) from public, anon, authenticated;

create or replace function private.messages_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v record;
begin
  for v in select * from private.message_event(tg_op, case when tg_op = 'UPDATE' then old end, new) loop
    perform private.broadcast('room:' || new.room_id, v.event, v.payload);
  end loop;
  return null;
end;
$$;
create trigger messages_broadcast after insert or update on public.messages
  for each row execute function private.messages_broadcast();

create or replace function private.participants_read_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.last_read_message_id is distinct from old.last_read_message_id then
    perform private.broadcast('room:' || new.room_id, 'read_update',
      jsonb_build_object('roomId', new.room_id, 'userId', new.user_id, 'lastReadMessageId', new.last_read_message_id));
  end if;
  return null;
end;
$$;
create trigger participants_read_broadcast after update of last_read_message_id on public.chat_room_participants
  for each row execute function private.participants_read_broadcast();

create or replace function private.participants_removed_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_payload jsonb := jsonb_build_object('roomId', old.room_id, 'userId', old.user_id);
begin
  perform private.broadcast('room:' || old.room_id, 'member_removed', v_payload);
  perform private.broadcast('user:' || old.user_id, 'member_removed', v_payload);
  return null;
end;
$$;
create trigger participants_removed_broadcast after delete on public.chat_room_participants
  for each row execute function private.participants_removed_broadcast();

create or replace function private.user_access_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.banned_until is not null and new.banned_until > now()
     and (tg_op = 'INSERT' or old.banned_until is distinct from new.banned_until) then
    perform private.broadcast('user:' || new.user_id, 'force_logout', jsonb_build_object('reason', 'banned'));
  elsif new.sessions_revoked_at is not null
     and (tg_op = 'INSERT' or old.sessions_revoked_at is distinct from new.sessions_revoked_at) then
    perform private.broadcast('user:' || new.user_id, 'force_logout', jsonb_build_object('reason', 'revoked'));
  end if;
  return null;
end;
$$;
create trigger user_access_broadcast after insert or update on private.user_access
  for each row execute function private.user_access_broadcast();

revoke execute on function private.messages_broadcast(), private.participants_read_broadcast(),
  private.participants_removed_broadcast(), private.user_access_broadcast() from public, anon, authenticated;

-- ============ 세션 삭제 통지 (Studio 세션 삭제·로그아웃) ============
create or replace function private.session_deleted_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.broadcast('user:' || old.user_id, 'force_logout',
    jsonb_build_object('reason', 'session_deleted', 'sessionId', old.id));
  return null;
end;
$$;
revoke execute on function private.session_deleted_broadcast() from public, anon, authenticated;
create trigger on_auth_session_deleted after delete on auth.sessions
  for each row execute function private.session_deleted_broadcast();
