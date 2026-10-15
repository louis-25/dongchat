begin;
select plan(10);

select tests.create_user('dr_alice@test.com', '{"username":"dr_alice"}');
select tests.create_user('dr_bob@test.com', '{"username":"dr_bob"}');
-- 반환된 방 id는 트랜잭션 로컬 설정값(t.*)에 담는다(역할 전환과 무관하게 읽힘).
create or replace function pg_temp.room(p_tag text) returns bigint language sql as $$ select current_setting('t.' || p_tag)::bigint $$;

-- alice·bob만 있는 그룹방이 먼저 있어도 1:1로 재사용하지 않는다
select tests.login_as(tests.uid('dr_alice@test.com'));
select public.create_room('dr_group', true, array['dr_bob']);
select set_config('t.first', public.open_direct_room('dr_bob')::text, true);
select set_config('t.again', public.open_direct_room('dr_bob')::text, true);
reset role;

select ok(pg_temp.room('first') <> tests.room_id('dr_group'), '그룹방은 재사용 안 함');
select ok((select not is_group from public.chat_rooms where id = pg_temp.room('first')), '1:1 방 생성');
select is((select count(*)::int from public.chat_room_participants where room_id = pg_temp.room('first')), 2, '참여자 2명');
select is(pg_temp.room('again'), pg_temp.room('first'), '다시 열면 같은 방');

select tests.login_as(tests.uid('dr_bob@test.com'));
select set_config('t.reverse', public.open_direct_room('  DR_ALICE ')::text, true);
reset role;
select is(pg_temp.room('reverse'), pg_temp.room('first'), '상대가 열어도 같은 방(대소문자·공백 무시)');

select tests.login_as(tests.uid('dr_alice@test.com'));
select throws_ok($$ select public.open_direct_room('dr_alice') $$, 'P0001', 'ROOM_INVALID_PARTICIPANTS', '본인 거부');
select throws_ok($$ select public.open_direct_room('nobody_here') $$, 'P0001', 'ROOM_INVALID_PARTICIPANTS', '없는 사용자 거부');
reset role;

-- bob이 나간 방은 재사용하지 않는다
select tests.login_as(tests.uid('dr_bob@test.com'));
select public.leave_room(current_setting('t.first')::bigint); -- authenticated 역할에서는 pg_temp 함수 대신 직접 읽는다
reset role;
select tests.login_as(tests.uid('dr_alice@test.com'));
select set_config('t.after_leave', public.open_direct_room('dr_bob')::text, true);
reset role;
select ok(pg_temp.room('after_leave') <> pg_temp.room('first'), '상대가 나간 방은 새로 만듦');
select is((select count(*)::int from public.chat_room_participants where room_id = pg_temp.room('after_leave')), 2, '새 방 참여자 2명');
select ok(not has_function_privilege('anon', 'public.open_direct_room(text)', 'execute'), 'anon 실행 불가');

select * from finish();
rollback;
