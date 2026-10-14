begin;
select plan(3);

select tests.create_user('ab_admin@test.com', '{"username":"ab_admin"}');
select tests.create_user('ab_bob@test.com', '{"username":"ab_bob"}');
insert into private.user_roles (user_id, role) values (tests.uid('ab_admin@test.com'), 'ADMIN');
-- 대시보드 Ban(Auth)만 걸린 상태
update auth.users set banned_until = now() + interval '1 day' where id = tests.uid('ab_bob@test.com');

select tests.login_as(tests.uid('ab_admin@test.com'));
select ok(
  (select (x ->> 'bannedUntil') is not null
   from jsonb_array_elements(public.admin_list_users(1, 100) -> 'items') x
   where x ->> 'id' = tests.uid('ab_bob@test.com')::text),
  '대시보드(Auth) 정지도 목록에 정지로 보인다');
select lives_ok(format('select public.admin_unban(%L)', tests.uid('ab_bob@test.com')), '해제');
reset role;
select is((select banned_until from auth.users where id = tests.uid('ab_bob@test.com')), null, '해제는 Auth 정지도 지운다');

select * from finish();
rollback;
