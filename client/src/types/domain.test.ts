import { test } from "node:test";
import assert from "node:assert/strict";
import { banUntil, displayName, isBanned, isPermanentBan, roomTitle } from "./domain.ts";
import type { Profile, Room } from "./domain.ts";

const p = (id: string, username: string, nickname: string | null = null): Profile => ({
  id,
  username,
  nickname,
  avatarUrl: null,
  statusMessage: null,
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

test("정지 종료 시각: 기간은 지금부터, 영구는 9999년", () => {
  const now = new Date("2026-10-14T00:00:00.000Z");
  assert.equal(banUntil("1d", now).toISOString(), "2026-10-15T00:00:00.000Z");
  assert.equal(banUntil("7d", now).toISOString(), "2026-10-21T00:00:00.000Z");
  assert.equal(banUntil("30d", now).toISOString(), "2026-11-13T00:00:00.000Z");
  assert.equal(banUntil("permanent", now).toISOString(), "9999-12-31T00:00:00.000Z");
});

test("정지 상태: 미래 시각만 정지, 지난 시각·null은 정상, 9999년은 영구 (Review Focus 4)", () => {
  const now = new Date("2026-10-14T00:00:00.000Z");
  assert.equal(isBanned("2026-10-15T00:00:00+00:00", now), true);
  assert.equal(isBanned("2026-10-13T00:00:00+00:00", now), false);
  assert.equal(isBanned(null, now), false);
  assert.equal(isPermanentBan("9999-12-31T00:00:00+00:00"), true);
  assert.equal(isPermanentBan("2026-10-15T00:00:00+00:00"), false);
  assert.equal(isPermanentBan(null), false);
});
