// 친구·방 데이터 계약 검증. services와 같은 SELECT·매퍼(src/services/mappers.ts)를 실제 로컬 DB에 실행한다.
// 실행(client/에서, supabase start 상태, 시드의 admin@dongchat.local 필요):
//   SUPABASE_PUBLISHABLE_KEY=<supabase status -o env의 PUBLISHABLE_KEY> node scripts/verify-social.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { FRIEND_SELECT, ROOM_SELECT, toFriend, toFriendRequest, toRoom } from "../src/services/mappers.ts";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
assert.ok(KEY, "SUPABASE_PUBLISHABLE_KEY 환경 변수가 필요합니다.");

const fresh = () => createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = Date.now().toString(36);

async function signUp(tag) {
  const client = fresh();
  const username = `${tag}_${stamp}`.slice(0, 20);
  const { data, error } = await client.auth.signUp({
    email: `${username}@test.local`,
    password: "password123",
    options: { data: { username } },
  });
  assert.equal(error, null, error?.message);
  return { client, id: data.user.id, username };
}
async function signIn(email) {
  const client = fresh();
  const { data, error } = await client.auth.signInWithPassword({ email, password: "password123" });
  assert.equal(error, null, error?.message);
  return { client, id: data.user.id };
}
const ok = async (query) => {
  const { data, error } = await query;
  assert.equal(error, null, error?.message);
  return data;
};
const fails = async (query, code) => {
  const { error } = await query;
  assert.equal(error?.message, code, `${code} 기대, 실제: ${error?.message}`);
};
// services/rooms.listRooms와 같은 쿼리
const myRooms = async (u) =>
  (await ok(u.client.from("chat_rooms").select(ROOM_SELECT).eq("me.user_id", u.id).order("id", { ascending: false }))).map(
    toRoom,
  );
const adminSees = async (roomId) => (await ok(admin.client.from("chat_rooms").select("id").eq("id", roomId))).length;

const u1 = await signUp("vs1");
const u2 = await signUp("vs2");
const u3 = await signUp("vs3");
const admin = await signIn("admin@dongchat.local");

// ---- 친구 ----
await ok(u1.client.rpc("send_friend_request", { p_username: ` ${u2.username.toUpperCase()} ` }));
await fails(u2.client.rpc("send_friend_request", { p_username: u1.username }), "FRIEND_DUPLICATE");
await fails(u1.client.rpc("send_friend_request", { p_username: u1.username }), "FRIEND_SELF_REQUEST");
await fails(u1.client.rpc("send_friend_request", { p_username: "no_such_user_zz" }), "FRIEND_USER_NOT_FOUND");

const pending = (
  await ok(u2.client.from("friends").select(FRIEND_SELECT).eq("status", "PENDING").eq("receiver_id", u2.id).order("id"))
).map(toFriendRequest);
assert.equal(pending.length, 1, "받은 요청 1건");
assert.equal(pending[0].requester.username, u1.username);

await fails(u1.client.rpc("respond_friend_request", { p_id: pending[0].id, p_action: "ACCEPT" }), "CHAT_FORBIDDEN");
await ok(u2.client.rpc("respond_friend_request", { p_id: pending[0].id, p_action: "ACCEPT" }));
for (const [me, other] of [
  [u1, u2],
  [u2, u1],
]) {
  const friends = (await ok(me.client.from("friends").select(FRIEND_SELECT).eq("status", "ACCEPTED").order("id"))).map((r) =>
    toFriend(r, me.id),
  );
  assert.deepEqual(
    friends.map((f) => f.user.username),
    [other.username],
    "양쪽 모두 상대방이 친구로 보인다",
  );
}

// ---- 방 ----
await fails(
  u1.client.rpc("create_room", { p_name: "", p_is_group: false, p_usernames: [u2.username, u3.username] }),
  "ROOM_INVALID_PARTICIPANTS",
);
const roomId = await ok(
  u1.client.rpc("create_room", { p_name: "verify", p_is_group: true, p_usernames: [u2.username, u3.username] }),
);
const room = (await myRooms(u1)).find((r) => r.id === roomId);
assert.ok(room, "만든 사람 목록에 보인다");
assert.equal(room.ownerId, u1.id, "만든 사람이 방장");
assert.equal(room.participants.length, 3);
assert.ok((await myRooms(u2)).some((r) => r.id === roomId), "참여자 목록에 보인다");
assert.ok(!(await myRooms(admin)).some((r) => r.id === roomId), "관리자도 내 방 목록에는 참여한 방만 (Review Focus 1)");
assert.equal(await adminSees(roomId), 1, "me 필터 없이는 관리자에게 보인다 — 필터가 필요한 이유");

// ---- 강퇴·나가기·방장 승계 ----
await fails(u2.client.rpc("kick_member", { p_room_id: roomId, p_user_id: u3.id }), "ROOM_KICK_FORBIDDEN");
await ok(u1.client.rpc("kick_member", { p_room_id: roomId, p_user_id: u3.id }));
assert.ok(!(await myRooms(u3)).some((r) => r.id === roomId), "강퇴된 사용자 목록에서 사라진다");

await ok(u1.client.rpc("leave_room", { p_room_id: roomId }));
const after = (await myRooms(u2)).find((r) => r.id === roomId);
assert.equal(after.ownerId, u2.id, "방장이 나가면 남은 멤버가 방장 (Review Focus 3)");
assert.deepEqual(
  after.participants.map((p) => p.user.id),
  [u2.id],
);
await ok(u2.client.rpc("leave_room", { p_room_id: roomId }));
assert.equal(await adminSees(roomId), 0, "마지막 멤버가 나가면 방 삭제");

// 초대 링크(초대 스펙 §3): u4가 u1의 코드로 친구 → 다시 수락하면 already
const u4 = await signUp("vs4");
const code = await ok(u1.client.rpc("get_my_invite_code"));
assert.equal(await ok(u1.client.rpc("get_my_invite_code")), code, "같은 코드");
assert.equal((await ok(u4.client.rpc("preview_invite", { p_code: code })))[0].username, u1.username, "미리보기");
assert.equal((await ok(u4.client.rpc("accept_invite", { p_code: code })))[0].already, false, "수락");
assert.equal((await ok(u4.client.rpc("accept_invite", { p_code: code })))[0].already, true, "이미 친구");
await fails(u1.client.rpc("accept_invite", { p_code: code }), "FRIEND_SELF_REQUEST");
await fails(u4.client.rpc("accept_invite", { p_code: "nope_nope_00" }), "INVITE_NOT_FOUND");
console.log("verify-social: OK");
