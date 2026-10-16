begin;
select plan(9);

select tests.create_user('im_me@test.com', '{"username":"im_me"}');
select tests.create_user('im_mate@test.com', '{"username":"im_mate"}');
select tests.create_user('im_out@test.com', '{"username":"im_out"}');
select tests.login_as(tests.uid('im_me@test.com'));
select public.create_room('im_room', true, array['im_mate']);
select public.create_room('im_other', true, array['im_out']);
reset role;
select set_config('tests.room', tests.room_id('im_room')::text, true);
select set_config('tests.other', tests.room_id('im_other')::text, true);
select set_config('tests.path', current_setting('tests.room') || '/11111111-1111-4111-8111-111111111111.jpg', true);

select ok(not (select public from storage.buckets where id = 'chat-images'), 'chat-images는 비공개 버킷');

-- 업로드: 방 멤버만
select tests.login_as(tests.uid('im_me@test.com'));
select lives_ok(format($$ insert into storage.objects (bucket_id, name, owner_id) values ('chat-images', %L, %L) $$,
  current_setting('tests.path'), tests.uid('im_me@test.com')), '멤버는 방 폴더에 업로드');
reset role;
select tests.login_as(tests.uid('im_out@test.com'));
select throws_ok(format($$ insert into storage.objects (bucket_id, name) values ('chat-images', '%s/22222222-2222-4222-8222-222222222222.jpg') $$,
  current_setting('tests.room')), '42501', null, '비멤버는 업로드 불가');
-- 읽기: 방 멤버만
select is((select count(*)::int from storage.objects where bucket_id = 'chat-images'), 0, '비멤버는 사진을 볼 수 없다');
reset role;
select tests.login_as(tests.uid('im_mate@test.com'));
select is((select count(*)::int from storage.objects where bucket_id = 'chat-images' and name = current_setting('tests.path')), 1, '멤버는 볼 수 있다');
reset role;

-- 메시지: 경로의 방 = 메시지의 방, 수정 불가, Realtime에 imagePath
select tests.login_as(tests.uid('im_me@test.com'));
select lives_ok(format($$ insert into public.messages (room_id, content, image_path) values (%s, '(사진)', %L) $$,
  current_setting('tests.room'), current_setting('tests.path')), '사진 메시지 전송');
select throws_ok(format($$ insert into public.messages (room_id, content, image_path) values (%s, '(사진)', %L) $$,
  current_setting('tests.other'), current_setting('tests.path')), '23514', null, '다른 방 경로는 거부');
select throws_ok($$ select public.edit_message((select id from public.messages where image_path is not null limit 1), '고침') $$,
  'P0001', 'VALIDATION_FAILED', '사진은 수정 불가');
reset role;
select ok(exists(select 1 from realtime.messages where topic = 'room:' || current_setting('tests.room')
  and event = 'message' and payload ->> 'imagePath' = current_setting('tests.path')), 'Realtime message에 imagePath');

select * from finish();
rollback;
