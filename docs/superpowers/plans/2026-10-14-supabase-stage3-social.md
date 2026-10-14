# Supabase 이전 3단계(친구·방·사용자) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 친구(요청·수락·차단·목록)와 채팅방(목록·생성·나가기·강퇴)을 NestJS API(Orval)에서 Supabase(`services/friends.ts`, `services/rooms.ts`)로 옮기고, 채팅 화면에 방 헤더(멤버 목록, [나가기], 그룹방 방장의 [강퇴])를 추가한다.

**Architecture:** DB(테이블·RLS·RPC)는 1단계에서 완료됐으므로 이번 단계는 DB 변경이 없다. UI → React Query 훅 → `services/*`(순수 async, domain 타입 반환) → supabase-js. PostgREST SELECT 문자열과 row→domain 변환은 `services/mappers.ts`(상대 경로·type-only import만)에 두어 Node 단위 테스트와 통합 스크립트가 서비스와 **같은 코드**를 검증한다. 방 목록은 RLS상 관리자에게 모든 방이 보이므로 `me:chat_room_participants!inner(user_id)` + `me.user_id=eq.<나>` 필터로 "내가 참여한 방"만 가져온다.

**Tech Stack:** Next.js 16.0.10, React 19.2, `@supabase/supabase-js@2.117.2`, React Query 5, react-hook-form + yup, Node 24 내장 테스트 러너(`node --test`, TS 타입 스트리핑), 로컬 Supabase(CLI 2.120.0).

**Spec:** `docs/superpowers/specs/2026-10-13-supabase-migration-design.md` (§2.1, §3.2, §5.4, §5.5, §9 UI, §12-3단계)

## Global Constraints

- 패키지 매니저 pnpm, 명령은 `client/`에서 실행. 새 의존성 추가 없음.
- `@supabase/*`, `@/lib/supabase/*` import는 `src/services/**`, `src/lib/supabase/**`, `src/proxy.ts`, `src/app/auth/callback/**`에서만(ESLint로 강제됨).
- `database.types.ts`는 `services/` 내부 전용. services는 `types/domain.ts`의 타입으로 변환해 반환한다.
- 에러는 `toDomainError`로 `DomainError { code, message }` 변환. RPC 에러의 `message`(사용자 문구)는 DB `hint`이며 `getErrorMessage`의 default 분기가 그대로 보여 준다.
- 표시명 = `nickname ?? username`(앱 전역). 친구 추가·방 생성 입력값은 `username`.
- 사용자 알림은 `useToast`. `alert()` 금지. 확인 대화상자는 브라우저 기본 `confirm()` 사용.
- 3단계 범위 밖(메시지 송수신·읽음·실시간·관리자 페이지·푸시)은 컴파일만 유지한다. 채팅 메시지는 4단계까지 동작하지 않는다(합의된 일괄 컷오버). 다른 사용자가 만든 방·받은 친구 요청은 실시간 반영되지 않고 화면 재진입/새로고침 시 보인다(4단계 Realtime에서 해결).
- 각 Task 완료 조건: 명시된 테스트 + `pnpm exec tsc --noEmit` + `pnpm lint`(에러 0) 통과. 기준선: lint 에러 0 / 경고 6, `pnpm test` 7 pass.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 관리자 계정의 "내 채팅방" 목록에는 본인이 참여한 방만 보인다(RLS는 관리자에게 모든 방 열람을 허용). → Task 2 통합 스크립트
2. 선택해 둔 방에서 나가거나 강퇴되어 목록에서 사라지면, 선택이 남은 첫 방(없으면 빈 상태)으로 자연스럽게 옮겨지고 에러가 나지 않는다. → Task 4 파생 선택 + Task 6 브라우저
3. 그룹방 방장이 나가면 다음 멤버가 방장이 되어 [강퇴]가 그 사람에게 보이고, 마지막 멤버가 나가면 방이 사라진다. → Task 2 통합 스크립트 + Task 6
4. 카카오 사용자(nickname 있음, username `kakao_xxxxxxxx`)는 친구 목록·받은 요청·방 이름·멤버 목록에서 닉네임으로 보이고, 친구 추가/방 생성은 username으로 동작한다. → Task 1 단위 테스트 + Task 4 모달
5. 친구 요청 실패(본인·없는 사용자·양방향 중복)와 대소문자·공백이 섞인 아이디 입력: 정규화되어 처리되고 실패 시 한국어 사유가 토스트로 보인다. → Task 2 통합 스크립트 + Task 6

---

## File Structure

```
client/
  scripts/verify-social.mjs                         # 친구·방 데이터 계약 통합 검증(로컬 Supabase)
  src/
    types/domain.ts                                 # + Profile, Friend, FriendRequest, FriendAction, Participant, Room, displayName, roomTitle
    types/domain.test.ts                            # displayName·roomTitle 단위 테스트
    services/mappers.ts                             # SELECT 문자열 + row→domain 변환(상대·type-only import만)
    services/mappers.test.ts
    services/auth.ts                                # + getCurrentUserId()
    services/friends.ts                             # listFriends / listPending / sendRequest / respond
    services/rooms.ts                               # listRooms / createRoom / leaveRoom / kickMember
    hooks/useFriends.ts                             # useFriendsList / usePendingFriends / FRIENDS_QUERY_KEY
    components/layout/ProtectedHeader.tsx           # displayName 사용
    app/(protected)/chat/[menu]/_components/
      Friends/index.tsx, hooks/useFriendsActions.ts, components/{FriendsList,PendingRequestsList}.tsx
      ChatRooms/index.tsx, hooks/useChatRooms.ts, types.ts, CreateRoomModal.tsx,
      ChatRooms/components/RoomList.tsx, ChatRooms/components/RoomHeader.tsx (신규)
  삭제: src/hooks/api/useFriends.ts, src/services/friends/ (Orval), src/services/chat-rooms/ (Orval),
        src/app/(protected)/chat/[menu]/_components/Friends/types.ts
```

범위 결정(스펙 §2.1 대비):
- `services/users.ts`(`isUsernameAvailable`)는 만들지 않는다. 사용처는 가입뿐이고 이미 `services/auth.signUp` 내부에서 경계 뒤에 있다.
- `rooms.listParticipants`는 4단계(스냅샷 재조회)에서 추가한다. 3단계 화면은 `listRooms`에 포함된 참여자로 충분하다.

---

### Task 1: 도메인 타입과 row→domain 매퍼

**Files:**
- Modify: `client/src/types/domain.ts`
- Create: `client/src/types/domain.test.ts`
- Create: `client/src/services/mappers.ts`
- Create: `client/src/services/mappers.test.ts`
- Modify: `client/src/components/layout/ProtectedHeader.tsx:23`

**Interfaces:**
- Consumes: 없음
- Produces (`types/domain.ts`):
  - `type Profile = { id: string; username: string; nickname: string | null; avatarUrl: string | null }`
  - `type Friend = { id: number; user: Profile }` (`id` = friends 행 id, `user` = 상대방)
  - `type FriendRequest = { id: number; requester: Profile; createdAt: string }`
  - `type FriendAction = "ACCEPT" | "BLOCK"`
  - `type Participant = { user: Profile; joinedAt: string; lastReadMessageId: number | null }`
  - `type Room = { id: number; name: string | null; isGroup: boolean; ownerId: string | null; participants: Participant[] }`
  - `displayName(p: { username: string; nickname: string | null }): string`
  - `roomTitle(room: Room, me: string): string`
- Produces (`services/mappers.ts`): `type ProfileRow`, `type FriendRow`, `type RoomRow`, `toProfile(row)`, `toFriend(row: FriendRow, me: string): Friend`, `toFriendRequest(row: FriendRow): FriendRequest`, `toRoom(row: RoomRow): Room`

- [ ] **Step 1: 실패하는 단위 테스트 작성** — `client/src/types/domain.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { displayName, roomTitle } from "./domain.ts";
import type { Profile, Room } from "./domain.ts";

const p = (id: string, username: string, nickname: string | null = null): Profile => ({
  id,
  username,
  nickname,
  avatarUrl: null,
});
const member = (user: Profile) => ({ user, joinedAt: "2026-10-14T00:00:00Z", lastReadMessageId: null });

test("표시명은 nickname 우선, 없으면 username", () => {
  assert.equal(displayName(p("1", "kakao_ab12cd34", "정동현")), "정동현");
  assert.equal(displayName(p("2", "alice_dev")), "alice_dev");
});

test("방 이름이 있으면 그대로 쓴다", () => {
  const room: Room = { id: 1, name: "스터디", isGroup: true, ownerId: "me", participants: [member(p("me", "me_user"))] };
  assert.equal(roomTitle(room, "me"), "스터디");
});

test("이름 없는 방은 나를 뺀 참여자 표시명, 혼자 남으면 안내 문구", () => {
  const room: Room = {
    id: 2,
    name: null,
    isGroup: false,
    ownerId: "me",
    participants: [member(p("me", "me_user")), member(p("k", "kakao_ab12cd34", "정동현"))],
  };
  assert.equal(roomTitle(room, "me"), "정동현");
  assert.equal(roomTitle({ ...room, participants: [member(p("me", "me_user"))] }, "me"), "대화 상대 없음");
});
```

`client/src/services/mappers.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { toFriend, toFriendRequest, toRoom } from "./mappers.ts";

const alice = { id: "a", username: "alice_dev", nickname: null, avatar_url: null };
const kakao = { id: "k", username: "kakao_ab12cd34", nickname: "정동현", avatar_url: "https://img/k.png" };
const row = { id: 7, created_at: "2026-10-14T01:00:00Z", requester: alice, receiver: kakao };

test("친구 행은 요청 방향과 무관하게 상대방을 돌려준다", () => {
  assert.deepEqual(toFriend(row, "a"), {
    id: 7,
    user: { id: "k", username: "kakao_ab12cd34", nickname: "정동현", avatarUrl: "https://img/k.png" },
  });
  assert.equal(toFriend(row, "k").user.username, "alice_dev");
});

test("받은 요청은 요청자 프로필과 요청 시각", () => {
  assert.deepEqual(toFriendRequest(row), {
    id: 7,
    requester: { id: "a", username: "alice_dev", nickname: null, avatarUrl: null },
    createdAt: "2026-10-14T01:00:00Z",
  });
});

test("방 행은 Room으로, 참여자는 입장 순(같으면 id 순)", () => {
  const room = toRoom({
    id: 3,
    name: null,
    is_group: true,
    created_by: "k",
    participants: [
      { user_id: "k", joined_at: "2026-10-14T02:00:00Z", last_read_message_id: 5, profile: kakao },
      { user_id: "a", joined_at: "2026-10-14T02:00:00Z", last_read_message_id: null, profile: alice },
    ],
  });
  assert.equal(room.ownerId, "k");
  assert.equal(room.isGroup, true);
  assert.deepEqual(
    room.participants.map((x) => [x.user.id, x.lastReadMessageId]),
    [
      ["a", null],
      ["k", 5],
    ],
  );
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test`
Expected: FAIL — `domain.test.ts`는 `displayName`/`roomTitle` export 없음(SyntaxError: does not provide an export named), `mappers.test.ts`는 `Cannot find module ... mappers.ts`. 기존 7개는 통과.

- [ ] **Step 3: 도메인 타입 구현** — `client/src/types/domain.ts`의 `AuthUser` 아래에 추가

```ts
export type Profile = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
};

// id = friends 행 id, user = 상대방
export type Friend = { id: number; user: Profile };
export type FriendRequest = { id: number; requester: Profile; createdAt: string };
export type FriendAction = "ACCEPT" | "BLOCK";

export type Participant = { user: Profile; joinedAt: string; lastReadMessageId: number | null };
// ownerId = 방장(chat_rooms.created_by). 방장이 나가면 DB가 다음 멤버로 승계한다.
export type Room = {
  id: number;
  name: string | null;
  isGroup: boolean;
  ownerId: string | null;
  participants: Participant[];
};

export const displayName = (p: { username: string; nickname: string | null }): string => p.nickname ?? p.username;

export const roomTitle = (room: Room, me: string): string =>
  room.name ??
  (room.participants
    .filter((p) => p.user.id !== me)
    .map((p) => displayName(p.user))
    .join(", ") ||
    "대화 상대 없음");
```

- [ ] **Step 4: 매퍼 구현** — `client/src/services/mappers.ts`

```ts
import type { Friend, FriendRequest, Profile, Room } from "../types/domain";

// PostgREST 응답 row → 도메인 타입. 이 파일은 상대 경로·type-only import만 쓴다(Node 단위 테스트·통합 스크립트가 직접 import).
export type ProfileRow = { id: string; username: string; nickname: string | null; avatar_url: string | null };
export type FriendRow = { id: number; created_at: string; requester: ProfileRow; receiver: ProfileRow };
export type RoomRow = {
  id: number;
  name: string | null;
  is_group: boolean;
  created_by: string | null;
  participants: { user_id: string; joined_at: string; last_read_message_id: number | null; profile: ProfileRow }[];
};

export const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  username: r.username,
  nickname: r.nickname,
  avatarUrl: r.avatar_url,
});

export const toFriend = (r: FriendRow, me: string): Friend => ({
  id: r.id,
  user: toProfile(r.requester.id === me ? r.receiver : r.requester),
});

export const toFriendRequest = (r: FriendRow): FriendRequest => ({
  id: r.id,
  requester: toProfile(r.requester),
  createdAt: r.created_at,
});

export const toRoom = (r: RoomRow): Room => ({
  id: r.id,
  name: r.name,
  isGroup: r.is_group,
  ownerId: r.created_by,
  participants: r.participants
    .map((p) => ({ user: toProfile(p.profile), joinedAt: p.joined_at, lastReadMessageId: p.last_read_message_id }))
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.user.id.localeCompare(b.user.id)),
});
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm test`
Expected: PASS — tests 13, pass 13, fail 0.

- [ ] **Step 6: 헤더 표시명 공용화** — `client/src/components/layout/ProtectedHeader.tsx`

import 추가: `import { displayName as toDisplayName } from "@/types/domain";` 그리고 23행을 교체:

```tsx
  const displayName = user ? toDisplayName(user) : "";
```

- [ ] **Step 7: 타입·린트 확인**

Run: `pnpm exec tsc --noEmit; pnpm lint`
Expected: tsc 출력 없음(exit 0), lint `0 errors, 6 warnings`.

- [ ] **Step 8: 커밋**

```bash
git add client/src/types/domain.ts client/src/types/domain.test.ts client/src/services/mappers.ts client/src/services/mappers.test.ts client/src/components/layout/ProtectedHeader.tsx
git commit -m "feat(social): 친구·방 도메인 타입과 row 매퍼(단위 테스트)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: SELECT 계약 통합 검증과 friends·rooms 서비스

**Files:**
- Create: `client/scripts/verify-social.mjs`
- Modify: `client/src/services/mappers.ts` (SELECT 상수 추가)
- Modify: `client/src/services/auth.ts` (`getCurrentUserId` 추가)
- Create: `client/src/services/friends.ts`
- Create: `client/src/services/rooms.ts`

**Interfaces:**
- Consumes: Task 1의 `toFriend`, `toFriendRequest`, `toRoom`, `FriendRow`, `RoomRow`, domain 타입. DB RPC(1단계): `send_friend_request(p_username text) → friends`, `respond_friend_request(p_id bigint, p_action text)`, `create_room(p_name text, p_is_group boolean, p_usernames text[]) → bigint`, `leave_room(p_room_id bigint)`, `kick_member(p_room_id bigint, p_user_id uuid)`.
- Produces:
  - `mappers.ts`: `FRIEND_SELECT: string`, `ROOM_SELECT: string`
  - `auth.ts`: `getCurrentUserId(): Promise<string>`
  - `friends.ts`: `listFriends(): Promise<Friend[]>`, `listPending(): Promise<FriendRequest[]>`, `sendRequest(username: string): Promise<void>`, `respond(id: number, action: FriendAction): Promise<void>`
  - `rooms.ts`: `listRooms(): Promise<Room[]>`(id 내림차순), `createRoom(input: { name?: string; isGroup: boolean; usernames: string[] }): Promise<number>`, `leaveRoom(roomId: number): Promise<void>`, `kickMember(roomId: number, userId: string): Promise<void>`

- [ ] **Step 1: 실패하는 통합 스크립트 작성** — `client/scripts/verify-social.mjs`

```js
// 친구·방 데이터 계약 검증. services와 같은 SELECT·매퍼(src/services/mappers.ts)를 실제 로컬 DB에 실행한다.
// 실행(client/에서, supabase start 상태, 시드의 admin@dongchat.local 필요):
//   SUPABASE_PUBLISHABLE_KEY=<supabase status -o env의 PUBLISHABLE_KEY> node scripts/verify-social.mjs
import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";
import { FRIEND_SELECT, ROOM_SELECT, toFriend, toFriendRequest, toRoom } from "../src/services/mappers.ts";

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
// services/rooms.listRooms와 같은 쿼리
const myRooms = async (u) =>
  (await ok(u.client.from("chat_rooms").select(ROOM_SELECT).eq("me.user_id", u.id).order("id", { ascending: false }))).map(
    toRoom,
  );
const adminSees = async (roomId) => (await ok(admin.client.from("chat_rooms").select("id").eq("id", roomId))).length;

const u1 = await signUp("vs1");
const u2 = await signUp("vs2");
const u3 = await signUp("vs3");
const admin = await signIn("admin@dongchat.local");

// ---- 친구 ----
await ok(u1.client.rpc("send_friend_request", { p_username: ` ${u2.username.toUpperCase()} ` }));
await fails(u2.client.rpc("send_friend_request", { p_username: u1.username }), "FRIEND_DUPLICATE");
await fails(u1.client.rpc("send_friend_request", { p_username: u1.username }), "FRIEND_SELF_REQUEST");
await fails(u1.client.rpc("send_friend_request", { p_username: "no_such_user_zz" }), "FRIEND_USER_NOT_FOUND");

const pending = (
  await ok(u2.client.from("friends").select(FRIEND_SELECT).eq("status", "PENDING").eq("receiver_id", u2.id).order("id"))
).map(toFriendRequest);
assert.equal(pending.length, 1, "받은 요청 1건");
assert.equal(pending[0].requester.username, u1.username);

await fails(u1.client.rpc("respond_friend_request", { p_id: pending[0].id, p_action: "ACCEPT" }), "CHAT_FORBIDDEN");
await ok(u2.client.rpc("respond_friend_request", { p_id: pending[0].id, p_action: "ACCEPT" }));
for (const [me, other] of [
  [u1, u2],
  [u2, u1],
]) {
  const friends = (await ok(me.client.from("friends").select(FRIEND_SELECT).eq("status", "ACCEPTED").order("id"))).map((r) =>
    toFriend(r, me.id),
  );
  assert.deepEqual(
    friends.map((f) => f.user.username),
    [other.username],
    "양쪽 모두 상대방이 친구로 보인다",
  );
}

// ---- 방 ----
await fails(
  u1.client.rpc("create_room", { p_name: "", p_is_group: false, p_usernames: [u2.username, u3.username] }),
  "ROOM_INVALID_PARTICIPANTS",
);
const roomId = await ok(
  u1.client.rpc("create_room", { p_name: "verify", p_is_group: true, p_usernames: [u2.username, u3.username] }),
);
const room = (await myRooms(u1)).find((r) => r.id === roomId);
assert.ok(room, "만든 사람 목록에 보인다");
assert.equal(room.ownerId, u1.id, "만든 사람이 방장");
assert.equal(room.participants.length, 3);
assert.ok((await myRooms(u2)).some((r) => r.id === roomId), "참여자 목록에 보인다");
assert.ok(!(await myRooms(admin)).some((r) => r.id === roomId), "관리자도 내 방 목록에는 참여한 방만 (Review Focus 1)");
assert.equal(await adminSees(roomId), 1, "me 필터 없이는 관리자에게 보인다 — 필터가 필요한 이유");

// ---- 강퇴·나가기·방장 승계 ----
await fails(u2.client.rpc("kick_member", { p_room_id: roomId, p_user_id: u3.id }), "ROOM_KICK_FORBIDDEN");
await ok(u1.client.rpc("kick_member", { p_room_id: roomId, p_user_id: u3.id }));
assert.ok(!(await myRooms(u3)).some((r) => r.id === roomId), "강퇴된 사용자 목록에서 사라진다");

await ok(u1.client.rpc("leave_room", { p_room_id: roomId }));
const after = (await myRooms(u2)).find((r) => r.id === roomId);
assert.equal(after.ownerId, u2.id, "방장이 나가면 남은 멤버가 방장 (Review Focus 3)");
assert.deepEqual(
  after.participants.map((p) => p.user.id),
  [u2.id],
);
await ok(u2.client.rpc("leave_room", { p_room_id: roomId }));
assert.equal(await adminSees(roomId), 0, "마지막 멤버가 나가면 방 삭제");

console.log("verify-social: OK");
```

- [ ] **Step 2: 실패 확인**

Run (`client/`에서): `SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-social.mjs`
(키가 다르면 저장소 루트에서 `npx -y supabase@2.120.0 status -o env`의 `PUBLISHABLE_KEY` 사용)
Expected: FAIL — `SyntaxError: The requested module '../src/services/mappers.ts' does not provide an export named 'FRIEND_SELECT'`.

- [ ] **Step 3: SELECT 상수 추가** — `client/src/services/mappers.ts`의 import 아래에 추가

```ts
const PROFILE_COLUMNS = "id, username, nickname, avatar_url";

export const FRIEND_SELECT = `id, created_at, requester:profiles!friends_requester_id_fkey(${PROFILE_COLUMNS}), receiver:profiles!friends_receiver_id_fkey(${PROFILE_COLUMNS})`;

// me: "내가 참여한 방" 필터 전용(.eq("me.user_id", 나)). RLS는 관리자에게 모든 방을 보여 주므로 필수.
// participants: 방의 전체 참여자.
export const ROOM_SELECT = `id, name, is_group, created_by, me:chat_room_participants!inner(user_id), participants:chat_room_participants(user_id, joined_at, last_read_message_id, profile:profiles(${PROFILE_COLUMNS}))`;
```

- [ ] **Step 4: 통과 확인**

Run: `SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-social.mjs`
Expected: `verify-social: OK` (Node의 타입 스트리핑 ExperimentalWarning 한 줄은 무시).

- [ ] **Step 5: 현재 사용자 id** — `client/src/services/auth.ts`의 `getCurrentUser` 위에 추가

```ts
// 로컬 세션의 사용자 id(네트워크 요청 없음). 쿼리 필터용이며 권한 판단은 RLS·RPC가 한다.
export async function getCurrentUserId(): Promise<string> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) throw { code: "AUTH_UNAUTHORIZED", message: "인증이 필요합니다." } satisfies DomainError;
  return session.user.id;
}
```

- [ ] **Step 6: 친구 서비스** — `client/src/services/friends.ts`

```ts
import { createClient } from "@/lib/supabase/client";
import type { Friend, FriendAction, FriendRequest } from "@/types/domain";
import { getCurrentUserId } from "./auth";
import { toDomainError } from "./errors";
import { FRIEND_SELECT, toFriend, toFriendRequest, type FriendRow } from "./mappers";

// 친구 경계. NestJS 복귀 시 이 파일 내부만 교체한다.
export async function listFriends(): Promise<Friend[]> {
  const me = await getCurrentUserId();
  const { data, error } = await createClient().from("friends").select(FRIEND_SELECT).eq("status", "ACCEPTED").order("id");
  if (error) throw toDomainError(error);
  // ponytail: 동적 SELECT 문자열이라 supabase-js 행 타입 추론이 안 된다. 계약은 verify-social.mjs가 검증.
  return (data as unknown as FriendRow[]).map((r) => toFriend(r, me));
}

// 내가 받은 대기 중 요청
export async function listPending(): Promise<FriendRequest[]> {
  const me = await getCurrentUserId();
  const { data, error } = await createClient()
    .from("friends")
    .select(FRIEND_SELECT)
    .eq("status", "PENDING")
    .eq("receiver_id", me)
    .order("id");
  if (error) throw toDomainError(error);
  return (data as unknown as FriendRow[]).map(toFriendRequest);
}

export async function sendRequest(username: string): Promise<void> {
  const { error } = await createClient().rpc("send_friend_request", { p_username: username });
  if (error) throw toDomainError(error);
}

export async function respond(id: number, action: FriendAction): Promise<void> {
  const { error } = await createClient().rpc("respond_friend_request", { p_id: id, p_action: action });
  if (error) throw toDomainError(error);
}
```

- [ ] **Step 7: 방 서비스** — `client/src/services/rooms.ts`

```ts
import { createClient } from "@/lib/supabase/client";
import type { Room } from "@/types/domain";
import { getCurrentUserId } from "./auth";
import { toDomainError } from "./errors";
import { ROOM_SELECT, toRoom, type RoomRow } from "./mappers";

// 채팅방 경계. NestJS 복귀 시 이 파일 내부만 교체한다.
// 내가 참여한 방(최신 생성 순). 관리자 열람용 전체 방 목록은 services/admin(5단계).
export async function listRooms(): Promise<Room[]> {
  const me = await getCurrentUserId();
  const { data, error } = await createClient()
    .from("chat_rooms")
    .select(ROOM_SELECT)
    .eq("me.user_id", me)
    .order("id", { ascending: false });
  if (error) throw toDomainError(error);
  // ponytail: 동적 SELECT 문자열이라 행 타입 추론이 안 된다. 계약은 verify-social.mjs가 검증.
  return (data as unknown as RoomRow[]).map(toRoom);
}

export async function createRoom(input: { name?: string; isGroup: boolean; usernames: string[] }): Promise<number> {
  const { data, error } = await createClient().rpc("create_room", {
    p_name: input.name ?? "",
    p_is_group: input.isGroup,
    p_usernames: input.usernames,
  });
  if (error) throw toDomainError(error);
  return data;
}

export async function leaveRoom(roomId: number): Promise<void> {
  const { error } = await createClient().rpc("leave_room", { p_room_id: roomId });
  if (error) throw toDomainError(error);
}

// 그룹방 방장 또는 관리자만. 1:1 방·본인은 DB가 거부(ROOM_KICK_FORBIDDEN).
export async function kickMember(roomId: number, userId: string): Promise<void> {
  const { error } = await createClient().rpc("kick_member", { p_room_id: roomId, p_user_id: userId });
  if (error) throw toDomainError(error);
}
```

- [ ] **Step 8: 타입·린트·테스트 확인**

Run: `pnpm exec tsc --noEmit; pnpm lint; pnpm test`
Expected: tsc 출력 없음, lint `0 errors, 6 warnings`, test 13 pass.

- [ ] **Step 9: 커밋**

```bash
git add client/scripts/verify-social.mjs client/src/services/mappers.ts client/src/services/auth.ts client/src/services/friends.ts client/src/services/rooms.ts
git commit -m "feat(social): friends·rooms 서비스와 SELECT 계약 통합 검증

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 친구 탭을 Supabase 서비스로 전환

**Files:**
- Create: `client/src/hooks/useFriends.ts`
- Modify: `client/src/app/(protected)/chat/[menu]/_components/Friends/hooks/useFriendsActions.ts` (전체 교체)
- Modify: `client/src/app/(protected)/chat/[menu]/_components/Friends/index.tsx` (전체 교체)
- Modify: `client/src/app/(protected)/chat/[menu]/_components/Friends/components/FriendsList.tsx` (전체 교체)
- Modify: `client/src/app/(protected)/chat/[menu]/_components/Friends/components/PendingRequestsList.tsx` (전체 교체)
- Modify: `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/CreateRoomModal.tsx` (친구 옵션·칩 표시)
- Delete: `client/src/hooks/api/useFriends.ts`, `client/src/app/(protected)/chat/[menu]/_components/Friends/types.ts`, `client/src/services/friends/` (Orval 생성물)

**Interfaces:**
- Consumes: Task 2 `listFriends`, `listPending`, `sendRequest`, `respond`; Task 1 `Friend`, `FriendRequest`, `FriendAction`, `displayName`
- Produces (`hooks/useFriends.ts`): `FRIENDS_QUERY_KEY = ["friends"]`, `useFriendsList()`(useQuery, data: `Friend[]`), `usePendingFriends()`(useQuery, data: `FriendRequest[]`). 같은 Task의 `CreateRoomModal`도 `useFriendsList`를 쓴다.

검증 방식: UI 배선은 단위 테스트 대상이 아니다(2단계와 동일). 이 Task의 게이트는 tsc·lint·기존 테스트와 Task 6 브라우저 확인이다.

- [ ] **Step 1: 공용 친구 쿼리 훅** — `client/src/hooks/useFriends.ts`

```ts
import { useQuery } from "@tanstack/react-query";
import { listFriends, listPending } from "@/services/friends";

export const FRIENDS_QUERY_KEY = ["friends"] as const;

export const useFriendsList = () => useQuery({ queryKey: [...FRIENDS_QUERY_KEY, "list"], queryFn: listFriends });
export const usePendingFriends = () => useQuery({ queryKey: [...FRIENDS_QUERY_KEY, "pending"], queryFn: listPending });
```

- [ ] **Step 2: 친구 액션 훅** — `Friends/hooks/useFriendsActions.ts` 전체 교체

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import useToast from "@/hooks/useToast";
import { FRIENDS_QUERY_KEY } from "@/hooks/useFriends";
import { getErrorMessage } from "@/lib/error-handler";
import { respond, sendRequest } from "@/services/friends";
import type { FriendAction } from "@/types/domain";

export const useFriendsActions = () => {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_KEY });

  const request = useMutation({
    mutationFn: sendRequest,
    onSuccess: () => {
      success("친구 요청을 보냈습니다.");
      void refresh();
    },
    onError: (e) => error(`친구 요청 실패: ${getErrorMessage(e)}`),
  });

  const response = useMutation({
    mutationFn: ({ id, action }: { id: number; action: FriendAction }) => respond(id, action),
    onSuccess: (_data, { action }) => {
      success(action === "ACCEPT" ? "친구 요청을 수락했습니다." : "요청을 차단했습니다.");
      void refresh();
    },
    onError: (e) => error(`요청 처리 실패: ${getErrorMessage(e)}`),
  });

  return {
    sendFriendRequest: (username: string) => request.mutate(username.trim()),
    respondFriendRequest: (id: number, action: FriendAction) => response.mutate({ id, action }),
    isRequestPending: request.isPending,
    isResponding: response.isPending,
  };
};
```

- [ ] **Step 3: 친구 탭** — `Friends/index.tsx` 전체 교체

```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useFriendsList, usePendingFriends } from "@/hooks/useFriends";
import { AddFriendForm } from "./components/AddFriendForm";
import { PendingRequestsList } from "./components/PendingRequestsList";
import { FriendsList } from "./components/FriendsList";
import { useFriendsActions } from "./hooks/useFriendsActions";

const FriendsTab = () => {
  const { data: friends = [], isFetching: friendsFetching } = useFriendsList();
  const { data: pending = [], isFetching: pendingFetching } = usePendingFriends();
  const { sendFriendRequest, respondFriendRequest, isRequestPending, isResponding } = useFriendsActions();

  return (
    <Card>
      <CardHeader>
        <CardTitle>친구 관리</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <AddFriendForm onSubmit={sendFriendRequest} disabled={isRequestPending} />
        <PendingRequestsList
          pending={pending}
          isLoading={pendingFetching}
          onRespond={respondFriendRequest}
          isResponding={isResponding}
        />
        <FriendsList friends={friends} isLoading={friendsFetching} />
      </CardContent>
    </Card>
  );
};

export default FriendsTab;
```

- [ ] **Step 4: 친구 목록** — `Friends/components/FriendsList.tsx` 전체 교체

```tsx
"use client";

import { displayName, type Friend } from "@/types/domain";

type FriendsListProps = {
  friends: Friend[];
  isLoading?: boolean;
};

export const FriendsList = ({ friends, isLoading = false }: FriendsListProps) => {
  return (
    <div>
      <h3 className="font-semibold mb-2">
        친구 목록
        <span className="ml-2 text-xs text-gray-500">{isLoading ? "불러오는 중..." : ""}</span>
      </h3>
      <div className="space-y-2">
        {friends.map((f) => (
          <div key={f.id} className="rounded border px-3 py-2">
            {displayName(f.user)}
            <span className="ml-2 text-xs text-gray-500">@{f.user.username}</span>
          </div>
        ))}
        {friends.length === 0 && <div className="text-sm text-gray-500">친구가 없습니다.</div>}
      </div>
    </div>
  );
};
```

- [ ] **Step 5: 받은 요청 목록** — `Friends/components/PendingRequestsList.tsx` 전체 교체

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { displayName, type FriendAction, type FriendRequest } from "@/types/domain";

type PendingRequestsListProps = {
  pending: FriendRequest[];
  isLoading?: boolean;
  onRespond: (id: number, action: FriendAction) => void;
  isResponding?: boolean;
};

export const PendingRequestsList = ({
  pending,
  isLoading = false,
  onRespond,
  isResponding = false,
}: PendingRequestsListProps) => {
  return (
    <div>
      <h3 className="font-semibold mb-2">
        받은 요청
        <span className="ml-2 text-xs text-gray-500">{isLoading ? "불러오는 중..." : ""}</span>
      </h3>
      <div className="space-y-2">
        {pending.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded border px-3 py-2">
            <span>
              {displayName(p.requester)}
              <span className="ml-2 text-xs text-gray-500">@{p.requester.username}</span>
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => onRespond(p.id, "ACCEPT")} disabled={isResponding}>
                수락
              </Button>
              <Button size="sm" variant="outline" onClick={() => onRespond(p.id, "BLOCK")} disabled={isResponding}>
                차단
              </Button>
            </div>
          </div>
        ))}
        {pending.length === 0 && <div className="text-sm text-gray-500">대기 중인 요청이 없습니다.</div>}
      </div>
    </div>
  );
};
```

- [ ] **Step 6: 옛 파일 삭제와 잔존 참조 확인**

```bash
git rm -q client/src/hooks/api/useFriends.ts "client/src/app/(protected)/chat/[menu]/_components/Friends/types.ts"
git rm -rq client/src/services/friends
grep -rln -E "hooks/api/useFriends|services/friends/friends" client/src
```
Expected: `git rm` 성공. grep 결과는 `ChatRooms/CreateRoomModal.tsx` 하나(다음 Step에서 교체).

- [ ] **Step 7: 방 생성 모달의 친구 옵션** — `ChatRooms/CreateRoomModal.tsx` (친구 목록 형태가 바뀌었으므로 이 Task에서 함께 고친다)

12행 import 교체 + 표시명 import 추가:

```tsx
import { useFriendsList } from "@/hooks/useFriends";
import { displayName } from "@/types/domain";
```

28행 import를 `import type { CreateRoomModalProps } from "./types";`로, 31~32행과 `friendOptions` 블록을 교체:

```tsx
  const { data: friends = [], isLoading: friendsLoading } = useFriendsList();
```

```tsx
  // value(전송·검색) = username, label(표시) = 표시명
  const friendOptions = friends.map((f) => ({
    value: f.user.username,
    label: displayName(f.user),
  }));
  const labelOf = (username: string) => friendOptions.find((o) => o.value === username)?.label ?? username;
```

선택된 칩의 `<span>{username}</span>`을 `<span>{labelOf(username)}</span>`로 바꾼다.

- [ ] **Step 8: 타입·린트·테스트 확인**

Run: `pnpm exec tsc --noEmit; pnpm lint; pnpm test`
Expected: tsc 출력 없음, lint `0 errors`(경고 ≤ 6), test 13 pass. (방 목록은 아직 Orval chat-rooms를 쓴다 — Task 4)

- [ ] **Step 9: 커밋**

```bash
git add -A client/src/hooks client/src/services "client/src/app/(protected)/chat/[menu]/_components/Friends" "client/src/app/(protected)/chat/[menu]/_components/ChatRooms/CreateRoomModal.tsx"
git commit -m "feat(social): 친구 탭을 Supabase 서비스로 전환, Orval friends 제거

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 방 목록·생성을 Supabase 서비스로 전환

**Files:**
- Modify: `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/hooks/useChatRooms.ts` (전체 교체)
- Modify: `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/types.ts` (`ChatRoom`, `FriendEntry` 삭제)
- Modify: `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/components/RoomList.tsx` (전체 교체)
- Modify: `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/index.tsx` (전체 교체)
- Delete: `client/src/services/chat-rooms/` (Orval 생성물)

**Interfaces:**
- Consumes: Task 2 `listRooms`, `createRoom`; Task 1 `Room`, `displayName`, `roomTitle`; `useAuth().user?.id`
- Produces (`useChatRooms`): `{ rooms: Room[]; selectedRoom: Room | null; selectedRoomId: number | null; setSelectedRoomId(id: number): void; createRoom(payload: CreateRoomPayload): Promise<boolean>; isLoading: boolean }`, `ROOMS_QUERY_KEY = ["rooms"]`. Task 5가 같은 훅에 leave/kick을 더한다.

- [ ] **Step 1: 방 훅** — `ChatRooms/hooks/useChatRooms.ts` 전체 교체

```ts
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import useToast from "@/hooks/useToast";
import { getErrorMessage } from "@/lib/error-handler";
import { createRoom, listRooms } from "@/services/rooms";
import type { CreateRoomPayload } from "../types";

export const ROOMS_QUERY_KEY = ["rooms"] as const;

export const useChatRooms = () => {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  const [pickedRoomId, setSelectedRoomId] = useState<number | null>(null);

  const { data: rooms = [], isLoading } = useQuery({ queryKey: ROOMS_QUERY_KEY, queryFn: listRooms });

  // 선택은 파생값: 고른 방이 목록에서 사라지면(나가기·강퇴) 첫 방, 방이 없으면 null.
  const selectedRoomId = rooms.some((r) => r.id === pickedRoomId) ? pickedRoomId : (rooms[0]?.id ?? null);
  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) ?? null;

  const create = useMutation({
    mutationFn: createRoom,
    onSuccess: async (roomId) => {
      await queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });
      setSelectedRoomId(roomId);
      success("채팅방을 생성했습니다.");
    },
    onError: (e) => error(`채팅방 생성 실패: ${getErrorMessage(e)}`),
  });

  const handleCreateRoom = async (payload: CreateRoomPayload) => {
    try {
      await create.mutateAsync({ name: payload.name, isGroup: payload.isGroup, usernames: payload.participants });
      return true;
    } catch {
      return false; // 토스트는 onError에서
    }
  };

  return { rooms, selectedRoom, selectedRoomId, setSelectedRoomId, createRoom: handleCreateRoom, isLoading };
};
```

- [ ] **Step 2: 기능 타입 정리** — `ChatRooms/types.ts`에서 `ChatRoom`, `FriendEntry` 타입 블록 2개를 삭제한다(`IncomingMessage`, `ChatMessage`, `ComposerContext`, `CreateRoomPayload`, `CreateRoomModalProps`는 유지).

- [ ] **Step 3: 방 목록** — `ChatRooms/components/RoomList.tsx` 전체 교체

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayName, roomTitle, type Room } from "@/types/domain";

type RoomListProps = {
  rooms: Room[];
  currentUserId: string;
  selectedRoomId: number | null;
  onSelectRoom: (roomId: number) => void;
  onCreateRoom: () => void;
};

export const RoomList = ({ rooms, currentUserId, selectedRoomId, onSelectRoom, onCreateRoom }: RoomListProps) => {
  return (
    <Card className="md:col-span-1">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>채팅방</CardTitle>
          <Button size="sm" onClick={onCreateRoom}>
            방 생성
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 max-h-[320px] overflow-y-auto border rounded p-2">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => onSelectRoom(room.id)}
              className={`w-full text-left rounded px-2 py-2 border ${
                selectedRoomId === room.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
              }`}
            >
              <div className="font-semibold">
                {roomTitle(room, currentUserId)}
                {room.isGroup && <span className="ml-1 text-xs font-normal text-gray-500">그룹</span>}
              </div>
              <div className="text-xs text-gray-600">{room.participants.map((p) => displayName(p.user)).join(", ")}</div>
            </button>
          ))}
          {rooms.length === 0 && <div className="text-sm text-gray-500">참여 중인 방이 없습니다.</div>}
        </div>
      </CardContent>
    </Card>
  );
};
```

- [ ] **Step 4: 채팅 탭** — `ChatRooms/index.tsx` 전체 교체

```tsx
"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import useAuth from "@/hooks/useAuth";
import CreateRoomModal from "./CreateRoomModal";
import { RoomList } from "./components/RoomList";
import { MessageList } from "./components/MessageList";
import { MessageInput } from "./components/MessageInput";
import { useChatRooms } from "./hooks/useChatRooms";
import { useChatMessages } from "./hooks/useChatMessages";
import type { ChatMessage, CreateRoomPayload } from "./types";

// 4단계에서 메시지 계층을 Supabase로 교체하며 참여자 uuid 기반 읽음 계산으로 바꾼다. 그 전까지 빈 배열.
// 모듈 상수여야 한다: 렌더마다 새 배열이면 useChatMessages의 의존성이 매번 바뀐다.
const NO_PARTICIPANTS: number[] = [];

const ChatRoomsTab = () => {
  const { user } = useAuth();
  const { rooms, selectedRoomId, setSelectedRoomId, createRoom } = useChatRooms();

  const {
    currentMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    loadOlder,
    hasMore,
    loadingOlder,
    currentUserId,
  } = useChatMessages(selectedRoomId, NO_PARTICIPANTS);

  const [showModal, setShowModal] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);

  const handleSend = (message: string) => {
    sendMessage(message, replyTarget?.id);
    setReplyTarget(null);
  };

  const handleCreateRoom = async (payload: CreateRoomPayload) => {
    if (await createRoom(payload)) setShowModal(false);
  };

  return (
    <>
      <CreateRoomModal open={showModal} onClose={() => setShowModal(false)} onSubmit={handleCreateRoom} />
      <div className="grid gap-4 md:grid-cols-3">
        <RoomList
          rooms={rooms}
          currentUserId={user?.id ?? ""}
          selectedRoomId={selectedRoomId}
          onSelectRoom={setSelectedRoomId}
          onCreateRoom={() => setShowModal(true)}
        />
        <Card className="md:col-span-2 h-[80vh] flex flex-col">
          <MessageList
            messages={currentMessages}
            currentUserId={currentUserId}
            selectedRoomId={selectedRoomId}
            onReply={setReplyTarget}
            onEdit={editMessage}
            onDelete={deleteMessage}
            onLoadOlder={loadOlder}
            hasMore={hasMore}
            loadingOlder={loadingOlder}
          />
          <div className="p-4 border-t">
            <MessageInput
              onSendMessage={handleSend}
              disabled={!selectedRoomId}
              replyTarget={replyTarget}
              onCancelReply={() => setReplyTarget(null)}
            />
          </div>
        </Card>
      </div>
    </>
  );
};

export default ChatRoomsTab;
```

- [ ] **Step 5: Orval chat-rooms 삭제와 잔존 참조 확인**

```bash
git rm -rq client/src/services/chat-rooms
grep -rn -E "services/chat-rooms|ChatRoomsController|FriendEntry|\bChatRoom\b" client/src --include=*.ts --include=*.tsx
```
Expected: grep 결과 없음.

- [ ] **Step 6: 타입·린트·테스트 확인**

Run: `pnpm exec tsc --noEmit; pnpm lint; pnpm test`
Expected: tsc 출력 없음, lint `0 errors`(경고 ≤ 6), test 13 pass.

- [ ] **Step 7: 커밋**

```bash
git add -A client/src/services "client/src/app/(protected)/chat/[menu]/_components/ChatRooms"
git commit -m "feat(social): 방 목록·생성을 Supabase 서비스로 전환, Orval chat-rooms 제거

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 방 헤더 — 멤버 목록, 나가기, 강퇴

**Files:**
- Create: `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/components/RoomHeader.tsx`
- Modify: `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/hooks/useChatRooms.ts`
- Modify: `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/index.tsx`

**Interfaces:**
- Consumes: Task 2 `leaveRoom`, `kickMember`; Task 4 `useChatRooms`, `ROOMS_QUERY_KEY`; Task 1 `Room`, `displayName`, `roomTitle`
- Produces: `useChatRooms`에 `leaveRoom(roomId: number): void`, `kickMember(roomId: number, userId: string): void`, `isMutating: boolean` 추가. `RoomHeader` props `{ room: Room; currentUserId: string; disabled?: boolean; onLeave(): void; onKick(userId: string): void }`.

권한 표시 규칙(스펙 §5.4·§9): [강퇴]는 그룹방이고 내가 방장일 때, 나 이외 멤버에게만 보인다. 1:1 방은 [나가기]만 있다. 관리자의 다른 방 강퇴는 5단계 `/admin/rooms`에서 한다.

- [ ] **Step 1: 나가기·강퇴 mutation** — `useChatRooms.ts`

import를 `import { createRoom, kickMember, leaveRoom, listRooms } from "@/services/rooms";`로 바꾸고, `handleCreateRoom` 아래에 추가:

```ts
  const refreshRooms = () => queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });

  const leave = useMutation({
    mutationFn: leaveRoom,
    onSuccess: async () => {
      await refreshRooms();
      success("채팅방에서 나왔습니다.");
    },
    onError: (e) => error(`나가기 실패: ${getErrorMessage(e)}`),
  });

  const kick = useMutation({
    mutationFn: ({ roomId, userId }: { roomId: number; userId: string }) => kickMember(roomId, userId),
    onSuccess: async () => {
      await refreshRooms();
      success("멤버를 내보냈습니다.");
    },
    onError: (e) => error(`강퇴 실패: ${getErrorMessage(e)}`),
  });
```

`return`을 교체:

```ts
  return {
    rooms,
    selectedRoom,
    selectedRoomId,
    setSelectedRoomId,
    createRoom: handleCreateRoom,
    leaveRoom: leave.mutate,
    kickMember: (roomId: number, userId: string) => kick.mutate({ roomId, userId }),
    isMutating: leave.isPending || kick.isPending,
    isLoading,
  };
```

- [ ] **Step 2: 방 헤더 컴포넌트** — `ChatRooms/components/RoomHeader.tsx`

```tsx
"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { displayName, roomTitle, type Room } from "@/types/domain";

type RoomHeaderProps = {
  room: Room;
  currentUserId: string;
  disabled?: boolean;
  onLeave: () => void;
  onKick: (userId: string) => void;
};

export const RoomHeader = ({ room, currentUserId, disabled = false, onLeave, onKick }: RoomHeaderProps) => {
  // 강퇴는 그룹방 방장만(1:1 방·본인 불가 — DB도 같은 규칙으로 거부)
  const canKick = room.isGroup && room.ownerId === currentUserId;

  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <div className="font-semibold">{roomTitle(room, currentUserId)}</div>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              멤버 {room.participants.length}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <ul className="space-y-1">
              {room.participants.map(({ user }) => (
                <li key={user.id} className="flex items-center justify-between rounded px-2 py-1 text-sm">
                  <span>
                    {displayName(user)}
                    {room.isGroup && user.id === room.ownerId && (
                      <span className="ml-1 text-xs text-blue-600">방장</span>
                    )}
                    {user.id === currentUserId && <span className="ml-1 text-xs text-gray-500">(나)</span>}
                  </span>
                  {canKick && user.id !== currentUserId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-red-600"
                      disabled={disabled}
                      onClick={() => {
                        if (confirm(`${displayName(user)}님을 내보낼까요?`)) onKick(user.id);
                      }}
                    >
                      강퇴
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600"
          disabled={disabled}
          onClick={() => {
            if (confirm("이 채팅방에서 나갈까요?")) onLeave();
          }}
        >
          나가기
        </Button>
      </div>
    </div>
  );
};
```

- [ ] **Step 3: 채팅 탭에 헤더 배치** — `ChatRooms/index.tsx`

import 추가: `import { RoomHeader } from "./components/RoomHeader";`
`useChatRooms()` 구조분해를 교체:

```tsx
  const { rooms, selectedRoom, selectedRoomId, setSelectedRoomId, createRoom, leaveRoom, kickMember, isMutating } =
    useChatRooms();
```

`<Card className="md:col-span-2 h-[80vh] flex flex-col">` 바로 다음 줄에 추가:

```tsx
          {selectedRoom && user && (
            <RoomHeader
              room={selectedRoom}
              currentUserId={user.id}
              disabled={isMutating}
              onLeave={() => leaveRoom(selectedRoom.id)}
              onKick={(userId) => kickMember(selectedRoom.id, userId)}
            />
          )}
```

- [ ] **Step 4: 타입·린트·테스트 확인**

Run: `pnpm exec tsc --noEmit; pnpm lint; pnpm test`
Expected: tsc 출력 없음, lint `0 errors`(경고 ≤ 6), test 13 pass.

- [ ] **Step 5: 커밋**

```bash
git add "client/src/app/(protected)/chat/[menu]/_components/ChatRooms"
git commit -m "feat(social): 방 헤더 — 멤버 목록, 나가기, 그룹방 방장 강퇴

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 전체 검증과 브라우저 확인

**Files:** 없음(문제 발견 시 해당 Task 파일 수정)

- [ ] **Step 1: 자동 검증 전체 재실행** (`client/`에서)

```bash
pnpm exec tsc --noEmit; pnpm lint; pnpm test
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-social.mjs
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-auth.mjs
pnpm build
```
Expected: tsc 출력 없음, lint 에러 0, test 13 pass, `verify-social: OK`, verify-auth 통과 메시지, build 성공.

- [ ] **Step 2: 브라우저 확인** — `pnpm dev` 실행 후, Chrome 확장 도구가 있으면 그것으로, 없으면 설치된 Chrome을 `playwright-core`(세션 scratch 디렉터리에 설치, 저장소에 추가하지 않음, `chromium.launch({ channel: "chrome" })`, `page.on("dialog", d => d.accept())`)로 자동 실행한다. 둘 다 불가하면 사용자에게 요청한다.
  1. alice로 로그인 → 친구 탭에서 ` BOB_DEV `(대문자·공백) 입력 후 친구 추가 → "친구 요청을 보냈습니다." 토스트. 같은 요청 재전송 → "친구 요청 실패: 이미 친구 요청이 존재합니다."
  2. 본인 아이디(`alice_dev`)로 요청 → "본인에게 친구 요청을 보낼 수 없습니다." 포함 토스트.
  3. bob으로 로그인 → 받은 요청에 `alice_dev` → [수락] → 친구 목록에 `alice_dev`. alice로 돌아가 친구 목록에 `bob_dev`.
  4. alice: 채팅 탭 → [방 생성] → 친구 bob 선택, 그룹방 체크, 이름 비움 → 생성 → 새 방이 선택되고 제목 `bob_dev`, "그룹" 표시. 헤더 [멤버 2]에 alice "방장 (나)", bob 옆 [강퇴].
  5. admin으로 로그인 → 채팅 탭에 4번 방이 없다(Review Focus 1).
  6. alice: 4번 방 헤더 [나가기] → 확인 → "채팅방에서 나왔습니다.", 방이 목록에서 사라지고 선택이 남은 방 또는 "참여 중인 방이 없습니다."로 바뀐다(Review Focus 2). bob으로 로그인 → 같은 방 헤더 [멤버 1]에 bob "방장 (나)"(Review Focus 3).
  7. (카카오 계정이 있으면) alice가 카카오 사용자의 `kakao_xxxxxxxx` 아이디로 친구 요청 → 카카오 사용자가 수락 → alice 친구 목록·방 생성 모달에 카카오 닉네임 표시(Review Focus 4).

- [ ] **Step 3: 마무리** — 발견한 문제는 해당 Task 파일을 고치고 Step 1을 재통과시킨 뒤 커밋한다. dev 서버를 종료한다.

---

## Self-Review 결과

- 스펙 §12-3단계: `services/{friends,rooms}` → Task 2, hooks+UI → Task 3·4, 방 나가기/강퇴 UI → Task 5. `services/users`·`listParticipants`는 범위 결정에 근거 기록.
- §5.5 에러 계약: RPC hint가 토스트 문구로 표시됨(Task 3·4·5 `getErrorMessage`, Task 6 1·2번).
- §9 UI "채팅 화면: 방 메뉴 [나가기], 그룹방 방장에게 멤버 [강퇴]" → Task 5.
- 타입 이름 일관성: `Friend.user`, `FriendRequest.requester`, `Room.ownerId`, `FriendAction` — Task 1 정의와 Task 2~5 사용 일치. `useFriendsList`/`usePendingFriends` 이름은 기존 호출부와 동일하게 유지.
