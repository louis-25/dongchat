begin;
select plan(5);

select tests.create_user('me@test.com', '{"username":"me_user"}');
select tests.create_user('mate@test.com', '{"username":"mate"}');
select tests.login_as(tests.uid('me@test.com'));
select public.create_room('grp', true, array['mate']);

select lives_ok(format($$ insert into public.messages (room_id, content, sticker) values (%s, '(이모티콘)', 'hi') $$, tests.room_id('grp')),
  '이모티콘 메시지 전송');
select throws_ok(format($$ insert into public.messages (room_id, content, sticker) values (%s, '(이모티콘)', 'Bad Id!') $$, tests.room_id('grp')),
  '23514', null, '잘못된 이모티콘 id 거부');
select throws_ok(format($$ select public.edit_message((select id from public.messages where sticker = 'hi'), '고침') $$),
  'P0001', 'VALIDATION_FAILED', '이모티콘은 수정 불가');
reset role;

select ok(exists(select 1 from realtime.messages where topic = 'room:' || tests.room_id('grp')
  and event = 'message' and payload ->> 'sticker' = 'hi'), 'Realtime message에 sticker 포함');
select is((select content from public.messages where sticker = 'hi'), '(이모티콘)', '알림·목록 미리보기용 content');

select * from finish();
rollback;
