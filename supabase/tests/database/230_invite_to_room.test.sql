begin;
select plan(8);

select tests.create_user('iv_me@test.com', '{"username":"iv_me"}');
select tests.create_user('iv_mate@test.com', '{"username":"iv_mate"}');
select tests.create_user('iv_new@test.com', '{"username":"iv_new"}');
select tests.create_user('iv_out@test.com', '{"username":"iv_out"}');
select tests.login_as(tests.uid('iv_me@test.com'));
select public.create_room('iv_group', true, array['iv_mate']);
select public.create_room('', false, array['iv_mate']);
reset role;
select set_config('tests.group', tests.room_id('iv_group')::text, true);
select set_config('tests.direct', (select max(id) from public.chat_rooms)::text, true);

select tests.login_as(tests.uid('iv_mate@test.com'));
select lives_ok(format($$ select public.invite_to_room(%s, array['IV_NEW', 'iv_me']) $$, current_setting('tests.group')),
  '멤버는 초대할 수 있고, 이미 있는 사람은 건너뛴다');
reset role;
select is((select count(*)::int from public.chat_room_participants where room_id = current_setting('tests.group')::bigint), 3, '새 사람만 추가');
select ok(exists(select 1 from realtime.messages where topic = 'room:' || current_setting('tests.group')
  and event = 'member_added' and payload ->> 'userId' = tests.uid('iv_new@test.com')::text), '방 채널에도 member_added');
select ok(exists(select 1 from realtime.messages where topic = 'user:' || tests.uid('iv_new@test.com')
  and event = 'member_added'), '초대받은 사람 user 채널에 member_added');

select tests.login_as(tests.uid('iv_me@test.com'));
select throws_ok(format($$ select public.invite_to_room(%s, array['iv_out']) $$, current_setting('tests.direct')),
  'P0001', 'ROOM_INVALID_PARTICIPANTS', '1:1 방에는 초대 불가');
select throws_ok(format($$ select public.invite_to_room(%s, array['nobody_here']) $$, current_setting('tests.group')),
  'P0001', 'ROOM_INVALID_PARTICIPANTS', '없는 사용자 거부');
reset role;

select tests.login_as(tests.uid('iv_out@test.com'));
select throws_ok(format($$ select public.invite_to_room(%s, array['iv_out']) $$, current_setting('tests.group')),
  'P0001', 'CHAT_FORBIDDEN', '비멤버는 초대 불가(자기 자신도)');
reset role;

set local role anon;
select throws_ok(format($$ select public.invite_to_room(%s, array['iv_out']) $$, current_setting('tests.group')),
  '42501', null, 'anon 호출 불가');
reset role;

select * from finish();
rollback;
