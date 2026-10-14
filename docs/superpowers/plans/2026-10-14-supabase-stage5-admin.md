# Supabase 이전 5단계(관리자) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관리자 화면을 Supabase로 옮긴다. `/admin/users`(상태 배지, [정지][해제][강제 로그아웃], 페이지네이션·정렬)와 신규 `/admin/rooms`(전체 방 → 멤버 목록·[강퇴] + 메시지 읽기 전용 실시간 열람, 읽음 처리 없음)를 만든다.

**Architecture:** DB(관리자 RPC·RLS·Realtime 수신 정책)는 1단계에서 완료돼 DB 변경은 없다. UI → React Query → `services/admin.ts`(RPC) → supabase-js. 방 열람은 4단계 채팅 계층을 재사용한다. `ChatProvider`를 `(protected)` 레이아웃으로 올리고 `watchRoom(id)`로 "참여하지 않은 방" 채널도 구독하게 하며, `useChatMessages`가 참여자 목록을 돌려주고 `MessageList`가 읽기 전용 모드를 지원한다. 관리자 화면은 `setViewingRoom`을 호출하지 않으므로 `mark_read`가 일어나지 않는다(§8.3 "관리자 비멤버 열람 시 호출 안 함").

**Tech Stack:** Next.js 16.0.10, React 19.2, `@supabase/supabase-js@2.117.2`, React Query 5, shadcn/ui(Button·Card·Popover), Node 24 `node --test`, Supabase CLI 2.120.0.

**Spec:** `docs/superpowers/specs/2026-10-13-supabase-migration-design.md` (§2.1 `services/admin.ts`, §5.4 관리자 RPC, §8.3, §9 모더레이션 UI, §12-5단계)

## Global Constraints

- pnpm, 명령은 `client/`에서. 새 의존성 없음. DB 마이그레이션 없음.
- `@supabase/*`, `@/lib/supabase/*` import는 `src/services/**`, `src/lib/supabase/**`, `src/proxy.ts`, `src/app/auth/callback/**`에서만.
- 관리자 권한 판정은 DB(`private.is_admin()`, RPC `ADMIN_FORBIDDEN`)가 한다. 클라이언트 가드는 화면 노출 제어일 뿐이다. 관리자 여부는 `get_me().isAdmin`(= `useAuth().user.isAdmin`)만 쓴다.
- 강퇴 규칙(§5.4): 그룹방만, 본인 불가(관리자·그룹방 방장). 정지 규칙: 본인 불가, 종료 시각은 미래. UI는 같은 규칙으로 버튼을 숨기고, DB 거부 시 RPC hint를 토스트로 보여 준다.
- 관리자는 열람만(§5.2): 메시지 수정·삭제·답장·전송 UI를 관리자 화면에 두지 않는다. 관리자 열람은 `mark_read`를 호출하지 않는다.
- 표시명 = `nickname ?? username`. 사용자 알림은 `useToast`, 확인은 `confirm()`.
- React 19 lint: effect 본문 동기 setState 금지, 렌더 중 ref 읽기/쓰기 금지.
- 각 Task 완료 조건: 명시된 테스트 + `pnpm exec tsc --noEmit` + `pnpm lint`(에러 0, 경고 ≤ 6). 기준선: `pnpm test` 28 pass, pgTAP 137.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 관리자가 아닌 사용자가 `/admin/*`에 직접 들어오면 화면이 보이지 않고 채팅으로 돌아간다. RPC도 거부한다. → Task 3 레이아웃 가드 + Task 2 통합 스크립트(`ADMIN_FORBIDDEN`) + Task 5 브라우저
2. 관리자가 [정지]·[강제 로그아웃]을 누르면 대상이 열어 둔 탭이 새로고침 없이 로그인 화면으로 가고, [해제] 후에는 다시 로그인할 수 있다. 목록 배지가 즉시 바뀐다. → Task 5 브라우저(4단계 force_logout 경로 재사용)
3. 관리자가 남의 방 메시지를 열람해도 그 방 참여자의 안 읽은 수가 줄지 않는다(읽음 처리 없음). 열람 중 새 메시지·수정·삭제·강퇴가 실시간으로 보인다. → Task 4 + Task 5 브라우저
4. 본인 행에는 정지·강제 로그아웃 버튼이 없고, 1:1 방에는 [강퇴]가 없다(DB도 거부). 영구 정지는 "영구"로 표시된다. → Task 1 단위 테스트(`isBanned`·`banUntil`·`isPermanentBan`) + Task 3·4 화면 + Task 2 스크립트
5. 열람 중인 방이 삭제(마지막 멤버 강퇴·퇴장)돼 목록에서 사라지면 선택이 해제되고 오류 없이 안내 문구로 돌아간다. → Task 4 파생 선택 + Task 5 브라우저

---

## File Structure

```
client/
  scripts/verify-admin.mjs                     # 관리자 RPC·비멤버 열람·Realtime·강퇴·정지 계약 통합 검증
  src/
    types/domain.ts (+ .test.ts)               # + Page, AdminUser, AdminRoom, UserSort, BanDuration, banUntil, isBanned, isPermanentBan
    services/admin.ts                          # listUsers / ban / unban / forceLogout / listRooms
    app/(protected)/layout.tsx                 # ChatProvider를 여기로(채팅·관리자 공용)
    app/(protected)/chat/layout.tsx            # ChatProvider 제거, 인앱 알림만
    components/chat-provider.tsx               # + watchRoom(id): 참여하지 않은 방 채널 구독
    app/(protected)/chat/[menu]/_components/ChatRooms/
      hooks/useChatMessages.ts                 # + participants 반환
      components/MessageList.tsx, MessageItem.tsx   # + readOnly
    app/(protected)/admin/layout.tsx           # 관리자 가드 + 탭(사용자/채팅방)
    app/(protected)/admin/users/page.tsx       # 전체 교체
    app/(protected)/admin/rooms/page.tsx       # 신규: 방 목록 + 상세
    app/(protected)/admin/rooms/RoomDetail.tsx # 신규: 멤버·강퇴·읽기 전용 메시지
```

범위 밖(6단계): `usePushNotification`의 `getAccessToken`, Orval `services/{app,users,push}`, axios 제거.

---

### Task 1: 관리자 도메인 타입과 정지 규칙(단위 테스트)

**Files:**
- Modify: `client/src/types/domain.ts`
- Modify: `client/src/types/domain.test.ts`

**Interfaces:**
- Produces:
  - `type Page<T> = { items: T[]; total: number; page: number; limit: number }`
  - `type AdminUser = { id: string; username: string; nickname: string | null; email: string | null; createdAt: string; isAdmin: boolean; bannedUntil: string | null }`
  - `type AdminRoom = { id: number; name: string | null; isGroup: boolean; createdBy: string | null; ownerUsername: string | null; memberCount: number; createdAt: string }`
  - `type UserSort = "created_at" | "username"`, `type SortOrder = "asc" | "desc"`
  - `type BanDuration = "1d" | "7d" | "30d" | "permanent"`, `PERMANENT_BAN = "9999-12-31T00:00:00.000Z"`
  - `banUntil(d: BanDuration, now?: Date): Date`, `isBanned(bannedUntil: string | null, now?: Date): boolean`, `isPermanentBan(bannedUntil: string | null): boolean`

`AdminUser`·`AdminRoom` 필드는 `admin_list_users`/`admin_list_rooms`가 돌려주는 jsonb 키와 같다(1단계 마이그레이션 `20261013061851_admin.sql`).

- [ ] **Step 1: 실패하는 테스트** — `client/src/types/domain.test.ts` 끝에 추가하고 import를 교체

```ts
import { banUntil, displayName, isBanned, isPermanentBan, roomTitle } from "./domain.ts";
```

```ts
test("정지 종료 시각: 기간은 지금부터, 영구는 9999년", () => {
  const now = new Date("2026-10-14T00:00:00.000Z");
  assert.equal(banUntil("1d", now).toISOString(), "2026-10-15T00:00:00.000Z");
  assert.equal(banUntil("7d", now).toISOString(), "2026-10-21T00:00:00.000Z");
  assert.equal(banUntil("30d", now).toISOString(), "2026-11-13T00:00:00.000Z");
  assert.equal(banUntil("permanent", now).toISOString(), "9999-12-31T00:00:00.000Z");
});

test("정지 상태: 미래 시각만 정지, 지난 시각·null은 정상, 9999년은 영구 (Review Focus 4)", () => {
  const now = new Date("2026-10-14T00:00:00.000Z");
  assert.equal(isBanned("2026-10-15T00:00:00+00:00", now), true);
  assert.equal(isBanned("2026-10-13T00:00:00+00:00", now), false);
  assert.equal(isBanned(null, now), false);
  assert.equal(isPermanentBan("9999-12-31T00:00:00+00:00"), true);
  assert.equal(isPermanentBan("2026-10-15T00:00:00+00:00"), false);
  assert.equal(isPermanentBan(null), false);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|SyntaxError"`
Expected: FAIL — `does not provide an export named 'banUntil'`(domain.test.ts 전체 실패).

- [ ] **Step 3: 구현** — `client/src/types/domain.ts` 끝에 추가

```ts
// ---- 관리자 ----
export type Page<T> = { items: T[]; total: number; page: number; limit: number };

// admin_list_users jsonb 항목
export type AdminUser = {
  id: string;
  username: string;
  nickname: string | null;
  email: string | null;
  createdAt: string;
  isAdmin: boolean;
  bannedUntil: string | null; // 지난 시각이면 정상(해제 전 만료)
};

// admin_list_rooms jsonb 항목
export type AdminRoom = {
  id: number;
  name: string | null;
  isGroup: boolean;
  createdBy: string | null; // 방장
  ownerUsername: string | null;
  memberCount: number;
  createdAt: string;
};

export type UserSort = "created_at" | "username";
export type SortOrder = "asc" | "desc";
export type BanDuration = "1d" | "7d" | "30d" | "permanent";

// 영구 정지는 먼 미래 시각으로 표현한다(DB는 banned_until > now()로만 판정).
export const PERMANENT_BAN = "9999-12-31T00:00:00.000Z";
const BAN_DAYS: Record<Exclude<BanDuration, "permanent">, number> = { "1d": 1, "7d": 7, "30d": 30 };

export const banUntil = (d: BanDuration, now: Date = new Date()): Date =>
  d === "permanent" ? new Date(PERMANENT_BAN) : new Date(now.getTime() + BAN_DAYS[d] * 86_400_000);

export const isBanned = (bannedUntil: string | null, now: Date = new Date()): boolean =>
  bannedUntil !== null && new Date(bannedUntil).getTime() > now.getTime();

export const isPermanentBan = (bannedUntil: string | null): boolean =>
  bannedUntil !== null && new Date(bannedUntil).getUTCFullYear() >= 9999;
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: tests 30, pass 30, fail 0.

- [ ] **Step 5: 타입·린트와 커밋**

Run: `pnpm exec tsc --noEmit; pnpm lint` → tsc 출력 없음, lint 에러 0.

```bash
git add client/src/types/domain.ts client/src/types/domain.test.ts
git commit -m "feat(admin): 관리자 도메인 타입과 정지 기간·상태 규칙(단위 테스트)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 관리자 서비스와 계약 통합 검증

**Files:**
- Create: `client/scripts/verify-admin.mjs`
- Create: `client/src/services/admin.ts`

**Interfaces:**
- Consumes: Task 1 타입; 1단계 RPC `admin_list_users(p_page, p_limit, p_sort, p_order) → jsonb`, `admin_list_rooms(p_page, p_limit) → jsonb`, `admin_ban(p_user_id, p_until, p_reason?)`, `admin_unban(p_user_id)`, `admin_force_logout(p_user_id)`; 4단계 `MESSAGE_SELECT`, `PARTICIPANT_SELECT`, `toMessagePage`, `toParticipant`
- Produces (`services/admin.ts`):
  - `listUsers(q: { page: number; limit: number; sort: UserSort; order: SortOrder }): Promise<Page<AdminUser>>`
  - `banUser(userId: string, until: Date, reason?: string): Promise<void>`
  - `unbanUser(userId: string): Promise<void>`
  - `forceLogout(userId: string): Promise<void>`
  - `listAllRooms(q: { page: number; limit: number }): Promise<Page<AdminRoom>>`

검증 방식: 스크립트가 같은 RPC와 4단계 SELECT로 실제 DB·Realtime을 검증한다(RED는 Step 2: 스크립트가 아직 없는 `isBanned` 등을 import하지 않으므로, 스크립트 자체의 첫 실행이 계약 확인이다. `services/admin.ts`는 이 계약을 감싸는 얇은 계층이며 tsc로 게이트한다).

- [ ] **Step 1: 통합 스크립트 작성** — `client/scripts/verify-admin.mjs`

```js
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
await ok(admin.client.rpc("admin_force_logout", { p_user_id: u1.id }));
assert.equal((await ok(u1.client.from("profiles").select("id"))).length, 0, "강제 로그아웃된 토큰은 데이터 0행");

// 정리: 남은 방은 u2가 나간다(u1은 강제 로그아웃 상태)
await ok(u2.client.rpc("leave_room", { p_room_id: oneToOne }));

console.log("verify-admin: OK");
process.exit(0);
```

- [ ] **Step 2: 실행(계약 확인)**

Run: `SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-admin.mjs 2>&1 | grep -v -i warning | tail -3`
Expected: `verify-admin: OK`. 실패하면 DB 계약과 계획의 가정이 다른 것이므로 원인을 Ruling으로 기록하고 이후 Task에 반영한다.

- [ ] **Step 3: 서비스** — `client/src/services/admin.ts`

```ts
import { createClient } from "@/lib/supabase/client";
import type { AdminRoom, AdminUser, Page, SortOrder, UserSort } from "@/types/domain";
import { toDomainError } from "./errors";

// 관리자 경계. 권한 판정은 DB(ADMIN_FORBIDDEN). NestJS 복귀 시 이 파일 내부만 교체한다.
export async function listUsers(q: { page: number; limit: number; sort: UserSort; order: SortOrder }): Promise<Page<AdminUser>> {
  const { data, error } = await createClient().rpc("admin_list_users", {
    p_page: q.page,
    p_limit: q.limit,
    p_sort: q.sort,
    p_order: q.order,
  });
  if (error) throw toDomainError(error);
  // jsonb 키가 도메인 타입과 같다(계약은 verify-admin.mjs가 검증).
  return data as unknown as Page<AdminUser>;
}

export async function banUser(userId: string, until: Date, reason?: string): Promise<void> {
  const { error } = await createClient().rpc("admin_ban", {
    p_user_id: userId,
    p_until: until.toISOString(),
    p_reason: reason,
  });
  if (error) throw toDomainError(error);
}

export async function unbanUser(userId: string): Promise<void> {
  const { error } = await createClient().rpc("admin_unban", { p_user_id: userId });
  if (error) throw toDomainError(error);
}

// 그 시각 이전에 만든 대상의 모든 세션을 끊는다(다시 로그인은 가능).
export async function forceLogout(userId: string): Promise<void> {
  const { error } = await createClient().rpc("admin_force_logout", { p_user_id: userId });
  if (error) throw toDomainError(error);
}

export async function listAllRooms(q: { page: number; limit: number }): Promise<Page<AdminRoom>> {
  const { data, error } = await createClient().rpc("admin_list_rooms", { p_page: q.page, p_limit: q.limit });
  if (error) throw toDomainError(error);
  return data as unknown as Page<AdminRoom>;
}
```

- [ ] **Step 4: 타입·린트·테스트**

Run: `pnpm exec tsc --noEmit; pnpm lint; pnpm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: tsc 출력 없음, lint 에러 0, 30 pass.

- [ ] **Step 5: 커밋**

```bash
git add client/scripts/verify-admin.mjs client/src/services/admin.ts
git commit -m "feat(admin): 관리자 서비스와 계약 통합 검증(비관리자 거부·비멤버 열람·강퇴·정지)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 관리자 레이아웃 가드와 사용자 관리 화면

**Files:**
- Create: `client/src/app/(protected)/admin/layout.tsx`
- Modify: `client/src/app/(protected)/admin/users/page.tsx` (전체 교체)

**Interfaces:**
- Consumes: Task 1 `AdminUser`, `UserSort`, `SortOrder`, `BanDuration`, `banUntil`, `isBanned`, `isPermanentBan`, `displayName`; Task 2 `listUsers`, `banUser`, `unbanUser`, `forceLogout`; `useAuth()` → `{ user: AuthUser | null; isLoading: boolean }`
- Produces: `ADMIN_USERS_QUERY_KEY = ["admin", "users"]`(이 파일 내부)

화면을 새로 만드는 Task이므로 구현 전에 `/frontend-design:frontend-design` 스킬을 참고하되, 기존 앱(shadcn + gray/blue) 스타일을 따른다(사용자 지시).

- [ ] **Step 1: 관리자 레이아웃** — `client/src/app/(protected)/admin/layout.tsx`

```tsx
"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import useAuth from "@/hooks/useAuth";

const TABS = [
  { href: "/admin/users", label: "사용자" },
  { href: "/admin/rooms", label: "채팅방" },
];

// 화면 노출 가드. 실제 권한 판정은 DB(관리자 RPC·RLS)가 한다.
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoading && user && !user.isAdmin) router.replace("/chat/friends");
  }, [isLoading, user, router]);

  if (!user?.isAdmin) return null;

  return (
    <div className="space-y-4">
      <nav className="flex gap-2">
        {TABS.map((tab) => (
          <Button key={tab.href} variant={pathname === tab.href ? "default" : "outline"} asChild>
            <Link href={tab.href}>{tab.label}</Link>
          </Button>
        ))}
      </nav>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: 사용자 관리 화면** — `client/src/app/(protected)/admin/users/page.tsx` 전체 교체

```tsx
"use client";

import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import useAuth from "@/hooks/useAuth";
import useToast from "@/hooks/useToast";
import { getErrorMessage } from "@/lib/error-handler";
import { banUser, forceLogout, listUsers, unbanUser } from "@/services/admin";
import {
  banUntil,
  displayName,
  isBanned,
  isPermanentBan,
  type AdminUser,
  type BanDuration,
  type SortOrder,
  type UserSort,
} from "@/types/domain";

const ADMIN_USERS_QUERY_KEY = ["admin", "users"] as const;
const PAGE_SIZES = [10, 20, 50, 100];
const BAN_OPTIONS: { value: BanDuration; label: string }[] = [
  { value: "1d", label: "1일" },
  { value: "7d", label: "7일" },
  { value: "30d", label: "30일" },
  { value: "permanent", label: "영구" },
];

const StatusBadge = ({ user }: { user: AdminUser }) =>
  isBanned(user.bannedUntil) ? (
    <span className="rounded bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
      정지 · {isPermanentBan(user.bannedUntil) ? "영구" : `${new Date(user.bannedUntil!).toLocaleString()}까지`}
    </span>
  ) : (
    <span className="rounded bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">정상</span>
  );

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(20);
  const [sort, setSort] = useState<UserSort>("created_at");
  const [order, setOrder] = useState<SortOrder>("desc");

  const { data, isFetching } = useQuery({
    queryKey: [...ADMIN_USERS_QUERY_KEY, page, limit, sort, order],
    queryFn: () => listUsers({ page, limit, sort, order }),
    placeholderData: keepPreviousData,
  });
  const users = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / limit));

  const onDone = (message: string) => () => {
    success(message);
    void queryClient.invalidateQueries({ queryKey: ADMIN_USERS_QUERY_KEY });
  };
  const onFail = (label: string) => (e: Error) => error(`${label}: ${getErrorMessage(e)}`);

  const ban = useMutation({
    mutationFn: ({ id, duration }: { id: string; duration: BanDuration }) => banUser(id, banUntil(duration)),
    onSuccess: onDone("정지했습니다."),
    onError: onFail("정지 실패"),
  });
  const unban = useMutation({ mutationFn: unbanUser, onSuccess: onDone("정지를 해제했습니다."), onError: onFail("해제 실패") });
  const logout = useMutation({
    mutationFn: forceLogout,
    onSuccess: onDone("강제 로그아웃했습니다."),
    onError: onFail("강제 로그아웃 실패"),
  });
  const busy = ban.isPending || unban.isPending || logout.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          사용자 관리
          <span className="ml-2 text-sm font-normal text-gray-500">
            {data ? `${data.total}명` : ""} {isFetching ? "불러오는 중..." : ""}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2 text-gray-600">
            정렬
            <select
              className="h-9 rounded border px-2"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value as UserSort);
                setPage(1);
              }}
            >
              <option value="created_at">가입일</option>
              <option value="username">아이디</option>
            </select>
            <select
              className="h-9 rounded border px-2"
              value={order}
              onChange={(e) => {
                setOrder(e.target.value as SortOrder);
                setPage(1);
              }}
            >
              <option value="desc">내림차순</option>
              <option value="asc">오름차순</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-gray-600">
            페이지당
            <select
              className="h-9 rounded border px-2"
              value={limit}
              onChange={(e) => {
                setLimit(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-left">
              <tr>
                <th className="px-3 py-2">사용자</th>
                <th className="px-3 py-2">이메일</th>
                <th className="px-3 py-2">가입일</th>
                <th className="px-3 py-2">상태</th>
                <th className="px-3 py-2 text-right">관리</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {displayName(u)}
                      {u.isAdmin && <span className="ml-1 text-xs text-blue-600">관리자</span>}
                    </div>
                    <div className="text-xs text-gray-500">@{u.username}</div>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{u.email ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-600">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="px-3 py-2">
                    <StatusBadge user={u} />
                  </td>
                  <td className="px-3 py-2">
                    {u.id === me?.id ? (
                      <div className="text-right text-xs text-gray-400">(나)</div>
                    ) : (
                      <div className="flex justify-end gap-1">
                        {isBanned(u.bannedUntil) ? (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => unban.mutate(u.id)}>
                            해제
                          </Button>
                        ) : (
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button size="sm" variant="outline" disabled={busy}>
                                정지
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-44 p-2">
                              <p className="px-1 pb-2 text-xs text-gray-500">정지 기간</p>
                              <div className="grid grid-cols-2 gap-1">
                                {BAN_OPTIONS.map((opt) => (
                                  <Button
                                    key={opt.value}
                                    size="sm"
                                    variant="ghost"
                                    disabled={busy}
                                    onClick={() => {
                                      if (confirm(`${displayName(u)}님을 ${opt.label} 정지할까요?`)) {
                                        ban.mutate({ id: u.id, duration: opt.value });
                                      }
                                    }}
                                  >
                                    {opt.label}
                                  </Button>
                                ))}
                              </div>
                            </PopoverContent>
                          </Popover>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-600"
                          disabled={busy}
                          onClick={() => {
                            if (confirm(`${displayName(u)}님의 모든 기기를 로그아웃시킬까요?`)) logout.mutate(u.id);
                          }}
                        >
                          강제 로그아웃
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-center text-gray-500" colSpan={5}>
                    사용자가 없습니다.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            이전
          </Button>
          <span className="text-sm text-gray-700">
            {page} / {totalPages}
          </span>
          <Button variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
            다음
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: 타입·린트·테스트**

Run: `pnpm exec tsc --noEmit; pnpm lint; pnpm test 2>&1 | grep -E "^ℹ (pass|fail)"`
Expected: tsc 출력 없음, lint 에러 0(경고 ≤ 6), 30 pass.

- [ ] **Step 4: 커밋**

```bash
git add "client/src/app/(protected)/admin/layout.tsx" "client/src/app/(protected)/admin/users/page.tsx"
git commit -m "feat(admin): 관리자 가드·탭과 사용자 관리 화면(상태 배지, 정지·해제·강제 로그아웃, 정렬·페이지)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 방 열람 화면(`/admin/rooms`)과 채팅 계층 재사용

**Files:**
- Modify: `client/src/app/(protected)/layout.tsx` (ChatProvider로 감싸기)
- Modify: `client/src/app/(protected)/chat/layout.tsx` (ChatProvider 제거)
- Modify: `client/src/components/chat-provider.tsx` (`watchRoom` 추가)
- Modify: `ChatRooms/hooks/useChatMessages.ts` (`participants` 반환)
- Modify: `ChatRooms/components/MessageList.tsx`, `ChatRooms/components/MessageItem.tsx` (`readOnly`)
- Create: `client/src/app/(protected)/admin/rooms/page.tsx`
- Create: `client/src/app/(protected)/admin/rooms/RoomDetail.tsx`

(`ChatRooms/` = `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/`)

**Interfaces:**
- Consumes: Task 1 `AdminRoom`, `Page`; Task 2 `listAllRooms`; 3단계 `kickMember`; 4단계 `useChat`, `useChatMessages`, `MessageList`, `displayName`
- Produces:
  - `useChat().watchRoom(roomId: number): () => void` — 참여하지 않은 방도 room 채널을 구독(해제 함수 반환, 여러 번 호출 가능)
  - `useChatMessages(room)` 반환에 `participants: Participant[]` 추가
  - `MessageList` / `MessageItem` prop `readOnly?: boolean` — 답장·수정·삭제 버튼과 안 읽은 수 숨김

화면을 새로 만드는 Task이므로 구현 전에 `/frontend-design:frontend-design` 스킬을 참고하되, 기존 채팅 화면(카드 2열, gray/blue)과 같은 구성을 따른다.

- [ ] **Step 1: ChatProvider를 보호 레이아웃으로** — `client/src/app/(protected)/layout.tsx` 전체 교체

```tsx
"use client";
import { ChatProvider } from "@/components/chat-provider";
import ProtectedHeader from "@/components/layout/ProtectedHeader";
import useAuth from "@/hooks/useAuth";

const ProtectedLayout = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  return (
    <div className="min-h-screen bg-gray-50">
      <ProtectedHeader user={user} />
      {/* Realtime 허브: 채팅(참여 방)과 관리자 방 열람(watchRoom)이 공유. 강제 로그아웃 통지도 여기서 받는다. */}
      <ChatProvider>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </ChatProvider>
    </div>
  );
};

export default ProtectedLayout;
```

`client/src/app/(protected)/chat/layout.tsx` 전체 교체:

```tsx
"use client";

import { useInAppNotification } from "@/hooks/useInAppNotification";

// 채팅 페이지 전용: 지금 보고 있지 않은 방의 새 메시지 토스트. Realtime 구독은 (protected) 레이아웃의 ChatProvider.
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  useInAppNotification();
  return <>{children}</>;
}
```

- [ ] **Step 2: watchRoom** — `client/src/components/chat-provider.tsx`

`ChatContextValue` 타입에 추가:

```ts
  // 참여하지 않은 방도 room 채널을 구독한다(관리자 열람). 반환값으로 해제.
  watchRoom: (roomId: number) => () => void;
```

`const [pickedRoomId, setPickedRoomId] = useState<number | null>(null);` 아래에 추가:

```ts
  const [watched, setWatched] = useState<number[]>([]);
```

방 채널 diff effect를 교체(구독 대상 = 내 방 ∪ watch 중인 방):

```ts
  // 방 채널은 목록과의 차이만 구독/해제한다(같은 토픽을 해제 직후 다시 만들면 해제 중인 채널을 돌려받을 수 있음).
  useEffect(() => {
    const subs = roomSubs.current;
    if (!userId) return;
    const wanted = new Set([...rooms.map((r) => r.id), ...watched]);
    for (const [id, unsubscribe] of subs) {
      if (!wanted.has(id)) {
        unsubscribe();
        subs.delete(id);
      }
    }
    for (const id of wanted) {
      if (!subs.has(id)) subs.set(id, subscribeRoom(id, emit));
    }
  }, [rooms, watched, userId, emit]);
```

`isViewing` 정의 아래에 추가:

```ts
  const watchRoom = useCallback((roomId: number) => {
    setWatched((prev) => [...prev, roomId]);
    return () =>
      setWatched((prev) => {
        const i = prev.indexOf(roomId);
        return i < 0 ? prev : [...prev.slice(0, i), ...prev.slice(i + 1)];
      });
  }, []);
```

`value` useMemo를 교체:

```ts
  const value = useMemo(
    () => ({ onRoomEvent, pickedRoomId, setPickedRoomId, setViewingRoom, isViewing, watchRoom }),
    [onRoomEvent, pickedRoomId, setViewingRoom, isViewing, watchRoom],
  );
```

- [ ] **Step 3: 참여자 반환** — `ChatRooms/hooks/useChatMessages.ts`의 return 객체 마지막에 추가

```ts
    // 화면의 멤버 목록용(스냅샷 이후엔 실시간 퇴장 반영)
    participants: current.participants ?? room?.participants ?? [],
```

- [ ] **Step 4: 읽기 전용** — `ChatRooms/components/MessageItem.tsx`

props 타입에 `readOnly?: boolean;` 추가, 구조분해를 `({ message, readOnly = false, onReply, onEdit, onDelete }: MessageItemProps)`로, `const { isMine } = message;`를 아래로 교체:

```tsx
  // 관리자 열람은 읽기 전용: 수정·삭제·답장·안 읽은 수를 숨긴다.
  const isMine = message.isMine && !readOnly;
```

답장 버튼 조건 `{!isMine && !isDeleted && (`를 `{!readOnly && !isMine && !isDeleted && (`로 바꾼다.

`ChatRooms/components/MessageList.tsx`: props 타입에 `readOnly?: boolean;` 추가, 구조분해에 `readOnly = false,` 추가, `<MessageItem ... />`에 `readOnly={readOnly}` 전달.

- [ ] **Step 5: 방 상세** — `client/src/app/(protected)/admin/rooms/RoomDetail.tsx`

```tsx
"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import useToast from "@/hooks/useToast";
import { getErrorMessage } from "@/lib/error-handler";
import { kickMember } from "@/services/rooms";
import { displayName, type AdminRoom, type Room } from "@/types/domain";
import { MessageList } from "@/app/(protected)/chat/[menu]/_components/ChatRooms/components/MessageList";
import { useChatMessages } from "@/app/(protected)/chat/[menu]/_components/ChatRooms/hooks/useChatMessages";

export const ADMIN_ROOMS_QUERY_KEY = ["admin", "rooms"] as const;
const noop = () => {};

// 관리자 방 열람: 멤버(그룹방 강퇴) + 메시지 읽기 전용 실시간. setViewingRoom을 호출하지 않으므로 mark_read 없음(§8.3).
export const RoomDetail = ({ room }: { room: AdminRoom }) => {
  const { user } = useAuth();
  const { watchRoom } = useChat();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  // 참여하지 않은 방도 Realtime으로 받는다
  useEffect(() => watchRoom(room.id), [room.id, watchRoom]);

  const chatRoom = useMemo<Room>(
    () => ({ id: room.id, name: room.name, isGroup: room.isGroup, ownerId: room.createdBy, participants: [] }),
    [room.id, room.name, room.isGroup, room.createdBy],
  );
  const { messages, loadOlder, hasMore, loadingOlder, participants } = useChatMessages(chatRoom);

  const kick = useMutation({
    mutationFn: (userId: string) => kickMember(room.id, userId),
    onSuccess: () => {
      success("멤버를 강퇴했습니다.");
      void queryClient.invalidateQueries({ queryKey: ADMIN_ROOMS_QUERY_KEY });
    },
    onError: (e) => error(`강퇴 실패: ${getErrorMessage(e)}`),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <div className="font-semibold">
          {room.name ?? `${room.isGroup ? "그룹방" : "1:1 방"} #${room.id}`}
          <span className="ml-2 text-xs font-normal text-gray-500">읽기 전용</span>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {participants.map(({ user: member }) => (
            <li key={member.id} className="flex items-center gap-1 rounded border px-2 py-1 text-sm">
              {displayName(member)}
              {member.id === room.createdBy && <span className="text-xs text-blue-600">방장</span>}
              {room.isGroup && member.id !== user?.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1 text-red-600"
                  disabled={kick.isPending}
                  onClick={() => {
                    if (confirm(`${displayName(member)}님을 강퇴할까요?`)) kick.mutate(member.id);
                  }}
                >
                  강퇴
                </Button>
              )}
            </li>
          ))}
          {participants.length === 0 && <li className="text-sm text-gray-500">멤버를 불러오는 중…</li>}
        </ul>
      </div>
      <MessageList
        key={room.id}
        messages={messages}
        hasRoom
        readOnly
        onReply={noop}
        onEdit={noop}
        onDelete={noop}
        onLoadOlder={loadOlder}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
      />
    </div>
  );
};
```

- [ ] **Step 6: 방 목록 화면** — `client/src/app/(protected)/admin/rooms/page.tsx`

```tsx
"use client";

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listAllRooms } from "@/services/admin";
import { ADMIN_ROOMS_QUERY_KEY, RoomDetail } from "./RoomDetail";

const LIMIT = 20;

export default function AdminRoomsPage() {
  const [page, setPage] = useState(1);
  const [pickedId, setPickedId] = useState<number | null>(null);

  const { data, isFetching } = useQuery({
    queryKey: [...ADMIN_ROOMS_QUERY_KEY, page],
    queryFn: () => listAllRooms({ page, limit: LIMIT }),
    placeholderData: keepPreviousData,
  });
  const rooms = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / LIMIT));
  // 선택한 방이 삭제돼 목록에서 사라지면 선택 해제(Review Focus 5)
  const selected = rooms.find((r) => r.id === pickedId) ?? null;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card className="md:col-span-1">
        <CardHeader>
          <CardTitle>
            전체 채팅방
            <span className="ml-2 text-sm font-normal text-gray-500">
              {data ? `${data.total}개` : ""} {isFetching ? "불러오는 중..." : ""}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-[60vh] space-y-2 overflow-y-auto">
            {rooms.map((room) => (
              <button
                key={room.id}
                onClick={() => setPickedId(room.id)}
                className={`w-full rounded border px-2 py-2 text-left ${
                  selected?.id === room.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
                }`}
              >
                <div className="font-semibold">
                  {room.name ?? `${room.isGroup ? "그룹방" : "1:1 방"} #${room.id}`}
                  {room.isGroup && <span className="ml-1 text-xs font-normal text-gray-500">그룹</span>}
                </div>
                <div className="text-xs text-gray-600">
                  방장 {room.ownerUsername ?? "-"} · 멤버 {room.memberCount}명
                </div>
              </button>
            ))}
            {rooms.length === 0 && <div className="text-sm text-gray-500">채팅방이 없습니다.</div>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              이전
            </Button>
            <span className="text-sm text-gray-700">
              {page} / {totalPages}
            </span>
            <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
              다음
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card className="md:col-span-2 h-[80vh] flex flex-col overflow-hidden">
        {selected ? (
          <RoomDetail key={selected.id} room={selected} />
        ) : (
          <div className="p-6 text-sm text-gray-500">왼쪽에서 채팅방을 선택하세요.</div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 7: 타입·린트·테스트·빌드**

Run: `pnpm exec tsc --noEmit; pnpm lint; pnpm test 2>&1 | grep -E "^ℹ (pass|fail)"; pnpm build 2>&1 | tail -3`
Expected: tsc 출력 없음, lint 에러 0(경고 ≤ 6), 30 pass, build 성공(`/admin/rooms` 경로 포함).

- [ ] **Step 8: 커밋**

```bash
git add -A "client/src/app/(protected)" client/src/components/chat-provider.tsx
git commit -m "feat(admin): 전체 채팅방 열람 화면 — 멤버·그룹방 강퇴, 메시지 읽기 전용 실시간(읽음 처리 없음)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 전체 검증과 브라우저 확인

**Files:** 없음(문제 발견 시 해당 Task 파일 수정 후 재검증·커밋)

- [ ] **Step 1: 자동 검증** (`client/`)

```bash
pnpm exec tsc --noEmit; pnpm lint; pnpm test
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-admin.mjs
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-chat.mjs
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-social.mjs
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-auth.mjs
```
그리고 저장소 루트에서 `npx -y supabase@2.120.0 test db`(alice·bob 테스트 방은 먼저 정리 — 030 테스트가 전역 삭제 메시지 수에 민감).
Expected: 전부 통과(test 30, pgTAP 137).

- [ ] **Step 2: 브라우저 확인** — `pnpm dev` 실행 중, Chrome 확장 도구가 있으면 그것으로, 없으면 설치된 Chrome을 `playwright-core`(세션 scratch)로 컨텍스트 3개(admin, alice, bob) 띄워 자동 실행. `page.on("dialog", d => d.accept())`. 시작 전 alice·bob 방 정리, bob의 `user_access` 행 삭제(이전 단계 강제 로그아웃 흔적).
  1. alice로 `/admin/users` 직접 접속 → 관리자 화면이 보이지 않고 `/chat/friends`로 이동(Review Focus 1).
  2. admin → 헤더 [관리자] → `/admin/users`: 본인 행 "(나)"·버튼 없음, alice·bob "정상" 배지. 정렬 아이디 오름차순·페이지당 10으로 바꿔 목록이 바뀐다.
  3. bob이 채팅 탭을 연 상태에서 admin이 bob [정지] → "1일" → bob 탭이 새로고침 없이 `/login` + "세션이 만료" 안내, admin 목록 배지 "정지 · …까지". bob 로그인 시도 → 로그인되지 않음(정지 안내). [해제] → 배지 "정상", bob 로그인 성공(Review Focus 2).
  4. admin이 bob [강제 로그아웃] → bob 탭 `/login`. bob 재로그인 가능.
  5. alice가 bob과 1:1 방 생성 후 "안녕" 전송(bob은 친구 탭). admin `/admin/rooms` → 그 방 선택 → "안녕" 보임, 멤버 2명, 1:1이라 [강퇴] 없음, 답장·수정·삭제 버튼 없음. alice 화면 "안녕" 아래 `1` 유지(관리자 열람은 읽음 아님, Review Focus 3).
  6. admin이 방을 보는 중 alice가 "두번째" 전송 → admin 화면에 새로고침 없이 표시. alice가 수정·삭제 → admin 화면 반영.
  7. alice가 bob과 그룹방 생성 → admin이 그 방 선택 → bob [강퇴] → admin 멤버 목록에서 bob이 바로 사라지고, bob 채팅 탭에서 방이 사라진다(Review Focus 4).
  8. 영구 정지: admin이 bob [정지] → "영구" → 배지 "정지 · 영구" → [해제]로 복구.

- [ ] **Step 3: 마무리** — 테스트 데이터 정리(방은 참여자 나가기 또는 SQL 삭제, bob `user_access` 정리). 발견한 문제는 해당 Task를 고치고 Step 1 재통과 후 커밋.

---

## Self-Review 결과

- 스펙 §9 UI: `/admin/users` 상태 배지·[정지][해제][강제 로그아웃]·페이지네이션·정렬 → Task 3. `/admin/rooms` 전체 방 → 멤버([강퇴]) + 메시지 읽기 전용 열람(Realtime 수신, `mark_read` 없음) → Task 4. `force_logout`/`member_removed` 처리 → 4단계에서 완료, 이번 단계 브라우저 3·4·7에서 재확인.
- §2.1 `services/admin.ts`(listUsers/ban/unban/forceLogout/listRooms) → Task 2(`listRooms`는 3단계 `rooms.listRooms`와 이름 충돌을 피해 `listAllRooms`).
- 타입 일관성: `AdminRoom.createdBy`(RPC 키) — Task 1 정의, Task 4 `ownerId: room.createdBy` 매핑. `watchRoom` — Task 4 Step 2 정의, Step 5 사용.
