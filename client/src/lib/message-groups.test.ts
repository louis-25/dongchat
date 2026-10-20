import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline } from "./message-groups.ts";
import type { MessageView } from "./chat-state.ts";

const v = (id: number, senderId: string, at: Date, deleted = false, kind: MessageView["kind"] = "user"): MessageView => ({
  id, roomId: 1, senderId, kind, content: `m${id}`, sticker: null, imagePath: null, imagePaths: [], reactions: [], replyToId: null, editedAt: null,
  deletedAt: deleted ? at.toISOString() : null, createdAt: at.toISOString(),
  senderName: senderId, senderAvatar: null, isMine: senderId === "me", unreadCount: null, replyTo: null,
});

test("날짜가 바뀌면 구분선, 같은 사람 5분 이내는 한 묶음", () => {
  const d = (h: number, m: number, day = 15) => new Date(2026, 9, day, h, m);
  const items = buildTimeline([v(1, "a", d(9, 0, 14)), v(2, "a", d(9, 0)), v(3, "a", d(9, 4)), v(4, "a", d(9, 10)), v(5, "b", d(9, 11))]);
  assert.deepEqual(items.map((i) => (i.kind === "date" ? `D:${i.label}` : i.kind === "notice" ? "N" : `${i.view.id}${i.first ? "F" : ""}${i.last ? "L" : ""}`)), [
    "D:2026년 10월 14일 수요일", "1FL",
    "D:2026년 10월 15일 목요일", "2F", "3L", "4FL", "5FL",
  ]);
});

test("삭제된 메시지는 묶음을 끊는다", () => {
  const t = new Date(2026, 9, 15, 9, 0);
  const items = buildTimeline([v(1, "a", t), v(2, "a", t, true), v(3, "a", t)]).filter((i) => i.kind === "message");
  assert.deepEqual(items.map((i) => (i.kind === "message" ? [i.first, i.last] : null)), [[true, true], [true, true], [true, true]]);
});

test("입장·퇴장 안내는 별도 줄, 앞뒤 묶음을 끊는다", () => {
  const t = new Date(2026, 9, 15, 9, 0);
  const items = buildTimeline([v(1, "a", t), v(2, "a", t, false, "system"), v(3, "a", t)]);
  assert.deepEqual(items.map((i) => (i.kind === "message" ? `${i.view.id}${i.first ? "F" : ""}${i.last ? "L" : ""}` : i.kind)),
    ["date", "1FL", "notice", "3FL"]);
});
