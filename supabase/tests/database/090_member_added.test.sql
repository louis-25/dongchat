begin;
select plan(2);

select tests.create_user('ma_alice@test.com', '{"username":"ma_alice"}');
select tests.create_user('ma_bob@test.com', '{"username":"ma_bob"}');

select tests.login_as(tests.uid('ma_alice@test.com'));
select public.create_room('ma_room', true, array['ma_bob']);
reset role;

select ok(
  exists(select 1 from realtime.messages
         where topic = 'user:' || tests.uid('ma_bob@test.com') and event = 'member_added'
           and (payload ->> 'roomId')::bigint = tests.room_id('ma_room')),
  '방에 추가된 사용자의 user 토픽에 member_added');
select is(
  (select payload ->> 'userId' from realtime.messages
   where topic = 'user:' || tests.uid('ma_bob@test.com') and event = 'member_added' limit 1),
  tests.uid('ma_bob@test.com')::text,
  'payload.userId는 추가된 사용자');

select * from finish();
rollback;
