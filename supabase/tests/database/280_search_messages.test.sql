begin;
select plan(9);

select tests.create_user('se_me@test.com', '{"username":"se_me","nickname":"나"}');
select tests.create_user('se_mate@test.com', '{"username":"se_mate"}');
select tests.create_user('se_out@test.com', '{"username":"se_out"}');
select tests.login_as(tests.uid('se_me@test.com'));
select public.create_room('se_room', true, array['se_mate']);
insert into public.messages (room_id, content) values
  (tests.room_id('se_room'), '내일 강남역에서 만나'),
  (tests.room_id('se_room'), 'Gangnam 몇 시?'),
  (tests.room_id('se_room'), '할인 100% 쿠폰'),
  (tests.room_id('se_room'), '강남 말고 홍대'),
  (tests.room_id('se_room'), '지울 강남 메시지');
select public.delete_message((select max(id) from public.messages where room_id = tests.room_id('se_room')));
insert into public.messages (room_id, content, sticker) values (tests.room_id('se_room'), '(이모티콘)', 'hi');
reset role;
select set_config('tests.room', tests.room_id('se_room')::text, true);

select tests.login_as(tests.uid('se_mate@test.com'));
select results_eq(format($$ select content from public.search_messages(%s, '강남', null) $$, current_setting('tests.room')),
  $$ values ('강남 말고 홍대'), ('내일 강남역에서 만나') $$, '부분 일치, 최신순, 삭제 제외');
select is((select sender_name from public.search_messages(current_setting('tests.room')::bigint, '홍대', null)), '나', '보낸 사람 이름');
select results_eq(format($$ select content from public.search_messages(%s, 'gangnam', null) $$, current_setting('tests.room')),
  $$ values ('Gangnam 몇 시?') $$, '대소문자 무시');
select results_eq(format($$ select content from public.search_messages(%s, '100%%', null) $$, current_setting('tests.room')),
  $$ values ('할인 100% 쿠폰') $$, '%는 글자 그대로');
select is((select count(*)::int from public.search_messages(current_setting('tests.room')::bigint, '_', null)), 0, '_도 글자 그대로');
select is((select count(*)::int from public.search_messages(current_setting('tests.room')::bigint, '이모티콘', null)), 0, '이모티콘 제외');
select results_eq(format($$ select content from public.search_messages(%s, '강남', (select max(id) from public.messages where content = '강남 말고 홍대')) $$,
  current_setting('tests.room')), $$ values ('내일 강남역에서 만나') $$, 'before_id로 다음 페이지');
select throws_ok($$ select * from public.search_messages(current_setting('tests.room')::bigint, '  ', null) $$,
  'P0001', 'VALIDATION_FAILED', '빈 검색어 거부');
reset role;

select tests.login_as(tests.uid('se_out@test.com'));
select throws_ok($$ select * from public.search_messages(current_setting('tests.room')::bigint, '강남', null) $$,
  'P0001', 'CHAT_FORBIDDEN', '비참여자 거부');
reset role;

select * from finish();
rollback;
