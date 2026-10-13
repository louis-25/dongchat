begin;
select plan(5);

select tests.create_user('me@test.com', '{"username":"me_user","nickname":"미"}');
select tests.create_user('boss@test.com', '{"username":"boss"}');
insert into private.user_roles values (tests.uid('boss@test.com'), 'ADMIN');

select tests.login_as(tests.uid('me@test.com'));
select is(public.get_me() ->> 'username', 'me_user', 'get_me는 본인 username');
select is((public.get_me() ->> 'isAdmin')::boolean, false, '일반 사용자는 isAdmin=false');
reset role;

select tests.login_as(tests.uid('boss@test.com'));
select is((public.get_me() ->> 'isAdmin')::boolean, true, '관리자는 isAdmin=true');
reset role;

set local role anon;
select throws_ok($$ select public.get_me() $$, '42501', null, 'anon은 호출 불가');
reset role;

insert into private.user_access (user_id, sessions_revoked_at) values (tests.uid('me@test.com'), now());
select tests.login_as(tests.uid('me@test.com'));
select throws_ok($$ select public.get_me() $$, 'P0001', 'AUTH_SESSION_REVOKED', '강제 로그아웃 후 거부');
reset role;

select * from finish();
rollback;
