-- ============ 테이블 ============
create table public.chat_rooms (
  id bigint generated always as identity primary key,
  name text,
  is_group boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index chat_rooms_created_by_idx on public.chat_rooms (created_by);
create trigger chat_rooms_set_updated_at before update on public.chat_rooms
  for each row execute function private.set_updated_at();

create table public.chat_room_participants (
  room_id bigint not null references public.chat_rooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_message_id bigint,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index chat_room_participants_user_id_idx on public.chat_room_participants (user_id);

create table public.messages (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.chat_rooms (id) on delete cascade,
  sender_id uuid default auth.uid() references public.profiles (id) on delete set null,
  content text not null,
  reply_to_id bigint references public.messages (id) on delete set null,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  constraint messages_content_length check (deleted_at is not null or char_length(content) between 1 and 2000)
);
create index messages_room_id_id_idx on public.messages (room_id, id desc);
create index messages_sender_id_idx on public.messages (sender_id);
create index messages_reply_to_id_idx on public.messages (reply_to_id);

alter table public.chat_rooms enable row level security;
alter table public.chat_room_participants enable row level security;
alter table public.messages enable row level security;
revoke all on table public.chat_rooms, public.chat_room_participants, public.messages from anon, authenticated;
grant select on table public.chat_rooms, public.chat_room_participants, public.messages to authenticated;
grant insert (room_id, content, reply_to_id) on table public.messages to authenticated;

-- ============ 멤버십 헬퍼 ============
create or replace function private.is_room_member(p_room_id bigint) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.is_active_session()
     and exists (
       select 1 from public.chat_room_participants p
       where p.room_id = p_room_id and p.user_id = auth.uid()
     );
$$;
revoke execute on function private.is_room_member(bigint) from public, anon;
grant execute on function private.is_room_member(bigint) to authenticated;

-- ============ 정책 ============
create policy chat_rooms_select on public.chat_rooms for select to authenticated
  using ((select private.is_room_member(id)) or (select private.is_admin()));
create policy chat_room_participants_select on public.chat_room_participants for select to authenticated
  using ((select private.is_room_member(room_id)) or (select private.is_admin()));
create policy messages_select on public.messages for select to authenticated
  using ((select private.is_room_member(room_id)) or (select private.is_admin()));
create policy messages_insert on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (select private.is_room_member(room_id))
    and (
      reply_to_id is null
      or exists (select 1 from public.messages r where r.id = reply_to_id and r.room_id = messages.room_id)
    )
  );

-- ============ 참여자 삭제 후처리 (RPC·Studio 공통) ============
create or replace function private.participants_after_delete() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_next uuid;
begin
  select p.user_id into v_next
  from public.chat_room_participants p
  where p.room_id = old.room_id
  order by p.joined_at, p.user_id
  limit 1;

  if v_next is null then
    delete from public.chat_rooms where id = old.room_id;
  else
    update public.chat_rooms set created_by = v_next
    where id = old.room_id and created_by is not distinct from old.user_id;
  end if;
  return null;
end;
$$;
revoke execute on function private.participants_after_delete() from public, anon, authenticated;
create trigger participants_after_delete after delete on public.chat_room_participants
  for each row execute function private.participants_after_delete();

-- ============ RPC ============
create or replace function public.create_room(p_name text, p_is_group boolean, p_usernames text[])
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_is_group boolean := coalesce(p_is_group, false);
  v_names text[];
  v_found int;
  v_others uuid[];
  v_room bigint;
begin
  perform private.require_active_session();

  select coalesce(array_agg(distinct lower(trim(u))), '{}')
  into v_names
  from unnest(coalesce(p_usernames, '{}'::text[])) as u
  where trim(u) <> '';

  select count(*), coalesce(array_agg(p.id) filter (where p.id <> v_me), '{}')
  into v_found, v_others
  from public.profiles p
  where p.username = any(v_names);

  if v_found <> cardinality(v_names) then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '존재하지 않는 사용자가 포함되어 있습니다.';
  end if;
  if cardinality(v_others) = 0 then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '대화 상대를 한 명 이상 선택하세요.';
  end if;
  if not v_is_group and cardinality(v_others) <> 1 then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '1:1 채팅방은 정확히 2명이어야 합니다.';
  end if;

  insert into public.chat_rooms (name, is_group, created_by)
  values (nullif(trim(p_name), ''), v_is_group, v_me)
  returning id into v_room;

  insert into public.chat_room_participants (room_id, user_id)
  select v_room, uid from unnest(array_append(v_others, v_me)) as uid;

  return v_room;
end;
$$;

create or replace function public.leave_room(p_room_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.require_active_session();
  delete from public.chat_room_participants where room_id = p_room_id and user_id = auth.uid();
  if not found then
    raise exception 'CHAT_FORBIDDEN' using hint = '참여 중인 방이 아닙니다.';
  end if;
end;
$$;

create or replace function public.kick_member(p_room_id bigint, p_user_id uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_room public.chat_rooms;
begin
  perform private.require_active_session();
  select * into v_room from public.chat_rooms where id = p_room_id;
  if not found then
    raise exception 'CHAT_ROOM_NOT_FOUND' using hint = '방을 찾을 수 없습니다.';
  end if;
  if p_user_id = auth.uid()
     or not v_room.is_group
     or not (coalesce(v_room.created_by = auth.uid(), false) or private.is_admin()) then
    raise exception 'ROOM_KICK_FORBIDDEN' using hint = '강퇴할 권한이 없습니다.';
  end if;
  delete from public.chat_room_participants where room_id = p_room_id and user_id = p_user_id;
  if not found then
    raise exception 'CHAT_FORBIDDEN' using hint = '방 참여자가 아닙니다.';
  end if;
end;
$$;

revoke execute on function public.create_room(text, boolean, text[]), public.leave_room(bigint), public.kick_member(bigint, uuid) from public, anon;
grant execute on function public.create_room(text, boolean, text[]), public.leave_room(bigint), public.kick_member(bigint, uuid) to authenticated;
