-- 프로필 사진. 공개 버킷(URL로 누구나 읽기), 쓰기는 본인 폴더 `<uid>/…`만.
-- 클라는 `<uid>/avatar` 한 파일을 upsert하고 profiles.avatar_url에 `?v=<시각>`을 붙여 캐시를 깬다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2 * 1024 * 1024, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- upsert는 select·insert·update 권한이 모두 필요하다.
create policy avatars_select_own on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_insert_own on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select private.is_active_session()));
create policy avatars_update_own on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select private.is_active_session()))
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
