begin;
select plan(17);

select tests.create_user('dave@test.com', '{"username":"dave"}');
select tests.create_user('alice@test.com', '{"username":"alice"}');
select tests.create_user('bob@test.com', '{"username":"bob"}');
insert into private.user_roles values (tests.uid('dave@test.com'), 'ADMIN');

-- 1~3: 비관리자 거부
select tests.login_as(tests.uid('alice@test.com'));
select throws_ok($$ select public.admin_list_users() $$, 'P0001', 'ADMIN_FORBIDDEN', '비관리자 목록 조회 불가');
select throws_ok(format('select public.admin_ban(%L, now() + interval ''1 day'')', tests.uid('bob@test.com')), 'P0001', 'ADMIN_FORBIDDEN', '비관리자 정지 불가');
select throws_ok(format('select public.admin_force_logout(%L)', tests.uid('bob@test.com')), 'P0001', 'ADMIN_FORBIDDEN', '비관리자 강제 로그아웃 불가');
select throws_ok($$ select public.admin_list_rooms() $$, 'P0001', 'ADMIN_FORBIDDEN', '비관리자 방 목록 불가');
select public.create_room('grp', true, array['bob']);
reset role;

-- 4~8: 목록
select tests.login_as(tests.uid('dave@test.com'));
select is((public.admin_list_users(1, 2, 'username', 'asc') ->> 'total')::int, (select count(*)::int from public.profiles where not is_bot), 'total = 봇을 뺀 전체 프로필 수');
select is(jsonb_array_length(public.admin_list_users(1, 2, 'username', 'asc') -> 'items'), 2, 'limit 적용');
select ok((public.admin_list_users(1, 2, 'username', 'asc') -> 'items' -> 0 ->> 'username') < (public.admin_list_users(1, 2, 'username', 'asc') -> 'items' -> 1 ->> 'username'), '정렬 asc');
select is((public.admin_list_users(1, 1000) ->> 'limit')::int, 100, 'limit 상한 100');
select is((public.admin_list_rooms() -> 'items' -> 0 ->> 'memberCount')::int, 2, '방 멤버 수');

-- 9~13: 정지/해제/강제 로그아웃
select throws_ok(format('select public.admin_ban(%L, now() + interval ''1 day'')', tests.uid('dave@test.com')), 'P0001', 'VALIDATION_FAILED', '본인 정지 불가');
select throws_ok(format('select public.admin_ban(%L, now() - interval ''1 day'')', tests.uid('bob@test.com')), 'P0001', 'VALIDATION_FAILED', '과거 시각 정지 불가');
select lives_ok(format('select public.admin_ban(%L, now() + interval ''1 day'', %L)', tests.uid('bob@test.com'), '스팸'), '정지');
select lives_ok(format('select public.admin_force_logout(%L)', tests.uid('alice@test.com')), '강제 로그아웃');
reset role;
select tests.login_as(tests.uid('bob@test.com'));
select is(private.is_active_session(), false, '정지된 사용자 비활성');
reset role;
select tests.login_as(tests.uid('alice@test.com'));
select is(private.is_active_session(), false, '강제 로그아웃된 사용자 비활성');
reset role;
select tests.login_as(tests.uid('dave@test.com'));
select lives_ok(format('select public.admin_unban(%L)', tests.uid('bob@test.com')), '정지 해제');
reset role;
select tests.login_as(tests.uid('bob@test.com'));
select is(private.is_active_session(), true, '해제 후 활성');
reset role;

select * from finish();
rollback;
