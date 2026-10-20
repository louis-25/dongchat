-- 방 안 메시지 검색: 글 메시지(삭제·안내·이모티콘·사진 제외) 부분 일치, 최신순 20개, before_id로 다음 페이지.
-- ponytail: 인덱스 없이 방 id 인덱스로 그 방만 훑는다. 방 하나가 수만 건을 넘어 느려지면 pg_trgm GIN 인덱스.
create or replace function public.search_messages(p_room_id bigint, p_query text, p_before_id bigint)
returns table (id bigint, sender_id uuid, sender_name text, content text, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_q text := trim(coalesce(p_query, ''));
begin
  perform private.require_active_session();
  if not (private.is_room_member(p_room_id) or private.is_admin()) then
    raise exception 'CHAT_FORBIDDEN' using hint = '참여 중인 방이 아닙니다.';
  end if;
  if char_length(v_q) not between 1 and 50 then
    raise exception 'VALIDATION_FAILED' using hint = '검색어는 1~50자로 입력해 주세요.';
  end if;

  return query
  select m.id, m.sender_id, coalesce(p.nickname, p.username), m.content, m.created_at
  from public.messages m
  left join public.profiles p on p.id = m.sender_id
  where m.room_id = p_room_id
    and m.kind = 'user'
    and m.deleted_at is null
    and m.sticker is null
    and m.image_path is null
    and (p_before_id is null or m.id < p_before_id)
    -- 사용자가 입력한 \ % _ 는 글자 그대로
    and m.content ilike '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by m.id desc
  limit 20;
end;
$$;
revoke execute on function public.search_messages(bigint, text, bigint) from public, anon;
grant execute on function public.search_messages(bigint, text, bigint) to authenticated;
