begin;
select plan(27);

select tests.create_user('pv_me@test.com', '{"username":"pv_me"}');
select tests.create_user('pv_mate@test.com', '{"username":"pv_mate"}');
select tests.create_user('pv_out@test.com', '{"username":"pv_out"}');
select tests.login_as(tests.uid('pv_me@test.com'));
select public.create_room('pv_group', true, array['pv_mate']);
reset role;
select set_config('tests.room', tests.room_id('pv_group')::text, true);

-- P1: 한 개 선택·공개·추가 불가 / P2: 여러 개·익명·추가 허용 / P3: 마감 시각 있음
select tests.login_as(tests.uid('pv_me@test.com'));
select set_config('tests.m1', public.create_poll(current_setting('tests.room')::bigint, '점심', array['A', 'B', 'C'], false, false, false, null)::text, true);
select set_config('tests.m2', public.create_poll(current_setting('tests.room')::bigint, '저녁', array['X', 'Y'], true, true, true, null)::text, true);
select set_config('tests.m3', public.create_poll(current_setting('tests.room')::bigint, '간식', array['K', 'L'], false, false, false, now() + interval '2 minutes')::text, true);
reset role;
select set_config('tests.p1', (select poll_id from public.messages where id = current_setting('tests.m1')::bigint)::text, true);
select set_config('tests.p2', (select poll_id from public.messages where id = current_setting('tests.m2')::bigint)::text, true);
select set_config('tests.p3', (select poll_id from public.messages where id = current_setting('tests.m3')::bigint)::text, true);
select set_config('tests.a', (select id from public.poll_options where poll_id = current_setting('tests.p1')::bigint and label = 'A')::text, true);
select set_config('tests.b', (select id from public.poll_options where poll_id = current_setting('tests.p1')::bigint and label = 'B')::text, true);
select set_config('tests.x', (select id from public.poll_options where poll_id = current_setting('tests.p2')::bigint and label = 'X')::text, true);
select set_config('tests.y', (select id from public.poll_options where poll_id = current_setting('tests.p2')::bigint and label = 'Y')::text, true);
select set_config('tests.k', (select id from public.poll_options where poll_id = current_setting('tests.p3')::bigint and label = 'K')::text, true);

-- 한 개 선택: 투표 → 옮기기 → 2개 거부 → 중복 id는 하나로 → 다른 투표 선택지 거부
select tests.login_as(tests.uid('pv_mate@test.com'));
select lives_ok(format('select public.vote_poll(%s, array[%s]::bigint[])', current_setting('tests.p1'), current_setting('tests.a')), '투표');
reset role;
select is((select count(*)::int from public.poll_votes where poll_id = current_setting('tests.p1')::bigint and user_id = tests.uid('pv_mate@test.com')), 1, '표 1개');
select tests.login_as(tests.uid('pv_mate@test.com'));
select lives_ok(format('select public.vote_poll(%s, array[%s]::bigint[])', current_setting('tests.p1'), current_setting('tests.b')), '다른 줄로 옮기기');
reset role;
select is((select array_agg(option_id) from public.poll_votes where poll_id = current_setting('tests.p1')::bigint and user_id = tests.uid('pv_mate@test.com')),
  array[current_setting('tests.b')::bigint], '옮긴 뒤 B 하나');
select tests.login_as(tests.uid('pv_mate@test.com'));
select throws_ok(format('select public.vote_poll(%s, array[%s, %s]::bigint[])', current_setting('tests.p1'), current_setting('tests.a'), current_setting('tests.b')),
  'P0001', 'VALIDATION_FAILED', '한 개 선택에 2개 거부');
select lives_ok(format('select public.vote_poll(%s, array[%s, %s]::bigint[])', current_setting('tests.p1'), current_setting('tests.b'), current_setting('tests.b')), '중복 id는 하나로');
select throws_ok(format('select public.vote_poll(%s, array[%s]::bigint[])', current_setting('tests.p1'), current_setting('tests.x')),
  'P0001', 'VALIDATION_FAILED', '다른 투표의 선택지 거부');
select is(public.get_poll(current_setting('tests.p1')::bigint) -> 'myOptionIds', jsonb_build_array(current_setting('tests.b')::bigint), '내 선택');
select is(public.get_poll(current_setting('tests.p1')::bigint) -> 'options' -> 1 -> 'voters', '["pv_mate"]'::jsonb, '공개 투표는 이름이 보인다');

-- 여러 개·익명: 만든 사람에게도 투표자 없음
select lives_ok(format('select public.vote_poll(%s, array[%s, %s]::bigint[])', current_setting('tests.p2'), current_setting('tests.x'), current_setting('tests.y')), '여러 개 선택');
reset role;
select tests.login_as(tests.uid('pv_me@test.com'));
select is(public.get_poll(current_setting('tests.p2')::bigint) -> 'options' -> 0 -> 'voters', '[]'::jsonb, '익명: 만든 사람에게도 빈 목록');
select is(public.get_poll(current_setting('tests.p2')::bigint) -> 'options' -> 0 ->> 'count', '1', '익명도 표 수는 보인다');
select is(public.get_poll(current_setting('tests.p2')::bigint) ->> 'voterCount', '1', '참여자 수');
reset role;

-- 취소
select tests.login_as(tests.uid('pv_mate@test.com'));
select public.vote_poll(current_setting('tests.p1')::bigint, '{}');
reset role;
select is((select count(*)::int from public.poll_votes where poll_id = current_setting('tests.p1')::bigint), 0, '빈 배열 = 취소');

-- 항목 추가
select tests.login_as(tests.uid('pv_mate@test.com'));
select throws_ok(format('select public.add_poll_option(%s, ''D'')', current_setting('tests.p1')), 'P0001', 'CHAT_FORBIDDEN', '추가 허용 안 된 투표');
select throws_ok(format('select public.add_poll_option(%s, '' x '')', current_setting('tests.p2')), 'P0001', 'VALIDATION_FAILED', '대소문자·공백만 다른 중복');
select lives_ok(format('select public.add_poll_option(%s, ''Z'')', current_setting('tests.p2')), '허용된 투표는 참여자도 추가');
reset role;
select tests.login_as(tests.uid('pv_me@test.com'));
select lives_ok(format('select public.add_poll_option(%s, ''D'')', current_setting('tests.p1')), '만든 사람은 늘 추가');
reset role;
select ok(exists(select 1 from realtime.messages where topic = 'room:' || current_setting('tests.room') and event = 'poll_updated'
  and payload ->> 'pollId' = current_setting('tests.p1')), '방 채널에 poll_updated');

-- 마감
select tests.login_as(tests.uid('pv_mate@test.com'));
select throws_ok(format('select public.close_poll(%s)', current_setting('tests.p1')), 'P0001', 'CHAT_FORBIDDEN', '만든 사람만 마감');
reset role;
select tests.login_as(tests.uid('pv_me@test.com'));
select lives_ok(format('select public.close_poll(%s)', current_setting('tests.p1')), '마감');
reset role;
select set_config('tests.sent', (select count(*) from realtime.messages where event = 'poll_updated' and payload ->> 'pollId' = current_setting('tests.p1'))::text, true);
select tests.login_as(tests.uid('pv_me@test.com'));
select public.close_poll(current_setting('tests.p1')::bigint);
reset role;
select is((select count(*) from realtime.messages where event = 'poll_updated' and payload ->> 'pollId' = current_setting('tests.p1'))::text,
  current_setting('tests.sent'), '두 번째 마감은 broadcast 없음');
select tests.login_as(tests.uid('pv_mate@test.com'));
select throws_ok(format('select public.vote_poll(%s, array[%s]::bigint[])', current_setting('tests.p1'), current_setting('tests.a')), 'P0001', 'POLL_CLOSED', '마감 후 투표 거부');
reset role;

-- 마감 시각 경과(트랜잭션 안에서 now()는 고정이라 시각을 과거로 옮긴다)
update public.polls set closes_at = now() - interval '1 second' where id = current_setting('tests.p3')::bigint;
select tests.login_as(tests.uid('pv_mate@test.com'));
select throws_ok(format('select public.vote_poll(%s, array[%s]::bigint[])', current_setting('tests.p3'), current_setting('tests.k')), 'P0001', 'POLL_CLOSED', '마감 시각 지나면 거부');
select is(public.get_poll(current_setting('tests.p3')::bigint) ->> 'closed', 'true', '마감 시각 지나면 closed');
reset role;

-- 비참여자·anon
select tests.login_as(tests.uid('pv_out@test.com'));
select throws_ok(format('select public.vote_poll(%s, array[%s]::bigint[])', current_setting('tests.p2'), current_setting('tests.x')), 'P0001', 'POLL_NOT_FOUND', '비참여자 거부');
reset role;
set local role anon;
select throws_ok('select public.vote_poll(1, ''{}'')', '42501', null, 'anon 호출 불가');
reset role;

select * from finish();
rollback;
