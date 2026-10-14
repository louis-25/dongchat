import { test } from "node:test";
import assert from "node:assert/strict";
import { toFriend, toFriendRequest, toRoom } from "./mappers.ts";

const alice = { id: "a", username: "alice_dev", nickname: null, avatar_url: null };
const kakao = { id: "k", username: "kakao_ab12cd34", nickname: "정동현", avatar_url: "https://img/k.png" };
const row = { id: 7, created_at: "2026-10-14T01:00:00Z", requester: alice, receiver: kakao };

test("친구 행은 요청 방향과 무관하게 상대방을 돌려준다", () => {
  assert.deepEqual(toFriend(row, "a"), {
    id: 7,
    user: { id: "k", username: "kakao_ab12cd34", nickname: "정동현", avatarUrl: "https://img/k.png" },
  });
  assert.equal(toFriend(row, "k").user.username, "alice_dev");
});

test("받은 요청은 요청자 프로필과 요청 시각", () => {
  assert.deepEqual(toFriendRequest(row), {
    id: 7,
    requester: { id: "a", username: "alice_dev", nickname: null, avatarUrl: null },
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
