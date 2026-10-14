// 웹 푸시 계약 검증: 메시지 → DB 웹훅 → Edge Function → (가짜) 푸시 서비스. 받은 요청을 RFC 8291로 복호화해 내용을 확인한다.
// 전제(로컬): supabase/.env에 PUSH_WEBHOOK_SECRET=local-dev-push-secret, PUSH_ALLOW_HTTP=true, VAPID_* 설정,
// seed의 Vault 웹훅 값, 시드 admin. 함수 컨테이너가 host.docker.internal:54999로 이 스크립트의 서버에 접속한다.
//   SUPABASE_PUBLISHABLE_KEY=... PUSH_WEBHOOK_SECRET=local-dev-push-secret node scripts/verify-push.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import http from "node:http";
import { once } from "node:events";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const HOOK_SECRET = process.env.PUSH_WEBHOOK_SECRET;
assert.ok(KEY && HOOK_SECRET, "SUPABASE_PUBLISHABLE_KEY, PUSH_WEBHOOK_SECRET 환경 변수가 필요합니다.");
const PORT = 54999;

// ---- 가짜 푸시 서비스 + RFC 8291(aes128gcm) 복호화 ----
const b64u = (b) => Buffer.from(b).toString("base64url");
const device = () => {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  return { ecdh, authSecret: crypto.randomBytes(16) };
};
const decrypt = ({ ecdh, authSecret }, body) => {
  const salt = body.subarray(0, 16);
  const idlen = body[20];
  const asPub = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), ecdh.getPublicKey(), asPub]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", ecdh.computeSecret(asPub), authSecret, info, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const pt = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  return JSON.parse(pt.subarray(0, pt.lastIndexOf(2)).toString());
};
const received = [];
const server = http
  .createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      received.push({ path: req.url, body: Buffer.concat(chunks), headers: req.headers });
      res.statusCode = req.url.startsWith("/gone/") ? 410 : 201;
      res.end();
    });
  })
  .listen(PORT);
await once(server, "listening"); // 포트 충돌이면 여기서 EADDRINUSE로 실패
const waitFor = async (match, label, ms = 15000) => {
  for (let t = 0; t < ms; t += 200) {
    const hit = received.find(match);
    if (hit) return hit;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.fail(`푸시 미수신: ${label}`);
};

// ---- 사용자 ----
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
const ok = async (query) => {
  const { data, error } = await query;
  assert.equal(error, null, error?.message);
  return data;
};
const subscribe = async (u, path, dev) =>
  ok(
    u.client.rpc("register_push_subscription", {
      p_endpoint: `http://host.docker.internal:${PORT}${path}`,
      p_p256dh: b64u(dev.ecdh.getPublicKey()),
      p_auth: b64u(dev.authSecret),
    }),
  );

try {
  // 비밀 없이 호출 → 401 (Review Focus 3)
  const unauth = await fetch(`${URL}/functions/v1/send-push`, { method: "POST", body: "{}" });
  assert.equal(unauth.status, 401, "웹훅 비밀 없으면 401");

  const u1 = await signUp("vp1");
  const u2 = await signUp("vp2");
  const u3 = await signUp("vp3");
  const dev2 = device();
  const dev3 = device();
  await subscribe(u2, `/ok/${stamp}`, dev2);
  await subscribe(u3, `/gone/${stamp}`, dev3);
  await subscribe(u1, `/sender/${stamp}`, device());
  const roomId = await ok(
    u1.client.rpc("create_room", { p_name: "push", p_is_group: true, p_usernames: [u2.username, u3.username] }),
  );

  // 메시지 → u2에게 푸시, 내용 복호화 (Review Focus 1)
  await ok(u1.client.from("messages").insert({ room_id: roomId, content: "푸시 테스트" }));
  const hit = await waitFor((r) => r.path === `/ok/${stamp}`, "u2");
  assert.equal(hit.headers["content-encoding"], "aes128gcm");
  assert.match(String(hit.headers.authorization), /^vapid t=/);
  assert.deepEqual(decrypt(dev2, hit.body), {
    title: "push",
    body: "푸시 테스트",
    data: { roomId, url: `/chat/rooms?room=${roomId}` },
  });
  await waitFor((r) => r.path === `/gone/${stamp}`, "u3(410)");
  await new Promise((r) => setTimeout(r, 1500));
  assert.ok(!received.some((r) => r.path === `/sender/${stamp}`), "발신자에게는 보내지 않음");
  assert.equal((await ok(u3.client.from("push_subscriptions").select("id"))).length, 0, "410 응답 구독은 삭제");

  // 공용 브라우저: u1이 u2의 endpoint를 등록하면 u1 소유 (Review Focus 2)
  await subscribe(u1, `/ok/${stamp}`, dev2);
  assert.equal((await ok(u2.client.from("push_subscriptions").select("id"))).length, 0, "이전 사용자 구독은 넘어감");

  // 정리(실패는 드러낸다)
  for (const u of [u1, u2, u3]) await ok(u.client.rpc("leave_room", { p_room_id: roomId }));
  await ok(u1.client.from("push_subscriptions").delete().like("endpoint", `%${stamp}`));
  console.log("verify-push: OK");
} finally {
  await new Promise((resolve) => server.close(resolve));
}
