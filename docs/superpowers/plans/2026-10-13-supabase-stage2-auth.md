# Supabase 이전 2단계(인증) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** NextAuth(+NestJS JWT)를 Supabase Auth(이메일+비밀번호, 카카오)로 교체한다. 로그인·가입·로그아웃·세션 갱신·보호 경로 리다이렉트·관리자 여부 표시가 Supabase만으로 동작한다.

**Architecture:** UI는 `services/auth.ts`(순수 async 함수)와 `hooks/useAuth.tsx`(React Query)만 사용한다. Supabase 접근은 `lib/supabase/*`와 `services/`, `proxy.ts`, OAuth 콜백 라우트에만 존재하고 ESLint `no-restricted-imports`로 강제한다. 세션은 `@supabase/ssr` 쿠키 세션이며 Next 16 `proxy.ts`가 `getClaims()`로 갱신·보호한다. 현재 사용자 정보(관리자 여부 포함)는 새 RPC `public.get_me()`로 얻는다.

**Tech Stack:** Next.js 16.0.10, React 19.2, `@supabase/supabase-js@2.117.2`, `@supabase/ssr@0.12.7`(정확한 버전 고정), React Query 5, react-hook-form + yup, Supabase CLI 2.120.0, Node 24 내장 테스트 러너(`node --test`, TS 타입 스트리핑).

**Spec:** `docs/superpowers/specs/2026-10-13-supabase-migration-design.md` (§2, §5.5, §7, §12-2단계)

## Global Constraints

- 패키지 매니저 pnpm(`client/`에서 실행). Supabase 패키지는 `--save-exact`로 고정, lockfile 커밋.
- 클라 env: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. secret/service role 키를 클라에 두지 않는다.
- 서버 코드(프록시·라우트)의 인증 판단은 `getClaims()`. 서버에서 `getSession()` 신뢰 금지.
- `@supabase/*`, `@/lib/supabase/*` import는 `src/services/**`, `src/lib/supabase/**`, `src/proxy.ts`, `src/app/auth/callback/**`에서만.
- 표시명 = `nickname ?? username`.
- username 입력 형식 `^[a-zA-Z0-9_]{3,20}$`(DB가 소문자로 정규화). 비밀번호 최소 6자(`config.toml minimum_password_length`).
- 에러는 `DomainError { code, message }`로 변환해 UI에 전달. 새 코드는 `lib/error-handler.ts` 매핑에 추가.
- 2단계 범위 밖(친구·방·채팅·관리자 페이지·푸시 저장)은 컴파일만 유지한다. 해당 기능은 3~6단계까지 동작하지 않는다(합의된 일괄 컷오버).
- 각 Task 완료 조건: 명시된 테스트 + `pnpm exec tsc --noEmit` + `pnpm lint`(에러 0) 통과. lint 기준선은 에러 0 / 경고 6.

## Review Focus

1. 로그인 상태로 `/login`·`/join`·`/` 접근 → `/chat/friends`로 이동, 비로그인으로 보호 경로 접근 → `/login`. → Task 5 curl 확인
2. 정지·강제 로그아웃된 사용자가 앱을 열면(토큰은 유효) 즉시 로그아웃되어 로그인 화면으로 간다. → Task 3 통합 스크립트 + Task 4 `useAuth`
3. 이메일 확인이 켜진 환경(운영)에서 가입 → 세션 없이 "메일 확인" 안내 후 로그인 화면. → Task 4 JoinForm 분기
4. 대문자가 섞인 username으로 가입 → 사전 확인과 저장 결과 일치(소문자). → Task 1 통합 스크립트
5. `/sw.js` 등 public 정적 파일은 비로그인이어도 리다이렉트되지 않는다. → Task 5 curl 확인

---

## File Structure

```
supabase/
  migrations/<ts>_get_me.sql                 # public.get_me() RPC
  tests/database/080_get_me.test.sql
  config.toml                                # site_url, redirect, [auth.external.kakao]
  .env.example                               # 카카오 키 env 템플릿
client/
  package.json, pnpm-lock.yaml               # +supabase-js/ssr, -next-auth, -jotai, test 스크립트
  tsconfig.json                              # allowImportingTsExtensions (node --test용 .ts import)
  eslint.config.mjs                          # 백엔드 교체 경계 규칙
  .env.local.example
  scripts/verify-auth.mjs                    # 로컬 Supabase 인증 계약 통합 검증
  src/
    types/domain.ts                          # AuthUser, DomainError
    lib/supabase/client.ts, server.ts, proxy.ts, database.types.ts(재생성)
    proxy.ts                                 # Next 16 세션 갱신 + 보호 경로
    app/auth/callback/route.ts               # 카카오 OAuth 코드 교환
    services/errors.ts, errors.test.ts       # 에러 변환(단위 테스트)
    services/auth.ts                         # 인증 경계
    hooks/useAuth.tsx                        # 재작성
    components/auth/login/LoginForm.tsx, join/JoinForm.tsx   # 재작성
    components/layout/ProtectedHeader.tsx    # 재작성
    components/providers.tsx, app/page.tsx, lib/error-handler.ts, config/index.ts
    hooks/usePushNotification.ts             # useSession → useAuth
    app/(protected)/chat/[menu]/_components/ChatRooms/hooks/useChatMessages.ts  # currentUserId 임시 처리
  삭제: src/auth.ts, src/app/api/auth/[...nextauth]/, src/store/auth.ts,
        src/hooks/api/useAuthMutation.ts, src/services/auth/ (Orval 생성 auth)
```

---

### Task 1: `get_me` RPC, Auth 설정, 인증 계약 통합 스크립트

**Files:**
- Create: `supabase/migrations/<ts>_get_me.sql`, `supabase/tests/database/080_get_me.test.sql`, `supabase/.env.example`, `client/scripts/verify-auth.mjs`
- Modify: `supabase/config.toml`, `client/src/lib/supabase/database.types.ts`(재생성), `client/package.json`(supabase-js 설치 — 스크립트가 사용)

**Interfaces:**
- Produces: `public.get_me() returns jsonb` → `{ id: uuid, username, nickname, avatarUrl, isAdmin: boolean }`. 비활성 세션이면 `AUTH_SESSION_REVOKED`(P0001). anon 실행 불가.
- Produces: `client/scripts/verify-auth.mjs` (env `SUPABASE_PUBLISHABLE_KEY`, 선택 `SUPABASE_URL`).

- [ ] **Step 1: pgTAP 실패 테스트** — `supabase/tests/database/080_get_me.test.sql`

```sql
begin;
select plan(5);

select tests.create_user('me@test.com', '{"username":"me_user","nickname":"미"}');
select tests.create_user('boss@test.com', '{"username":"boss"}');
insert into private.user_roles values (tests.uid('boss@test.com'), 'ADMIN');

select tests.login_as(tests.uid('me@test.com'));
select is(public.get_me() ->> 'username', 'me_user', 'get_me는 본인 username');
select is((public.get_me() ->> 'isAdmin')::boolean, false, '일반 사용자는 isAdmin=false');
reset role;

select tests.login_as(tests.uid('boss@test.com'));
select is((public.get_me() ->> 'isAdmin')::boolean, true, '관리자는 isAdmin=true');
reset role;

set local role anon;
select throws_ok($$ select public.get_me() $$, '42501', null, 'anon은 호출 불가');
reset role;

insert into private.user_access (user_id, sessions_revoked_at) values (tests.uid('me@test.com'), now());
select tests.login_as(tests.uid('me@test.com'));
select throws_ok($$ select public.get_me() $$, 'P0001', 'AUTH_SESSION_REVOKED', '강제 로그아웃 후 거부');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인** — 저장소 루트에서 `npx -y supabase@2.120.0 test db` → `080_get_me` FAIL (`function public.get_me() does not exist`).

- [ ] **Step 3: 마이그레이션** — `npx -y supabase@2.120.0 migration new get_me` 후:

```sql
-- 현재 사용자 정보(관리자 여부 포함). 클라이언트는 private.*를 볼 수 없으므로 이 RPC로 얻는다.
create or replace function public.get_me() returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_me jsonb;
begin
  perform private.require_active_session();
  select jsonb_build_object(
           'id', p.id,
           'username', p.username,
           'nickname', p.nickname,
           'avatarUrl', p.avatar_url,
           'isAdmin', private.is_admin())
  into v_me
  from public.profiles p
  where p.id = auth.uid();
  return v_me;
end;
$$;
revoke execute on function public.get_me() from public, anon;
grant execute on function public.get_me() to authenticated;
```

- [ ] **Step 4: 통과 확인** — `npx -y supabase@2.120.0 db reset && npx -y supabase@2.120.0 test db` → 전부 ok.

- [ ] **Step 5: Auth 설정** — `supabase/config.toml`:
  - `[auth]`의 `site_url = "http://localhost:3000"`, `additional_redirect_urls = ["http://localhost:3000/auth/callback"]`
  - 파일 끝에 추가:

```toml
[auth.external.kakao]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_KAKAO_CLIENT_ID)"
# DO NOT commit your OAuth provider secret to git. Use environment variable substitution instead:
secret = "env(SUPABASE_AUTH_EXTERNAL_KAKAO_SECRET)"
redirect_uri = ""
url = ""
skip_nonce_check = false
# 비즈 앱이 아니면 카카오가 이메일을 주지 않는다.
email_optional = true
```

`supabase/.env.example`:
```
# supabase/config.toml env() 치환용. 복사: cp supabase/.env.example supabase/.env (gitignore됨)
# 카카오 개발자 콘솔 REST API 키 / Client Secret. Redirect URI에 http://localhost:54321/auth/v1/callback 등록 필요.
SUPABASE_AUTH_EXTERNAL_KAKAO_CLIENT_ID=
SUPABASE_AUTH_EXTERNAL_KAKAO_SECRET=
```
`supabase/.env`를 만들고 `client/.env.local`의 `KAKAO_CLIENT_ID`/`KAKAO_CLIENT_SECRET` 값을 옮겨 적는다(값을 출력하거나 커밋하지 않는다).

재기동: `npx -y supabase@2.120.0 stop && npx -y supabase@2.120.0 start`. Expected: 정상 기동. 기동 실패가 env/kakao 설정 때문이면 `enabled = false`로 두고 Ruling 기록(카카오는 Task 5 수동 확인에서 제외).

- [ ] **Step 6: 클라 의존성 설치 + 타입 재생성** (`client/`에서)

```bash
pnpm add @supabase/supabase-js@2.117.2 @supabase/ssr@0.12.7 --save-exact
cd .. && npx -y supabase@2.120.0 gen types --local --lang typescript --schema public > client/src/lib/supabase/database.types.ts && npx -y oxfmt client/src/lib/supabase/database.types.ts
grep -c "get_me" client/src/lib/supabase/database.types.ts
```
Expected: `get_me` 1 이상.

- [ ] **Step 7: 통합 스크립트 작성** — `client/scripts/verify-auth.mjs`

```js
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
```

- [ ] **Step 8: 실행** — 저장소 루트에서:
```bash
KEY=$(npx -y supabase@2.120.0 status -o env | grep '^PUBLISHABLE_KEY=' | cut -d= -f2- | tr -d '"')
SUPABASE_PUBLISHABLE_KEY=$KEY node client/scripts/verify-auth.mjs
```
Expected: `verify-auth: all checks passed`. (Step 3 이전에 실행했다면 `get_me` 부재로 실패했어야 한다 — RED는 Step 2의 pgTAP이 담당.)

- [ ] **Step 9: spec 반영 + Commit** — spec §5.4 RPC 표에 다음 행을 추가하고 §6의 "RPC 14개"를 "RPC 15개"로 고친다:
    | `get_me() → jsonb` | 활성 세션 | `{id, username, nickname, avatarUrl, isAdmin}` — 클라가 관리자 여부를 알 수 있는 유일한 경로 |
```bash
git add docs/superpowers/specs/2026-10-13-supabase-migration-design.md supabase/migrations supabase/tests/database/080_get_me.test.sql supabase/config.toml supabase/.env.example client/scripts/verify-auth.mjs client/package.json client/pnpm-lock.yaml client/src/lib/supabase/database.types.ts
git commit -m "feat(auth): get_me RPC, Auth 설정(카카오·리다이렉트), 인증 계약 통합 스크립트"
```

---

### Task 2: 에러 변환과 인증 서비스 경계

**Files:**
- Create: `client/src/types/domain.ts`, `client/src/services/errors.ts`, `client/src/services/errors.test.ts`, `client/src/lib/supabase/client.ts`, `client/src/services/auth.ts`
- Modify: `client/tsconfig.json`, `client/package.json`(test 스크립트), `client/src/lib/error-handler.ts`

**Interfaces:**
- Produces (`types/domain.ts`): `type DomainError = { code: string; message: string }`, `type AuthUser = { id: string; username: string; nickname: string | null; avatarUrl: string | null; isAdmin: boolean }`
- Produces (`services/errors.ts`): `toDomainError(error: unknown): DomainError`
- Produces (`services/auth.ts`): `signUp({ email, password, username }): Promise<{ needsEmailConfirmation: boolean }>`, `signIn({ email, password }): Promise<void>`, `signInWithKakao(): Promise<void>`, `signOut(): Promise<void>`, `getCurrentUser(): Promise<AuthUser | null>`, `onAuthChange(cb: (event: AuthChangeEvent) => void): () => void` where `type AuthChangeEvent = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED"`
- Produces (`lib/supabase/client.ts`): `createClient()` (브라우저, `Database` 타입)

- [ ] **Step 1: 실패하는 단위 테스트** — `client/src/services/errors.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toDomainError } from "./errors.ts";

test("RPC raise(P0001)는 message를 코드로, hint를 메시지로", () => {
  assert.deepEqual(
    toDomainError({ code: "P0001", message: "CHAT_FORBIDDEN", hint: "권한이 없습니다." }),
    { code: "CHAT_FORBIDDEN", message: "권한이 없습니다." },
  );
});

test("hint가 없으면 코드를 메시지로도 사용", () => {
  assert.deepEqual(toDomainError({ code: "P0001", message: "X_CODE" }), { code: "X_CODE", message: "X_CODE" });
});

test("RLS·권한 거부(42501)는 CHAT_FORBIDDEN", () => {
  assert.equal(toDomainError({ code: "42501", message: "permission denied for table messages" }).code, "CHAT_FORBIDDEN");
});

test("Auth 잘못된 자격 증명", () => {
  assert.equal(toDomainError({ code: "invalid_credentials", message: "Invalid login credentials" }).code, "AUTH_INVALID_CREDENTIALS");
});

test("Auth 중복 이메일", () => {
  assert.equal(toDomainError({ code: "user_already_exists", message: "User already registered" }).code, "AUTH_DUPLICATE_EMAIL");
});

test("가입 트리거 실패(username 경합)는 AUTH_DUPLICATE_USER", () => {
  assert.equal(toDomainError({ code: "unexpected_failure", message: "Database error saving new user" }).code, "AUTH_DUPLICATE_USER");
});

test("알 수 없는 입력은 UNKNOWN", () => {
  assert.deepEqual(toDomainError("boom"), { code: "UNKNOWN", message: "알 수 없는 오류가 발생했습니다." });
  assert.deepEqual(toDomainError(new Error("network down")), { code: "UNKNOWN", message: "network down" });
});
```

`client/tsconfig.json`의 `compilerOptions`에 `"allowImportingTsExtensions": true` 추가(noEmit이므로 허용됨). `client/package.json` scripts에 `"test": "node --test \"src/**/*.test.ts\""` 추가.

- [ ] **Step 2: 실패 확인** — `client/`에서 `pnpm test` → FAIL (`Cannot find module .../errors.ts`).

- [ ] **Step 3: 구현** — `client/src/types/domain.ts`

```ts
// 앱 도메인 타입. 백엔드(Supabase/NestJS)와 무관한 계약이며 services/가 이 타입으로 변환해 반환한다.
export type DomainError = { code: string; message: string };

export type AuthUser = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};
```

`client/src/services/errors.ts`
```ts
import type { DomainError } from "../types/domain";

// 서버(RPC·RLS·Auth) 에러를 앱 도메인 에러로 변환한다. 백엔드 교체 시 이 파일의 매핑만 바꾼다.
const AUTH_CODE_MAP: Record<string, string> = {
  invalid_credentials: "AUTH_INVALID_CREDENTIALS",
  user_already_exists: "AUTH_DUPLICATE_EMAIL",
  email_exists: "AUTH_DUPLICATE_EMAIL",
  weak_password: "VALIDATION_FAILED",
  validation_failed: "VALIDATION_FAILED",
  email_address_invalid: "VALIDATION_FAILED",
  over_email_send_rate_limit: "AUTH_RATE_LIMITED",
  over_request_rate_limit: "AUTH_RATE_LIMITED",
  // 가입 트리거 실패 = 동시 가입으로 username unique 충돌
  unexpected_failure: "AUTH_DUPLICATE_USER",
};

type RawError = { code?: unknown; message?: unknown; hint?: unknown };

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

export function toDomainError(error: unknown): DomainError {
  const raw: RawError = typeof error === "object" && error !== null ? (error as RawError) : {};
  const code = str(raw.code);
  const message = str(raw.message);
  const hint = str(raw.hint);

  // RPC: raise exception '<CODE>' using hint = '<사용자 메시지>' (SQLSTATE P0001)
  if (code === "P0001" && message) return { code: message, message: hint ?? message };
  if (code === "42501") return { code: "CHAT_FORBIDDEN", message: "접근 권한이 없습니다." };
  if (code && AUTH_CODE_MAP[code]) return { code: AUTH_CODE_MAP[code], message: message ?? "" };
  return { code: "UNKNOWN", message: message ?? "알 수 없는 오류가 발생했습니다." };
}
```

- [ ] **Step 4: 통과 확인** — `pnpm test` → `pass 7`, `fail 0`.

- [ ] **Step 5: 브라우저 클라이언트와 인증 서비스** — `client/src/lib/supabase/client.ts`

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";

// 브라우저에서는 @supabase/ssr이 싱글턴을 돌려준다. services/에서만 사용한다.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}
```

`client/src/services/auth.ts`
```ts
import { createClient } from "@/lib/supabase/client";
import type { AuthUser, DomainError } from "@/types/domain";
import { toDomainError } from "./errors";

// 인증 경계. UI는 이 함수들만 사용한다. NestJS 복귀 시 이 파일 내부만 교체한다.
export type AuthChangeEvent = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED";

export async function signUp(input: {
  email: string;
  password: string;
  username: string;
}): Promise<{ needsEmailConfirmation: boolean }> {
  const supabase = createClient();
  const { data: available, error: checkError } = await supabase.rpc("is_username_available", {
    p_username: input.username,
  });
  if (checkError) throw toDomainError(checkError);
  if (!available) {
    throw { code: "AUTH_DUPLICATE_USER", message: "이미 사용 중인 아이디입니다." } satisfies DomainError;
  }
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { username: input.username } },
  });
  if (error) throw toDomainError(error);
  // 이메일 확인이 켜진 환경에서는 세션 없이 사용자만 생성된다.
  return { needsEmailConfirmation: !data.session };
}

export async function signIn(input: { email: string; password: string }): Promise<void> {
  const { error } = await createClient().auth.signInWithPassword(input);
  if (error) throw toDomainError(error);
}

export async function signInWithKakao(): Promise<void> {
  const { error } = await createClient().auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw toDomainError(error);
}

export async function signOut(): Promise<void> {
  await createClient().auth.signOut();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase.rpc("get_me");
  if (error) throw toDomainError(error);
  // get_me jsonb 계약: { id, username, nickname, avatarUrl, isAdmin }
  return data as unknown as AuthUser;
}

export function onAuthChange(callback: (event: AuthChangeEvent) => void): () => void {
  const { data } = createClient().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
      callback(event);
    }
  });
  return () => data.subscription.unsubscribe();
}
```

`client/src/lib/error-handler.ts` 전체 교체:
```ts
// 도메인 에러 코드 → 사용자 메시지. 백엔드 응답 형태와 무관하게 { code, message }만 본다.
export const getErrorMessage = (error: { code?: string; message?: string } | null | undefined): string => {
  if (!error) {
    return '알 수 없는 오류가 발생했습니다.';
  }

  if (error.code) {
    switch (error.code) {
      case 'AUTH_USER_NOT_FOUND':
        return '사용자를 찾을 수 없습니다.';
      case 'AUTH_INVALID_PASSWORD':
      case 'AUTH_INVALID_CREDENTIALS':
        return '이메일 또는 비밀번호가 올바르지 않습니다.';
      case 'AUTH_DUPLICATE_USER':
        return '이미 사용 중인 아이디입니다.';
      case 'AUTH_DUPLICATE_EMAIL':
        return '이미 가입된 이메일입니다.';
      case 'AUTH_RATE_LIMITED':
        return '요청이 너무 많습니다. 잠시 후 다시 시도하세요.';
      case 'AUTH_SESSION_REVOKED':
        return '세션이 만료되었습니다. 다시 로그인해주세요.';
      case 'AUTH_UNAUTHORIZED':
        return '인증이 필요합니다.';
      case 'AUTH_FORBIDDEN':
        return '접근 권한이 없습니다.';
      case 'VALIDATION_FAILED':
        return '입력값이 올바르지 않습니다.';
      case 'CHAT_FORBIDDEN':
        return '해당 채팅에 접근할 권한이 없습니다.';
      case 'MESSAGE_NOT_FOUND':
        return '메시지를 찾을 수 없습니다.';
      case 'CHAT_ROOM_NOT_FOUND':
        return '채팅방을 찾을 수 없습니다.';
      default:
        return error.message || '오류가 발생했습니다.';
    }
  }

  return error.message || '서버와 통신 중 오류가 발생했습니다.';
};
```

> 기존 Orval `src/services/auth/auth.ts`(`@/services/auth/auth`)는 새 `@/services/auth`와 경로가 달라 공존한다. 폼이 아직 사용하므로 Task 4에서 삭제한다.

- [ ] **Step 6: 확인** — `pnpm test` → pass 7, `pnpm exec tsc --noEmit` → 출력 없음, `pnpm lint` → 에러 0.

- [ ] **Step 7: Commit**
```bash
git add client/src/types client/src/services/errors.ts client/src/services/errors.test.ts client/src/services/auth.ts client/src/lib/supabase/client.ts client/src/lib/error-handler.ts client/tsconfig.json client/package.json
git commit -m "feat(auth): 도메인 에러 변환(단위 테스트)과 인증 서비스 경계"
```

---

### Task 3: 서버 측 세션 — server 클라이언트, proxy, OAuth 콜백

**Files:**
- Create: `client/src/lib/supabase/server.ts`, `client/src/lib/supabase/proxy.ts`, `client/src/proxy.ts`, `client/src/app/auth/callback/route.ts`

**Interfaces:**
- Produces: `createClient()` (server, async, `next/headers` 쿠키), `updateSession(request: NextRequest): Promise<NextResponse>`
- 리다이렉트 규칙: 비로그인 + 공개 경로(`/login`, `/join`, `/auth/*`) 외 → `/login`. 로그인 + (`/`, `/login`, `/join`) → `/chat/friends`. 정적 파일(이미지·`.js`·`.json`·`.webmanifest`·`.ico`)은 proxy 미적용.

- [ ] **Step 1: 서버 클라이언트** — `client/src/lib/supabase/server.ts`

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

// 요청마다 새로 만든다(전역 보관 금지). 라우트 핸들러·서버 컴포넌트용.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // 서버 컴포넌트에서 호출된 경우 — proxy가 세션을 갱신하므로 무시해도 된다.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 2: 세션 갱신 + 보호 경로** — `client/src/lib/supabase/proxy.ts`

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

const PUBLIC_PATHS = ["/login", "/join", "/auth"];
const AUTH_ENTRY_PATHS = ["/", "/login", "/join"];
const HOME = "/chat/friends";

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers?: Record<string, string>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          // 세션 쿠키 응답이 CDN에 캐시되지 않도록 Cache-Control 등을 적용
          Object.entries(headers ?? {}).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
        },
      },
    },
  );

  // createServerClient와 getClaims 사이에 다른 코드를 두지 않는다(무작위 로그아웃 방지).
  const { data } = await supabase.auth.getClaims();
  const isAuthed = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    const response = NextResponse.redirect(url);
    // 갱신된 세션 쿠키·캐시 헤더를 리다이렉트 응답에도 옮긴다.
    response.cookies.setAll(supabaseResponse.cookies.getAll());
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = supabaseResponse.headers.get(header);
      if (value) response.headers.set(header, value);
    }
    return response;
  };

  if (!isAuthed && !isPublic(pathname)) return redirectTo("/login");
  if (isAuthed && AUTH_ENTRY_PATHS.includes(pathname)) return redirectTo(HOME);

  return supabaseResponse;
}
```

> `response.cookies.setAll`이 Next 16 `ResponseCookies`에 없으면(`tsc` 오류) `supabaseResponse.cookies.getAll().forEach((c) => response.cookies.set(c))`로 바꾸고 Ruling 기록.

- [ ] **Step 3: proxy 진입점** — `client/src/proxy.ts`

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // _next 정적 파일, 이미지·스크립트·매니페스트 등 public 정적 파일 제외 (sw.js 포함)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|json|webmanifest)$).*)",
  ],
};
```

- [ ] **Step 4: OAuth 콜백** — `client/src/app/auth/callback/route.ts`

```ts
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const HOME = "/chat/friends";

// 카카오 OAuth(PKCE) 콜백: code를 세션 쿠키로 교환한다.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? HOME;
  // 외부 URL로의 오픈 리다이렉트 방지
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : HOME;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
```

- [ ] **Step 5: 확인** — `pnpm exec tsc --noEmit 2>&1 | grep -E "src/(proxy|lib/supabase|app/auth)"` → 출력 없음.

- [ ] **Step 6: Commit**
```bash
git add client/src/lib/supabase client/src/proxy.ts client/src/app/auth
git commit -m "feat(auth): 서버 세션 갱신 proxy(보호 경로), OAuth 콜백 라우트"
```

---

### Task 4: UI 전환 — useAuth, 폼, 헤더, NextAuth·jotai 제거, 경계 규칙

**Files:**
- Modify: `client/src/hooks/useAuth.tsx`, `client/src/components/auth/login/LoginForm.tsx`, `client/src/components/auth/join/JoinForm.tsx`, `client/src/components/layout/ProtectedHeader.tsx`, `client/src/components/providers.tsx`, `client/src/app/page.tsx`, `client/src/hooks/usePushNotification.ts`, `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/hooks/useChatMessages.ts`, `client/src/config/index.ts`, `client/eslint.config.mjs`, `client/.env.local.example`, `client/package.json`
- Delete: `client/src/auth.ts`, `client/src/app/api/auth/[...nextauth]/route.ts`, `client/src/store/auth.ts`, `client/src/services/auth/`(Orval 생성), `client/src/hooks/api/useAuthMutation.ts`

**Interfaces:**
- Consumes: Task 2 `services/auth.ts` 전체, `AuthUser`, `DomainError`, `getErrorMessage`.
- Produces: `useAuth(): { user: AuthUser | null; isLoading: boolean }`, `AUTH_QUERY_KEY = ["auth", "me"]`.

- [ ] **Step 1: 경계 규칙을 먼저 추가(실패 확인용)** — `client/eslint.config.mjs`의 `defineConfig([...])` 배열에 `...nextTs,` 다음 항목으로 추가:

```js
  // 백엔드 교체 경계: Supabase는 services/·lib/supabase/·proxy·OAuth 콜백에서만 사용한다.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/services/**", "src/lib/supabase/**", "src/proxy.ts", "src/app/auth/callback/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["@supabase/*"], message: "Supabase는 services/ 뒤에서만 사용합니다(백엔드 교체 경계)." },
            { group: ["@/lib/supabase/*", "**/lib/supabase/*"], message: "lib/supabase는 services/에서만 사용합니다." },
          ],
        },
      ],
    },
  },
```

검증용 위반 파일을 임시로 만든다: `client/src/hooks/__boundary_probe.ts` 내용 `import { createClient } from "@/lib/supabase/client"; export const p = createClient;` → `pnpm lint` 에 `no-restricted-imports` error가 나와야 한다. 확인 후 파일 삭제.

- [ ] **Step 2: useAuth** — `client/src/hooks/useAuth.tsx` 전체 교체

```tsx
"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getCurrentUser, onAuthChange, signOut } from "@/services/auth";
import type { DomainError } from "@/types/domain";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

// 현재 사용자. 세션 변화는 onAuthChange로 반영하고, 정지·강제 로그아웃이면 로그인 화면으로 보낸다.
// ponytail: 호출하는 컴포넌트마다 구독이 생긴다(현재 3곳). 늘어나면 Provider로 올릴 것.
const useAuth = () => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: user = null, isLoading, error } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: getCurrentUser,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(
    () =>
      onAuthChange((event) => {
        if (event === "SIGNED_OUT") queryClient.setQueryData(AUTH_QUERY_KEY, null);
        else void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      }),
    [queryClient],
  );

  useEffect(() => {
    if ((error as DomainError | null)?.code !== "AUTH_SESSION_REVOKED") return;
    void signOut().then(() => router.push("/login"));
  }, [error, router]);

  return { user, isLoading };
};

export default useAuth;
```

- [ ] **Step 3: 로그인 폼** — `client/src/components/auth/login/LoginForm.tsx` 전체 교체

```tsx
"use client";

import { useForm, FormProvider } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import FormInput from "@/components/common/RHF/FormInput";
import useRouter from "@/hooks/useRouter";
import useToast from "@/hooks/useToast";
import { AUTH_QUERY_KEY } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/error-handler";
import { signIn, signInWithKakao } from "@/services/auth";
import type { DomainError } from "@/types/domain";

const loginSchema = yup.object({
  email: yup.string().email("이메일 형식이 아닙니다.").required("이메일을 입력해주세요."),
  password: yup.string().required("비밀번호를 입력해주세요."),
});

type LoginFormValues = yup.InferType<typeof loginSchema>;

const LoginForm = () => {
  const { goChat } = useRouter();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const methods = useForm<LoginFormValues>({ resolver: yupResolver(loginSchema) });

  const login = useMutation({
    mutationFn: signIn,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      success("로그인 성공!");
      goChat();
    },
    onError: (e) => error(`로그인 실패: ${getErrorMessage(e as unknown as DomainError)}`),
  });

  // 성공 시 카카오로 페이지가 이동하므로 pending이 풀리지 않는 것이 정상이다.
  const kakao = useMutation({
    mutationFn: signInWithKakao,
    onError: (e) => error(`카카오 로그인 실패: ${getErrorMessage(e as unknown as DomainError)}`),
  });

  const busy = login.isPending || kakao.isPending;

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit((data) => login.mutate(data))} className="space-y-4 mt-4">
        <FormInput name="email" label="이메일" type="email" placeholder="이메일을 입력하세요" disabled={busy} />
        <FormInput name="password" label="비밀번호" type="password" placeholder="비밀번호를 입력하세요" disabled={busy} />
        <Button type="submit" className="w-full" disabled={busy}>
          {login.isPending ? "로그인 중..." : "로그인"}
        </Button>
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">또는</span>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => kakao.mutate()}
          className="w-full bg-[#FEE500] text-[#000000] hover:bg-[#FEE500]/90"
          disabled={busy}
        >
          {kakao.isPending ? "카카오 로그인 중..." : "카카오로 시작하기"}
        </Button>
      </form>
    </FormProvider>
  );
};

export default LoginForm;
```

`FormInput`이 `type` prop을 받는지 확인: `grep -n "type" client/src/components/common/RHF/FormInput.tsx`. 받지 않으면 `type="email"`을 빼고 Ruling 기록.

- [ ] **Step 4: 가입 폼** — `client/src/components/auth/join/JoinForm.tsx` 전체 교체

```tsx
"use client";

import { useForm, FormProvider } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import FormInput from "@/components/common/RHF/FormInput";
import useRouter from "@/hooks/useRouter";
import useToast from "@/hooks/useToast";
import { AUTH_QUERY_KEY } from "@/hooks/useAuth";
import { getErrorMessage } from "@/lib/error-handler";
import { signInWithKakao, signUp } from "@/services/auth";
import type { DomainError } from "@/types/domain";

const joinSchema = yup.object({
  email: yup.string().email("이메일 형식이 아닙니다.").required("이메일을 입력해주세요."),
  username: yup
    .string()
    .matches(/^[a-zA-Z0-9_]{3,20}$/, "아이디는 영문·숫자·밑줄 3~20자입니다.")
    .required("아이디를 입력해주세요."),
  password: yup.string().min(6, "비밀번호는 6자 이상입니다.").required("비밀번호를 입력해주세요."),
});

type JoinFormValues = yup.InferType<typeof joinSchema>;

const JoinForm = () => {
  const { goLogin, goChat } = useRouter();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const methods = useForm<JoinFormValues>({ resolver: yupResolver(joinSchema) });

  const join = useMutation({
    mutationFn: signUp,
    onSuccess: async ({ needsEmailConfirmation }) => {
      // 이메일 확인이 켜진 환경(운영)에서는 세션이 없다.
      if (needsEmailConfirmation) {
        success("가입 완료! 메일함에서 인증 후 로그인해주세요.");
        goLogin();
        return;
      }
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      success("회원가입 완료!");
      goChat();
    },
    onError: (e) => error(`회원가입 실패: ${getErrorMessage(e as unknown as DomainError)}`),
  });

  const kakao = useMutation({
    mutationFn: signInWithKakao,
    onError: (e) => error(`카카오 로그인 실패: ${getErrorMessage(e as unknown as DomainError)}`),
  });

  const busy = join.isPending || kakao.isPending;

  return (
    <FormProvider {...methods}>
      <form onSubmit={methods.handleSubmit((data) => join.mutate(data))} className="space-y-4 mt-4">
        <FormInput name="email" label="이메일" type="email" placeholder="이메일을 입력하세요" disabled={busy} />
        <FormInput name="username" label="아이디" placeholder="친구가 검색할 아이디" disabled={busy} />
        <FormInput name="password" label="비밀번호" type="password" placeholder="6자 이상" disabled={busy} />
        <Button type="submit" className="w-full" disabled={busy}>
          {join.isPending ? "가입 중..." : "회원가입"}
        </Button>
        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">또는</span>
          </div>
        </div>
        <Button
          type="button"
          onClick={() => kakao.mutate()}
          className="w-full bg-[#FEE500] text-[#000000] hover:bg-[#FEE500]/90"
          disabled={busy}
        >
          {kakao.isPending ? "카카오 로그인 중..." : "카카오로 시작하기"}
        </Button>
      </form>
    </FormProvider>
  );
};

export default JoinForm;
```

- [ ] **Step 5: 헤더** — `client/src/components/layout/ProtectedHeader.tsx` 전체 교체

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import useRouter from "@/hooks/useRouter";
import { AUTH_QUERY_KEY } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";
import { signOut } from "@/services/auth";
import type { AuthUser } from "@/types/domain";

type ProtectedHeaderProps = {
  user: AuthUser | null;
};

const ProtectedHeader = ({ user }: ProtectedHeaderProps) => {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const { goLogin, router } = useRouter();
  const queryClient = useQueryClient();

  const displayName = user ? (user.nickname ?? user.username) : "";
  const initials = displayName ? displayName.charAt(0).toUpperCase() : "?";

  const handleLogout = async () => {
    await signOut();
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    setIsMenuOpen(false);
    goLogin();
  };

  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMenuOpen]);

  return (
    <header className="border-b bg-white shadow-sm">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="text-lg font-semibold text-gray-900 flex items-center gap-3">
          <button onClick={() => router.push("/chat/friends")} className="hover:text-blue-600">
            DongChat
          </button>
          {user?.isAdmin && (
            <button
              onClick={() => router.push("/admin/users")}
              className="text-sm text-gray-600 hover:text-blue-600"
            >
              관리자
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {displayName && <span className="text-sm text-gray-600">안녕하세요, {displayName}님</span>}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-haspopup="menu"
              aria-expanded={isMenuOpen}
              onClick={() => setIsMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-2 py-1 shadow-sm transition hover:shadow"
            >
              <Avatar className="size-9">
                {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt={displayName} /> : null}
                <AvatarFallback
                  className={cn("bg-blue-600 text-sm font-semibold text-white", !user && "bg-gray-400")}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
            {isMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-md border border-gray-200 bg-white shadow-lg">
                <div className="border-b px-4 py-3">
                  <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                  {user && <p className="mt-1 text-xs text-gray-500">@{user.username}</p>}
                </div>
                <div className="p-2">
                  <Button
                    variant="ghost"
                    className="w-full justify-start text-sm text-red-600 hover:bg-red-50"
                    onClick={handleLogout}
                  >
                    로그아웃
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default ProtectedHeader;
```

- [ ] **Step 6: Provider·루트 페이지·푸시·채팅 임시 처리·설정**

`client/src/components/providers.tsx` 전체 교체:
```tsx
"use client";

import { ReactQueryProvider } from "@/components/react-query-provider";
import { Toaster } from "./ui/sonner";

// 앱 전역 Provider. 인증 세션은 Supabase 쿠키 + useAuth(React Query)로 관리한다.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ReactQueryProvider>
      <Toaster />
      {children}
    </ReactQueryProvider>
  );
}
```

`client/src/app/page.tsx` 전체 교체(로그인 여부 분기는 proxy가 담당):
```tsx
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/chat/friends");
}
```

`client/src/hooks/usePushNotification.ts`: `import { useSession } from "next-auth/react";`를 `import useAuth from "@/hooks/useAuth";`로, `const { data: session } = useSession();`를 `const { user: session } = useAuth();`로 바꾼다(나머지 `session` 참조는 로그인 여부 판정으로 그대로 동작).

`useChatMessages.ts`의 `currentUserId: user?.id ?? null,` 을 다음으로 바꾼다:
```ts
    // ponytail: 사용자 id가 uuid(string)로 바뀌었다. 채팅은 4단계에서 재작성하므로 그때까지 본인 메시지 판별 비활성.
    currentUserId: null as number | null,
```

`client/src/config/index.ts`에서 `NEXTAUTH_SECRET`, `KAKAO_CLIENT_ID`, `KAKAO_CLIENT_SECRET` 선언과 주석을 삭제한다.

`client/.env.local.example` 전체 교체:
```
# client/.env.local 템플릿 — 복사: cp client/.env.local.example client/.env.local

# Supabase (로컬: 저장소 루트에서 `npx -y supabase@2.120.0 status -o env`의 API_URL / PUBLISHABLE_KEY)
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=

# (6단계에서 제거) 기존 NestJS 주소 — 아직 친구·방·채팅 코드가 참조
NEXT_PUBLIC_API_URL=http://localhost:4000

# 웹 푸시 VAPID 공개키
NEXT_PUBLIC_VAPID_PUBLIC_KEY=

# 카카오 키는 supabase/.env 로 이동했습니다(Supabase Auth가 사용).
```
`client/.env.local`에 `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`를 추가하고 `NEXTAUTH_SECRET`, `KAKAO_*` 줄을 삭제한다(파일은 gitignore — 값 출력 금지).

삭제와 의존성 정리(`client/`):
```bash
git rm -r client/src/auth.ts "client/src/app/api/auth/[...nextauth]/route.ts" client/src/store/auth.ts client/src/services/auth client/src/hooks/api/useAuthMutation.ts
pnpm remove next-auth jotai
grep -rnE "next-auth|jotai|@/store/auth|useAuthMutation" src || echo "no references"
```
Expected: `no references`.

- [ ] **Step 7: 전체 확인** (`client/`)
```bash
pnpm exec tsc --noEmit
pnpm lint
pnpm test
```
Expected: tsc 출력 없음, lint 에러 0(경고는 기준선 6 이하), test pass 7.

- [ ] **Step 8: Commit**
```bash
git add -A client
git commit -m "feat(auth): UI를 Supabase Auth로 전환 — useAuth·로그인/가입 폼·헤더, NextAuth·jotai 제거, 경계 lint 규칙"
```

---

### Task 5: 실행 검증

**Files:** (코드 변경 없음, 발견 시 해당 파일 수정)

- [ ] **Step 1: 빌드** — `client/`에서 `pnpm build` → 성공. (`NEXT_PUBLIC_SUPABASE_*`가 `.env.local`에 있어야 함)

- [ ] **Step 2: 개발 서버 + 리다이렉트 확인** — `client/`에서 `pnpm dev`를 백그라운드로 띄우고 준비되면:
```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/chat/friends
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/login
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/join
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/sw.js
```
Expected: `307 http://localhost:3000/login`, `307 http://localhost:3000/login`, `200`, `200`, 마지막은 리다이렉트 없음(200 또는 404 — public에 파일이 없으면 404). (Review Focus 1, 5)

- [ ] **Step 3: 통합 스크립트 재실행** — Task 1 Step 8 명령 → `verify-auth: all checks passed`.

- [ ] **Step 4: 브라우저 확인** — 가능하면 브라우저 자동화 도구(chrome-browser 스킬)로, 불가하면 사용자에게 아래 체크리스트를 요청한다.
  1. `/login`에서 `alice@dongchat.local` / `password123` 로그인 → `/chat/friends`로 이동, 헤더에 "안녕하세요, alice_dev님", 관리자 링크 없음.
  2. 로그아웃 → `/login`. 뒤로가기로 `/chat/friends` 접근 시 다시 `/login`.
  3. `admin@dongchat.local` 로그인 → 헤더에 "관리자" 링크.
  4. `/join`에서 새 이메일·아이디(`New_User1`)로 가입 → 자동 로그인 후 `/chat/friends`, 표시명 `new_user1`. 같은 아이디로 다시 가입 시 "이미 사용 중인 아이디입니다."
  5. alice로 로그인한 상태에서 Studio(`http://127.0.0.1:54323`) SQL Editor로 다음을 실행 → 앱 새로고침 시 로그인 화면으로 이동. (Review Focus 2)
     `insert into private.user_access (user_id, sessions_revoked_at) select id, now() from auth.users where email = 'alice@dongchat.local' on conflict (user_id) do update set sessions_revoked_at = now();`
  6. (카카오 Redirect URI 등록 후) 카카오로 시작하기 → 동의 → `/chat/friends`, 표시명 = 카카오 닉네임.

- [ ] **Step 5: 마무리** — dev 서버 종료. 발견한 문제는 해당 Task 파일을 고치고 tsc/lint/test 재통과 후 커밋.

---

## 검증 기록 (실행 중 채움)

| 항목 | 결과 | 비고 |
|---|---|---|
| 카카오 provider 설정으로 supabase 기동 | | Task 1 Step 5 |
| 중복 이메일 에러 코드 = `user_already_exists` | | Task 1 Step 8 |
| `setAll`의 두 번째 인자(headers) 타입 호환 | | Task 3 Step 5 |
| `response.cookies.setAll` 존재 | | Task 3 Step 5 |
| 브라우저 체크리스트 수행 주체 | | Task 5 Step 4 |
