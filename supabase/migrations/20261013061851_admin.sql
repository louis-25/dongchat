create or replace function private.require_admin() returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.require_active_session();
  if not private.is_admin() then
    raise exception 'ADMIN_FORBIDDEN' using hint = '관리자만 접근할 수 있습니다.';
  end if;
end;
$$;
revoke execute on function private.require_admin() from public, anon, authenticated;

create or replace function public.admin_list_users(
  p_page int default 1, p_limit int default 20, p_sort text default 'created_at', p_order text default 'desc'
) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_sort text := case when p_sort in ('created_at', 'username', 'updated_at') then p_sort else 'created_at' end;
  v_order text := case when lower(coalesce(p_order, '')) = 'asc' then 'asc' else 'desc' end;
  v_items jsonb;
  v_total bigint;
begin
  perform private.require_admin();
  select count(*) into v_total from public.profiles;
  execute format($q$
    select coalesce(jsonb_agg(t), '[]'::jsonb) from (
      select p.id, p.username, p.nickname, u.email,
             p.created_at as "createdAt",
             exists (select 1 from private.user_roles r where r.user_id = p.id) as "isAdmin",
             a.banned_until as "bannedUntil"
      from public.profiles p
      join auth.users u on u.id = p.id
      left join private.user_access a on a.user_id = p.id
      order by p.%I %s, p.id
      limit %s offset %s
    ) t $q$, v_sort, v_order, v_limit, (v_page - 1) * v_limit)
  into v_items;
  return jsonb_build_object('items', v_items, 'total', v_total, 'page', v_page, 'limit', v_limit);
end;
$$;

create or replace function public.admin_list_rooms(p_page int default 1, p_limit int default 20) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_limit int := least(greatest(coalesce(p_limit, 20), 1), 100);
  v_page int := greatest(coalesce(p_page, 1), 1);
  v_items jsonb;
  v_total bigint;
begin
  perform private.require_admin();
  select count(*) into v_total from public.chat_rooms;
  select coalesce(jsonb_agg(t), '[]'::jsonb) into v_items from (
    select r.id, r.name, r.is_group as "isGroup", r.created_by as "createdBy",
           o.username as "ownerUsername",
           (select count(*) from public.chat_room_participants p where p.room_id = r.id) as "memberCount",
           r.created_at as "createdAt"
    from public.chat_rooms r
    left join public.profiles o on o.id = r.created_by
    order by r.id desc
    limit v_limit offset (v_page - 1) * v_limit
  ) t;
  return jsonb_build_object('items', v_items, 'total', v_total, 'page', v_page, 'limit', v_limit);
end;
$$;

create or replace function public.admin_ban(p_user_id uuid, p_until timestamptz, p_reason text default null) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_user_id = auth.uid() then
    raise exception 'VALIDATION_FAILED' using hint = '본인은 정지할 수 없습니다.';
  end if;
  if p_until is null or p_until <= now() then
    raise exception 'VALIDATION_FAILED' using hint = '정지 종료 시각은 미래여야 합니다.';
  end if;
  insert into private.user_access (user_id, banned_until, reason)
  values (p_user_id, p_until, p_reason)
  on conflict (user_id) do update set banned_until = excluded.banned_until, reason = excluded.reason;
end;
$$;

create or replace function public.admin_unban(p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin();
  update private.user_access set banned_until = null, reason = null where user_id = p_user_id;
end;
$$;

create or replace function public.admin_force_logout(p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin();
  insert into private.user_access (user_id, sessions_revoked_at) values (p_user_id, now())
  on conflict (user_id) do update set sessions_revoked_at = excluded.sessions_revoked_at;
end;
$$;

revoke execute on function
  public.admin_list_users(int, int, text, text), public.admin_list_rooms(int, int),
  public.admin_ban(uuid, timestamptz, text), public.admin_unban(uuid), public.admin_force_logout(uuid)
  from public, anon;
grant execute on function
  public.admin_list_users(int, int, text, text), public.admin_list_rooms(int, int),
  public.admin_ban(uuid, timestamptz, text), public.admin_unban(uuid), public.admin_force_logout(uuid)
  to authenticated;
