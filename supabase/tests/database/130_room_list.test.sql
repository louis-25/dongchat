begin;
select plan(12);

select tests.create_user('rl_alice@test.com', '{"username":"rl_alice"}');
select tests.create_user('rl_bob@test.com', '{"username":"rl_bob"}');
select tests.create_user('rl_carol@test.com', '{"username":"rl_carol"}');

select tests.login_as(tests.uid('rl_alice@test.com'));
select public.create_room('rl_dm', false, array['rl_bob']);
select public.create_room('rl_grp', true, array['rl_bob', 'rl_carol']);
select public.create_room('rl_empty', true, array['rl_carol']);
reset role;
select tests.login_as(tests.uid('rl_carol@test.com'));
select public.create_room('rl_other', false, array['rl_bob']);
reset role;

-- 메시지: dm(bob b1, bob b2, alice a1), grp(carol c1 → 삭제)
select tests.login_as(tests.uid('rl_bob@test.com'));
insert into public.messages (room_id, content) values (tests.room_id('rl_dm'), 'b1'), (tests.room_id('rl_dm'), 'b2');
reset role;
select tests.login_as(tests.uid('rl_alice@test.com'));
insert into public.messages (room_id, content) values (tests.room_id('rl_dm'), 'a1');
reset role;
select tests.login_as(tests.uid('rl_carol@test.com'));
insert into public.messages (room_id, content) values (tests.room_id('rl_grp'), 'c1');
reset role;
update public.messages set deleted_at = now(), content = '' where content = 'c1';

-- 같은 트랜잭션의 now()는 같으므로 시각을 직접 정한다: grp(10분 전) > dm(1시간 전) > empty(생성 2시간 전)
update public.messages set created_at = now() - interval '1 hour' where room_id = tests.room_id('rl_dm');
update public.messages set created_at = now() - interval '10 minutes' where room_id = tests.room_id('rl_grp');
update public.chat_rooms set created_at = now() - interval '2 hours' where id = tests.room_id('rl_empty');

select tests.login_as(tests.uid('rl_alice@test.com'));
select is((select count(*)::int from public.list_my_rooms()), 3, '참여 방만 3개');
select ok(not exists (select 1 from public.list_my_rooms() where name = 'rl_other'), '남의 방 제외');
select is(array(select name from public.list_my_rooms()), array['rl_grp', 'rl_dm', 'rl_empty'], '최근 활동 순');
select is((select unread_count from public.list_my_rooms() where name = 'rl_dm'), 2, '안 읽은 수: 내 메시지 제외');
select is((select last_message_content from public.list_my_rooms() where name = 'rl_dm'), 'a1', '마지막 메시지');
select is((select member_count from public.list_my_rooms() where name = 'rl_grp'), 3, '인원 수');
select ok((select last_message_deleted and last_message_content is null from public.list_my_rooms() where name = 'rl_grp'), '삭제된 마지막 메시지는 내용 없음');
select is((select unread_count from public.list_my_rooms() where name = 'rl_grp'), 0, '삭제된 메시지는 안 읽은 수 제외');
select ok((select last_message_id is null and unread_count = 0 from public.list_my_rooms() where name = 'rl_empty'), '메시지 없는 방');
reset role;

-- 읽음 위치 반영: b1까지 읽음 → 1
update public.chat_room_participants set last_read_message_id = (select id from public.messages where content = 'b1')
where room_id = tests.room_id('rl_dm') and user_id = tests.uid('rl_alice@test.com');
select tests.login_as(tests.uid('rl_alice@test.com'));
select is((select unread_count from public.list_my_rooms() where name = 'rl_dm'), 1, '읽음 위치 이후만 셈');
reset role;

-- 정지 세션 거부, anon 실행 불가
insert into private.user_access (user_id, banned_until) values (tests.uid('rl_alice@test.com'), now() + interval '1 day');
select tests.login_as(tests.uid('rl_alice@test.com'));
select throws_ok($$ select * from public.list_my_rooms() $$, 'P0001', 'AUTH_SESSION_REVOKED', '정지 세션 거부');
reset role;
select ok(not has_function_privilege('anon', 'public.list_my_rooms()', 'execute'), 'anon 실행 불가');

select * from finish();
rollback;
