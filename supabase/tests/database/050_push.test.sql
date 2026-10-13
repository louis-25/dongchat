begin;
select plan(6);

select tests.create_user('alice@test.com', '{"username":"alice"}');
select tests.create_user('bob@test.com', '{"username":"bob"}');

select tests.login_as(tests.uid('alice@test.com'));
select lives_ok($$ insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push/a', 'k', 'a') $$, '본인 구독 저장');
select lives_ok($$ insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push/a', 'k2', 'a2')
                   on conflict (endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth $$, '같은 endpoint upsert');
select is((select p256dh from public.push_subscriptions where endpoint = 'https://push/a'), 'k2', 'upsert 반영');
select throws_ok(format($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (%L, 'https://push/b', 'k', 'a') $$, tests.uid('bob@test.com')), '42501', null, '타인 user_id로 저장 불가');
reset role;

select tests.login_as(tests.uid('bob@test.com'));
select is((select count(*)::int from public.push_subscriptions), 0, '타인 구독 안 보임');
select throws_ok($$ insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push/a', 'x', 'y')
                    on conflict (endpoint) do update set p256dh = excluded.p256dh $$, '42501', null, '타인 endpoint 덮어쓰기 불가');
reset role;

select * from finish();
rollback;
