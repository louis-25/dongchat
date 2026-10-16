-- 상태 메시지(친구 목록에서 이름 아래 표시). 본인만 수정, 60자까지.
alter table public.profiles add column status_message text
  constraint profiles_status_message_len check (char_length(status_message) <= 60);
grant update (status_message) on table public.profiles to authenticated;

create or replace function public.get_me() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me jsonb;
begin
  perform private.require_active_session();
  select jsonb_build_object(
           'id', p.id,
           'username', p.username,
           'nickname', p.nickname,
           'avatarUrl', p.avatar_url,
           'statusMessage', p.status_message,
           'isAdmin', private.is_admin())
  into v_me
  from public.profiles p
  where p.id = auth.uid();
  return v_me;
end;
$$;

-- profile_updated에 상태 메시지 포함, 상태 메시지 변경도 송출
create or replace function private.profiles_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_payload jsonb := jsonb_build_object('userId', new.id, 'username', new.username, 'nickname', new.nickname,
                                        'avatarUrl', new.avatar_url, 'statusMessage', new.status_message);
  v_to uuid;
begin
  if new.nickname is not distinct from old.nickname and new.avatar_url is not distinct from old.avatar_url
     and new.status_message is not distinct from old.status_message then
    return null;
  end if;
  for v_to in
    select new.id
    union
    select o.user_id from public.chat_room_participants me
      join public.chat_room_participants o on o.room_id = me.room_id
     where me.user_id = new.id
    union
    select case when f.requester_id = new.id then f.receiver_id else f.requester_id end
      from public.friends f where new.id in (f.requester_id, f.receiver_id)
  loop
    perform private.broadcast('user:' || v_to, 'profile_updated', v_payload);
  end loop;
  return null;
end;
$$;
drop trigger profiles_broadcast on public.profiles;
create trigger profiles_broadcast after update of nickname, avatar_url, status_message on public.profiles
  for each row execute function private.profiles_broadcast();
