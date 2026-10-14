// 새 메시지 웹 푸시(스펙 §10). DB 트리거(pg_net)가 x-webhook-secret과 함께 { messageId }를 보낸다.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import webpush from "npm:web-push@3.6.7";
import { isAllowedEndpoint } from "./endpoint.ts";

type Target = { endpoint: string; p256dh: string; auth: string; title: string; body: string; room_id: number };

const env = (name: string) => Deno.env.get(name) ?? "";
const SECRET = env("PUSH_WEBHOOK_SECRET");
const ALLOW_HTTP = env("PUSH_ALLOW_HTTP") === "true"; // 로컬 검증 전용
const vapidDetails = {
  subject: env("VAPID_SUBJECT") || "mailto:admin@dongchat.local",
  publicKey: env("VAPID_PUBLIC_KEY"),
  privateKey: env("VAPID_PRIVATE_KEY"),
};
const MISSING = ["PUSH_WEBHOOK_SECRET", "VAPID_PUBLIC_KEY", "VAPID_PRIVATE_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"].filter(
  (name) => !env(name),
);
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

// 대상 하나의 실패(잘못된 키·네트워크)가 나머지 발송을 막지 않도록 전부 이 안에서 처리하고 상태 코드만 돌려준다(0 = 미발송).
async function send(t: Target): Promise<number> {
  if (!isAllowedEndpoint(t.endpoint, ALLOW_HTTP)) return 0; // SSRF 방지(알려진 푸시 서비스만)
  try {
    const payload = JSON.stringify({
      title: t.title,
      body: t.body,
      data: { roomId: t.room_id, url: `/chat/rooms?room=${t.room_id}` },
    });
    // sendNotification은 Node https를 써서 Deno에서 불안정 → 요청만 만들고 fetch로 보낸다(스파이크로 확인).
    const req = webpush.generateRequestDetails({ endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } }, payload, {
      vapidDetails,
      TTL: 60,
    });
    // 응답 없는 endpoint가 함수를 붙잡지 않게 10초 제한, 리다이렉트로 다른 주소에 가지 않게 차단
    const res = await fetch(req.endpoint, {
      method: req.method,
      headers: req.headers,
      body: req.body,
      redirect: "manual",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 410) {
      await admin.from("push_subscriptions").delete().eq("endpoint", t.endpoint); // 만료된 구독 정리
    }
    return res.status;
  } catch {
    return 0;
  }
}

Deno.serve(async (req) => {
  if (MISSING.length > 0) return new Response(`missing config: ${MISSING.join(", ")}`, { status: 500 });
  if (req.method !== "POST" || req.headers.get("x-webhook-secret") !== SECRET) {
    return new Response("unauthorized", { status: 401 });
  }
  const body = await req.json().catch(() => null);
  const messageId = body?.messageId;
  if (!Number.isSafeInteger(messageId) || messageId <= 0) return new Response("bad request", { status: 400 });

  const { data, error } = await admin.rpc("push_targets", { p_message_id: messageId });
  if (error) return new Response(error.message, { status: 500 });
  const targets = Array.isArray(data) ? (data as Target[]) : [];
  // ponytail: 동시 발송 수 제한 없음 — 한 방 구독이 수백 개가 되면 배치로 나눌 것.
  const statuses = await Promise.all(targets.map(send));
  return Response.json({ attempted: statuses.length, delivered: statuses.filter((s) => s >= 200 && s < 300).length });
});
