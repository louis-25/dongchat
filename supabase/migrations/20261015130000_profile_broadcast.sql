-- 닉네임·사진 변경을 관련된 사람(본인·같은 방·친구)의 user 채널로 알린다. 화면은 받은 값으로 바로 고친다.
create or replace function private.profiles_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_payload jsonb := jsonb_build_object('userId', new.id, 'username', new.username,
                                        'nickname', new.nickname, 'avatarUrl', new.avatar_url);
  v_to uuid;
begin
  if new.nickname is not distinct from old.nickname and new.avatar_url is not distinct from old.avatar_url then
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
revoke execute on function private.profiles_broadcast() from public, anon, authenticated;
create trigger profiles_broadcast after update of nickname, avatar_url on public.profiles
  for each row execute function private.profiles_broadcast();
