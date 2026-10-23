begin;
select plan(9);

select tests.create_user('bg_me@test.com', '{"username":"bg_me"}');
select tests.create_user('bg_mate@test.com', '{"username":"bg_mate"}');
select tests.create_user('bg_bot@test.com', '{"username":"bg_bot"}');
update public.profiles set is_bot = true where username = 'bg_bot';
insert into private.user_roles (user_id, role) values (tests.uid('bg_me@test.com'), 'ADMIN');

-- 사람 전용 경로에서 봇은 없는 사용자
select tests.login_as(tests.uid('bg_me@test.com'));
select throws_ok($$ select public.send_friend_request('bg_bot') $$, 'P0001', 'FRIEND_USER_NOT_FOUND', '봇에게 친구 요청 불가');
select throws_ok($$ select public.open_direct_room('bg_bot') $$, 'P0001', 'ROOM_INVALID_PARTICIPANTS', '봇과 1:1 방 불가');
select throws_ok($$ select public.create_room('x', true, array['bg_bot']) $$, 'P0001', 'ROOM_INVALID_PARTICIPANTS', '봇으로 방 만들기 불가');
select public.create_room('bg_group', true, array['bg_mate']);
select throws_ok(format('select public.invite_to_room(%s, array[%L])', tests.room_id('bg_group'), 'bg_bot'),
  'P0001', 'ROOM_INVALID_PARTICIPANTS', '봇 초대 불가');

-- 관리자 목록에서 제외
select ok(not (public.admin_list_users(1, 100) -> 'items') @> jsonb_build_array(jsonb_build_object('username', 'bg_bot')), '관리자 목록에 봇 없음');
select is((public.admin_list_users(1, 100) ->> 'total')::int, (select count(*)::int from public.profiles where not is_bot), '총계는 봇 제외');

-- 사용자는 is_bot을 바꿀 수 없다
select throws_ok($$ update public.profiles set is_bot = true where id = auth.uid() $$, '42501', null, 'is_bot 수정 불가');
reset role;

-- 방장 넘기기: 봇이 먼저 들어와 있어도 사람에게
insert into public.chat_room_participants (room_id, user_id, joined_at)
values (tests.room_id('bg_group'), tests.uid('bg_bot@test.com'), now() - interval '1 day');
select tests.login_as(tests.uid('bg_me@test.com'));
select public.leave_room(tests.room_id('bg_group'));
reset role;
select is((select created_by from public.chat_rooms where name = 'bg_group'), tests.uid('bg_mate@test.com'), '다음 방장은 사람');

-- 사람이 모두 나가면 봇만 남아도 방 삭제
select tests.login_as(tests.uid('bg_mate@test.com'));
select public.leave_room(tests.room_id('bg_group'));
reset role;
select is((select count(*)::int from public.chat_rooms where name = 'bg_group'), 0, '봇만 남은 방은 삭제');

select * from finish();
rollback;
