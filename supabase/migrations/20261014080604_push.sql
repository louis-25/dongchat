create extension if not exists pg_net with schema extensions;

-- 푸시 대상(스펙 §10): 방 참여자 − 발신자 − 정지 사용자, 기기(구독)별 한 행. Edge Function(service role) 전용.
create or replace function public.push_targets(p_message_id bigint)
returns table (endpoint text, p256dh text, auth text, title text, body text, room_id bigint)
language sql stable security definer set search_path = ''
as $$
  select s.endpoint, s.p256dh, s.auth,
         coalesce(r.name, sp.nickname, sp.username, '새 메시지') as title,
         m.content as body,
         m.room_id
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
-- Edge Function이 410/404 구독을 지운다(기본 권한에 기대지 않고 명시)
grant select, delete on table public.push_subscriptions to service_role;

-- 구독 등록. endpoint는 그 브라우저만 아는 값이므로 제시한 사람이 그 브라우저의 현재 사용자다 →
-- 다른 사용자 소유였다면 넘겨받는다(공용 브라우저에서 이전 사용자 메시지가 뜨지 않게).
create or replace function public.register_push_subscription(p_endpoint text, p_p256dh text, p_auth text) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_active_session();
  -- endpoint는 http(s) URL(운영 발송은 Edge Function이 https만 허용), 키는 base64url
  if coalesce(p_endpoint, '') !~ '^https?://[^\s]+$' or char_length(p_endpoint) > 2000
     or coalesce(p_p256dh, '') !~ '^[A-Za-z0-9_-]{1,200}$'
     or coalesce(p_auth, '') !~ '^[A-Za-z0-9_-]{1,200}$' then
    raise exception 'VALIDATION_FAILED' using hint = '푸시 구독 정보가 올바르지 않습니다.';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;
revoke execute on function public.register_push_subscription(text, text, text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text) to authenticated;

-- 새 메시지 → 웹훅(pg_net, 비동기). URL·비밀은 환경별 Vault 값(로컬은 seed.sql, 운영은 DEPLOYMENT.md).
-- 미설정이거나 실패해도 메시지 INSERT는 깨지지 않는다.
create or replace function private.messages_push() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_webhook_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('messageId', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret)
  );
  return null;
exception when others then
  raise warning 'push webhook failed: %', sqlerrm;
  return null;
end;
$$;
revoke execute on function private.messages_push() from public, anon, authenticated;
create trigger messages_push after insert on public.messages
  for each row execute function private.messages_push();
