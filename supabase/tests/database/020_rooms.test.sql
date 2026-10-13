begin;
select plan(22);

select tests.create_user('alice@test.com', '{"username":"alice"}');
select tests.create_user('bob@test.com', '{"username":"bob"}');
select tests.create_user('carol@test.com', '{"username":"carol"}');
select tests.create_user('dave@test.com', '{"username":"dave"}');   -- 관리자
select tests.create_user('eve@test.com', '{"username":"eve"}');     -- 외부인
insert into private.user_roles values (tests.uid('dave@test.com'), 'ADMIN');

-- 1~5: create_room 검증
select tests.login_as(tests.uid('alice@test.com'));
select lives_ok($$ select public.create_room('dm', false, array['Bob']) $$, '1:1 방 생성(대소문자 무시)');
select throws_ok($$ select public.create_room('bad', false, array['bob','carol']) $$, 'P0001', 'ROOM_INVALID_PARTICIPANTS', '1:1에 2명 초과 불가');
select throws_ok($$ select public.create_room('bad', true, array['ghost']) $$, 'P0001', 'ROOM_INVALID_PARTICIPANTS', '없는 사용자 불가');
select throws_ok($$ select public.create_room('bad', true, array['alice']) $$, 'P0001', 'ROOM_INVALID_PARTICIPANTS', '본인만으로는 불가');
select lives_ok($$ select public.create_room('grp', true, array['bob','carol']) $$, '그룹방 생성');
select is((select created_by from public.chat_rooms where id = tests.room_id('grp')), tests.uid('alice@test.com'), '생성자가 방장');
select is((select count(*)::int from public.chat_room_participants where room_id = tests.room_id('grp')), 3, '그룹 참여자 3명');
select throws_ok($$ insert into public.chat_rooms (name) values ('x') $$, '42501', null, '방 직접 INSERT 불가');
reset role;

-- 9~11: 가시성
select tests.login_as(tests.uid('eve@test.com'));
select is((select count(*)::int from public.chat_rooms), 0, '외부인은 방 0개');
select is((select count(*)::int from public.chat_room_participants), 0, '외부인은 참여자 0행');
reset role;
select tests.login_as(tests.uid('dave@test.com'));
select is((select count(*)::int from public.chat_rooms where name in ('dm', 'grp')), 2, '관리자는 모든 방 열람');
reset role;

-- 12~16: 강퇴
select tests.login_as(tests.uid('bob@test.com'));
select throws_ok(format('select public.kick_member(%s, %L)', tests.room_id('grp'), tests.uid('carol@test.com')), 'P0001', 'ROOM_KICK_FORBIDDEN', '방장 아닌 멤버는 강퇴 불가');
reset role;
select tests.login_as(tests.uid('alice@test.com'));
select throws_ok(format('select public.kick_member(%s, %L)', tests.room_id('dm'), tests.uid('bob@test.com')), 'P0001', 'ROOM_KICK_FORBIDDEN', '1:1 방은 강퇴 불가');
select throws_ok(format('select public.kick_member(%s, %L)', tests.room_id('grp'), tests.uid('alice@test.com')), 'P0001', 'ROOM_KICK_FORBIDDEN', '본인 강퇴 불가');
select lives_ok(format('select public.kick_member(%s, %L)', tests.room_id('grp'), tests.uid('carol@test.com')), '방장은 강퇴 가능');
reset role;
select tests.login_as(tests.uid('carol@test.com'));
select is((select count(*)::int from public.chat_rooms where name = 'grp'), 0, '강퇴된 사용자는 방이 안 보임');
reset role;

-- 17~19: 나가기 + 방장 승계 + 빈 방 삭제
select tests.login_as(tests.uid('eve@test.com'));
select throws_ok(format('select public.leave_room(%s)', tests.room_id('grp')), 'P0001', 'CHAT_FORBIDDEN', '비참여자는 나가기 불가');
reset role;
select tests.login_as(tests.uid('alice@test.com'));
select lives_ok(format('select public.leave_room(%s)', tests.room_id('grp')), '방장 나가기');
reset role;
select is((select created_by from public.chat_rooms where name = 'grp'), tests.uid('bob@test.com'), '남은 멤버에게 방장 승계');

-- 20: Studio 직접 삭제도 동일 처리 (Review Focus 3)
delete from public.chat_room_participants where room_id = tests.room_id('grp') and user_id = tests.uid('bob@test.com');
select is((select count(*)::int from public.chat_rooms where name = 'grp'), 0, '마지막 멤버 삭제 시 방 삭제');

-- 21~22: 비활성 세션
insert into private.user_access (user_id, sessions_revoked_at) values (tests.uid('alice@test.com'), now());
select tests.login_as(tests.uid('alice@test.com'), now() - interval '1 minute');
select throws_ok($$ select public.create_room('late', true, array['bob']) $$, 'P0001', 'AUTH_SESSION_REVOKED', '강제 로그아웃 후 RPC 거부');
select is((select count(*)::int from public.chat_rooms), 0, '강제 로그아웃 후 방 조회 0');
reset role;

select * from finish();
rollback;
