-- 반응을 코드(heart…) 대신 이모지 문자로 저장해 아무 이모지나 달 수 있게 한다(화면은 frimousse 선택기).
-- ponytail: DB는 "짧고 공백·글자·숫자가 없는 문자열"까지만 본다 — 진짜 이모지 판별은 못 함(키캡 1️⃣는 거부됨).
alter table public.message_reactions drop constraint message_reactions_kind;
update public.message_reactions set reaction = case reaction
  when 'heart' then '❤️' when 'like' then '👍' when 'lol' then '😂' when 'wow' then '😮' when 'sad' then '😢'
  else reaction end;
alter table public.message_reactions add constraint message_reactions_emoji
  check (char_length(reaction) between 1 and 16 and reaction !~ '[[:space:][:alnum:]]');

create or replace function public.set_reaction(p_message_id bigint, p_reaction text) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_msg public.messages;
begin
  perform private.require_active_session();
  if p_reaction is not null and (char_length(p_reaction) not between 1 and 16 or p_reaction ~ '[[:space:][:alnum:]]') then
    raise exception 'VALIDATION_FAILED' using hint = '이모지만 반응으로 달 수 있어요.';
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
