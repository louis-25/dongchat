begin;
select plan(17);

select tests.create_user('pa_me@test.com', '{"username":"pa_me"}');
select tests.create_user('pa_mate@test.com', '{"username":"pa_mate"}');
select tests.create_user('pa_out@test.com', '{"username":"pa_out"}');
select tests.login_as(tests.uid('pa_me@test.com'));
select public.create_room('pa_group', true, array['pa_mate']);
reset role;
select set_config('tests.room', tests.room_id('pa_group')::text, true);

-- 만들기: 선택지 정리(공백·빈 칸·null·대소문자 무시 중복)
select tests.login_as(tests.uid('pa_me@test.com'));
select set_config('tests.msg', public.create_poll(current_setting('tests.room')::bigint, '  점심   뭐 먹지 ',
  array[' 짜장 ', '짬뽕', '짜장', '', null, '볶음  밥'], false, false, false, null)::text, true);
reset role;
select set_config('tests.poll', (select poll_id from public.messages where id = current_setting('tests.msg')::bigint)::text, true);

select is((select content from public.messages where id = current_setting('tests.msg')::bigint), '(투표) 점심 뭐 먹지', '메시지 content');
select is((select array_agg(label order by id) from public.poll_options where poll_id = current_setting('tests.poll')::bigint),
  array['짜장', '짬뽕', '볶음 밥'], '선택지 정리');
select is((select creator_id from public.polls where id = current_setting('tests.poll')::bigint), tests.uid('pa_me@test.com'), '만든 사람');

-- 검증 실패
select tests.login_as(tests.uid('pa_me@test.com'));
select throws_ok($$select public.create_poll(current_setting('tests.room')::bigint, '질문', array['하나', ' 하나'], false, false, false, null)$$,
  'P0001', 'VALIDATION_FAILED', '정리 후 선택지 1개');
select throws_ok($$select public.create_poll(current_setting('tests.room')::bigint, '   ', array['a', 'b'], false, false, false, null)$$,
  'P0001', 'VALIDATION_FAILED', '빈 질문');
select throws_ok($$select public.create_poll(current_setting('tests.room')::bigint, '질문', array['a', 'b'], false, false, false, now() + interval '30 seconds')$$,
  'P0001', 'VALIDATION_FAILED', '마감 시각 1분 미만');
select throws_ok($$select public.create_poll(current_setting('tests.room')::bigint, '질문', array(select 'o' || g from generate_series(1, 21) g), false, false, false, null)$$,
  'P0001', 'VALIDATION_FAILED', '선택지 21개');
reset role;
select tests.login_as(tests.uid('pa_out@test.com'));
select throws_ok($$select public.create_poll(current_setting('tests.room')::bigint, '질문', array['a', 'b'], false, false, false, null)$$,
  'P0001', 'CHAT_FORBIDDEN', '비참여자 거부');
reset role;

-- get_poll
select tests.login_as(tests.uid('pa_mate@test.com'));
select is(public.get_poll(current_setting('tests.poll')::bigint) ->> 'question', '점심 뭐 먹지', '참여자는 조회');
select is(jsonb_array_length(public.get_poll(current_setting('tests.poll')::bigint) -> 'options'), 3, '선택지 3개');
select is(public.get_poll(current_setting('tests.poll')::bigint) ->> 'closed', 'false', '열림');
reset role;
select tests.login_as(tests.uid('pa_out@test.com'));
select throws_ok(format('select public.get_poll(%s)', current_setting('tests.poll')), 'P0001', 'POLL_NOT_FOUND', '비참여자 조회 불가');
reset role;

-- 직접 접근 거부(익명 보장)
select tests.login_as(tests.uid('pa_me@test.com'));
select throws_ok('select * from public.polls', '42501', null, 'polls 직접 select 불가');
select throws_ok('select * from public.poll_votes', '42501', null, 'poll_votes 직접 select 불가');
select throws_ok(format('insert into public.poll_options (poll_id, label) values (%s, ''x'')', current_setting('tests.poll')), '42501', null, 'poll_options 직접 insert 불가');
select throws_ok(format('insert into public.messages (room_id, content, poll_id) values (%s, ''위조'', %s)', current_setting('tests.room'), current_setting('tests.poll')),
  '42501', null, 'messages.poll_id 직접 insert 불가');
reset role;

set local role anon;
select throws_ok('select public.get_poll(1)', '42501', null, 'anon 호출 불가');
reset role;

select * from finish();
rollback;
