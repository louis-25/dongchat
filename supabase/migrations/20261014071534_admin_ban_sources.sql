-- 정지 상태는 is_active_session과 같게 두 원천(private.user_access, auth.users = 대시보드 Ban) 중 늦은 값으로 보여 주고,
-- 해제는 둘 다 지운다. (greatest는 null을 무시한다)
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
             greatest(a.banned_until, u.banned_until) as "bannedUntil"
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

create or replace function public.admin_unban(p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_admin();
  update private.user_access set banned_until = null, reason = null where user_id = p_user_id;
  update auth.users set banned_until = null where id = p_user_id;
end;
$$;
