# 친구 초대 링크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이디 없이 링크 하나로 친구가 된다 — 친구 탭 "친구 초대"(공유 창/복사) → 수신자가 링크를 열고(필요하면 로그인 후 복귀) "친구 되기" → 1:1 방.

**Architecture:** 사용자당 초대 코드 하나(`private.friend_invites`)와 RPC 4개. 수락은 수신자 동의(버튼)로 `friends`를 ACCEPTED로 만든다. 로그인 복귀는 `?next=` + 순수 함수 `safeNext`(오픈 리다이렉트 방지)를 proxy·로그인·가입·카카오 콜백이 공유한다.

**Tech Stack:** Supabase(pgcrypto `extensions.gen_random_bytes`, pgTAP), Next.js 16, React Query, Web Share API, Clipboard API, Node 24 `node:test`, playwright-core(스크래치패드).

**Spec:** `docs/superpowers/specs/2026-10-15-friend-invite-link-design.md`

## Global Constraints
- 새 npm 의존성 없음. `@supabase/*`·`@/lib/supabase/*` import는 services·lib/supabase·proxy·auth/callback에서만.
- DB 함수: `security definer`, `set search_path = ''`, 스키마 한정, `perform private.require_active_session()`, `revoke execute … from public, anon`, `grant execute … to authenticated`. 에러는 `raise exception '<CODE>' using hint = '<사용자 문구>'` — 클라는 hint를 그대로 보여 준다(`getErrorMessage` default 분기)이므로 `error-handler.ts` 변경 없음.
- 순수 함수(`lib/*.ts`)는 상대 경로 + `.ts` import.
- 색은 토큰만(`bg-primary` 등), 높이 `h-dvh`, 시트는 `components/ui/sheet.tsx`.
- 각 Task: 명시된 테스트 + `pnpm exec tsc --noEmit`(종료 코드 직접 확인) + `pnpm lint` 에러 0. 기준선: `pnpm test` 58, pgTAP 179.
- 개발 서버가 떠 있는 동안 `pnpm build` 금지(.next 공유로 dev 서버가 깨진다).
- 커밋 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus
1. **오픈 리다이렉트:** `?next=//evil.com`, `/\evil.com`, `https://evil.com`, `/login?next=...`(루프)은 거부되어 기본 화면으로. → Task 2 `safe-next` 테스트
2. **로그인 복귀:** 비로그인으로 초대 링크 → 이메일 로그인·카카오·가입 어느 경로로든 초대 화면으로 돌아온다. 이미 로그인한 사람이 `/login?next=/invite/x`를 열면 바로 초대 화면. → Task 3 + Task 5 헤드리스
3. **관계 상태별 수락:** 대기 중 요청(양방향), 이미 친구, 차단(양방향), 본인 코드, 재발급된 예전 코드. → Task 1 pgTAP
4. **공유 취소:** 공유 창에서 사용자가 취소하면 복사·토스트 없이 조용히 끝난다. 공유 미지원이면 복사. → Task 2 `share` 테스트
5. **초대 코드 노출 범위:** 코드 테이블은 API로 읽을 수 없고, 미리보기는 이름·사진만 준다(이메일 등 없음). → Task 1 pgTAP(테이블 권한·반환 컬럼)

---

## File Structure
```
supabase/migrations/<ts>_friend_invites.sql
supabase/tests/database/150_friend_invites.test.sql
client/src/lib/supabase/database.types.ts           # 재생성
client/src/lib/safe-next.ts (+test)                 # next 경로 검증
client/src/lib/share.ts (+test)                     # 공유 창 → 복사 폴백
client/src/services/invites.ts                      # RPC 4개
client/src/services/auth.ts                         # signInWithKakao(next?)
client/scripts/verify-social.mjs                    # 초대 계약
client/src/lib/supabase/proxy.ts                    # 비로그인 → /login?next=, 로그인 상태 /login?next= → next
client/src/app/auth/callback/route.ts               # safeNext, 기본 /chat/rooms
client/src/components/auth/{AuthShell,login/LoginForm,join/JoinForm}.tsx
client/src/app/(public)/(auth)/{login,join}/page.tsx
client/src/hooks/useNextParam.ts                    # ?next= 읽기(브라우저 전용)
client/src/app/(protected)/chat/friends/page.tsx    # 초대 버튼
client/src/app/(protected)/chat/settings/page.tsx   # 초대 링크 새로 만들기
client/src/app/(protected)/invite/[code]/page.tsx   # 초대 화면
client/src/components/chat/InviteButton.tsx
```

---

### Task 1: DB — 초대 코드와 수락

**Files:** Create `supabase/migrations/<ts>_friend_invites.sql`(`npx -y supabase@2.120.0 migration new friend_invites < /dev/null`), `supabase/tests/database/150_friend_invites.test.sql`; Modify `client/src/lib/supabase/database.types.ts`.

**Interfaces — Produces:** `get_my_invite_code() → text`, `reset_my_invite_code() → text`, `preview_invite(p_code text) → table(username text, nickname text, avatar_url text)`, `accept_invite(p_code text) → table(username text, already boolean)`. 에러: `INVITE_NOT_FOUND`, `FRIEND_SELF_REQUEST`, `FRIEND_BLOCKED`, `AUTH_SESSION_REVOKED`.

- [ ] **Step 1: 실패하는 pgTAP**

`supabase/tests/database/150_friend_invites.test.sql`:
```sql
begin;
select plan(18);

select tests.create_user('fi_alice@test.com', '{"username":"fi_alice"}');
select tests.create_user('fi_bob@test.com', '{"username":"fi_bob"}');
select tests.create_user('fi_carol@test.com', '{"username":"fi_carol"}');
select tests.create_user('fi_dave@test.com', '{"username":"fi_dave"}');
select tests.create_user('fi_erin@test.com', '{"username":"fi_erin"}');

-- 코드 생성·재사용
select tests.login_as(tests.uid('fi_alice@test.com'));
select set_config('t.code', public.get_my_invite_code(), true);
select is(public.get_my_invite_code(), current_setting('t.code'), '두 번 받아도 같은 코드');
select ok(current_setting('t.code') ~ '^[A-Za-z0-9_-]{12}$', 'URL 안전 12자');
reset role;

-- 미리보기: 이름·사진만
select tests.login_as(tests.uid('fi_bob@test.com'));
select is((select username from public.preview_invite(current_setting('t.code'))), 'fi_alice', '미리보기 = 초대자');
select is((select count(*)::int from public.preview_invite('nope_nope_00')), 0, '없는 코드 미리보기 0행');
select throws_ok($$ select * from public.accept_invite('nope_nope_00') $$, 'P0001', 'INVITE_NOT_FOUND', '없는 코드 거부');

-- 관계 없음 → 친구
select is((select already from public.accept_invite(current_setting('t.code'))), false, '처음 수락');
reset role;
select is((select status from public.friends where requester_id = tests.uid('fi_alice@test.com') and receiver_id = tests.uid('fi_bob@test.com')), 'ACCEPTED', '친구가 됨');

-- 이미 친구 → already
select tests.login_as(tests.uid('fi_bob@test.com'));
select is((select already from public.accept_invite(current_setting('t.code'))), true, '이미 친구');
select is((select username from public.accept_invite(current_setting('t.code'))), 'fi_alice', '초대자 username 반환');
reset role;

-- 대기 중 요청(수신자→초대자 방향) → ACCEPTED
select tests.login_as(tests.uid('fi_carol@test.com'));
select public.send_friend_request('fi_alice');
select lives_ok(format($$ select * from public.accept_invite(%L) $$, current_setting('t.code')), '대기 중 요청이 있어도 수락');
reset role;
select is((select status from public.friends where requester_id = tests.uid('fi_carol@test.com')), 'ACCEPTED', '대기 중 → ACCEPTED');

-- 차단 → FRIEND_BLOCKED
select tests.login_as(tests.uid('fi_alice@test.com'));
select public.send_friend_request('fi_dave');
reset role;
select tests.login_as(tests.uid('fi_dave@test.com'));
select public.respond_friend_request((select id from public.friends where receiver_id = tests.uid('fi_dave@test.com')), 'BLOCK');
select throws_ok(format($$ select * from public.accept_invite(%L) $$, current_setting('t.code')), 'P0001', 'FRIEND_BLOCKED', '차단 관계 거부');
reset role;

-- 본인 코드
select tests.login_as(tests.uid('fi_alice@test.com'));
select throws_ok(format($$ select * from public.accept_invite(%L) $$, current_setting('t.code')), 'P0001', 'FRIEND_SELF_REQUEST', '본인 코드 거부');
-- 재발급 → 예전 코드 무효
select set_config('t.new', public.reset_my_invite_code(), true);
select isnt(current_setting('t.new'), current_setting('t.code'), '재발급하면 새 코드');
reset role;
select tests.login_as(tests.uid('fi_erin@test.com'));
select throws_ok(format($$ select * from public.accept_invite(%L) $$, current_setting('t.code')), 'P0001', 'INVITE_NOT_FOUND', '예전 코드 무효');
reset role;

-- 노출 범위·권한
select ok(not has_table_privilege('authenticated', 'private.friend_invites', 'select'), '코드 테이블 직접 조회 불가');
select ok(not has_function_privilege('anon', 'public.accept_invite(text)', 'execute'), 'anon 수락 불가');
insert into private.user_access (user_id, banned_until) values (tests.uid('fi_erin@test.com'), now() + interval '1 day');
select tests.login_as(tests.uid('fi_erin@test.com'));
select throws_ok(format($$ select * from public.accept_invite(%L) $$, current_setting('t.new')), 'P0001', 'AUTH_SESSION_REVOKED', '정지 세션 거부');
reset role;

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인** — 루트에서 `npx -y supabase@2.120.0 test db < /dev/null 2>&1 | tail -6` → 150 FAIL(함수 없음), 나머지 PASS.

- [ ] **Step 3: 마이그레이션**

```sql
-- 친구 초대 링크(초대 링크 스펙 §4). 사용자당 코드 하나, 재발급하면 예전 링크 무효.
create table private.friend_invites (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  code text not null unique,
  created_at timestamptz not null default now()
);
revoke all on table private.friend_invites from public, anon, authenticated;

-- URL 안전 12자(72비트)
create or replace function private.new_invite_code() returns text
language sql volatile set search_path = ''
as $$ select translate(encode(extensions.gen_random_bytes(9), 'base64'), '+/', '-_') $$;
revoke execute on function private.new_invite_code() from public, anon, authenticated;

create or replace function public.get_my_invite_code() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text;
begin
  perform private.require_active_session();
  insert into private.friend_invites (user_id, code) values (auth.uid(), private.new_invite_code())
  on conflict (user_id) do nothing;
  select code into v_code from private.friend_invites where user_id = auth.uid();
  return v_code;
end;
$$;

create or replace function public.reset_my_invite_code() returns text
language plpgsql security definer set search_path = ''
as $$
declare
  v_code text := private.new_invite_code();
begin
  perform private.require_active_session();
  insert into private.friend_invites (user_id, code) values (auth.uid(), v_code)
  on conflict (user_id) do update set code = excluded.code, created_at = now();
  return v_code;
end;
$$;

-- 초대 화면용: 이름·사진만(이메일 등은 주지 않는다). 없으면 0행.
create or replace function public.preview_invite(p_code text)
returns table (username text, nickname text, avatar_url text)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_active_session();
  return query
  select p.username, p.nickname, p.avatar_url
  from private.friend_invites i join public.profiles p on p.id = i.user_id
  where i.code = p_code;
end;
$$;

-- 수신자가 "친구 되기"를 누르면: 관계 없음 → ACCEPTED 생성, 대기 중 → ACCEPTED, 이미 친구 → already, 차단 → 거부.
create or replace function public.accept_invite(p_code text)
returns table (username text, already boolean)
language plpgsql security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_inviter uuid;
  v_name text;
  v_row public.friends;
begin
  perform private.require_active_session();
  select i.user_id, p.username into v_inviter, v_name
  from private.friend_invites i join public.profiles p on p.id = i.user_id
  where i.code = p_code;
  if v_inviter is null then
    raise exception 'INVITE_NOT_FOUND' using hint = '만료되었거나 잘못된 초대 링크예요.';
  end if;
  if v_inviter = v_me then
    raise exception 'FRIEND_SELF_REQUEST' using hint = '내 초대 링크예요. 친구에게 보내 주세요.';
  end if;

  select * into v_row from public.friends f
  where least(f.requester_id, f.receiver_id) = least(v_me, v_inviter)
    and greatest(f.requester_id, f.receiver_id) = greatest(v_me, v_inviter)
  for update;

  if v_row.id is null then
    insert into public.friends (requester_id, receiver_id, status) values (v_inviter, v_me, 'ACCEPTED')
    on conflict do nothing; -- 동시에 두 번 눌러도 한 행
    return query select v_name, false;
  elsif v_row.status = 'BLOCKED' then
    raise exception 'FRIEND_BLOCKED' using hint = '친구를 추가할 수 없어요.';
  elsif v_row.status = 'ACCEPTED' then
    return query select v_name, true;
  else
    update public.friends set status = 'ACCEPTED' where id = v_row.id;
    return query select v_name, false;
  end if;
end;
$$;

revoke execute on function public.get_my_invite_code(), public.reset_my_invite_code(),
  public.preview_invite(text), public.accept_invite(text) from public, anon;
grant execute on function public.get_my_invite_code(), public.reset_my_invite_code(),
  public.preview_invite(text), public.accept_invite(text) to authenticated;
```

- [ ] **Step 4: 적용·통과** — `npx -y supabase@2.120.0 migration up --local < /dev/null`, `test db` → `Result: PASS`(179+18=197), `db advisors --local`의 ERROR 0.
- [ ] **Step 5: 타입** — `gen types --local --lang typescript --schema public > client/src/lib/supabase/database.types.ts`, `npx -y prettier@3.6.2 --print-width 110 --write` 후 tsc 0.
- [ ] **Step 6: 커밋** — `feat(db): 친구 초대 코드와 수락(accept_invite)`.

---

### Task 2: 순수 로직·services·통합 검증

**Files:** Create `client/src/lib/safe-next.ts`, `safe-next.test.ts`, `client/src/lib/share.ts`, `share.test.ts`, `client/src/services/invites.ts`; Modify `client/scripts/verify-social.mjs`.

**Interfaces — Produces:** `safeNext(raw: string | null | undefined, fallback?: string): string`; `shareOrCopy(data: { title: string; text: string; url: string }, nav?: ShareNav): Promise<"shared" | "copied" | "cancelled">`; `getMyInviteCode(): Promise<string>`, `resetMyInviteCode(): Promise<string>`, `previewInvite(code): Promise<Profile | null>`, `acceptInvite(code): Promise<{ username: string; already: boolean }>`; `inviteUrl(origin: string, code: string): string`(safe-next.ts가 아닌 share.ts에).

- [ ] **Step 1: 실패하는 테스트**

`client/src/lib/safe-next.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeNext } from "./safe-next.ts";

test("같은 사이트 경로만 허용, 나머지는 기본 화면", () => {
  assert.equal(safeNext("/invite/abc"), "/invite/abc");
  assert.equal(safeNext("/chat/rooms/3?x=1"), "/chat/rooms/3?x=1");
  for (const bad of [null, undefined, "", "invite", "//evil.com", "/\\evil.com", "https://evil.com", "/login?next=/x", "/join", "/auth/callback", "javascript:alert(1)"]) {
    assert.equal(safeNext(bad), "/chat/rooms", String(bad));
  }
  assert.equal(safeNext("//evil.com", "/chat/friends"), "/chat/friends");
});
```
`client/src/lib/share.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { inviteUrl, shareOrCopy } from "./share.ts";

const data = { title: "t", text: "x", url: "https://a/invite/c" };

test("공유 창이 있으면 공유", async () => {
  let shared = false;
  assert.equal(await shareOrCopy(data, { share: async () => void (shared = true), clipboard: { writeText: async () => {} } }), "shared");
  assert.equal(shared, true);
});

test("사용자가 취소하면 복사하지 않음", async () => {
  let copied = false;
  const abort = Object.assign(new Error("x"), { name: "AbortError" });
  assert.equal(await shareOrCopy(data, { share: async () => { throw abort; }, clipboard: { writeText: async () => void (copied = true) } }), "cancelled");
  assert.equal(copied, false);
});

test("공유 미지원·실패면 복사", async () => {
  let copied = "";
  const clipboard = { writeText: async (s: string) => void (copied = s) };
  assert.equal(await shareOrCopy(data, { clipboard }), "copied");
  assert.equal(copied, data.url);
  assert.equal(await shareOrCopy(data, { share: async () => { throw new Error("NotAllowed"); }, clipboard }), "copied");
});

test("초대 주소", () => {
  assert.equal(inviteUrl("https://a.app", "Ab_-1"), "https://a.app/invite/Ab_-1");
});
```
Run `pnpm test` → 두 파일 FAIL.

- [ ] **Step 2: 구현**

`client/src/lib/safe-next.ts`:
```ts
// 로그인 후 돌아갈 경로. 같은 사이트 경로만 허용(오픈 리다이렉트 방지), 로그인·가입·콜백으로는 되돌리지 않는다.
const BLOCKED = ["/login", "/join", "/auth"];

export const safeNext = (raw: string | null | undefined, fallback = "/chat/rooms"): string => {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  const path = raw.split(/[?#]/)[0];
  if (BLOCKED.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;
  return raw;
};
```
`client/src/lib/share.ts`:
```ts
export type ShareNav = {
  share?: (data: { title: string; text: string; url: string }) => Promise<void>;
  clipboard?: { writeText: (s: string) => Promise<void> };
};

export const inviteUrl = (origin: string, code: string): string => `${origin}/invite/${code}`;

// 폰은 공유 창, 없으면(주로 PC) 클립보드. 사용자가 공유 창을 닫으면(AbortError) 아무것도 하지 않는다.
export const shareOrCopy = async (
  data: { title: string; text: string; url: string },
  nav: ShareNav = globalThis.navigator,
): Promise<"shared" | "copied" | "cancelled"> => {
  if (nav.share) {
    try {
      await nav.share(data);
      return "shared";
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return "cancelled";
    }
  }
  await nav.clipboard?.writeText(data.url);
  return "copied";
};
```
`client/src/services/invites.ts`:
```ts
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/domain";
import { toDomainError } from "./errors";

// 친구 초대 링크 경계. NestJS 복귀 시 이 파일 내부만 교체한다.
export async function getMyInviteCode(): Promise<string> {
  const { data, error } = await createClient().rpc("get_my_invite_code");
  if (error) throw toDomainError(error);
  return data;
}

export async function resetMyInviteCode(): Promise<string> {
  const { data, error } = await createClient().rpc("reset_my_invite_code");
  if (error) throw toDomainError(error);
  return data;
}

// 초대자(이름·사진). 없거나 무효한 코드면 null. id는 노출하지 않으므로 빈 문자열.
export async function previewInvite(code: string): Promise<Profile | null> {
  const { data, error } = await createClient().rpc("preview_invite", { p_code: code });
  if (error) throw toDomainError(error);
  const row = data[0];
  return row ? { id: "", username: row.username, nickname: row.nickname, avatarUrl: row.avatar_url } : null;
}

export async function acceptInvite(code: string): Promise<{ username: string; already: boolean }> {
  const { data, error } = await createClient().rpc("accept_invite", { p_code: code });
  if (error) throw toDomainError(error);
  return { username: data[0].username, already: data[0].already };
}
```
`pnpm test` → 모두 pass(58+5), tsc 0.

- [ ] **Step 3: verify-social 확장** — `console.log("verify-social: OK");` 바로 위에:
```js
// 초대 링크(초대 스펙 §3): u4가 u1의 코드로 친구 → 다시 수락하면 already
const u4 = await signUp("vs4");
const code = await ok(u1.client.rpc("get_my_invite_code"));
assert.equal(await ok(u1.client.rpc("get_my_invite_code")), code, "같은 코드");
assert.equal((await ok(u4.client.rpc("preview_invite", { p_code: code })))[0].username, u1.username, "미리보기");
assert.equal((await ok(u4.client.rpc("accept_invite", { p_code: code })))[0].already, false, "수락");
assert.equal((await ok(u4.client.rpc("accept_invite", { p_code: code })))[0].already, true, "이미 친구");
await fails(u1.client.rpc("accept_invite", { p_code: code }), "FRIEND_SELF_REQUEST");
await fails(u4.client.rpc("accept_invite", { p_code: "nope_nope_00" }), "INVITE_NOT_FOUND");
```
(`signUp`·`ok`·`fails`·`u1`은 스크립트에 이미 있다. `u3`까지 쓰이므로 새 사용자는 `u4`.) `pnpm verify` 5/5 OK.
- [ ] **Step 4: 커밋** — `feat(invite): safeNext·공유/복사, 초대 services, 통합 검증`.

---

### Task 3: 로그인 후 돌아오기

**Files:** Modify `client/src/lib/supabase/proxy.ts`, `client/src/app/auth/callback/route.ts`, `client/src/services/auth.ts`, `client/src/components/auth/AuthShell.tsx`, `login/LoginForm.tsx`, `join/JoinForm.tsx`, `client/src/app/(public)/(auth)/{login,join}/page.tsx`; Create `client/src/hooks/useNextParam.ts`.

**Interfaces:** Consumes `safeNext`. Produces `useNextParam(): string`(검증된 next, 기본 `/chat/rooms`), `signInWithKakao(next?: string)`.

- [ ] **Step 1: proxy** — `lib/supabase/proxy.ts`:
  - import `import { safeNext } from "@/lib/safe-next";`
  - `redirectTo(target)`를 `redirectTo(target: string, search = "")`로 바꾸고 `url.search = search;`.
  - 분기 교체:
```ts
  if (!isAuthed && !isPublic(pathname)) {
    const next = `${pathname}${request.nextUrl.search}`;
    return redirectTo("/login", pathname === "/" ? "" : `?next=${encodeURIComponent(next)}`);
  }
  if (isAuthed && AUTH_ENTRY_PATHS.includes(pathname)) {
    const target = safeNext(request.nextUrl.searchParams.get("next"), HOME);
    const [path, query = ""] = target.split("?");
    return redirectTo(path, query ? `?${query}` : "");
  }
```
- [ ] **Step 2: 콜백** — `auth/callback/route.ts`: `const HOME = "/chat/rooms";`, import `safeNext`, `const safe = safeNext(searchParams.get("next"), HOME);` 후 `NextResponse.redirect(`${origin}${safe}`)`. 기존 수동 검사 줄 삭제.
- [ ] **Step 3: 카카오** — `services/auth.ts`:
```ts
export async function signInWithKakao(next?: string): Promise<void> {
  const callback = new URL("/auth/callback", window.location.origin);
  if (next) callback.searchParams.set("next", next);
  const { error } = await createClient().auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo: callback.toString() },
  });
  if (error) throw toDomainError(error);
}
```
- [ ] **Step 4: next 훅·폼** — `hooks/useNextParam.ts`:
```ts
"use client";

import { useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/safe-next";

// 로그인·가입 화면의 ?next=(검증됨). 없으면 채팅 목록.
export const useNextParam = (): string => safeNext(useSearchParams().get("next"));
```
  - `LoginForm`: `const next = useNextParam();`, 성공 시 `router.replace(next)`(`useRouter` from `next/navigation`; 기존 `goChat` 제거), 카카오 `mutationFn: () => signInWithKakao(next)`.
  - `JoinForm`: 같은 방식. 이메일 확인 필요 시 `router.replace(`/login?next=${encodeURIComponent(next)}`)`.
  - `AuthShell`: footer `href`에 next를 붙일 수 있도록 `login/page.tsx`·`join/page.tsx`를 client 래퍼 없이 두고, AuthShell 안에서 `useNextParam()`으로 링크를 만든다 → AuthShell을 `"use client"`로, footer prop은 `{ text, path, link }`로 바꾸고 `href={next === "/chat/rooms" ? path : `${path}?next=${encodeURIComponent(next)}`}`.
  - `useSearchParams`는 Suspense 경계가 필요하다(Next 빌드 에러 방지): `login/page.tsx`·`join/page.tsx`에서 `<Suspense>`로 `AuthShell`을 감싼다.
- [ ] **Step 5: 확인** — tsc 0, lint 0, `pnpm test` pass. (빌드는 Task 5에서 dev 서버 띄우기 전에.)
- [ ] **Step 6: 커밋** — `feat(auth): 로그인·가입·카카오 후 원래 화면으로(next), 콜백 기본 /chat/rooms`.

---

### Task 4: 초대 화면들

**Files:** Create `client/src/components/chat/InviteButton.tsx`, `client/src/app/(protected)/invite/[code]/page.tsx`; Modify `chat/friends/page.tsx`, `chat/settings/page.tsx`.

**Interfaces:** Consumes Task 2 services, `shareOrCopy`, `inviteUrl`, `useRoomActions().openDirect`, `UserAvatar`.

- [ ] **Step 1: 초대 버튼**
```tsx
"use client";

import { useMutation } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-handler";
import { inviteUrl, shareOrCopy } from "@/lib/share";
import { getMyInviteCode } from "@/services/invites";
import type { DomainError } from "@/types/domain";

// 친구 초대: 폰은 공유 창, PC는 링크 복사. variant="icon"은 상단 바용.
export function InviteButton({ variant = "full" }: { variant?: "full" | "icon" }) {
  const invite = useMutation({
    mutationFn: async () => {
      const code = await getMyInviteCode();
      return shareOrCopy({
        title: "dongchat 친구 초대",
        text: "dongchat에서 같이 대화해요! 링크를 누르면 바로 친구가 돼요.",
        url: inviteUrl(window.location.origin, code),
      });
    },
    onSuccess: (result) => result === "copied" && toast.success("초대 링크를 복사했어요. 친구에게 보내 주세요."),
    onError: (e) => toast.error(getErrorMessage(e as unknown as DomainError)),
  });
  if (variant === "icon")
    return (
      <button type="button" onClick={() => invite.mutate()} disabled={invite.isPending} aria-label="친구 초대" className="flex size-10 items-center justify-center rounded-full hover:bg-muted">
        <Share2 className="size-5" />
      </button>
    );
  return (
    <Button className="h-11 w-full" onClick={() => invite.mutate()} disabled={invite.isPending}>
      <Share2 className="size-4" /> 친구 초대 링크 보내기
    </Button>
  );
}
```
- [ ] **Step 2: 친구 탭** — `actions`에 `<InviteButton variant="icon" />`를 ＋ 앞에, 내 프로필 카드 바로 아래 `<div className="mx-4 mt-2"><InviteButton /></div>`. 친구 0명 문구를 "아직 친구가 없어요. 초대 링크를 보내거나 오른쪽 위 ＋로 아이디를 검색해 보세요."로.
- [ ] **Step 3: 초대 화면** `app/(protected)/invite/[code]/page.tsx`:
```tsx
"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { FRIENDS_QUERY_KEY } from "@/hooks/useFriends";
import { useRoomActions } from "@/hooks/useRoomActions";
import { getErrorMessage } from "@/lib/error-handler";
import { acceptInvite, previewInvite } from "@/services/invites";
import { displayName, type DomainError } from "@/types/domain";

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { openDirect } = useRoomActions();
  const { data: inviter, isLoading, isError } = useQuery({ queryKey: ["invite", code], queryFn: () => previewInvite(code), retry: false });
  const accept = useMutation({
    mutationFn: () => acceptInvite(code),
    onSuccess: async ({ username, already }) => {
      await queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_KEY });
      toast.success(already ? "이미 친구예요." : "친구가 됐어요!");
      openDirect(username);
    },
    onError: (e) => {
      const err = e as unknown as DomainError;
      toast.error(getErrorMessage(err));
      if (err.code === "FRIEND_SELF_REQUEST") router.replace("/chat/friends");
    },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      {isLoading && <p className="text-muted-foreground">초대를 확인하는 중…</p>}
      {!isLoading && (isError || !inviter) && (
        <>
          <p className="font-semibold">만료되었거나 잘못된 초대 링크예요</p>
          <p className="text-sm text-muted-foreground">친구에게 새 링크를 받아 주세요.</p>
          <Button asChild variant="outline"><Link href="/chat/rooms">채팅으로</Link></Button>
        </>
      )}
      {inviter && (
        <>
          <UserAvatar name={displayName(inviter)} src={inviter.avatarUrl} className="size-20 rounded-[24px] text-2xl" />
          <div>
            <p className="text-lg font-bold">{displayName(inviter)}</p>
            <p className="text-sm text-muted-foreground">@{inviter.username}님이 친구로 초대했어요</p>
          </div>
          <Button className="h-12 w-full text-base" disabled={accept.isPending} onClick={() => accept.mutate()}>친구 되기</Button>
          <Link href="/chat/rooms" className="text-sm text-muted-foreground">나중에</Link>
        </>
      )}
    </main>
  );
}
```
- [ ] **Step 4: 설정** — "내 프로필" 아래 버튼 행 추가(`resetMyInviteCode`, `confirm("예전 초대 링크는 더 이상 쓸 수 없어요. 새로 만들까요?")` → 성공 토스트 "새 초대 링크를 만들었어요.", 실패 토스트). `useMutation` 사용.
- [ ] **Step 5: 확인** — tsc 0, lint 0, test pass.
- [ ] **Step 6: 커밋** — `feat(invite): 친구 초대 버튼·초대 화면·링크 재발급`.

---

### Task 5: 빌드·브라우저 확인·문서

- [ ] **Step 1:** dev 서버가 없을 때 `pnpm build` 성공 확인(`/invite/[code]` 라우트, login/join Suspense 에러 없음).
- [ ] **Step 2:** `pnpm dev` 띄우고 스크래치패드 `invite-check.mjs`(390×844, devtools 숨김):
  0. 시작 전 alice–bob 친구 행을 백업 후 삭제(시드에서 이미 친구라 수락 경로를 볼 수 없음). 끝나면 복원.
  1. alice 로그인 → 친구 탭 → `InviteButton`(full) 클릭 전 `navigator.share`를 undefined로 만들고 clipboard를 가로채(addInitScript) 복사된 URL 획득, 토스트 "복사".
  2. 새 컨텍스트(비로그인)로 그 URL → `/login?next=%2Finvite%2F<code>`로 이동 확인.
  3. 그 화면에서 bob 이메일 로그인 → `/invite/<code>` 복귀 → "fi" 아닌 alice 표시 이름 보임 → 친구 되기 → `/chat/rooms/<id>` 이동, 토스트.
  4. 같은 bob이 다시 URL → 친구 되기 → "이미 친구예요."
  5. alice가 자기 URL → 친구 되기 → 안내 후 `/chat/friends`.
  6. `/invite/nope_nope_00` → "만료되었거나 잘못된 초대 링크예요".
  7. 로그인 상태에서 `/login?next=/invite/<code>` → 바로 초대 화면. `/login?next=//evil.com` → `/chat/rooms`.
  8. 콘솔 에러 0. 끝나면 테스트로 만든 방을 지우고 alice–bob 친구 행을 원래대로 복원.
- [ ] **Step 3:** 회귀: `pnpm test`, tsc, lint, `pnpm verify`, `test db`.
- [ ] **Step 4:** 문서: `client/AGENTS.md` 화면 구조에 `/invite/[code]`, "로그인 복귀는 `?next=` + `safeNext`" 한 줄. 루트 `AGENTS.md` 배포 절의 Redirect URL 메모(쿼리 문자열이 붙은 콜백) 확인 결과 반영.
- [ ] **Step 5:** 커밋 `docs: 초대 링크·로그인 복귀 규칙`.
