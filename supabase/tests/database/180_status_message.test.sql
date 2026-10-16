begin;
select plan(5);

select tests.create_user('me@test.com', '{"username":"me_user"}');
select tests.create_user('mate@test.com', '{"username":"mate"}');
select tests.create_user('other@test.com', '{"username":"other_user"}');
select tests.login_as(tests.uid('me@test.com'));
select public.create_room('grp', true, array['mate']);

select lives_ok($$ update public.profiles set status_message = '오늘도 화이팅' where id = auth.uid() $$, '본인 상태 메시지 수정');
select is(public.get_me() ->> 'statusMessage', '오늘도 화이팅', 'get_me에 statusMessage');
select throws_ok($$ update public.profiles set status_message = repeat('가', 61) where id = auth.uid() $$, '23514', null, '61자 이상 거부');
update public.profiles set status_message = '바꿈' where id = tests.uid('other@test.com');
reset role;

select is((select status_message from public.profiles where id = tests.uid('other@test.com')), null, '남의 상태 메시지는 못 바꾼다');
select ok(exists(select 1 from realtime.messages where topic = 'user:' || tests.uid('mate@test.com')
  and event = 'profile_updated' and payload ->> 'statusMessage' = '오늘도 화이팅'), '같은 방 사람에게 실시간 송출');

select * from finish();
rollback;
