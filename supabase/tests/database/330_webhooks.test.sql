begin;
select plan(36);

select tests.create_user('wh_me@test.com', '{"username":"wh_me"}');
select tests.create_user('wh_mate@test.com', '{"username":"wh_mate"}');
select tests.login_as(tests.uid('wh_me@test.com'));
select public.create_room('wh_group', true, array['wh_mate']);
select set_config('tests.dm', public.open_direct_room('wh_mate')::text, true);
reset role;
select set_config('tests.room', tests.room_id('wh_group')::text, true);

-- 발급(SQL Editor = postgres)
select set_config('tests.tok', public.create_webhook('  채용봇 ', current_setting('tests.room')::bigint), true);
select set_config('tests.bot', (select bot_id::text from private.webhooks where room_id = current_setting('tests.room')::bigint), true);
select set_config('tests.hook', (select id::text from private.webhooks where room_id = current_setting('tests.room')::bigint), true);

select matches(current_setting('tests.tok'), '^dch_[0-9a-f]{64}$', '토큰 형식');
select is((select nickname from public.profiles where id = current_setting('tests.bot')::uuid), '채용봇', '봇 이름(trim)');
select ok((select is_bot from public.profiles where id = current_setting('tests.bot')::uuid), '봇 표식');
select matches((select username from public.profiles where id = current_setting('tests.bot')::uuid), '^bot_[0-9a-f]{16}$', '봇 username');
select ok(exists (select 1 from public.chat_room_participants
  where room_id = current_setting('tests.room')::bigint and user_id = current_setting('tests.bot')::uuid), '봇이 방 멤버');
select is((select token_hash from private.webhooks where id = current_setting('tests.hook')::bigint),
  encode(extensions.digest(current_setting('tests.tok'), 'sha256'), 'hex'), '해시만 저장');
select ok(not exists (select 1 from private.webhooks w where to_jsonb(w)::text like '%' || current_setting('tests.tok') || '%'), '토큰 원문 없음');
select is((select content from public.messages where room_id = current_setting('tests.room')::bigint and kind = 'system' order by id desc limit 1),
  '채용봇님이 들어왔어요', '들어옴 안내');
select is((select count(*)::int from auth.sessions where user_id = current_setting('tests.bot')::uuid), 0, '봇 세션 없음(로그인 불가)');
-- GoTrue는 이 문자열 칼럼이 NULL이면 사용자 목록 전체가 500(대시보드 Users 화면)
select is((select array[confirmation_token, recovery_token, email_change_token_new, email_change]
  from auth.users where id = current_setting('tests.bot')::uuid), array['', '', '', '']::varchar[], 'GoTrue 토큰 칼럼은 빈 문자열');

-- 발급 검증
select throws_ok(format('select public.create_webhook(%L, %s)', 'x', current_setting('tests.dm')), 'P0001', 'VALIDATION_FAILED', '1:1 방 거절');
select throws_ok($$ select public.create_webhook('x', -1::bigint) $$, 'P0001', 'VALIDATION_FAILED', '없는 방 거절');
select throws_ok(format('select public.create_webhook(%L, %s)', '  ', current_setting('tests.room')), 'P0001', 'VALIDATION_FAILED', '빈 이름 거절');
select throws_ok(format('select public.create_webhook(%L, %s)', repeat('가', 21), current_setting('tests.room')), 'P0001', 'VALIDATION_FAILED', '21자 이름 거절');

-- 새 방 형태
select set_config('tests.tok2', public.create_webhook('알림', array[' WH_ME ']), true);
select is((select is_group from public.chat_rooms where name = '알림'), true, '새 방은 그룹');
select is((select created_by from public.chat_rooms where name = '알림'), tests.uid('wh_me@test.com'), '새 방 방장 = 첫 사용자');
select is((select count(*)::int from public.chat_room_participants where room_id = tests.room_id('알림')), 2, '새 방 멤버 = 사람 + 봇');
select throws_ok($$ select public.create_webhook('x', array['ghost']) $$, 'P0001', 'VALIDATION_FAILED', '없는 사용자 거절');
select throws_ok(format('select public.create_webhook(%L, array[%L])', 'x',
  (select username from public.profiles where id = current_setting('tests.bot')::uuid)), 'P0001', 'VALIDATION_FAILED', '봇 username 거절');

-- 저장(service_role)
set local role service_role;
select is(public.webhook_post(current_setting('tests.tok'), array['a', 'b']), 2, '저장 개수');
reset role;
select is((select array_agg(content order by id) from public.messages
  where room_id = current_setting('tests.room')::bigint and sender_id = current_setting('tests.bot')::uuid), array['a', 'b'], '봇 이름으로 순서대로');
select is((select array_agg(distinct kind) from public.messages where sender_id = current_setting('tests.bot')::uuid), array['user'], 'kind = user');
select isnt((select last_used_at from private.webhooks where id = current_setting('tests.hook')::bigint), null, 'last_used_at 갱신');

set local role service_role;
select throws_ok($$ select public.webhook_post('dch_nope', array['a']) $$, 'P0001', 'WEBHOOK_INVALID', '틀린 토큰');
select throws_ok(format('select public.webhook_post(%L, %L::text[])', current_setting('tests.tok'), '{}'), 'P0001', 'VALIDATION_FAILED', '빈 조각');
select throws_ok(format('select public.webhook_post(%L, array[%L])', current_setting('tests.tok'), repeat('x', 2001)), 'P0001', 'VALIDATION_FAILED', '2001자 조각');
select throws_ok(format('select public.webhook_post(%L, array_fill(%L::text, array[11]))', current_setting('tests.tok'), 'x'), 'P0001', 'VALIDATION_FAILED', '조각 11개');
reset role;

-- 재발급
select set_config('tests.tok3', public.rotate_webhook(current_setting('tests.hook')::bigint), true);
set local role service_role;
select throws_ok(format('select public.webhook_post(%L, array[%L])', current_setting('tests.tok'), 'x'), 'P0001', 'WEBHOOK_INVALID', '옛 토큰 거절');
select is(public.webhook_post(current_setting('tests.tok3'), array['c']), 1, '새 토큰 성공');
reset role;

-- 강퇴된 봇
delete from public.chat_room_participants where room_id = tests.room_id('알림') and user_id <> tests.uid('wh_me@test.com');
set local role service_role;
select throws_ok(format('select public.webhook_post(%L, array[%L])', current_setting('tests.tok2'), 'x'), 'P0001', 'WEBHOOK_INVALID', '강퇴된 봇 거절');
reset role;

-- 삭제
select public.delete_webhook(current_setting('tests.hook')::bigint);
select ok(not exists (select 1 from public.chat_room_participants
  where room_id = current_setting('tests.room')::bigint and user_id = current_setting('tests.bot')::uuid), '삭제 후 멤버 아님');
select is((select content from public.messages where room_id = current_setting('tests.room')::bigint and kind = 'system' order by id desc limit 1),
  '채용봇님이 나갔어요', '나감 안내');
select is((select count(*)::int from public.messages where sender_id = current_setting('tests.bot')::uuid), 3, '이전 메시지 보낸 사람 유지');
set local role service_role;
select throws_ok(format('select public.webhook_post(%L, array[%L])', current_setting('tests.tok3'), 'x'), 'P0001', 'WEBHOOK_INVALID', '삭제 후 토큰 거절');
reset role;

-- 권한
select ok(not has_function_privilege('authenticated', 'public.create_webhook(text,bigint)', 'execute')
      and not has_function_privilege('anon', 'public.create_webhook(text,text[])', 'execute')
      and not has_function_privilege('service_role', 'public.create_webhook(text,bigint)', 'execute')
      and not has_function_privilege('service_role', 'public.create_webhook(text,text[])', 'execute')
      and not has_function_privilege('authenticated', 'public.rotate_webhook(bigint)', 'execute')
      and not has_function_privilege('service_role', 'public.rotate_webhook(bigint)', 'execute')
      and not has_function_privilege('authenticated', 'public.delete_webhook(bigint)', 'execute')
      and not has_function_privilege('service_role', 'public.delete_webhook(bigint)', 'execute'), '관리 함수는 SQL Editor 전용');
select ok(has_function_privilege('service_role', 'public.webhook_post(text,text[])', 'execute')
      and not has_function_privilege('authenticated', 'public.webhook_post(text,text[])', 'execute')
      and not has_function_privilege('anon', 'public.webhook_post(text,text[])', 'execute'), 'webhook_post는 service_role만');

select * from finish();
rollback;
