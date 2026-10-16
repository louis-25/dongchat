begin;
select plan(7);

select tests.create_user('mu_me@test.com', '{"username":"mu_me"}');
select tests.create_user('mu_mate@test.com', '{"username":"mu_mate"}');
select tests.create_user('mu_out@test.com', '{"username":"mu_out"}');
select tests.login_as(tests.uid('mu_mate@test.com'));
select public.register_push_subscription('https://push.test/mu_mate', 'k', 'a');
reset role;
select tests.login_as(tests.uid('mu_me@test.com'));
select public.create_room('mu_room', true, array['mu_mate']);
reset role;

-- 참여자만, 자기 설정만
select tests.login_as(tests.uid('mu_mate@test.com'));
select is((select muted from public.list_my_rooms() where room_id = tests.room_id('mu_room')), false, '기본은 알림 켜짐');
select lives_ok(format('select public.set_room_muted(%s, true)', tests.room_id('mu_room')), '참여자는 알림 끄기');
select is((select muted from public.list_my_rooms() where room_id = tests.room_id('mu_room')), true, '목록 요약에 내 설정');
reset role;

select tests.login_as(tests.uid('mu_me@test.com'));
select is((select muted from public.list_my_rooms() where room_id = tests.room_id('mu_room')), false, '남의 설정은 내 목록에 영향 없음');
insert into public.messages (room_id, content) values (tests.room_id('mu_room'), '조용');
reset role;

set local role service_role;
select is((select count(*)::int from public.push_targets((select max(id) from public.messages))), 0, '알림 끈 사람은 푸시 대상 제외');
reset role;

select tests.login_as(tests.uid('mu_out@test.com'));
select throws_ok(format('select public.set_room_muted(%s, true)', tests.room_id('mu_room')), 'P0001', 'CHAT_FORBIDDEN', '비참여자 거부');
reset role;

select set_config('tests.mu_room', tests.room_id('mu_room')::text, true);
set local role anon;
select throws_ok(format('select public.set_room_muted(%s, true)', current_setting('tests.mu_room')), '42501', null, 'anon 호출 불가');
reset role;

select * from finish();
rollback;
