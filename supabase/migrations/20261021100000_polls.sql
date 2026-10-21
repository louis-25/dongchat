-- 투표(스펙 docs/superpowers/specs/2026-10-21-polls-design.md).
-- 투표는 messages.poll_id로 연결된 일반 메시지(kind 'user', content '(투표) 질문')라 목록·푸시·검색·답장이 그대로 동작한다.
-- 세 테이블은 grant가 없다 — 읽기·쓰기는 RPC로만(익명 투표의 투표자를 누구도 직접 읽지 못하게).
create table public.polls (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.chat_rooms (id) on delete cascade,
  creator_id uuid references public.profiles (id) on delete set null,
  question text not null constraint polls_question_length check (char_length(question) between 1 and 100),
  multiple boolean not null default false,
  anonymous boolean not null default false,
  allow_add boolean not null default false,
  closes_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);
create index polls_room_id_idx on public.polls (room_id);
create index polls_creator_id_idx on public.polls (creator_id);

create table public.poll_options (
  id bigint generated always as identity primary key,
  poll_id bigint not null references public.polls (id) on delete cascade,
  label text not null constraint poll_options_label_length check (char_length(label) between 1 and 50),
  added_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index poll_options_label_key on public.poll_options (poll_id, lower(label));
create index poll_options_added_by_idx on public.poll_options (added_by);

create table public.poll_votes (
  poll_id bigint not null references public.polls (id) on delete cascade,
  option_id bigint not null references public.poll_options (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade, -- 탈퇴하면 표도 사라진다
  created_at timestamptz not null default now(),
  primary key (poll_id, option_id, user_id)
);
create index poll_votes_option_id_idx on public.poll_votes (option_id);
create index poll_votes_user_id_idx on public.poll_votes (user_id);

alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
revoke all on table public.polls, public.poll_options, public.poll_votes from anon, authenticated;

-- 방 삭제 때 messages·polls가 같은 cascade로 지워지므로 기본 FK(no action)로 충분하다.
-- 사용자 insert grant(room_id, content, reply_to_id …)에 poll_id는 없다 → create_poll만 넣는다.
alter table public.messages add column poll_id bigint references public.polls (id);
create index messages_poll_id_idx on public.messages (poll_id) where poll_id is not null;

-- ============ 헬퍼 ============
-- 질문·선택지 정리: 연속 공백 → 한 칸, 앞뒤 공백 제거(클라 lib/polls.ts normalizeLabel과 같은 규칙)
create or replace function private.normalize_label(p_text text) returns text
language sql immutable set search_path = ''
as $$
  select btrim(regexp_replace(p_text, '\s+', ' ', 'g'));
$$;
revoke execute on function private.normalize_label(text) from public, anon, authenticated;

-- 열림: 일찍 마감 안 했고, 마감 시각 전이고, 투표 메시지가 삭제되지 않았다
create or replace function private.poll_open(p_poll public.polls) returns boolean
language sql stable set search_path = ''
as $$
  select p_poll.closed_at is null
     and (p_poll.closes_at is null or p_poll.closes_at > now())
     and exists (select 1 from public.messages m where m.poll_id = p_poll.id and m.deleted_at is null);
$$;
revoke execute on function private.poll_open(public.polls) from public, anon, authenticated;

-- ============ RPC ============
create or replace function public.create_poll(
  p_room_id bigint, p_question text, p_options text[],
  p_multiple boolean, p_anonymous boolean, p_allow_add boolean, p_closes_at timestamptz
) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_question text := private.normalize_label(coalesce(p_question, ''));
  v_options text[];
  v_poll_id bigint;
  v_message_id bigint;
begin
  perform private.require_active_session();
  if not private.is_room_member(p_room_id) then
    raise exception 'CHAT_FORBIDDEN' using hint = '참여 중인 방이 아닙니다.';
  end if;
  if char_length(v_question) not between 1 and 100 then
    raise exception 'VALIDATION_FAILED' using hint = '질문은 1~100자여야 해요.';
  end if;
  -- 정리 → 빈 값 제거 → 대소문자 무시 중복 제거(첫 등장 유지)
  select coalesce(array_agg(label order by ord), '{}') into v_options
  from (
    select distinct on (lower(label)) label, ord
    from (select private.normalize_label(x) as label, ord
          from unnest(coalesce(p_options, '{}')) with ordinality as t(x, ord)) s
    where label <> ''
    order by lower(label), ord
  ) d;
  if cardinality(v_options) not between 2 and 20 then
    raise exception 'VALIDATION_FAILED' using hint = '항목은 2~20개여야 해요.';
  end if;
  if exists (select 1 from unnest(v_options) l where char_length(l) > 50) then
    raise exception 'VALIDATION_FAILED' using hint = '항목은 50자까지 쓸 수 있어요.';
  end if;
  if p_closes_at is not null and p_closes_at < now() + interval '1 minute' then
    raise exception 'VALIDATION_FAILED' using hint = '마감 시각은 1분 뒤부터 고를 수 있어요.';
  end if;

  insert into public.polls (room_id, creator_id, question, multiple, anonymous, allow_add, closes_at)
  values (p_room_id, auth.uid(), v_question, coalesce(p_multiple, false), coalesce(p_anonymous, false),
          coalesce(p_allow_add, false), p_closes_at)
  returning id into v_poll_id;
  insert into public.poll_options (poll_id, label, added_by)
  select v_poll_id, l, auth.uid() from unnest(v_options) with ordinality as t(l, ord) order by ord;
  -- 메시지 insert 트리거가 기존처럼 broadcast·푸시를 처리한다
  insert into public.messages (room_id, sender_id, content, poll_id)
  values (p_room_id, auth.uid(), '(투표) ' || v_question, v_poll_id)
  returning id into v_message_id;
  return v_message_id;
end;
$$;
revoke execute on function public.create_poll(bigint, text, text[], boolean, boolean, boolean, timestamptz) from public, anon;
grant execute on function public.create_poll(bigint, text, text[], boolean, boolean, boolean, timestamptz) to authenticated;

-- 투표 하나. 익명이면 voters는 만든 사람에게도 항상 []. 삭제된 투표는 결과도 주지 않는다.
create or replace function public.get_poll(p_poll_id bigint) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_poll public.polls;
  v_message_id bigint;
begin
  perform private.require_active_session();
  select * into v_poll from public.polls where id = p_poll_id;
  select id into v_message_id from public.messages where poll_id = p_poll_id and deleted_at is null;
  if v_poll.id is null or v_message_id is null or not private.is_room_member(v_poll.room_id) then
    raise exception 'POLL_NOT_FOUND' using hint = '투표를 찾을 수 없어요.';
  end if;
  return jsonb_build_object(
    'id', v_poll.id, 'roomId', v_poll.room_id, 'messageId', v_message_id, 'creatorId', v_poll.creator_id,
    'question', v_poll.question, 'multiple', v_poll.multiple, 'anonymous', v_poll.anonymous,
    'allowAdd', v_poll.allow_add, 'closesAt', v_poll.closes_at, 'closed', not private.poll_open(v_poll),
    'voterCount', (select count(distinct user_id) from public.poll_votes where poll_id = p_poll_id),
    'myOptionIds', coalesce((select jsonb_agg(option_id order by option_id) from public.poll_votes
                             where poll_id = p_poll_id and user_id = auth.uid()), '[]'::jsonb),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'label', o.label,
               'count', (select count(*) from public.poll_votes v where v.option_id = o.id),
               'voters', case when v_poll.anonymous then '[]'::jsonb else coalesce((
                   select jsonb_agg(private.display_name(v.user_id) order by v.created_at, v.user_id)
                   from public.poll_votes v where v.option_id = o.id), '[]'::jsonb) end
             ) order by o.id)
      from public.poll_options o where o.poll_id = p_poll_id), '[]'::jsonb));
end;
$$;
revoke execute on function public.get_poll(bigint) from public, anon;
grant execute on function public.get_poll(bigint) to authenticated;
