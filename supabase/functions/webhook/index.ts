// 수신 웹훅(스펙 2026-10-23-webhooks-design.md §5). 외부 스크립트가 Authorization: Bearer dch_… 로 글을 보낸다.
// JWT 검사를 끄고(verify_jwt = false) 토큰은 DB가 해시로 확인한다. 헤더·본문은 로그에 남기지 않는다.
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { isTokenShape, prepareParts } from "./split.ts";

const env = (name: string) => Deno.env.get(name) ?? "";
const admin = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const reply = (status: number, body: unknown = { error: status }) => Response.json(body, { status });

async function readText(req: Request): Promise<string | null> {
  const raw = await req.text();
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return raw;
  try {
    const text = JSON.parse(raw)?.text;
    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply(405);
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!isTokenShape(token)) return reply(401);

  const text = await readText(req);
  if (text === null) return reply(400);
  const parts = prepareParts(text);
  if (typeof parts === "number") return reply(parts);

  const { data, error } = await admin.rpc("webhook_post", { p_token: token, p_parts: parts });
  if (error) {
    if (error.message.includes("WEBHOOK_INVALID")) return reply(401);
    if (error.message.includes("VALIDATION_FAILED")) return reply(400);
    console.error("webhook_post failed", error.code, error.message);
    return reply(500);
  }
  return reply(200, { posted: data });
});
