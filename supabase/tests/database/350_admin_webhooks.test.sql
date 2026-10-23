begin;
select plan(10);

select tests.create_user('aw_admin@test.com', '{"username":"aw_admin"}');
select tests.create_user('aw_user@test.com', '{"username":"aw_user"}');
insert into private.user_roles (user_id, role) values (tests.uid('aw_admin@test.com'), 'ADMIN');
select tests.login_as(tests.uid('aw_admin@test.com'));
select public.create_room('aw_group', true, array['aw_user']);
select public.open_direct_room('aw_user');
reset role;
select set_config('tests.room', tests.room_id('aw_group')::text, true);

-- 관리자가 아니면 모두 거절
select tests.login_as(tests.uid('aw_user@test.com'));
select throws_ok($$ select public.admin_list_webhooks() $$, 'P0001', 'ADMIN_FORBIDDEN', '목록 거절');
select throws_ok(format('select public.admin_create_webhook(%L, %s)', '봇', current_setting('tests.room')), 'P0001', 'ADMIN_FORBIDDEN', '만들기 거절');
select throws_ok($$ select public.admin_rotate_webhook(1) $$, 'P0001', 'ADMIN_FORBIDDEN', '재발급 거절');
select throws_ok($$ select public.admin_delete_webhook(1) $$, 'P0001', 'ADMIN_FORBIDDEN', '삭제 거절');
reset role;

-- 관리자(목록은 최근 것부터 — 로컬 DB에 다른 웹훅이 있어도 0번이 방금 만든 것)
select tests.login_as(tests.uid('aw_admin@test.com'));
select matches(public.admin_create_webhook('채용봇', current_setting('tests.room')::bigint), '^dch_[0-9a-f]{64}$', '만들면 토큰');
select set_config('tests.list', public.admin_list_webhooks()::text, true);
select is(current_setting('tests.list')::jsonb #>> '{webhooks,0,name}', '채용봇', '목록에 이름');
select is((current_setting('tests.list')::jsonb #>> '{webhooks,0,roomId}')::bigint, current_setting('tests.room')::bigint, '목록에 방');
select ok(current_setting('tests.list')::jsonb -> 'rooms' @> jsonb_build_array(jsonb_build_object('id', current_setting('tests.room')::bigint, 'name', 'aw_group'))
  and jsonb_array_length(current_setting('tests.list')::jsonb -> 'rooms') = (select count(*)::int from public.chat_rooms where is_group),
  '고를 수 있는 방 = 그룹 방만');
select set_config('tests.hook', current_setting('tests.list')::jsonb #>> '{webhooks,0,id}', true);
select matches(public.admin_rotate_webhook(current_setting('tests.hook')::bigint), '^dch_[0-9a-f]{64}$', '재발급 토큰');
select public.admin_delete_webhook(current_setting('tests.hook')::bigint);
select ok(not (public.admin_list_webhooks() -> 'webhooks') @> jsonb_build_array(jsonb_build_object('id', current_setting('tests.hook')::bigint)), '삭제 후 목록에서 사라짐');
reset role;

select * from finish();
rollback;
