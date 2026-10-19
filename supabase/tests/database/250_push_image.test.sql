begin;
select plan(2);

select tests.create_user('pi_me@test.com', '{"username":"pi_me"}');
select tests.create_user('pi_mate@test.com', '{"username":"pi_mate"}');
select tests.login_as(tests.uid('pi_mate@test.com'));
select public.register_push_subscription('https://push.test/pi_mate', 'k', 'a');
reset role;
select tests.login_as(tests.uid('pi_me@test.com'));
select public.create_room('pi_room', true, array['pi_mate']);
select set_config('tests.path', tests.room_id('pi_room') || '/33333333-3333-4333-8333-333333333333.jpg', true);
insert into public.messages (room_id, content, image_path) values (tests.room_id('pi_room'), '(사진)', current_setting('tests.path'));
insert into public.messages (room_id, content) values (tests.room_id('pi_room'), '글');
reset role;

-- 푸시 대상에 사진 경로(함수가 서명 URL을 만든다)
set local role service_role;
select is((select image_path from public.push_targets((select max(id) - 1 from public.messages))),
  current_setting('tests.path'), '사진 메시지는 경로를 준다');
select is((select image_path from public.push_targets((select max(id) from public.messages))), null, '글 메시지는 null');
reset role;

select * from finish();
rollback;
