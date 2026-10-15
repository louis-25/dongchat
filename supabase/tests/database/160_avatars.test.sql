begin;
select plan(5);

select tests.create_user('me@test.com', '{"username":"me_user"}');
select tests.create_user('you@test.com', '{"username":"you_user"}');

select ok((select public from storage.buckets where id = 'avatars'), 'avatars 버킷은 공개 읽기');

select tests.login_as(tests.uid('me@test.com'));
select lives_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('avatars', '%s/avatar') $$, tests.uid('me@test.com')),
  '내 폴더에는 올릴 수 있다');
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('avatars', '%s/avatar') $$, tests.uid('you@test.com')),
  '42501', null, '남의 폴더에는 못 올린다');
select lives_ok(
  format($$ update storage.objects set metadata = '{}' where bucket_id = 'avatars' and name = '%s/avatar' $$, tests.uid('me@test.com')),
  '내 사진은 덮어쓸 수 있다(upsert)');
reset role;

insert into private.user_access (user_id, sessions_revoked_at) values (tests.uid('me@test.com'), now());
select tests.login_as(tests.uid('me@test.com'));
select throws_ok(
  format($$ insert into storage.objects (bucket_id, name) values ('avatars', '%s/other') $$, tests.uid('me@test.com')),
  '42501', null, '강제 로그아웃 후 거부');
reset role;

select * from finish();
rollback;
