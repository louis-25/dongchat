// 관리자 계약 검증: 비관리자 거부, 목록·정렬·페이지, 비멤버 방 열람(SELECT·Realtime), 강퇴 규칙, 정지·해제·강제 로그아웃.
// 실행(client/에서, supabase start 상태, 시드의 admin@dongchat.local 필요):
//   SUPABASE_PUBLISHABLE_KEY=<supabase status -o env의 PUBLISHABLE_KEY> node scripts/verify-admin.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { MESSAGE_SELECT, PARTICIPANT_SELECT, toMessagePage, toParticipant } from "../src/services/mappers.ts";
import { isBanned } from "../src/types/domain.ts";

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
  await client.realtime.setAuth();
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

const u1 = await signUp("va1");
const u2 = await signUp("va2");
const admin = await signIn("admin@dongchat.local");

// 비관리자 거부 (Review Focus 1)
await fails(u1.client.rpc("admin_list_users", {}), "ADMIN_FORBIDDEN");
await fails(u1.client.rpc("admin_list_rooms", {}), "ADMIN_FORBIDDEN");

// 사용자 목록: 페이지·정렬
const byName = await ok(admin.client.rpc("admin_list_users", { p_page: 1, p_limit: 2, p_sort: "username", p_order: "asc" }));
assert.equal(byName.items.length, 2, "limit 적용");
assert.ok(byName.total >= 3, "total은 전체 수");
assert.ok(byName.items[0].username < byName.items[1].username, "username 오름차순");
const recent = async () =>
  (await ok(admin.client.rpc("admin_list_users", { p_page: 1, p_limit: 100, p_sort: "created_at", p_order: "desc" }))).items;
const find = async (id) => (await recent()).find((u) => u.id === id);
assert.deepEqual(
  Object.keys(await find(u1.id)).sort(),
  ["bannedUntil", "createdAt", "email", "id", "isAdmin", "nickname", "username"],
  "AdminUser 키 계약",
);

// 방: 목록·멤버 수·방장, 비멤버 관리자 열람
const group = await ok(u1.client.rpc("create_room", { p_name: "adm", p_is_group: true, p_usernames: [u2.username] }));
const oneToOne = await ok(u1.client.rpc("create_room", { p_name: "", p_is_group: false, p_usernames: [u2.username] }));
const rooms = (await ok(admin.client.rpc("admin_list_rooms", { p_page: 1, p_limit: 100 }))).items;
const g = rooms.find((r) => r.id === group);
assert.deepEqual(
  Object.keys(g).sort(),
  ["createdAt", "createdBy", "id", "isGroup", "memberCount", "name", "ownerUsername"],
  "AdminRoom 키 계약",
);
assert.equal(g.memberCount, 2);
assert.equal(g.ownerUsername, u1.username);

await ok(u1.client.from("messages").insert({ room_id: group, content: "관리자 열람" }));
const page = toMessagePage(
  await ok(admin.client.from("messages").select(MESSAGE_SELECT).eq("room_id", group).order("id", { ascending: false }).limit(30)),
);
assert.deepEqual(
  page.messages.map((m) => m.content),
  ["관리자 열람"],
  "비멤버 관리자도 메시지 조회(RLS is_admin)",
);
const parts = (await ok(admin.client.from("chat_room_participants").select(PARTICIPANT_SELECT).eq("room_id", group))).map(
  toParticipant,
);
assert.equal(parts.length, 2, "비멤버 관리자도 참여자 조회");

// 비멤버 관리자 Realtime 수신
const events = [];
await new Promise((resolve, reject) => {
  const ch = admin.client.channel(`room:${group}`, { config: { private: true } });
  ch.on("broadcast", { event: "*" }, ({ event, payload }) => events.push({ event, payload }));
  ch.subscribe((s, err) => (s === "SUBSCRIBED" ? resolve() : s === "CHANNEL_ERROR" ? reject(err) : undefined));
});
const waitFor = async (match, label) => {
  for (let i = 0; i < 50; i++) {
    if (events.some(match)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`이벤트 미수신: ${label}`);
};
await ok(u2.client.from("messages").insert({ room_id: group, content: "실시간" }));
await waitFor((e) => e.event === "message" && e.payload.content === "실시간", "관리자 message 수신");

// 관리자 열람은 읽음 처리를 하지 않는다 → 참여자 읽음 위치 그대로 (Review Focus 3)
const after = (await ok(admin.client.from("chat_room_participants").select(PARTICIPANT_SELECT).eq("room_id", group))).map(
  toParticipant,
);
assert.ok(after.every((p) => p.lastReadMessageId === null), "열람만으로 읽음 위치가 바뀌지 않음");

// 강퇴: 1:1 불가, 그룹 가능 (Review Focus 4)
await fails(admin.client.rpc("kick_member", { p_room_id: oneToOne, p_user_id: u2.id }), "ROOM_KICK_FORBIDDEN");
await ok(admin.client.rpc("kick_member", { p_room_id: group, p_user_id: u2.id }));
await waitFor((e) => e.event === "member_removed" && e.payload.userId === u2.id, "관리자 member_removed 수신");

// 정지·해제·강제 로그아웃
await fails(admin.client.rpc("admin_ban", { p_user_id: admin.id, p_until: new Date(Date.now() + 86_400_000).toISOString() }), "VALIDATION_FAILED");
await ok(admin.client.rpc("admin_ban", { p_user_id: u2.id, p_until: "9999-12-31T00:00:00.000Z", p_reason: "verify" }));
assert.equal(isBanned((await find(u2.id)).bannedUntil), true, "정지 반영");
await ok(admin.client.rpc("admin_unban", { p_user_id: u2.id }));
assert.equal((await find(u2.id)).bannedUntil, null, "해제 반영");

// 정리(강제 로그아웃 전에): 1:1은 둘 다 나가고, 그룹방은 관리자가 마지막 멤버를 강퇴 → 방 삭제
await ok(u2.client.rpc("leave_room", { p_room_id: oneToOne }));
await ok(u1.client.rpc("leave_room", { p_room_id: oneToOne }));
await ok(admin.client.rpc("kick_member", { p_room_id: group, p_user_id: u1.id }));
assert.ok(!(await ok(admin.client.rpc("admin_list_rooms", { p_page: 1, p_limit: 100 }))).items.some((r) => r.id === group), "마지막 멤버 강퇴 시 방 삭제");

await ok(admin.client.rpc("admin_force_logout", { p_user_id: u1.id }));
assert.equal((await ok(u1.client.from("profiles").select("id"))).length, 0, "강제 로그아웃된 토큰은 데이터 0행");

console.log("verify-admin: OK");
process.exit(0);
