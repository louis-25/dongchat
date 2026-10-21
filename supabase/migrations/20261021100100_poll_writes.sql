-- 투표 쓰기(스펙 §3.2~3.4)
-- 잠금 순서: 투표 메시지 → 투표. delete_message도 메시지 행을 먼저 잠그므로 삭제와 투표 쓰기가 엇갈리지 않는다.
create or replace function private.lock_poll(p_poll_id bigint, p_require_open boolean) returns public.polls
language plpgsql security definer set search_path = ''
as $$
declare
  v_poll public.polls;
begin
  perform 1 from public.messages where poll_id = p_poll_id for update;
  select * into v_poll from public.polls where id = p_poll_id for update;
  if not found or not private.is_room_member(v_poll.room_id) then
    raise exception 'POLL_NOT_FOUND' using hint = '투표를 찾을 수 없어요.';
  end if;
  if p_require_open and not private.poll_open(v_poll) then
    raise exception 'POLL_CLOSED' using hint = '마감된 투표예요.';
  end if;
  return v_poll;
end;
$$;
revoke execute on function private.lock_poll(bigint, boolean) from public, anon, authenticated;

-- 표 수·투표자는 싣지 않는다(받은 쪽이 get_poll로 다시 받는다)
create or replace function private.poll_broadcast(p_poll public.polls) returns void
language sql security definer set search_path = ''
as $$
  select private.broadcast('room:' || p_poll.room_id, 'poll_updated',
    jsonb_build_object('roomId', p_poll.room_id, 'pollId', p_poll.id));
$$;
revoke execute on function private.poll_broadcast(public.polls) from public, anon, authenticated;

-- p_option_ids = 내 최종 선택(빈 배열 = 취소). 중복·null은 정리한다.
create or replace function public.vote_poll(p_poll_id bigint, p_option_ids bigint[]) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_poll public.polls;
  v_ids bigint[];
begin
  perform private.require_active_session();
  v_poll := private.lock_poll(p_poll_id, true);
  select coalesce(array_agg(distinct x), '{}') into v_ids from unnest(coalesce(p_option_ids, '{}')) x where x is not null;
  if not v_poll.multiple and cardinality(v_ids) > 1 then
    raise exception 'VALIDATION_FAILED' using hint = '하나만 고를 수 있어요.';
  end if;
  if exists (select 1 from unnest(v_ids) x
             where not exists (select 1 from public.poll_options o where o.id = x and o.poll_id = p_poll_id)) then
    raise exception 'VALIDATION_FAILED' using hint = '항목을 찾을 수 없어요.';
  end if;
  delete from public.poll_votes where poll_id = p_poll_id and user_id = auth.uid();
  insert into public.poll_votes (poll_id, option_id, user_id) select p_poll_id, x, auth.uid() from unnest(v_ids) x;
  perform private.poll_broadcast(v_poll);
end;
$$;
revoke execute on function public.vote_poll(bigint, bigint[]) from public, anon;
grant execute on function public.vote_poll(bigint, bigint[]) to authenticated;

create or replace function public.add_poll_option(p_poll_id bigint, p_label text) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_poll public.polls;
  v_label text := private.normalize_label(coalesce(p_label, ''));
  v_id bigint;
begin
  perform private.require_active_session();
  v_poll := private.lock_poll(p_poll_id, true);
  if v_poll.creator_id is distinct from auth.uid() and not v_poll.allow_add then
    raise exception 'CHAT_FORBIDDEN' using hint = '항목을 추가할 수 없는 투표예요.';
  end if;
  if char_length(v_label) not between 1 and 50 then
    raise exception 'VALIDATION_FAILED' using hint = '항목은 1~50자여야 해요.';
  end if;
  if (select count(*) from public.poll_options where poll_id = p_poll_id) >= 20 then
    raise exception 'VALIDATION_FAILED' using hint = '항목은 20개까지예요.';
  end if;
  begin
    insert into public.poll_options (poll_id, label, added_by) values (p_poll_id, v_label, auth.uid()) returning id into v_id;
  exception when unique_violation then
    raise exception 'VALIDATION_FAILED' using hint = '이미 있는 항목이에요.';
  end;
  perform private.poll_broadcast(v_poll);
  return v_id;
end;
$$;
revoke execute on function public.add_poll_option(bigint, text) from public, anon;
grant execute on function public.add_poll_option(bigint, text) to authenticated;

-- 만든 사람만. 이미 닫혔거나(시각 경과·삭제 포함) 다시 부르면 아무 일도 하지 않는다(broadcast도 없음).
create or replace function public.close_poll(p_poll_id bigint) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_poll public.polls;
begin
  perform private.require_active_session();
  v_poll := private.lock_poll(p_poll_id, false);
  if v_poll.creator_id is distinct from auth.uid() then
    raise exception 'CHAT_FORBIDDEN' using hint = '만든 사람만 마감할 수 있어요.';
  end if;
  if not private.poll_open(v_poll) then
    return;
  end if;
  update public.polls set closed_at = now() where id = p_poll_id;
  perform private.poll_broadcast(v_poll);
end;
$$;
revoke execute on function public.close_poll(bigint) from public, anon;
grant execute on function public.close_poll(bigint) to authenticated;
