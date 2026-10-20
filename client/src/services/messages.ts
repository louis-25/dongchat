import { createClient } from "@/lib/supabase/client";
import { MESSAGE_PAGE_SIZE, type ChatMessage, type MessagePage, type MessageSearchHit } from "@/types/domain";
import { toJpeg } from "@/lib/image";
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

const IMAGE_FALLBACK = "(사진)";
const IMAGE_BUCKET = "chat-images";

// 긴 변 1600px JPEG로 줄여 `<room>/<uuid>.jpg`에 올리고 메시지를 만든다. 메시지가 실패하면 올린 파일을 지운다.
export async function sendImage(roomId: number, file: File, replyToId?: number): Promise<ChatMessage> {
  const supabase = createClient();
  const path = `${roomId}/${crypto.randomUUID()}.jpg`;
  const blob = await toJpeg(file, { maxSide: 1600, quality: 0.8 });
  const up = await supabase.storage.from(IMAGE_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
  if (up.error) throw toDomainError(up.error);
  const { data, error } = await supabase
    .from("messages")
    .insert({ room_id: roomId, content: IMAGE_FALLBACK, image_path: path, reply_to_id: replyToId ?? null })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) {
    await supabase.storage.from(IMAGE_BUCKET).remove([path]);
    throw toDomainError(error);
  }
  return toChatMessage(data as unknown as MessageCoreRow);
}

// 비공개 버킷이라 서명 URL(1시간)로 읽는다. 화면은 useImageUrl이 캐시한다.
export async function getImageUrl(path: string): Promise<string> {
  const { data, error } = await createClient().storage.from(IMAGE_BUCKET).createSignedUrl(path, 60 * 60);
  if (error) throw toDomainError(error);
  return data.signedUrl;
}

// 방 안 검색(글 메시지만). before를 주면 그보다 오래된 결과.
export async function searchMessages(roomId: number, query: string, before?: number): Promise<MessageSearchHit[]> {
  const { data, error } = await createClient().rpc("search_messages", { p_room_id: roomId, p_query: query, p_before_id: before ?? null });
  if (error) throw toDomainError(error);
  return (data ?? []).map((r) => ({ id: r.id, senderName: r.sender_name ?? "(알 수 없음)", content: r.content, createdAt: r.created_at }));
}

// null이면 내 반응 취소. 화면 반영은 reaction_updated 이벤트로.
// 같은 값을 다시 보내도 결과가 같아서, 네트워크 실패(앱 복귀 직후 등)는 1초 뒤 한 번 더 보낸다.
export async function setReaction(messageId: number, reaction: string | null): Promise<void> {
  const call = () => createClient().rpc("set_reaction", { p_message_id: messageId, p_reaction: reaction as string });
  let { error } = await call();
  if (error && toDomainError(error).code === "NETWORK_ERROR") {
    await new Promise((r) => setTimeout(r, 1000));
    ({ error } = await call());
  }
  if (error) throw toDomainError(error);
}

export async function editMessage(id: number, content: string): Promise<void> {
  const { error } = await createClient().rpc("edit_message", { p_id: id, p_content: normalizeMessageContent(content) });
  if (error) throw toDomainError(error);
}

// 사진 메시지면 파일도 지운다(실패해도 메시지 삭제는 유지 — 파일만 남는다).
export async function deleteMessage(id: number, imagePath?: string | null): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.rpc("delete_message", { p_id: id });
  if (error) throw toDomainError(error);
  if (imagePath) await supabase.storage.from(IMAGE_BUCKET).remove([imagePath]);
}

// 방의 최신 메시지까지 읽음(단조 증가, 변화 없으면 DB가 UPDATE 생략).
export async function markRead(roomId: number): Promise<number | null> {
  const { data, error } = await createClient().rpc("mark_read", { p_room_id: roomId });
  if (error) throw toDomainError(error);
  return data;
}
