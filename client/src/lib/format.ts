import type { RoomSummary } from "../types/domain.ts";
import { stickerLabel } from "./stickers.ts";

// 화면 표시 문자열. 기기 시간대·ko-KR 기준.
const clock = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" });
const monthDay = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" });
const fullDate = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric" });
const divider = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" });

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const formatClock = (iso: string): string => clock.format(new Date(iso));

export const formatListTime = (iso: string, now: Date = new Date()): string => {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return clock.format(d);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return "어제";
  if (d.getFullYear() === now.getFullYear()) return monthDay.format(d);
  return fullDate.format(d);
};

export const formatDateDivider = (iso: string): string => divider.format(new Date(iso));

export const badgeText = (n: number): string | null => (n <= 0 ? null : n > 99 ? "99+" : String(n));

export const previewText = (s: RoomSummary, ctx: { me: string; senderName: (id: string) => string }): string => {
  const m = s.lastMessage;
  if (!m) return "아직 메시지가 없어요";
  if (m.deleted) return "삭제된 메시지입니다";
  const content = m.sticker ? stickerLabel(m.sticker) : m.content; // 이모티콘은 그림(RoomRow) + 이름
  if (s.isGroup && m.senderId && m.senderId !== ctx.me) return `${ctx.senderName(m.senderId)}: ${content}`;
  return content;
};
