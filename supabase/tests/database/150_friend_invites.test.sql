begin;
select plan(22);

select tests.create_user('fi_alice@test.com', '{"username":"fi_alice"}');
select tests.create_user('fi_bob@test.com', '{"username":"fi_bob"}');
select tests.create_user('fi_carol@test.com', '{"username":"fi_carol"}');
select tests.create_user('fi_dave@test.com', '{"username":"fi_dave"}');
select tests.create_user('fi_erin@test.com', '{"username":"fi_erin"}');
select tests.create_user('fi_frank@test.com', '{"username":"fi_frank"}');
select tests.create_user('fi_gina@test.com', '{"username":"fi_gina"}');

-- 코드 생성·재사용
select tests.login_as(tests.uid('fi_alice@test.com'));
select set_config('t.code', public.get_my_invite_code(), true);
select is(public.get_my_invite_code(), current_setting('t.code'), '두 번 받아도 같은 코드');
select ok(current_setting('t.code') ~ '^[A-Za-z0-9_-]{12}$', 'URL 안전 12자');
reset role;

-- 미리보기: 이름·사진만
select tests.login_as(tests.uid('fi_bob@test.com'));
select is((select username from public.preview_invite(current_setting('t.code'))), 'fi_alice', '미리보기 = 초대자');
select is((select count(*)::int from public.preview_invite('nope_nope_00')), 0, '없는 코드 미리보기 0행');
select throws_ok($$ select * from public.accept_invite('nope_nope_00') $$, 'P0001', 'INVITE_NOT_FOUND', '없는 코드 거부');

-- 관계 없음 → 친구
select is((select already from public.accept_invite(current_setting('t.code'))), false, '처음 수락');
reset role;
select is((select status from public.friends where requester_id = tests.uid('fi_alice@test.com') and receiver_id = tests.uid('fi_bob@test.com')), 'ACCEPTED', '친구가 됨');

-- 이미 친구 → already
select tests.login_as(tests.uid('fi_bob@test.com'));
select is((select already from public.accept_invite(current_setting('t.code'))), true, '이미 친구');
select is((select username from public.accept_invite(current_setting('t.code'))), 'fi_alice', '초대자 username 반환');
reset role;

-- 대기 중 요청(수신자→초대자 방향) → ACCEPTED
select tests.login_as(tests.uid('fi_carol@test.com'));
select public.send_friend_request('fi_alice');
select lives_ok(format($$ select * from public.accept_invite(%L) $$, current_setting('t.code')), '대기 중 요청이 있어도 수락');
reset role;
select is((select status from public.friends where requester_id = tests.uid('fi_carol@test.com')), 'ACCEPTED', '대기 중 → ACCEPTED');

-- 대기 중 요청(초대자→수신자 방향) → ACCEPTED
select tests.login_as(tests.uid('fi_alice@test.com'));
select public.send_friend_request('fi_frank');
reset role;
select tests.login_as(tests.uid('fi_frank@test.com'));
select lives_ok(format($$ select * from public.accept_invite(%L) $$, current_setting('t.code')), '반대 방향 대기 중 요청도 수락');
reset role;
select is((select status from public.friends where receiver_id = tests.uid('fi_frank@test.com')), 'ACCEPTED', '반대 방향 대기 중 → ACCEPTED');

-- 초대자가 수신자를 차단(gina→alice 요청을 alice가 차단) → FRIEND_BLOCKED
select tests.login_as(tests.uid('fi_gina@test.com'));
select public.send_friend_request('fi_alice');
reset role;
select tests.login_as(tests.uid('fi_alice@test.com'));
select public.respond_friend_request((select id from public.friends where requester_id = tests.uid('fi_gina@test.com')), 'BLOCK');
reset role;
select tests.login_as(tests.uid('fi_gina@test.com'));
select throws_ok(format($$ select * from public.accept_invite(%L) $$, current_setting('t.code')), 'P0001', 'FRIEND_BLOCKED', '초대자가 차단한 경우 거부');
reset role;

-- 수신자가 초대자를 차단 → FRIEND_BLOCKED
select tests.login_as(tests.uid('fi_alice@test.com'));
select public.send_friend_request('fi_dave');
reset role;
select tests.login_as(tests.uid('fi_dave@test.com'));
select public.respond_friend_request((select id from public.friends where receiver_id = tests.uid('fi_dave@test.com')), 'BLOCK');
select throws_ok(format($$ select * from public.accept_invite(%L) $$, current_setting('t.code')), 'P0001', 'FRIEND_BLOCKED', '차단 관계 거부');
reset role;

-- 본인 코드
select tests.login_as(tests.uid('fi_alice@test.com'));
select throws_ok(format($$ select * from public.accept_invite(%L) $$, current_setting('t.code')), 'P0001', 'FRIEND_SELF_REQUEST', '본인 코드 거부');
-- 재발급 → 예전 코드 무효
select set_config('t.new', public.reset_my_invite_code(), true);
select isnt(current_setting('t.new'), current_setting('t.code'), '재발급하면 새 코드');
reset role;
select tests.login_as(tests.uid('fi_erin@test.com'));
select throws_ok(format($$ select * from public.accept_invite(%L) $$, current_setting('t.code')), 'P0001', 'INVITE_NOT_FOUND', '예전 코드 무효');
reset role;

-- 노출 범위·권한
select ok(not has_table_privilege('authenticated', 'private.friend_invites', 'select'), '코드 테이블 직접 조회 불가');
select is(pg_get_function_result('public.preview_invite(text)'::regprocedure), 'TABLE(username text, nickname text, avatar_url text)', '미리보기는 이름·사진만');
select ok(not has_function_privilege('anon', 'public.accept_invite(text)', 'execute'), 'anon 수락 불가');
insert into private.user_access (user_id, banned_until) values (tests.uid('fi_erin@test.com'), now() + interval '1 day');
select tests.login_as(tests.uid('fi_erin@test.com'));
select throws_ok(format($$ select * from public.accept_invite(%L) $$, current_setting('t.new')), 'P0001', 'AUTH_SESSION_REVOKED', '정지 세션 거부');
reset role;

select * from finish();
rollback;
