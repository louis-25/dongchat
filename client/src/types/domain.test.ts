import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, roomTitle } from "./domain.ts";
import type { Profile, Room } from "./domain.ts";

const p = (id: string, username: string, nickname: string | null = null): Profile => ({
  id,
  username,
  nickname,
  avatarUrl: null,
});
const member = (user: Profile) => ({ user, joinedAt: "2026-10-14T00:00:00Z", lastReadMessageId: null });

test("표시명은 nickname 우선, 없으면 username", () => {
  assert.equal(displayName(p("1", "kakao_ab12cd34", "정동현")), "정동현");
  assert.equal(displayName(p("2", "alice_dev")), "alice_dev");
});

test("방 이름이 있으면 그대로 쓴다", () => {
  const room: Room = { id: 1, name: "스터디", isGroup: true, ownerId: "me", participants: [member(p("me", "me_user"))] };
  assert.equal(roomTitle(room, "me"), "스터디");
});

test("이름 없는 방은 나를 뺀 참여자 표시명, 혼자 남으면 안내 문구", () => {
  const room: Room = {
    id: 2,
    name: null,
    isGroup: false,
    ownerId: "me",
    participants: [member(p("me", "me_user")), member(p("k", "kakao_ab12cd34", "정동현"))],
  };
  assert.equal(roomTitle(room, "me"), "정동현");
  assert.equal(roomTitle({ ...room, participants: [member(p("me", "me_user"))] }, "me"), "대화 상대 없음");
});
