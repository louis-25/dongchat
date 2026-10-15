-- 친구 초대 링크(초대 링크 스펙 §4). 사용자당 코드 하나, 재발급하면 예전 링크 무효.
create table private.friend_invites (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
revoke all on table private.friend_invites from public, anon, authenticated;

-- URL 안전 12자(72비트)
create or replace function private.new_invite_code() returns text
language sql volatile set search_path = ''
as $$ select translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_') $$;
revoke execute on function private.new_invite_code() from public, anon, authenticated;

create or replace function public.get_my_invite_code() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
begin
  perform private.require_active_session();
  insert into private.friend_invites (user_id, code) values (auth.uid(), private.new_invite_code())
  on conflict (user_id) do nothing;
  select code into v_code from private.friend_invites where user_id = auth.uid();
  return v_code;
end;
$$;

create or replace function public.reset_my_invite_code() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := private.new_invite_code();
begin
  perform private.require_active_session();
  insert into private.friend_invites (user_id, code) values (auth.uid(), v_code)
  on conflict (user_id) do update set code = excluded.code, created_at = now();
  return v_code;
end;
$$;

-- 초대 화면용: 이름·사진만(이메일 등은 주지 않는다). 없으면 0행.
create or replace function public.preview_invite(p_code text)
returns table (username text, nickname text, avatar_url text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_active_session();
  return query
  select p.username, p.nickname, p.avatar_url
  from private.friend_invites i join public.profiles p on p.id = i.user_id
  where i.code = p_code;
end;
$$;

-- 수신자가 "친구 되기"를 누르면: 관계 없음 → ACCEPTED 생성, 대기 중 → ACCEPTED, 이미 친구 → already, 차단 → 거부.
create or replace function public.accept_invite(p_code text)
returns table (username text, already boolean)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_inviter uuid;
  v_name text;
  v_row public.friends;
begin
  perform private.require_active_session();
  select i.user_id, p.username into v_inviter, v_name
  from private.friend_invites i join public.profiles p on p.id = i.user_id
  where i.code = p_code;
  if v_inviter is null then
    raise exception 'INVITE_NOT_FOUND' using hint = '만료되었거나 잘못된 초대 링크예요.';
  end if;
  if v_inviter = v_me then
    raise exception 'FRIEND_SELF_REQUEST' using hint = '내 초대 링크예요. 친구에게 보내 주세요.';
  end if;

  select * into v_row from public.friends f
  where least(f.requester_id, f.receiver_id) = least(v_me, v_inviter)
    and greatest(f.requester_id, f.receiver_id) = greatest(v_me, v_inviter)
  for update;

  if v_row.id is null then
    insert into public.friends (requester_id, receiver_id, status) values (v_inviter, v_me, 'ACCEPTED')
    on conflict do nothing; -- 동시에 두 번 눌러도 한 행
    return query select v_name, not found; -- 다른 탭이 먼저 넣었으면 already
  elsif v_row.status = 'BLOCKED' then
    raise exception 'FRIEND_BLOCKED' using hint = '친구를 추가할 수 없어요.';
  elsif v_row.status = 'ACCEPTED' then
    return query select v_name, true;
  else
    update public.friends set status = 'ACCEPTED' where id = v_row.id;
    return query select v_name, false;
  end if;
end;
$$;

revoke execute on function public.get_my_invite_code(), public.reset_my_invite_code(),
  public.preview_invite(text), public.accept_invite(text) from public, anon;
grant execute on function public.get_my_invite_code(), public.reset_my_invite_code(),
  public.preview_invite(text), public.accept_invite(text) to authenticated;
