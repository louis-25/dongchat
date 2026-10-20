import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRoomEvent, sortSummaries, totalUnread } from "./room-list.ts";
import type { ChatMessage, RoomSummary } from "../types/domain.ts";

const s = (id: number, at: string | null, unread = 0, createdAt = "2026-10-01T00:00:00Z"): RoomSummary => ({
  id, name: null, isGroup: false, createdAt, memberCount: 2, unreadCount: unread, muted: false,
  lastMessage: at === null ? null : { id: id * 10, content: "x", sticker: null, deleted: false, senderId: "u", at },
});
const msg = (roomId: number, id: number, senderId: string | null, kind: ChatMessage["kind"] = "user"): ChatMessage => ({
  id, roomId, senderId, kind, content: "새", sticker: null, imagePath: null, imagePaths: [], reactions: [], replyToId: null, editedAt: null, deletedAt: null, createdAt: "2026-10-15T10:00:00Z",
});
const ctx = { me: "me", isViewing: () => false };

test("정렬: 마지막 메시지(없으면 생성) 시각 내림차순, 같으면 id 내림차순", () => {
  const list = sortSummaries([s(1, "2026-10-14T00:00:00Z"), s(2, null, 0, "2026-10-15T00:00:00Z"), s(3, "2026-10-14T00:00:00Z")]);
  assert.deepEqual(list.map((r) => r.id), [2, 3, 1]);
});

test("새 메시지: 맨 위로, 남의 메시지면 +1, 내 것·보고 있는 방은 그대로", () => {
  const list = [s(1, "2026-10-15T09:00:00Z"), s(2, "2026-10-14T00:00:00Z", 3)];
  const a = applyRoomEvent(list, { type: "message", roomId: 2, message: msg(2, 100, "u2") }, ctx);
  assert.deepEqual(a.list.map((r) => [r.id, r.unreadCount]), [[2, 4], [1, 0]]);
  assert.equal(a.list[0].lastMessage?.content, "새");
  assert.equal(a.refetch, false);
  assert.equal(applyRoomEvent(list, { type: "message", roomId: 2, message: msg(2, 100, "me") }, ctx).list[0].unreadCount, 3);
  assert.equal(applyRoomEvent(list, { type: "message", roomId: 2, message: msg(2, 100, "u2") }, { ...ctx, isViewing: (id) => id === 2 }).list[0].unreadCount, 3);
});

test("같은 메시지가 두 번 와도 한 번만 센다", () => {
  const once = applyRoomEvent([s(2, "2026-10-14T00:00:00Z", 0)], { type: "message", roomId: 2, message: msg(2, 100, "u2") }, ctx).list;
  const twice = applyRoomEvent(once, { type: "message", roomId: 2, message: msg(2, 100, "u2") }, ctx);
  assert.equal(twice.list[0].unreadCount, 1);
  assert.equal(twice.list, once);
});

test("모르는 방·삭제·멤버 변동·재구독은 다시 불러오기", () => {
  const list = [s(1, "2026-10-15T09:00:00Z")];
  assert.equal(applyRoomEvent(list, { type: "message", roomId: 9, message: msg(9, 1, "u2") }, ctx).refetch, true);
  assert.equal(applyRoomEvent(list, { type: "message_deleted", roomId: 1, id: 10 }, ctx).refetch, true);
  assert.equal(applyRoomEvent(list, { type: "member_removed", roomId: 1, userId: "u2" }, ctx).refetch, true);
  assert.equal(applyRoomEvent(list, { type: "subscribed", roomId: 1 }, ctx).refetch, true);
});

test("수정은 마지막 메시지일 때만 미리보기 갱신, 내 읽음은 0", () => {
  const list = [s(1, "2026-10-15T09:00:00Z", 5)];
  assert.equal(applyRoomEvent(list, { type: "message_edited", roomId: 1, id: 10, content: "고침", editedAt: "" }, ctx).list[0].lastMessage?.content, "고침");
  assert.equal(applyRoomEvent(list, { type: "message_edited", roomId: 1, id: 9, content: "고침", editedAt: "" }, ctx).list, list);
  assert.equal(applyRoomEvent(list, { type: "read_update", roomId: 1, userId: "me", lastReadMessageId: 10 }, ctx).list[0].unreadCount, 0);
  assert.equal(applyRoomEvent(list, { type: "read_update", roomId: 1, userId: "u2", lastReadMessageId: 10 }, ctx).list, list);
});

test("전체 안 읽은 수", () => {
  assert.equal(totalUnread([s(1, null, 2), s(2, null, 5)]), 7);
});

test("입장·퇴장 안내는 미리보기만 바꾸고 안 읽은 수는 그대로", () => {
  const a = applyRoomEvent([s(2, "2026-10-14T00:00:00Z", 3)], { type: "message", roomId: 2, message: msg(2, 100, null, "system") }, ctx);
  assert.equal(a.list[0].unreadCount, 3);
  assert.equal(a.list[0].lastMessage?.id, 100);
});
