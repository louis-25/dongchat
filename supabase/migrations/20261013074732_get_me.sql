-- 현재 사용자 정보(관리자 여부 포함). 클라이언트는 private.*를 볼 수 없으므로 이 RPC로 얻는다.
create or replace function public.get_me() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me jsonb;
begin
  perform private.require_active_session();
  select jsonb_build_object(
           'id', p.id,
           'username', p.username,
           'nickname', p.nickname,
           'avatarUrl', p.avatar_url,
           'isAdmin', private.is_admin())
  into v_me
  from public.profiles p
  where p.id = auth.uid();
  return v_me;
end;
$$;
revoke execute on function public.get_me() from public, anon;
grant execute on function public.get_me() to authenticated;
