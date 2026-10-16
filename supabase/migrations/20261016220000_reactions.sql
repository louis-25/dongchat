-- 메시지 반응(한 사람당 메시지 하나에 하나). 코드로 저장하고 화면이 이모지로 바꾼다.
create table public.message_reactions (
  message_id bigint not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reaction text not null constraint message_reactions_kind check (reaction in ('heart', 'like', 'lol', 'wow', 'sad')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index message_reactions_user_id_idx on public.message_reactions (user_id);

alter table public.message_reactions enable row level security;
revoke all on table public.message_reactions from anon, authenticated;
grant select on table public.message_reactions to authenticated;

-- 반응이 달린 메시지의 방 멤버(또는 관리자 열람)만 본다. messages RLS를 다시 타지 않도록 definer 헬퍼.
create or replace function private.can_see_message(p_message_id bigint) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.messages m
    where m.id = p_message_id and (private.is_room_member(m.room_id) or private.is_admin())
  );
$$;
revoke execute on function private.can_see_message(bigint) from public, anon;
grant execute on function private.can_see_message(bigint) to authenticated;

create policy message_reactions_select on public.message_reactions for select to authenticated
  using ((select private.can_see_message(message_id)));

-- p_reaction이 null이면 내 반응 취소. 바뀌면 방 채널에 reaction_updated.
create or replace function public.set_reaction(p_message_id bigint, p_reaction text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_msg public.messages;
begin
  perform private.require_active_session();
  if p_reaction is not null and p_reaction not in ('heart', 'like', 'lol', 'wow', 'sad') then
    raise exception 'VALIDATION_FAILED' using hint = '지원하지 않는 반응이에요.';
  end if;
  select * into v_msg from public.messages where id = p_message_id;
  if not found or v_msg.deleted_at is not null then
    raise exception 'MESSAGE_NOT_FOUND' using hint = '메시지를 찾을 수 없습니다.';
  end if;
  if not private.is_room_member(v_msg.room_id) then
    raise exception 'CHAT_FORBIDDEN' using hint = '참여 중인 방이 아닙니다.';
  end if;

  if p_reaction is null then
    delete from public.message_reactions where message_id = p_message_id and user_id = auth.uid();
  else
    insert into public.message_reactions (message_id, user_id, reaction)
    values (p_message_id, auth.uid(), p_reaction)
    on conflict (message_id, user_id) do update set reaction = excluded.reaction, created_at = now();
  end if;

  perform private.broadcast('room:' || v_msg.room_id, 'reaction_updated',
    jsonb_build_object('roomId', v_msg.room_id, 'messageId', p_message_id, 'userId', auth.uid(), 'reaction', p_reaction));
end;
$$;
revoke execute on function public.set_reaction(bigint, text) from public, anon;
grant execute on function public.set_reaction(bigint, text) to authenticated;
