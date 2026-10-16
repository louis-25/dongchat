begin;
select plan(3);

select tests.create_user('sp_me@test.com', '{"username":"sp_me"}');
select tests.create_user('sp_mate@test.com', '{"username":"sp_mate"}');
select tests.login_as(tests.uid('sp_mate@test.com'));
select public.register_push_subscription('https://push.test/sp_mate', 'k', 'a');
reset role;
select tests.login_as(tests.uid('sp_me@test.com'));
select public.create_room('sp_room', true, array['sp_mate']);
insert into public.messages (room_id, content, sticker) values (tests.room_id('sp_room'), '(이모티콘)', 'love');

select is((select last_message_sticker from public.list_my_rooms() where room_id = tests.room_id('sp_room')), 'love',
  '방 목록 요약에 마지막 메시지 이모티콘');
reset role;

set local role service_role;
select is((select sticker from public.push_targets((select max(id) from public.messages))), 'love', '푸시 대상에 이모티콘');
select is((select body from public.push_targets((select max(id) from public.messages))), '(이모티콘)', '본문은 그대로(이미지 미지원 브라우저용)');
reset role;

select * from finish();
rollback;
