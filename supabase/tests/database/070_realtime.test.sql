begin;
select plan(17);

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
  row(1, 7, null, 'hi', null, null, null, now())::public.messages)), 'message', 'INSERT → message');
select is((select event from private.message_event('UPDATE',
  row(1, 7, null, 'hi', null, null, null, now())::public.messages,
  row(1, 7, null, '', null, null, now(), now())::public.messages)), 'message_deleted', 'deleted_at 설정 → message_deleted');
select is((select event from private.message_event('UPDATE',
  row(1, 7, null, 'hi', null, null, null, now())::public.messages,
  row(1, 7, null, 'hello', null, now(), null, now())::public.messages)), 'message_edited', '내용 변경 → message_edited');
select is((select payload ->> 'roomId' from private.message_event('INSERT', null,
  row(1, 7, null, 'hi', null, null, null, now())::public.messages)), '7', 'payload에 roomId');

-- 14~17: 송출 트리거가 원 트랜잭션을 깨지 않음 (파티션이 없어 send가 실패해도 성공)
select tests.login_as(tests.uid('alice@test.com'));
select lives_ok(format($$ insert into public.messages (room_id, content) values (%s, 'rt') $$, tests.room_id('grp')), '메시지 INSERT + 송출');
select lives_ok(format('select public.mark_read(%s)', tests.room_id('grp')), '읽음 + 송출');
select lives_ok(format('select public.kick_member(%s, %L)', tests.room_id('grp'), tests.uid('bob@test.com')), '강퇴 + 송출');
reset role;
select lives_ok(format($$ insert into private.user_access (user_id, sessions_revoked_at) values (%L, now()) $$, tests.uid('bob@test.com')), '강제 로그아웃 + 송출');

select * from finish();
rollback;
