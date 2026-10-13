begin;
select plan(24);

-- 사용자 준비 (postgres 권한)
select tests.create_user('alice@test.com', '{"username":"  Alice "}');
select tests.create_user('weird@test.com', '{"username":"no!"}');
select tests.create_user('kakao@test.com', '{"name":"카카오유저","avatar_url":"https://img/k.png"}', 'kakao');
select tests.create_user('bob@test.com', '{"username":"bob"}');

-- 1~4: 가입 트리거
select is((select username from public.profiles where id = tests.uid('alice@test.com')), 'alice', '공백·대문자 username은 정규화된다');
select matches((select username from public.profiles where id = tests.uid('weird@test.com')), '^user_[0-9a-f]{8}$', '형식 불일치 username은 user_xxxxxxxx로 대체');
select matches((select username from public.profiles where id = tests.uid('kakao@test.com')), '^kakao_[0-9a-f]{8}$', '카카오는 kakao_xxxxxxxx');
select is((select nickname from public.profiles where id = tests.uid('kakao@test.com')), '카카오유저', '카카오 이름은 nickname');

-- 5~7: is_username_available (Review Focus 2)
select is(public.is_username_available('  ALICE '), false, '정규화 후 중복이면 false');
select is(public.is_username_available('new_user'), true, '미사용 username은 true');
select is(public.is_username_available('a!'), false, '형식 불일치는 false');

-- 8: anon은 profiles 접근 불가, 함수는 호출 가능
set local role anon;
select throws_ok($$ select count(*) from public.profiles $$, '42501', null, 'anon은 profiles 조회 불가');
select is(public.is_username_available('another'), true, 'anon도 username 확인 가능');
reset role;

-- 10~14: 로그인 사용자
select tests.login_as(tests.uid('alice@test.com'));
select is(private.is_active_session(), true, '정상 세션은 활성');
select is((select count(*)::int from public.profiles where id in (tests.uid('alice@test.com'), tests.uid('weird@test.com'), tests.uid('kakao@test.com'), tests.uid('bob@test.com'))), 4, '로그인 사용자는 타인 프로필도 조회');
select lives_ok($$ update public.profiles set nickname = '앨리스' where id = tests.uid('alice@test.com') $$, '본인 nickname 수정');
select throws_ok($$ update public.profiles set username = 'hacker' where id = tests.uid('alice@test.com') $$, '42501', null, 'username 수정 불가(컬럼 권한)');
update public.profiles set nickname = 'pwned' where id = tests.uid('bob@test.com');
reset role;
select isnt((select nickname from public.profiles where id = tests.uid('bob@test.com')), 'pwned', '타인 프로필 수정은 0행');

-- 15~16: private 접근 불가 / 관리자 판정
select tests.login_as(tests.uid('alice@test.com'));
select throws_ok($$ select * from private.user_roles $$, '42501', null, 'private.user_roles 직접 조회 불가');
select is(private.is_admin(), false, '일반 사용자는 관리자 아님');
reset role;
insert into private.user_roles (user_id, role) values (tests.uid('alice@test.com'), 'ADMIN');
select tests.login_as(tests.uid('alice@test.com'));
select is(private.is_admin(), true, 'user_roles ADMIN이면 관리자');
reset role;

-- 18~22: is_active_session 차단 경로
insert into private.user_access (user_id, banned_until) values (tests.uid('bob@test.com'), now() + interval '1 day');
select tests.login_as(tests.uid('bob@test.com'));
select is(private.is_active_session(), false, 'user_access 정지 중이면 비활성');
select is((select count(*)::int from public.profiles where id = tests.uid('alice@test.com')), 0, '비활성 세션은 프로필도 0행');
reset role;
update private.user_access set banned_until = now() - interval '1 minute' where user_id = tests.uid('bob@test.com');
select tests.login_as(tests.uid('bob@test.com'));
select is(private.is_active_session(), true, '정지 만료 후 복귀 (Review Focus 5)');
reset role;
update private.user_access set sessions_revoked_at = now() where user_id = tests.uid('bob@test.com');
select tests.login_as(tests.uid('bob@test.com'), now() - interval '1 minute');
select is(private.is_active_session(), false, '강제 로그아웃 이전 발급 토큰은 비활성');
reset role;
select tests.login_as(tests.uid('bob@test.com'), now() + interval '1 minute');
select is(private.is_active_session(), true, '강제 로그아웃 이후 발급 토큰은 활성');
reset role;

-- 23~24: 세션 삭제(Studio) / 대시보드 Ban
delete from auth.sessions where user_id = tests.uid('alice@test.com');
select tests.login_as(tests.uid('alice@test.com'));
select is(private.is_active_session(), false, 'auth.sessions 행 삭제 시 즉시 비활성');
reset role;
update auth.users set banned_until = now() + interval '1 day' where id = tests.uid('kakao@test.com');
select tests.login_as(tests.uid('kakao@test.com'));
select is(private.is_active_session(), false, 'auth.users.banned_until(대시보드 Ban)도 존중');
reset role;

select * from finish();
rollback;
