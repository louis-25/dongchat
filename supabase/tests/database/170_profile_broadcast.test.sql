begin;
select plan(5);

select tests.create_user('me@test.com', '{"username":"me_user"}');
select tests.create_user('mate@test.com', '{"username":"mate"}');
select tests.create_user('pal@test.com', '{"username":"pal"}');
select tests.create_user('stranger@test.com', '{"username":"stranger"}');
insert into public.friends (requester_id, receiver_id) values (tests.uid('pal@test.com'), tests.uid('me@test.com'));
select tests.login_as(tests.uid('me@test.com'));
select public.create_room('grp', true, array['mate']);
update public.profiles set avatar_url = 'https://img/new.png' where id = tests.uid('me@test.com');
reset role;

create temp table sent as
  select topic from realtime.messages
  where event = 'profile_updated' and payload ->> 'userId' = tests.uid('me@test.com')::text
    and payload ->> 'avatarUrl' = 'https://img/new.png';

select ok(exists(select 1 from sent where topic = 'user:' || tests.uid('me@test.com')), '본인(다른 기기)에게 송출');
select ok(exists(select 1 from sent where topic = 'user:' || tests.uid('mate@test.com')), '같은 방 사람에게 송출');
select ok(exists(select 1 from sent where topic = 'user:' || tests.uid('pal@test.com')), '친구(요청 포함)에게 송출');
select ok(not exists(select 1 from sent where topic = 'user:' || tests.uid('stranger@test.com')), '모르는 사람에게는 안 보냄');
select is((select count(*) from sent where topic = 'user:' || tests.uid('mate@test.com'))::int, 1, '한 번만');

select * from finish();
rollback;
