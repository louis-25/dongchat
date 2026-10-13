// 로컬 Supabase 인증 계약 검증. 실행(저장소 루트에서 supabase start 상태):
//   SUPABASE_PUBLISHABLE_KEY=<supabase status -o env의 PUBLISHABLE_KEY> node client/scripts/verify-auth.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

const URL = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
assert.ok(KEY, "SUPABASE_PUBLISHABLE_KEY 환경 변수가 필요합니다.");

const fresh = () =>
  createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const stamp = Date.now().toString(36);
const email = `verify_${stamp}@test.local`;
const username = `v_${stamp}`.slice(0, 20);

const anon = fresh();
let r = await anon.rpc("is_username_available", { p_username: username.toUpperCase() });
assert.equal(r.error, null, r.error?.message);
assert.equal(r.data, true, "가입 전 username 사용 가능");

const user = fresh();
r = await user.auth.signUp({
  email,
  password: "password123",
  options: { data: { username: username.toUpperCase() } },
});
assert.equal(r.error, null, r.error?.message);
assert.ok(r.data.session, "이메일 확인 off → 가입 즉시 세션");
const userId = r.data.user.id;

let me = await user.rpc("get_me");
assert.equal(me.error, null, me.error?.message);
assert.equal(me.data.username, username, "username은 소문자로 저장 (Review Focus 4)");
assert.equal(me.data.isAdmin, false);

r = await anon.rpc("is_username_available", { p_username: username });
assert.equal(r.data, false, "가입 후 같은 username 사용 불가");

r = await fresh().auth.signInWithPassword({ email, password: "wrong-password" });
assert.equal(r.error?.code, "invalid_credentials", "잘못된 비밀번호 코드");

r = await fresh().auth.signUp({
  email,
  password: "password123",
  options: { data: { username: `x_${stamp}`.slice(0, 20) } },
});
assert.equal(r.error?.code, "user_already_exists", "중복 이메일 코드");

const admin = fresh();
r = await admin.auth.signInWithPassword({ email: "admin@dongchat.local", password: "password123" });
assert.equal(r.error, null, r.error?.message);
me = await admin.rpc("get_me");
assert.equal(me.data?.isAdmin, true, "시드 관리자 isAdmin");

r = await admin.rpc("admin_force_logout", { p_user_id: userId });
assert.equal(r.error, null, r.error?.message);
me = await user.rpc("get_me");
assert.equal(me.error?.message, "AUTH_SESSION_REVOKED", "강제 로그아웃 후 기존 세션 거부 (Review Focus 2)");

const again = fresh();
r = await again.auth.signInWithPassword({ email, password: "password123" });
assert.equal(r.error, null, r.error?.message);
me = await again.rpc("get_me");
assert.equal(me.error, null, "강제 로그아웃 후 새 로그인은 허용");

await again.auth.signOut();
me = await again.rpc("get_me");
assert.ok(me.error, "로그아웃 후 get_me 불가");

console.log("verify-auth: all checks passed");
