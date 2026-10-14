-- 방에 추가된 사용자에게 알린다(새 방이 목록에 바로 보이도록). 스펙 §8.1 확장.
create or replace function private.participants_added_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.broadcast('user:' || new.user_id, 'member_added',
    jsonb_build_object('roomId', new.room_id, 'userId', new.user_id));
  return null;
end;
$$;
revoke execute on function private.participants_added_broadcast() from public, anon, authenticated;

create trigger participants_added_broadcast after insert on public.chat_room_participants
  for each row execute function private.participants_added_broadcast();
