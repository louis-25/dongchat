begin;
select plan(14);

select tests.create_user('pu_alice@test.com', '{"username":"pu_alice"}');
select tests.create_user('pu_bob@test.com', '{"username":"pu_bob"}');
select tests.create_user('pu_carol@test.com', '{"username":"pu_carol"}');
select tests.create_user('pu_dave@test.com', '{"username":"pu_dave"}');
select tests.create_user('pu_erin@test.com', '{"username":"pu_erin"}');

-- 구독: bob 2기기, carol 1, alice(발신자) 1
select tests.login_as(tests.uid('pu_bob@test.com'));
select lives_ok($$ select public.register_push_subscription('https://push.test/bob1', 'k', 'a') $$, '본인 구독 등록');
select throws_ok($$ select public.register_push_subscription('javascript:alert(1)', 'k', 'a') $$, 'P0001', 'VALIDATION_FAILED', '형식이 아닌 endpoint 거부');
select public.register_push_subscription('https://push.test/bob2', 'k', 'a');
reset role;
select tests.login_as(tests.uid('pu_carol@test.com'));
select public.register_push_subscription('https://push.test/carol', 'k', 'a');
reset role;
select tests.login_as(tests.uid('pu_erin@test.com'));
select public.register_push_subscription('https://push.test/erin', 'k', 'a');
reset role;
select tests.login_as(tests.uid('pu_alice@test.com'));
select public.register_push_subscription('https://push.test/alice', 'k', 'a');
select public.create_room('pu_room', true, array['pu_bob', 'pu_carol', 'pu_erin']);
insert into public.messages (room_id, content) values (tests.room_id('pu_room'), '푸시');
select throws_ok(
  format('select * from public.push_targets(%s)', (select max(id) from public.messages)),
  '42501', null, '일반 사용자는 push_targets 호출 불가');
reset role;

-- 1·2·3: 대상 = 참여자 − 발신자, 기기별 구독, 제목·본문
select is(
  (select array_agg(endpoint order by endpoint) from public.push_targets((select max(id) from public.messages))),
  array['https://push.test/bob1', 'https://push.test/bob2', 'https://push.test/carol', 'https://push.test/erin'],
  '발신자 제외, 여러 기기 모두');
select is((select distinct title from public.push_targets((select max(id) from public.messages))), 'pu_room', '제목 = 방 이름');
select is((select distinct body from public.push_targets((select max(id) from public.messages))), '푸시', '본문 = 내용');

-- 4·5: 정지 사용자 제외 — 대시보드 Ban(auth.users)과 앱 정지(private.user_access) 둘 다
update auth.users set banned_until = now() + interval '1 day' where id = tests.uid('pu_carol@test.com');
select is(
  (select array_agg(endpoint order by endpoint) from public.push_targets((select max(id) from public.messages))),
  array['https://push.test/bob1', 'https://push.test/bob2', 'https://push.test/erin'],
  '대시보드 Ban 사용자 제외');
insert into private.user_access (user_id, banned_until) values (tests.uid('pu_erin@test.com'), now() + interval '1 day');
select is(
  (select array_agg(endpoint order by endpoint) from public.push_targets((select max(id) from public.messages))),
  array['https://push.test/bob1', 'https://push.test/bob2'],
  '앱 정지 사용자 제외');

-- service_role(Edge Function)은 대상 조회·만료 구독 삭제가 가능해야 한다
set local role service_role;
select lives_ok(
  format('select * from public.push_targets(%s); delete from public.push_subscriptions where endpoint = %L',
         (select max(id) from public.messages), 'https://push.test/none'),
  'service_role: push_targets 실행·구독 삭제 권한');
reset role;

-- 5: 삭제된 메시지는 보내지 않음
update public.messages set deleted_at = now(), content = '' where id = (select max(id) from public.messages);
select is((select count(*)::int from public.push_targets((select max(id) from public.messages))), 0, '삭제된 메시지 대상 없음');

-- 6·7: 공용 브라우저 — dave가 bob의 endpoint를 등록하면 dave 소유로 넘어간다
select tests.login_as(tests.uid('pu_dave@test.com'));
select public.register_push_subscription('https://push.test/bob1', 'k2', 'a2');
reset role;
select is((select user_id from public.push_subscriptions where endpoint = 'https://push.test/bob1'), tests.uid('pu_dave@test.com'), '같은 endpoint는 등록한 사람에게 이전');
select is((select p256dh from public.push_subscriptions where endpoint = 'https://push.test/bob1'), 'k2', '키 갱신');

-- 웹훅 트리거 — Vault 값이 있을 때만 요청 큐에 쌓인다.
-- seed의 로컬 값을 먼저 지우고(vault.secrets.name은 unique) 테스트 값을 만든다 → 트리거가 읽는 값은 하나뿐(롤백으로 복원).
delete from vault.secrets where name in ('push_webhook_url', 'push_webhook_secret');
select tests.login_as(tests.uid('pu_alice@test.com'));
insert into public.messages (room_id, content) values (tests.room_id('pu_room'), '설정 전');
reset role;
select is(
  (select count(*)::int from net.http_request_queue where url = 'http://push.test/hook'),
  0, 'Vault 미설정이면 웹훅 없음(전송은 성공)');
select vault.create_secret('http://push.test/hook', 'push_webhook_url');
select vault.create_secret('s3cret', 'push_webhook_secret');
select tests.login_as(tests.uid('pu_alice@test.com'));
insert into public.messages (room_id, content) values (tests.room_id('pu_room'), '설정 후');
reset role;
select ok(
  exists(select 1 from net.http_request_queue
         where url = 'http://push.test/hook' and headers ->> 'x-webhook-secret' = 's3cret'
           and convert_from(body, 'utf8')::jsonb ? 'messageId'),
  'Vault 설정 시 messageId와 비밀 헤더로 웹훅');

select * from finish();
rollback;
