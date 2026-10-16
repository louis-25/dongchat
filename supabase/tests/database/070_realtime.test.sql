begin;
select plan(25);

select tests.create_user('alice@test.com', '{"username":"alice"}');
select tests.create_user('bob@test.com', '{"username":"bob"}');
select tests.create_user('dave@test.com', '{"username":"dave"}');
select tests.create_user('eve@test.com', '{"username":"eve"}');
insert into private.user_roles values (tests.uid('dave@test.com'), 'ADMIN');
select tests.login_as(tests.uid('alice@test.com'));
select public.create_room('grp', true, array['bob']);
reset role;

-- 1~9: 토픽 수신 권한 (Review Focus 1)
select tests.login_as(tests.uid('alice@test.com'));
select is(private.can_receive_topic('room:' || tests.room_id('grp')), true, '멤버는 방 토픽 수신');
select is(private.can_receive_topic('user:' || tests.uid('alice@test.com')), true, '본인 user 토픽 수신');
select is(private.can_receive_topic('user:' || tests.uid('bob@test.com')), false, '타인 user 토픽 거부');
select is(private.can_receive_topic('room:abc'), false, '형식 불일치 거부');
select is(private.can_receive_topic('room:99999999999999999999999'), false, 'bigint 초과 숫자도 오류 없이 거부');
select is(private.can_receive_topic('user:not-a-uuid'), false, '비UUID user 토픽 거부');
select is(private.can_receive_topic(null), false, 'null 거부');
reset role;
select tests.login_as(tests.uid('eve@test.com'));
select is(private.can_receive_topic('room:' || tests.room_id('grp')), false, '비멤버 거부');
reset role;
select tests.login_as(tests.uid('dave@test.com'));
select is(private.can_receive_topic('room:' || tests.room_id('grp')), true, '관리자 열람 수신');
reset role;

-- 10~13: 이벤트 매핑
select is((select event from private.message_event('INSERT', null,
  row(1, 7, null, 'hi', null, null, null, now(), null)::public.messages)), 'message', 'INSERT → message');
select is((select event from private.message_event('UPDATE',
  row(1, 7, null, 'hi', null, null, null, now(), null)::public.messages,
  row(1, 7, null, '', null, null, now(), now(), null)::public.messages)), 'message_deleted', 'deleted_at 설정 → message_deleted');
select is((select event from private.message_event('UPDATE',
  row(1, 7, null, 'hi', null, null, null, now(), null)::public.messages,
  row(1, 7, null, 'hello', null, now(), null, now(), null)::public.messages)), 'message_edited', '내용 변경 → message_edited');
select is((select payload ->> 'roomId' from private.message_event('INSERT', null,
  row(1, 7, null, 'hi', null, null, null, now(), null)::public.messages)), '7', 'payload에 roomId');

-- 14~17: 송출 트리거와 함께 원 작업이 성공 (send 실패 시에도 private.broadcast가 예외를 삼킴)
select tests.login_as(tests.uid('alice@test.com'));
select lives_ok(format($$ insert into public.messages (room_id, content) values (%s, 'rt') $$, tests.room_id('grp')), '메시지 INSERT + 송출');
select lives_ok(format('select public.mark_read(%s)', tests.room_id('grp')), '읽음 + 송출');
select lives_ok(format('select public.kick_member(%s, %L)', tests.room_id('grp'), tests.uid('bob@test.com')), '강퇴 + 송출');
reset role;
select lives_ok(format($$ insert into private.user_access (user_id, sessions_revoked_at) values (%L, now()) $$, tests.uid('bob@test.com')), '강제 로그아웃 + 송출');

-- 18~23: 실제 송출 내용 (로컬 스택은 Realtime 서비스가 일별 파티션을 만들어 둔다)
select ok(exists(select 1 from realtime.messages where topic = 'room:' || tests.room_id('grp') and event = 'message' and payload ->> 'content' = 'rt'), 'message 이벤트 기록');
select ok(exists(select 1 from realtime.messages where topic = 'room:' || tests.room_id('grp') and event = 'read_update' and payload ->> 'userId' = tests.uid('alice@test.com')::text), 'read_update 이벤트 기록');
select ok(exists(select 1 from realtime.messages where topic = 'user:' || tests.uid('bob@test.com') and event = 'member_removed'), '강퇴 시 user 토픽 member_removed');
select ok(exists(select 1 from realtime.messages where topic = 'user:' || tests.uid('bob@test.com') and event = 'force_logout' and payload ->> 'reason' = 'revoked'), '강제 로그아웃 force_logout(revoked)');
update private.user_access set banned_until = now() + interval '1 day' where user_id = tests.uid('bob@test.com');
select ok(exists(select 1 from realtime.messages where topic = 'user:' || tests.uid('bob@test.com') and event = 'force_logout' and payload ->> 'reason' = 'banned'), '정지 force_logout(banned)');
insert into auth.sessions (id, user_id, created_at, updated_at)
values ('22222222-2222-2222-2222-222222222222', tests.uid('eve@test.com'), now(), now());
delete from auth.sessions where id = '22222222-2222-2222-2222-222222222222';
select ok(exists(select 1 from realtime.messages where topic = 'user:' || tests.uid('eve@test.com') and event = 'force_logout' and payload ->> 'sessionId' = '22222222-2222-2222-2222-222222222222'), '세션 삭제 force_logout(sessionId)');

-- 24~25: realtime.messages 수신 정책 (Realtime이 설정하는 realtime.topic을 흉내)
select tests.login_as(tests.uid('alice@test.com'));
select set_config('realtime.topic', 'room:' || tests.room_id('grp'), true);
select ok((select count(*) from realtime.messages) > 0, '멤버는 방 토픽 수신(정책)');
reset role;
select tests.login_as(tests.uid('eve@test.com'));
select set_config('realtime.topic', 'room:' || tests.room_id('grp'), true);
select is((select count(*)::int from realtime.messages), 0, '비멤버는 방 토픽 수신 0(정책)');
reset role;

select * from finish();
rollback;
