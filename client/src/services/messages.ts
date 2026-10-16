import { createClient } from "@/lib/supabase/client";
import { MESSAGE_PAGE_SIZE, type ChatMessage, type MessagePage } from "@/types/domain";
import { STICKER_FALLBACK } from "@/lib/stickers";
import { toDomainError } from "./errors";
import {
  MESSAGE_COLUMNS,
  MESSAGE_SELECT,
  normalizeMessageContent,
  toChatMessage,
  toMessagePage,
  type MessageCoreRow,
  type MessageRow,
} from "./mappers";

// 메시지 경계. NestJS 복귀 시 이 파일 내부만 교체한다.
// before가 없으면 최신 페이지, 있으면 그 id보다 오래된 페이지. 결과는 id 오름차순.
export async function fetchMessages(roomId: number, before?: number): Promise<MessagePage> {
  let query = createClient()
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("room_id", roomId)
    .order("id", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (before !== undefined) query = query.lt("id", before);
  const { data, error } = await query;
  if (error) throw toDomainError(error);
  // ponytail: 동적 SELECT 문자열이라 행 타입 추론이 안 된다. 계약은 verify-chat.mjs가 검증.
  return toMessagePage(data as unknown as MessageRow[]);
}

// 발신자는 DB 기본값 auth.uid()(컬럼 권한상 지정 불가). 반환값으로 Realtime 에코 전에 화면에 반영한다.
export async function sendMessage(roomId: number, content: string, replyToId?: number): Promise<ChatMessage> {
  const text = normalizeMessageContent(content);
  const { data, error } = await createClient()
    .from("messages")
    .insert({ room_id: roomId, content: text, reply_to_id: replyToId ?? null })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw toDomainError(error);
  return toChatMessage(data as unknown as MessageCoreRow);
}

// content는 알림·목록·답장 미리보기에 쓰이는 대체 문구
export async function sendSticker(roomId: number, sticker: string, replyToId?: number): Promise<ChatMessage> {
  const { data, error } = await createClient()
    .from("messages")
    .insert({ room_id: roomId, content: STICKER_FALLBACK, sticker, reply_to_id: replyToId ?? null })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw toDomainError(error);
  return toChatMessage(data as unknown as MessageCoreRow);
}

export async function editMessage(id: number, content: string): Promise<void> {
  const { error } = await createClient().rpc("edit_message", { p_id: id, p_content: normalizeMessageContent(content) });
  if (error) throw toDomainError(error);
}

export async function deleteMessage(id: number): Promise<void> {
  const { error } = await createClient().rpc("delete_message", { p_id: id });
  if (error) throw toDomainError(error);
}

// 방의 최신 메시지까지 읽음(단조 증가, 변화 없으면 DB가 UPDATE 생략).
export async function markRead(roomId: number): Promise<number | null> {
  const { data, error } = await createClient().rpc("mark_read", { p_room_id: roomId });
  if (error) throw toDomainError(error);
  return data;
}
