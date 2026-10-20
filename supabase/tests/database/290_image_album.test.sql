begin;
select plan(7);

select tests.create_user('al_me@test.com', '{"username":"al_me"}');
select tests.create_user('al_mate@test.com', '{"username":"al_mate"}');
select tests.login_as(tests.uid('al_me@test.com'));
select public.create_room('al_room', true, array['al_mate']);
select public.create_room('al_other', true, array['al_mate']);
reset role;
select set_config('tests.room', tests.room_id('al_room')::text, true);
select set_config('tests.other', tests.room_id('al_other')::text, true);
select set_config('tests.p1', current_setting('tests.room') || '/11111111-1111-4111-8111-111111111111.jpg', true);
select set_config('tests.p2', current_setting('tests.room') || '/22222222-2222-4222-8222-222222222222.jpg', true);
select set_config('tests.px', current_setting('tests.other') || '/33333333-3333-4333-8333-333333333333.jpg', true);

select tests.login_as(tests.uid('al_me@test.com'));
select lives_ok(format($$ insert into public.messages (room_id, content, image_path, image_paths) values (%s, '(사진 2장)', %L, array[%L, %L]) $$,
  current_setting('tests.room'), current_setting('tests.p1'), current_setting('tests.p1'), current_setting('tests.p2')), '여러 장 전송');
select throws_ok(format($$ insert into public.messages (room_id, content, image_path, image_paths) values (%s, '(사진 2장)', %L, array[%L, %L]) $$,
  current_setting('tests.room'), current_setting('tests.p2'), current_setting('tests.p1'), current_setting('tests.p2')), '23514', null, 'image_path는 첫 장');
select throws_ok(format($$ insert into public.messages (room_id, content, image_path, image_paths) values (%s, '(사진 2장)', %L, array[%L, %L]) $$,
  current_setting('tests.room'), current_setting('tests.p1'), current_setting('tests.p1'), current_setting('tests.px')), '23514', null, '다른 방 경로 거부');
select throws_ok(format($$ insert into public.messages (room_id, content, image_path, image_paths) values (%s, '(사진)', %L, array_fill(%L::text, array[11])) $$,
  current_setting('tests.room'), current_setting('tests.p1'), current_setting('tests.p1')), '23514', null, '10장까지');
select lives_ok(format($$ insert into public.messages (room_id, content, image_path) values (%s, '(사진)', %L) $$,
  current_setting('tests.room'), current_setting('tests.p1')), '예전 앱(한 장, image_paths 없음)도 그대로');
reset role;

select ok(exists(select 1 from realtime.messages where topic = 'room:' || current_setting('tests.room')
  and event = 'message' and payload -> 'imagePaths' = jsonb_build_array(current_setting('tests.p1'), current_setting('tests.p2'))),
  'Realtime 이벤트에 imagePaths');
select is((select count(*)::int from public.messages where image_path is not null and image_paths is null
  and created_at < now() - interval '1 second'), 0, '기존 사진 메시지는 채워져 있다');

select * from finish();
rollback;
