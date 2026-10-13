begin;
select plan(11);

select tests.create_user('alice@test.com', '{"username":"alice"}');
select tests.create_user('bob@test.com', '{"username":"bob"}');
select tests.create_user('eve@test.com', '{"username":"eve"}');

select tests.login_as(tests.uid('alice@test.com'));
select lives_ok($$ select public.send_friend_request(' BOB ') $$, '친구 요청(정규화)');
select throws_ok($$ select public.send_friend_request('alice') $$, 'P0001', 'FRIEND_SELF_REQUEST', '본인 요청 불가');
select throws_ok($$ select public.send_friend_request('ghost') $$, 'P0001', 'FRIEND_USER_NOT_FOUND', '없는 사용자');
select throws_ok($$ select public.send_friend_request('bob') $$, 'P0001', 'FRIEND_DUPLICATE', '중복 요청 불가');
select throws_ok($$ insert into public.friends (requester_id, receiver_id) values (tests.uid('alice@test.com'), tests.uid('eve@test.com')) $$, '42501', null, '직접 INSERT 불가');
select throws_ok($$ select public.respond_friend_request((select id from public.friends limit 1), 'ACCEPT') $$, 'P0001', 'CHAT_FORBIDDEN', '요청자는 수락 불가');
reset role;

select tests.login_as(tests.uid('bob@test.com'));
select throws_ok($$ select public.send_friend_request('alice') $$, 'P0001', 'FRIEND_DUPLICATE', '반대 방향 중복 불가');
select throws_ok($$ select public.respond_friend_request((select id from public.friends limit 1), 'maybe') $$, 'P0001', 'VALIDATION_FAILED', '잘못된 action');
select lives_ok($$ select public.respond_friend_request((select id from public.friends limit 1), 'accept') $$, '수신자 수락');
select is((select status from public.friends limit 1), 'ACCEPTED', '상태 ACCEPTED');
reset role;

select tests.login_as(tests.uid('eve@test.com'));
select is((select count(*)::int from public.friends), 0, '제3자는 친구 관계 안 보임');
reset role;

select * from finish();
rollback;
