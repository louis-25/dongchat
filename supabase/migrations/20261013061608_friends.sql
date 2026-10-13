create table public.friends (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  receiver_id uuid not null references public.profiles (id) on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING', 'ACCEPTED', 'BLOCKED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint friends_not_self check (requester_id <> receiver_id)
);
-- 양방향 중복 차단
create unique index friends_pair_key on public.friends (least(requester_id, receiver_id), greatest(requester_id, receiver_id));
create index friends_requester_id_idx on public.friends (requester_id);
create index friends_receiver_id_idx on public.friends (receiver_id);
create trigger friends_set_updated_at before update on public.friends
  for each row execute function private.set_updated_at();

alter table public.friends enable row level security;
revoke all on table public.friends from anon, authenticated;
grant select on table public.friends to authenticated;

create policy friends_select on public.friends for select to authenticated
  using (
    (select auth.uid()) in (requester_id, receiver_id)
    and (select private.is_active_session())
  );

create or replace function public.send_friend_request(p_username text) returns public.friends
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_target uuid;
  v_row public.friends;
begin
  perform private.require_active_session();
  select id into v_target from public.profiles where username = lower(trim(coalesce(p_username, '')));
  if v_target is null then
    raise exception 'FRIEND_USER_NOT_FOUND' using hint = '사용자를 찾을 수 없습니다.';
  end if;
  if v_target = v_me then
    raise exception 'FRIEND_SELF_REQUEST' using hint = '본인에게 친구 요청을 보낼 수 없습니다.';
  end if;
  insert into public.friends (requester_id, receiver_id) values (v_me, v_target)
  returning * into v_row;
  return v_row;
exception
  when unique_violation then
    raise exception 'FRIEND_DUPLICATE' using hint = '이미 친구 요청이 존재합니다.';
end;
$$;

create or replace function public.respond_friend_request(p_id bigint, p_action text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_status text := case upper(trim(coalesce(p_action, '')))
                     when 'ACCEPT' then 'ACCEPTED'
                     when 'BLOCK' then 'BLOCKED'
                   end;
begin
  perform private.require_active_session();
  if v_status is null then
    raise exception 'VALIDATION_FAILED' using hint = 'action은 ACCEPT 또는 BLOCK이어야 합니다.';
  end if;
  update public.friends set status = v_status
  where id = p_id and receiver_id = auth.uid();
  if not found then
    raise exception 'CHAT_FORBIDDEN' using hint = '요청을 받은 사용자만 응답할 수 있습니다.';
  end if;
end;
$$;

revoke execute on function public.send_friend_request(text), public.respond_friend_request(bigint, text) from public, anon;
grant execute on function public.send_friend_request(text), public.respond_friend_request(bigint, text) to authenticated;
