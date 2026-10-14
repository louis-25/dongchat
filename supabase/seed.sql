-- 로컬 개발 전용 계정. 비밀번호: password123
-- GoTrue는 토큰 컬럼이 NULL이면 로그인 시 오류가 나므로 빈 문자열로 채운다.
do $$
declare
  v_user record;
begin
  for v_user in
    select * from (values
      ('00000000-0000-0000-0000-00000000a001'::uuid, 'admin@dongchat.local', 'admin'),
      ('00000000-0000-0000-0000-00000000b001'::uuid, 'alice@dongchat.local', 'alice_dev'),
      ('00000000-0000-0000-0000-00000000b002'::uuid, 'bob@dongchat.local', 'bob_dev')
    ) as t(id, email, username)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user.id, 'authenticated', 'authenticated', v_user.email,
      extensions.crypt('password123', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('username', v_user.username), now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), v_user.id, v_user.id::text,
            jsonb_build_object('sub', v_user.id::text, 'email', v_user.email, 'email_verified', true),
            'email', now(), now(), now());
  end loop;
end $$;

insert into private.user_roles (user_id, role) values ('00000000-0000-0000-0000-00000000a001', 'ADMIN');

-- 로컬 웹 푸시 웹훅(메시지 트리거 → Edge Function). 비밀은 supabase/.env의 PUSH_WEBHOOK_SECRET과 같아야 한다.
-- 운영 값은 DEPLOYMENT.md의 "웹 푸시" 절차로 별도 설정한다.
select vault.create_secret('http://kong:8000/functions/v1/send-push', 'push_webhook_url');
select vault.create_secret('local-dev-push-secret', 'push_webhook_secret');
