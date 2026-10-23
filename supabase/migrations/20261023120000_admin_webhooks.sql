-- 관리자 화면(/admin/webhooks)용 웹훅 관리. 앱 관리자(private.require_admin)만, 실제 로직은 SQL Editor용 함수 그대로.
-- (함수 소유자 postgres는 그 함수들의 실행 권한을 회수하지 않았으므로 여기서 부를 수 있다)

-- 웹훅 목록(최근 것부터)과 고를 수 있는 그룹 방
create or replace function public.admin_list_webhooks() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_admin();
  return jsonb_build_object(
    'webhooks', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'roomId', w.room_id, 'roomName', r.name,
                                          'createdAt', w.created_at, 'lastUsedAt', w.last_used_at) order by w.id desc)
      from private.webhooks w join public.chat_rooms r on r.id = w.room_id), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object('id', r.id, 'name', r.name,
                                          'memberCount', (select count(*) from public.chat_room_participants p where p.room_id = r.id))
                       order by r.id desc)
      from public.chat_rooms r where r.is_group), '[]'::jsonb)
  );
end;
$$;

create or replace function public.admin_create_webhook(p_name text, p_room_id bigint) returns text
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin();
  return public.create_webhook(p_name, p_room_id);
end;
$$;

create or replace function public.admin_rotate_webhook(p_id bigint) returns text
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin();
  return public.rotate_webhook(p_id);
end;
$$;

create or replace function public.admin_delete_webhook(p_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin();
  perform public.delete_webhook(p_id);
end;
$$;

revoke execute on function public.admin_list_webhooks(), public.admin_create_webhook(text, bigint),
  public.admin_rotate_webhook(bigint), public.admin_delete_webhook(bigint) from public, anon;
grant execute on function public.admin_list_webhooks(), public.admin_create_webhook(text, bigint),
  public.admin_rotate_webhook(bigint), public.admin_delete_webhook(bigint) to authenticated;
