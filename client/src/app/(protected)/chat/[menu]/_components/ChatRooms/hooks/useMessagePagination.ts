import { get } from "@/lib/api-client";
import type { ChatMessage, IncomingMessage } from "../types";

// Design Ref: §4.2 — cursor(before) 기반 과거 메시지 조회 (FR-08)
export const normalizeMessage = (m: IncomingMessage): ChatMessage => ({
  id: Number(m.id),
  sender: m.sender,
  senderId: m.senderId ?? null,
  message: m.content ?? m.message ?? "",
  replyTo: m.replyTo ?? null,
  editedAt: m.editedAt ?? null,
  deletedAt: m.deletedAt ?? null,
  unreadCount: m.unreadCount ?? 0,
  createdAt: m.createdAt,
});

/**
 * 특정 방의 과거 메시지를 cursor 기준으로 가져온다.
 * @returns 시간순(ASC) ChatMessage 배열
 */
export const fetchOlderMessages = async (
  roomId: number,
  before?: number,
  limit = 30
): Promise<ChatMessage[]> => {
  const res = await get<IncomingMessage[]>("/chat", {
    params: { roomId, ...(before ? { before } : {}), limit },
  });
  return (res.data || [])
    .map(normalizeMessage)
    .filter((m) => Number.isFinite(m.id));
};
