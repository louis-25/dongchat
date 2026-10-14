-- 강제 로그아웃·정지된 사용자의 푸시 구독을 서버에서 지운다.
-- 분실 기기처럼 앱이 열려 있지 않아 클라 정리(로그아웃 시 구독 해제)가 돌지 못해도 메시지 본문이 계속 가지 않게 한다.
-- 다시 로그인해 앱을 열면 브라우저에 남은 구독이 재등록된다(usePushNotification).
create or replace function private.user_access_clear_push() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.sessions_revoked_at is not null
      and (tg_op = 'INSERT' or old.sessions_revoked_at is distinct from new.sessions_revoked_at))
     or (new.banned_until is not null and new.banned_until > now()
         and (tg_op = 'INSERT' or old.banned_until is distinct from new.banned_until)) then
    delete from public.push_subscriptions where user_id = new.user_id;
  end if;
  return null;
end;
$$;
revoke execute on function private.user_access_clear_push() from public, anon, authenticated;

create trigger user_access_clear_push after insert or update on private.user_access
  for each row execute function private.user_access_clear_push();
