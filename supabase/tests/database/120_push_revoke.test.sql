begin;
select plan(3);

select tests.create_user('pr_a@test.com', '{"username":"pr_a"}');
select tests.create_user('pr_b@test.com', '{"username":"pr_b"}');
select tests.login_as(tests.uid('pr_a@test.com'));
select public.register_push_subscription('https://fcm.googleapis.com/pr_a1', 'k', 'a');
select public.register_push_subscription('https://fcm.googleapis.com/pr_a2', 'k', 'a');
reset role;
select tests.login_as(tests.uid('pr_b@test.com'));
select public.register_push_subscription('https://fcm.googleapis.com/pr_b', 'k', 'a');
reset role;

-- 강제 로그아웃(분실 기기 등): 그 사용자의 모든 기기 구독 삭제
insert into private.user_access (user_id, sessions_revoked_at) values (tests.uid('pr_a@test.com'), now());
select is((select count(*)::int from public.push_subscriptions where user_id = tests.uid('pr_a@test.com')), 0, '강제 로그아웃 시 구독 삭제');

-- 정지: 구독 삭제
insert into private.user_access (user_id, banned_until) values (tests.uid('pr_b@test.com'), now() + interval '1 day');
select is((select count(*)::int from public.push_subscriptions where user_id = tests.uid('pr_b@test.com')), 0, '정지 시 구독 삭제');

-- 해제 후 다시 켠 구독은 관련 없는 변경(사유 수정)으로 지워지지 않는다
update private.user_access set banned_until = null where user_id = tests.uid('pr_b@test.com');
select tests.login_as(tests.uid('pr_b@test.com'));
select public.register_push_subscription('https://fcm.googleapis.com/pr_b', 'k', 'a');
reset role;
update private.user_access set reason = '메모' where user_id = tests.uid('pr_b@test.com');
select is((select count(*)::int from public.push_subscriptions where user_id = tests.uid('pr_b@test.com')), 1, '관련 없는 변경은 구독 유지');

select * from finish();
rollback;
