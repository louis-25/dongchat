// 채팅 데이터·Realtime 계약 검증. services와 같은 SELECT·매퍼로 실제 로컬 DB와 Realtime을 사용한다.
// 실행(client/에서, supabase start 상태, 시드의 admin@dongchat.local 필요):
//   SUPABASE_PUBLISHABLE_KEY=<supabase status -o env의 PUBLISHABLE_KEY> node scripts/verify-chat.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import {
  MESSAGE_COLUMNS,
  MESSAGE_SELECT,
  PARTICIPANT_SELECT,
  fromMessagePayload,
  toChatMessage,
  toMessagePage,
  toParticipant,
} from "../src/services/mappers.ts";

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
  await client.realtime.setAuth();
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

const events = [];
const listen = (u, topic, tag) =>
  new Promise((resolve, reject) => {
    const channel = u.client.channel(topic, { config: { private: true } });
    channel.on("broadcast", { event: "*" }, ({ event, payload }) => events.push({ tag, event, payload }));
    channel.subscribe((status, err) => {
      if (status === "SUBSCRIBED") resolve(channel);
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") reject(err ?? new Error(status));
    });
  });
const waitFor = async (match, label) => {
  for (let i = 0; i < 50; i++) {
    const hit = events.find(match);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 100));
  }
  assert.fail(`이벤트 미수신: ${label}`);
};

const u1 = await signUp("vc1");
const u2 = await signUp("vc2");
const admin = await signIn("admin@dongchat.local");
await listen(u2, `user:${u2.id}`, "u2user");

// 방 생성 → 초대된 사람 user 토픽 member_added (Review Focus 5)
const roomId = await ok(u1.client.rpc("create_room", { p_name: "", p_is_group: false, p_usernames: [u2.username] }));
await waitFor((e) => e.tag === "u2user" && e.event === "member_added" && e.payload.roomId === roomId, "member_added");

await listen(u1, `room:${roomId}`, "u1room");
await listen(u2, `room:${roomId}`, "u2room");

// 전송 → message 이벤트가 조회 결과와 같은 ChatMessage로 변환된다
const sent = toChatMessage(
  await ok(u2.client.from("messages").insert({ room_id: roomId, content: "안녕" }).select(MESSAGE_COLUMNS).single()),
);
const msgEvent = await waitFor((e) => e.tag === "u1room" && e.event === "message" && e.payload.id === sent.id, "message");
const fromEvent = fromMessagePayload(msgEvent.payload);
assert.equal(new Date(fromEvent.createdAt).getTime(), new Date(sent.createdAt).getTime(), "createdAt 같은 시각");
assert.deepEqual({ ...fromEvent, createdAt: "" }, { ...sent, createdAt: "" }, "payload ↔ 조회 행 계약 일치");

// 답장 + 페이지 조회(발신자·답장 대상 포함)
await ok(u1.client.from("messages").insert({ room_id: roomId, content: "반가워", reply_to_id: sent.id }));
const page = toMessagePage(
  await ok(u1.client.from("messages").select(MESSAGE_SELECT).eq("room_id", roomId).order("id", { ascending: false }).limit(30)),
);
assert.deepEqual(
  page.messages.map((m) => m.content),
  ["안녕", "반가워"],
  "오름차순",
);
assert.ok(page.profiles.some((p) => p.username === u2.username), "발신자 프로필 포함");
assert.deepEqual(
  page.replyTargets.map((m) => m.id),
  [sent.id],
  "답장 대상 포함",
);

// 읽음: read_update 이벤트 + 참여자 읽음 위치(안 읽은 참여자는 null)
await ok(u1.client.rpc("mark_read", { p_room_id: roomId }));
await waitFor((e) => e.tag === "u2room" && e.event === "read_update" && e.payload.userId === u1.id, "read_update");
const parts = (await ok(u2.client.from("chat_room_participants").select(PARTICIPANT_SELECT).eq("room_id", roomId))).map(
  toParticipant,
);
assert.equal(parts.find((p) => p.user.id === u1.id).lastReadMessageId, page.messages[1].id, "u1 읽음 위치 = 최신");
assert.equal(parts.find((p) => p.user.id === u2.id).lastReadMessageId, null, "한 번도 안 읽으면 null");

// 수정·삭제
await ok(u2.client.rpc("edit_message", { p_id: sent.id, p_content: "안녕하세요" }));
await waitFor((e) => e.tag === "u1room" && e.event === "message_edited" && e.payload.content === "안녕하세요", "edited");
await ok(u2.client.rpc("delete_message", { p_id: sent.id }));
await waitFor((e) => e.tag === "u1room" && e.event === "message_deleted" && e.payload.id === sent.id, "deleted");

// 정지 → force_logout(sessionId 없음) + 데이터 즉시 거부, 해제 (Review Focus 4)
await ok(
  admin.client.rpc("admin_ban", {
    p_user_id: u2.id,
    p_until: new Date(Date.now() + 3600_000).toISOString(),
    p_reason: "verify",
  }),
);
const fl = await waitFor((e) => e.tag === "u2user" && e.event === "force_logout" && e.payload.reason === "banned", "force_logout");
assert.equal(fl.payload.sessionId, undefined, "정지 통지에는 sessionId가 없다(모든 세션 대상)");
assert.equal((await ok(u2.client.from("messages").select("id").eq("room_id", roomId))).length, 0, "정지 중 조회 0행");
await ok(admin.client.rpc("admin_unban", { p_user_id: u2.id }));

// 나가기 → 나간 사람 user 토픽, 남은 사람 room 토픽 member_removed
await ok(u2.client.rpc("leave_room", { p_room_id: roomId }));
await waitFor((e) => e.tag === "u2user" && e.event === "member_removed" && e.payload.roomId === roomId, "user member_removed");
await waitFor((e) => e.tag === "u1room" && e.event === "member_removed" && e.payload.userId === u2.id, "room member_removed");
await ok(u1.client.rpc("leave_room", { p_room_id: roomId }));

console.log("verify-chat: OK");
process.exit(0); // Realtime 소켓이 프로세스를 붙잡으므로 명시 종료
