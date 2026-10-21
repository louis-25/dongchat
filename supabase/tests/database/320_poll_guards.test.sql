begin;
select plan(10);

select tests.create_user('pg_me@test.com', '{"username":"pg_me"}');
select tests.create_user('pg_mate@test.com', '{"username":"pg_mate"}');
select tests.create_user('pg_solo@test.com', '{"username":"pg_solo"}');
select tests.login_as(tests.uid('pg_me@test.com'));
select public.create_room('pg_group', true, array['pg_mate']);
select public.create_room('pg_two', true, array['pg_solo']);
reset role;
select set_config('tests.room', tests.room_id('pg_group')::text, true);
select set_config('tests.two', tests.room_id('pg_two')::text, true);

select tests.login_as(tests.uid('pg_me@test.com'));
select set_config('tests.msg', public.create_poll(current_setting('tests.room')::bigint, '주말', array['토', '일'], false, false, false, null)::text, true);
select public.create_poll(current_setting('tests.two')::bigint, '둘이', array['a', 'b'], false, false, false, null);
reset role;
select set_config('tests.poll', (select poll_id from public.messages where id = current_setting('tests.msg')::bigint)::text, true);
select set_config('tests.opt', (select min(id) from public.poll_options where poll_id = current_setting('tests.poll')::bigint)::text, true);

-- 수정·공지 등록 불가
select tests.login_as(tests.uid('pg_me@test.com'));
select throws_ok(format('select public.edit_message(%s, ''바꿈'')', current_setting('tests.msg')), 'P0001', 'VALIDATION_FAILED', '투표는 수정 불가');
select throws_ok(format('select public.set_room_notice(%s, %s)', current_setting('tests.room'), current_setting('tests.msg')), 'P0001', 'VALIDATION_FAILED', '투표는 공지 불가');
reset role;

-- message 이벤트 payload에 pollId
select is((select payload ->> 'pollId' from private.message_event('INSERT', null,
  (select m from public.messages m where m.id = current_setting('tests.msg')::bigint))), current_setting('tests.poll'), 'payload에 pollId');

-- 삭제하면 닫히고 결과도 안 보인다
select tests.login_as(tests.uid('pg_me@test.com'));
select lives_ok(format('select public.delete_message(%s)', current_setting('tests.msg')), '투표 메시지 삭제');
reset role;
select tests.login_as(tests.uid('pg_mate@test.com'));
select throws_ok(format('select public.vote_poll(%s, array[%s]::bigint[])', current_setting('tests.poll'), current_setting('tests.opt')), 'P0001', 'POLL_CLOSED', '삭제 후 투표 거부');
select throws_ok(format('select public.get_poll(%s)', current_setting('tests.poll')), 'P0001', 'POLL_NOT_FOUND', '삭제 후 조회 불가');
reset role;
select tests.login_as(tests.uid('pg_me@test.com'));
select lives_ok(format('select public.close_poll(%s)', current_setting('tests.poll')), '삭제된 투표 마감은 아무 일도 안 함');
reset role;

-- 만든 사람 탈퇴 → creator_id null
delete from auth.users where id = tests.uid('pg_me@test.com');
select is((select creator_id from public.polls where id = current_setting('tests.poll')::bigint), null, '탈퇴하면 만든 사람 null');

-- 투표가 있는 방에서 마지막 참여자가 나가면 방·투표 함께 삭제(pg_me는 위에서 탈퇴해 pg_solo만 남음)
select tests.login_as(tests.uid('pg_solo@test.com'));
select lives_ok(format('select public.leave_room(%s)', current_setting('tests.two')), '마지막 참여자 나가기');
reset role;
select is((select count(*)::int from public.polls where room_id = current_setting('tests.two')::bigint), 0, '방과 함께 투표 삭제');

select * from finish();
rollback;
