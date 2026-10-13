begin;
select plan(21);

select tests.create_user('alice@test.com', '{"username":"alice"}');
select tests.create_user('bob@test.com', '{"username":"bob"}');
select tests.create_user('dave@test.com', '{"username":"dave"}');
select tests.create_user('eve@test.com', '{"username":"eve"}');
insert into private.user_roles values (tests.uid('dave@test.com'), 'ADMIN');

select tests.login_as(tests.uid('alice@test.com'));
select public.create_room('dm', false, array['bob']);
select public.create_room('other', false, array['eve']);
reset role;

-- 1~6: INSERT 규칙
select tests.login_as(tests.uid('alice@test.com'));
select lives_ok(format($$ insert into public.messages (room_id, content) values (%s, 'hi') $$, tests.room_id('dm')), '멤버는 메시지 전송');
select is((select sender_id from public.messages where content = 'hi'), tests.uid('alice@test.com'), 'sender_id는 auth.uid() 기본값');
select throws_ok(format($$ insert into public.messages (room_id, content, sender_id) values (%s, 'spoof', %L) $$, tests.room_id('dm'), tests.uid('bob@test.com')), '42501', null, 'sender_id 지정 불가(컬럼 권한)');
select throws_ok(format($$ insert into public.messages (room_id, content) values (%s, '') $$, tests.room_id('dm')), '23514', null, '빈 메시지 불가');
insert into public.messages (room_id, content) values (tests.room_id('other'), 'other-room');
select throws_ok(format($$ insert into public.messages (room_id, content, reply_to_id) values (%s, 'x', %s) $$, tests.room_id('dm'), (select id from public.messages where content = 'other-room')), '42501', null, '다른 방 메시지에 답장 불가');
select lives_ok(format($$ insert into public.messages (room_id, content, reply_to_id) values (%s, 'reply', %s) $$, tests.room_id('dm'), (select id from public.messages where content = 'hi')), '같은 방 답장 가능');
reset role;

-- 7~8: 비멤버
select tests.login_as(tests.uid('eve@test.com'));
select throws_ok(format($$ insert into public.messages (room_id, content) values (%s, 'intrude') $$, tests.room_id('dm')), '42501', null, '비멤버 전송 불가');
select is((select count(*)::int from public.messages where room_id = tests.room_id('dm')), 0, '비멤버는 메시지 0개');
reset role;

-- 9~11: 관리자 열람만 (Review Focus 4)
select tests.login_as(tests.uid('dave@test.com'));
select is((select count(*)::int from public.messages where room_id = tests.room_id('dm')), 2, '관리자는 메시지 열람');
select throws_ok(format($$ insert into public.messages (room_id, content) values (%s, 'admin') $$, tests.room_id('dm')), '42501', null, '관리자도 비멤버면 전송 불가');
select throws_ok(format('select public.mark_read(%s)', tests.room_id('dm')), 'P0001', 'CHAT_FORBIDDEN', '관리자 열람은 읽음 처리 안 됨');
reset role;

-- 12~16: 수정·삭제
select tests.login_as(tests.uid('bob@test.com'));
select throws_ok(format('select public.edit_message(%s, %L)', (select id from public.messages where content = 'hi'), 'hack'), 'P0001', 'CHAT_FORBIDDEN', '타인 메시지 수정 불가');
reset role;
select tests.login_as(tests.uid('alice@test.com'));
select throws_ok(format('select public.edit_message(%s, %L)', (select id from public.messages where content = 'hi'), ''), 'P0001', 'VALIDATION_FAILED', '빈 내용으로 수정 불가');
select lives_ok(format('select public.edit_message(%s, %L)', (select id from public.messages where content = 'hi'), 'hello'), '본인 메시지 수정');
select ok((select edited_at is not null from public.messages where content = 'hello'), 'edited_at 기록');
select lives_ok(format('select public.delete_message(%s)', (select id from public.messages where content = 'hello')), '본인 메시지 삭제');
reset role;
select is((select content from public.messages where deleted_at is not null), '', '삭제 시 content 마스킹');
select tests.login_as(tests.uid('alice@test.com'));
select throws_ok(format('select public.edit_message(%s, %L)', (select id from public.messages where deleted_at is not null), 'revive'), 'P0001', 'MESSAGE_NOT_FOUND', '삭제된 메시지 수정 불가');
select throws_ok(format($$ update public.messages set content = 'x' where room_id = %s $$, tests.room_id('dm')), '42501', null, '메시지 직접 UPDATE 불가');
reset role;

-- 19~20: 읽음
select tests.login_as(tests.uid('bob@test.com'));
select is(public.mark_read(tests.room_id('dm')), (select max(id) from public.messages where room_id = tests.room_id('dm')), 'mark_read는 최신 id');
select is(public.mark_read(tests.room_id('dm')), (select max(id) from public.messages where room_id = tests.room_id('dm')), '반복 호출해도 단조(값 유지)');
reset role;

select * from finish();
rollback;
