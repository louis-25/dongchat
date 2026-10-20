begin;
select plan(14);

select tests.create_user('sy_me@test.com', '{"username":"sy_me","nickname":"나"}');
select tests.create_user('sy_mate@test.com', '{"username":"sy_mate"}');
select tests.create_user('sy_new@test.com', '{"username":"sy_new"}');
select tests.create_user('sy_new2@test.com', '{"username":"sy_new2"}');
select tests.login_as(tests.uid('sy_mate@test.com'));
select public.register_push_subscription('https://push.test/sy_mate', 'k', 'a');
reset role;
select tests.login_as(tests.uid('sy_me@test.com'));
select public.create_room('sy_group', true, array['sy_mate']);
select public.create_room('', false, array['sy_mate']);
reset role;
select set_config('tests.group', tests.room_id('sy_group')::text, true);
select set_config('tests.direct', (select max(id) from public.chat_rooms)::text, true);

create temp view sys as
  select content, sender_id from public.messages
  where room_id = current_setting('tests.group')::bigint and kind = 'system' order by id;

select is((select count(*)::int from sys), 0, '방을 만들 때는 안내 없음');

-- 초대: 실제로 추가된 사람만 한 줄에
select tests.login_as(tests.uid('sy_me@test.com'));
select public.invite_to_room(current_setting('tests.group')::bigint, array['sy_new', 'sy_new2', 'sy_mate']);
reset role;
select is((select content from sys), '나님이 sy_new, sy_new2님을 초대했어요', '초대 안내(이미 있는 사람 제외)');
select is((select sender_id from sys), null, '보낸 사람 없음');
select ok(exists(select 1 from realtime.messages where topic = 'room:' || current_setting('tests.group')
  and event = 'message' and payload ->> 'kind' = 'system'), 'Realtime 이벤트에 kind');

-- 강퇴·나가기
select tests.login_as(tests.uid('sy_me@test.com'));
select public.kick_member(current_setting('tests.group')::bigint, tests.uid('sy_new2@test.com'));
reset role;
select tests.login_as(tests.uid('sy_new@test.com'));
select public.leave_room(current_setting('tests.group')::bigint);
reset role;
select results_eq('select content from sys offset 1',
  $$ values ('나님이 sy_new2님을 내보냈어요'), ('sy_new님이 나갔어요') $$, '강퇴·나가기 안내');

-- 1:1방 나가기는 안내 없음
select tests.login_as(tests.uid('sy_mate@test.com'));
select public.leave_room(current_setting('tests.direct')::bigint);
reset role;
select is((select count(*)::int from public.messages where room_id = current_setting('tests.direct')::bigint), 0, '1:1방은 안내 없음');

-- 안 읽은 수·푸시 대상에서 제외
select tests.login_as(tests.uid('sy_mate@test.com'));
select is((select unread_count from public.list_my_rooms() where room_id = current_setting('tests.group')::bigint), 0,
  '안내는 안 읽은 수에 안 셈');
select is((select last_message_content from public.list_my_rooms() where room_id = current_setting('tests.group')::bigint),
  'sy_new님이 나갔어요', '방 목록 미리보기에는 보임');
reset role;
set local role service_role;
select is((select count(*)::int from public.push_targets(
  (select max(id) from public.messages where room_id = current_setting('tests.group')::bigint))), 0, '안내는 푸시 대상 없음');
reset role;

-- 사용자가 직접 만들거나 고칠 수 없다
select tests.login_as(tests.uid('sy_mate@test.com'));
select throws_ok(format($$ insert into public.messages (room_id, content, kind) values (%s, '가짜', 'system') $$,
  current_setting('tests.group')), '42501', null, 'kind는 직접 넣을 수 없다');
select throws_ok($$ select public.edit_message((select max(id) from public.messages where kind = 'system'), '고침') $$,
  'P0001', null, '안내는 수정 불가');
select throws_ok($$ select public.delete_message((select max(id) from public.messages where kind = 'system')) $$,
  'P0001', null, '안내는 삭제 불가');
reset role;
select is((select count(*)::int from public.messages where kind = 'system' and deleted_at is not null), 0, '그대로 남음');
select is((select count(*)::int from public.messages where room_id = current_setting('tests.group')::bigint and kind = 'user'), 0,
  '일반 메시지는 없었다');

select * from finish();
rollback;
