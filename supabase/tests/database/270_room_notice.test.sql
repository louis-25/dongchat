begin;
select plan(12);

select tests.create_user('no_me@test.com', '{"username":"no_me","nickname":"나"}');
select tests.create_user('no_mate@test.com', '{"username":"no_mate"}');
select tests.create_user('no_out@test.com', '{"username":"no_out"}');
select tests.login_as(tests.uid('no_me@test.com'));
select public.create_room('no_group', true, array['no_mate']);
select public.create_room('no_other', true, array['no_out']);
insert into public.messages (room_id, content) values (tests.room_id('no_group'), '모임 장소: 강남역 2번 출구');
insert into public.messages (room_id, content, sticker) values (tests.room_id('no_group'), '(이모티콘)', 'hi');
insert into public.messages (room_id, content) values (tests.room_id('no_other'), '다른 방');
reset role;
select set_config('tests.room', tests.room_id('no_group')::text, true);
select set_config('tests.msg', (select min(id) from public.messages where room_id = tests.room_id('no_group'))::text, true);
select set_config('tests.sticker', (select max(id) from public.messages where room_id = tests.room_id('no_group'))::text, true);
select set_config('tests.other_msg', (select max(id) from public.messages where room_id = tests.room_id('no_other'))::text, true);

-- 참여자 누구나 등록
select tests.login_as(tests.uid('no_mate@test.com'));
select lives_ok(format('select public.set_room_notice(%s, %s)', current_setting('tests.room'), current_setting('tests.msg')), '참여자는 공지 등록');
reset role;
select is((select notice_message_id from public.chat_rooms where id = current_setting('tests.room')::bigint),
  current_setting('tests.msg')::bigint, '공지가 걸렸다');
select is((select content from public.messages where room_id = current_setting('tests.room')::bigint and kind = 'system' order by id desc limit 1),
  'no_mate님이 공지를 등록했어요', '등록 안내');
select ok(exists(select 1 from realtime.messages where topic = 'room:' || current_setting('tests.room') and event = 'notice_updated'),
  '방 채널에 notice_updated');

-- 거부: 비참여자, 다른 방 메시지, 이모티콘
select tests.login_as(tests.uid('no_out@test.com'));
select throws_ok(format('select public.set_room_notice(%s, %s)', current_setting('tests.room'), current_setting('tests.msg')),
  'P0001', 'CHAT_FORBIDDEN', '비참여자 거부');
reset role;
select tests.login_as(tests.uid('no_me@test.com'));
select throws_ok(format('select public.set_room_notice(%s, %s)', current_setting('tests.room'), current_setting('tests.other_msg')),
  'P0001', 'MESSAGE_NOT_FOUND', '다른 방 메시지 거부');
select throws_ok(format('select public.set_room_notice(%s, %s)', current_setting('tests.room'), current_setting('tests.sticker')),
  'P0001', 'VALIDATION_FAILED', '글 메시지만');

-- 내리기
select lives_ok(format('select public.set_room_notice(%s, null)', current_setting('tests.room')), '공지 내리기');
reset role;
select is((select notice_message_id from public.chat_rooms where id = current_setting('tests.room')::bigint), null, '내려갔다');
select is((select content from public.messages where room_id = current_setting('tests.room')::bigint and kind = 'system' order by id desc limit 1),
  '나님이 공지를 내렸어요', '내리기 안내');

-- 공지 메시지를 지우면 공지도 내려간다
select tests.login_as(tests.uid('no_me@test.com'));
select public.set_room_notice(current_setting('tests.room')::bigint, current_setting('tests.msg')::bigint);
select public.delete_message(current_setting('tests.msg')::bigint);
reset role;
select is((select notice_message_id from public.chat_rooms where id = current_setting('tests.room')::bigint), null, '삭제하면 공지도 내려감');

set local role anon;
select throws_ok(format('select public.set_room_notice(%s, null)', current_setting('tests.room')), '42501', null, 'anon 호출 불가');
reset role;

select * from finish();
rollback;
