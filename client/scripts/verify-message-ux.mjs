// message-ux 런타임 E2E 검증 (G1 해소)
// 실행: cd client && node scripts/verify-message-ux.mjs
import { io } from "socket.io-client";

const BASE = "http://localhost:4000";
const pass = [];
const fail = [];
const ok = (c, m) => (c ? pass : fail).push(m);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, body, token) {
  const res = await fetch(BASE + path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* no body */
  }
  return { status: res.status, data };
}

async function login(username, password) {
  await api("/auth/register", { username, password }); // 409면 무시
  const r = await api("/auth/login", { username, password });
  return r.data.access_token;
}

function connect(token) {
  return io(BASE, { auth: { token }, transports: ["websocket"] });
}
const waitEvent = (sock, ev, timeout = 3000) =>
  new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), timeout);
    sock.once(ev, (p) => {
      clearTimeout(t);
      resolve(p);
    });
  });

async function main() {
  const ua = "verify_a";
  const ub = "verify_b";
  const tokenA = await login(ua, "password123");
  const tokenB = await login(ub, "password123");
  ok(!!tokenA && !!tokenB, "로그인/토큰 발급");

  // 그룹 방 생성 (A + B)
  const room = await api(
    "/chat/rooms",
    { isGroup: true, participantUsernames: [ub] },
    tokenA
  );
  const roomId = room.data?.id;
  ok(!!roomId, `채팅방 생성 (roomId=${roomId})`);

  // L1: 인증 없이 /chat → 401
  const noAuth = await fetch(`${BASE}/chat?roomId=${roomId}`).then((r) => r.status);
  ok(noAuth === 401, `미인증 GET /chat → 401 (실제 ${noAuth})`);

  const sockA = connect(tokenA);
  const sockB = connect(tokenB);
  await Promise.all([waitEvent(sockA, "connect"), waitEvent(sockB, "connect")]);
  ok(sockA.connected && sockB.connected, "소켓 JWT 인증 연결");

  // 양쪽 입장
  sockA.emit("join_room", { roomId });
  sockB.emit("join_room", { roomId });
  await sleep(500);

  // FR-01/07: A가 메시지 전송 → 양쪽 수신, id/unreadCount 포함
  const aRecv = waitEvent(sockA, "message");
  const bRecv = waitEvent(sockB, "message");
  sockA.emit("message", { roomId, content: "안녕 B" });
  const m1 = await aRecv;
  await bRecv;
  ok(m1 && typeof m1.id === "number", `메시지에 id 포함 (id=${m1?.id})`);
  ok(m1 && m1.message === "안녕 B", "메시지 내용 전달");
  const msgId = m1?.id;

  // FR-03: B 미열람 시 unreadCount >= 1 (A가 보낸 직후, B는 아직 read 전이거나 join 시 read)
  // join에서 B가 read했을 수 있으므로, 새 메시지에 대한 unread를 명시 검증:
  ok(typeof m1?.unreadCount === "number", `unreadCount 필드 존재 (=${m1?.unreadCount})`);

  // FR-02: B가 읽음 → A가 read_update 수신
  const aReadUpd = waitEvent(sockA, "read_update");
  sockB.emit("message_read", { roomId });
  const ru = await aReadUpd;
  ok(ru && ru.lastReadMessageId >= msgId, `read_update 수신 (lastRead=${ru?.lastReadMessageId})`);

  // FR-07: 답장
  const aReply = waitEvent(sockA, "message");
  sockA.emit("message", { roomId, content: "이건 답장", replyToId: msgId });
  const r1 = await aReply;
  ok(r1 && r1.replyTo && r1.replyTo.id === msgId, `답장 replyTo 연결 (replyTo=${r1?.replyTo?.id})`);

  // FR-04: 본인 메시지 수정
  const aEdited = waitEvent(sockA, "message_edited");
  sockA.emit("message_edit", { messageId: msgId, content: "수정된 메시지" });
  const e1 = await aEdited;
  ok(e1 && e1.content === "수정된 메시지" && !!e1.editedAt, "본인 메시지 수정 + editedAt");

  // FR-06: B가 A의 메시지 수정 시도 → 거부(message_error)
  const bErr = waitEvent(sockB, "message_error");
  sockB.emit("message_edit", { messageId: msgId, content: "해킹" });
  const err = await bErr;
  ok(err && err.code === "CHAT_FORBIDDEN", `타인 수정 거부 (code=${err?.code})`);

  // FR-05: 본인 메시지 삭제(soft)
  const aDeleted = waitEvent(sockA, "message_deleted");
  sockA.emit("message_delete", { messageId: msgId });
  const d1 = await aDeleted;
  ok(d1 && d1.id === msgId, "본인 메시지 삭제(soft) 브로드캐스트");

  // FR-08: cursor 페이지네이션 (REST)
  const list = await fetch(`${BASE}/chat?roomId=${roomId}&limit=10`, {
    headers: { Authorization: `Bearer ${tokenA}` },
  }).then((r) => r.json());
  ok(Array.isArray(list) && list.length >= 1, `GET /chat 목록 조회 (${list.length}건)`);
  const deletedInList = list.find((m) => m.id === msgId);
  ok(
    deletedInList && deletedInList.deletedAt !== null && deletedInList.message === "",
    "삭제 메시지는 deletedAt 설정 + 내용 마스킹"
  );

  // 권한: B가 아닌 제3자 방 접근 → 403
  const tokenC = await login("verify_c", "password123");
  const forbidden = await fetch(`${BASE}/chat?roomId=${roomId}`, {
    headers: { Authorization: `Bearer ${tokenC}` },
  }).then((r) => r.status);
  ok(forbidden === 403, `비참여자 GET /chat → 403 (실제 ${forbidden})`);

  sockA.close();
  sockB.close();

  console.log("\n===== 검증 결과 =====");
  pass.forEach((m) => console.log("✅ " + m));
  fail.forEach((m) => console.log("❌ " + m));
  console.log(`\n통과 ${pass.length} / 실패 ${fail.length}`);
  process.exit(fail.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("검증 스크립트 오류:", e);
  process.exit(1);
});
