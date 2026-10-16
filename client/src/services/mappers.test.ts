import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fromMessagePayload,
  normalizeMessageContent,
  toChatMessage,
  toFriend,
  toFriendRequest,
  toMessagePage,
  toRoom,
  toRoomSummary,
} from "./mappers.ts";

const alice = { id: "a", username: "alice_dev", nickname: null, avatar_url: null, status_message: null };
const kakao = { id: "k", username: "kakao_ab12cd34", nickname: "정동현", avatar_url: "https://img/k.png", status_message: "바쁨" };
const row = { id: 7, created_at: "2026-10-14T01:00:00Z", requester: alice, receiver: kakao };

test("친구 행은 요청 방향과 무관하게 상대방을 돌려준다", () => {
  assert.deepEqual(toFriend(row, "a"), {
    id: 7,
    user: { id: "k", username: "kakao_ab12cd34", nickname: "정동현", avatarUrl: "https://img/k.png", statusMessage: "바쁨" },
  });
  assert.equal(toFriend(row, "k").user.username, "alice_dev");
});

test("받은 요청은 요청자 프로필과 요청 시각", () => {
  assert.deepEqual(toFriendRequest(row), {
    id: 7,
    requester: { id: "a", username: "alice_dev", nickname: null, avatarUrl: null, statusMessage: null },
    createdAt: "2026-10-14T01:00:00Z",
  });
});

test("방 행은 Room으로, 참여자는 입장 순(같으면 id 순)", () => {
  const room = toRoom({
    id: 3,
    name: null,
    is_group: true,
    created_by: "k",
    participants: [
      { user_id: "k", joined_at: "2026-10-14T02:00:00Z", last_read_message_id: 5, profile: kakao },
      { user_id: "a", joined_at: "2026-10-14T02:00:00Z", last_read_message_id: null, profile: alice },
    ],
  });
  assert.equal(room.ownerId, "k");
  assert.equal(room.isGroup, true);
  assert.deepEqual(
    room.participants.map((x) => [x.user.id, x.lastReadMessageId]),
    [
      ["a", null],
      ["k", 5],
    ],
  );
});

const core = (id: number, extra: Partial<Record<string, unknown>> = {}) => ({
  id,
  room_id: 9,
  sender_id: "a",
  content: `m${id}`,
  sticker: null,
  reply_to_id: null,
  edited_at: null,
  deleted_at: null,
  created_at: `2026-10-14T03:00:0${id}Z`,
  ...extra,
});

test("메시지 페이지: 최신순 행 → 오름차순, 발신자 프로필·답장 대상 수집(중복 제거)", () => {
  const page = toMessagePage([
    { ...core(5, { reply_to_id: 1, sender_id: "k" }), sender: kakao, reply: core(1) },
    { ...core(3, { reply_to_id: 1, sender_id: "k" }), sender: kakao, reply: core(1) },
    { ...core(2), sender: alice, reply: null },
    { ...core(4, { sender_id: null }), sender: null, reply: null },
  ] as never);
  assert.deepEqual(
    page.messages.map((m) => m.id),
    [2, 3, 4, 5],
  );
  assert.deepEqual(page.messages[1], {
    id: 3,
    roomId: 9,
    senderId: "k",
    content: "m3",
    sticker: null,
    replyToId: 1,
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-10-14T03:00:03Z",
  });
  assert.deepEqual(
    page.profiles.map((p) => p.id),
    ["k", "a"],
  );
  assert.deepEqual(
    page.replyTargets.map((m) => m.id),
    [1],
  );
});

test("Realtime message payload는 조회 행과 같은 ChatMessage가 된다", () => {
  const payload = { id: 5, roomId: 9, senderId: "a", content: "m5", replyToId: null, createdAt: "2026-10-14T03:00:05Z" };
  assert.deepEqual(fromMessagePayload(payload), toChatMessage(core(5) as never));
});

test("이모티콘: payload·조회 행 모두 sticker 유지, 예전 payload(sticker 없음)는 null", () => {
  const payload = { id: 6, roomId: 9, senderId: "a", content: "(이모티콘)", sticker: "hi", replyToId: null, createdAt: "t" };
  assert.equal(fromMessagePayload(payload).sticker, "hi");
  assert.equal(toChatMessage(core(6, { sticker: "hi" }) as never).sticker, "hi");
  assert.equal(fromMessagePayload({ ...payload, sticker: undefined }).sticker, null);
});

test("메시지 내용: 앞뒤 공백 제거, 공백만·2000자 초과 거부, 이모지는 코드 포인트로 센다", () => {
  assert.equal(normalizeMessageContent("  안녕  "), "안녕");
  assert.throws(() => normalizeMessageContent("   "), { code: "VALIDATION_FAILED" });
  assert.throws(() => normalizeMessageContent("a".repeat(2001)), { code: "VALIDATION_FAILED" });
  assert.equal(normalizeMessageContent("😀".repeat(2000)).length, 4000);
});

test("방 요약 행은 RoomSummary로, 메시지 없는 방은 lastMessage null", () => {
  const base = {
    room_id: 7, name: null, is_group: false, created_at: "2026-10-15T00:00:00Z", member_count: 2,
    last_message_id: null, last_message_content: null, last_message_deleted: false,
    last_message_sender_id: null, last_message_at: null, unread_count: 0, last_message_sticker: null,
  };
  assert.deepEqual(toRoomSummary(base), {
    id: 7, name: null, isGroup: false, createdAt: "2026-10-15T00:00:00Z", memberCount: 2, lastMessage: null, unreadCount: 0,
  });
  assert.deepEqual(
    toRoomSummary({ ...base, last_message_id: 3, last_message_content: null, last_message_deleted: true, last_message_sender_id: "u", last_message_at: "2026-10-15T01:00:00Z", unread_count: 4 }).lastMessage,
    { id: 3, content: "", sticker: null, deleted: true, senderId: "u", at: "2026-10-15T01:00:00Z" },
  );
});
