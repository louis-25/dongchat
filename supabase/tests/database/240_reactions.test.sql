begin;
select plan(14);

select tests.create_user('rx_me@test.com', '{"username":"rx_me"}');
select tests.create_user('rx_mate@test.com', '{"username":"rx_mate"}');
select tests.create_user('rx_out@test.com', '{"username":"rx_out"}');
select tests.login_as(tests.uid('rx_me@test.com'));
select public.create_room('rx_room', true, array['rx_mate']);
insert into public.messages (room_id, content) values (tests.room_id('rx_room'), '반응해줘');
reset role;
select set_config('tests.msg', (select max(id) from public.messages)::text, true);
select set_config('tests.room', tests.room_id('rx_room')::text, true);

select tests.login_as(tests.uid('rx_mate@test.com'));
select lives_ok(format($$ select public.set_reaction(%s, '❤️') $$, current_setting('tests.msg')), '멤버는 반응');
select lives_ok(format($$ select public.set_reaction(%s, '😂') $$, current_setting('tests.msg')), '다른 반응으로 바꾸기');
select is((select array_agg(reaction) from public.message_reactions where message_id = current_setting('tests.msg')::bigint),
  array['😂'], '한 사람당 하나');
select lives_ok(format($$ select public.set_reaction(%s, '🥹') $$, current_setting('tests.msg')), '목록 밖 이모지도 가능');
select lives_ok(format($$ select public.set_reaction(%s, '👍🏽') $$, current_setting('tests.msg')), '피부색 이모지 가능');
select throws_ok(format($$ select public.set_reaction(%s, 'poop') $$, current_setting('tests.msg')),
  'P0001', 'VALIDATION_FAILED', '영문 거부');
select throws_ok(format($$ select public.set_reaction(%s, '❤️ ') $$, current_setting('tests.msg')),
  'P0001', 'VALIDATION_FAILED', '공백 거부');
select throws_ok(format($$ select public.set_reaction(%s, repeat('😂', 17)) $$, current_setting('tests.msg')),
  'P0001', 'VALIDATION_FAILED', '너무 긴 값 거부');
select public.set_reaction(current_setting('tests.msg')::bigint, '😂');
reset role;

select ok(exists(select 1 from realtime.messages where topic = 'room:' || current_setting('tests.room')
  and event = 'reaction_updated' and payload ->> 'reaction' = '😂'), '방 채널에 reaction_updated');

select tests.login_as(tests.uid('rx_me@test.com'));
select is((select count(*)::int from public.message_reactions), 1, '멤버는 반응을 볼 수 있다');
reset role;

select tests.login_as(tests.uid('rx_out@test.com'));
select is((select count(*)::int from public.message_reactions), 0, '비멤버는 볼 수 없다');
select throws_ok(format($$ select public.set_reaction(%s, '❤️') $$, current_setting('tests.msg')),
  'P0001', 'CHAT_FORBIDDEN', '비멤버는 반응 불가');
reset role;

select tests.login_as(tests.uid('rx_mate@test.com'));
select public.set_reaction(current_setting('tests.msg')::bigint, null);
select is((select count(*)::int from public.message_reactions), 0, 'null이면 취소');
reset role;

select tests.login_as(tests.uid('rx_me@test.com'));
select public.delete_message(current_setting('tests.msg')::bigint);
reset role;
select tests.login_as(tests.uid('rx_mate@test.com'));
select throws_ok(format($$ select public.set_reaction(%s, '❤️') $$, current_setting('tests.msg')),
  'P0001', 'MESSAGE_NOT_FOUND', '삭제된 메시지에는 불가');
reset role;

select * from finish();
rollback;
