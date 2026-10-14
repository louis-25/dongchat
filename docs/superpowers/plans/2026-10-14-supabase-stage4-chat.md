# Supabase 이전 4단계(채팅·Realtime) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채팅(전송·수정·삭제·답장·읽음/안 읽은 인원 수·무한 스크롤·다른 방 인앱 토스트)을 socket.io/NestJS에서 Supabase(테이블 INSERT + RPC + Realtime Broadcast)로 옮기고, 강퇴·나가기·새 방 초대·강제 로그아웃이 열린 화면에 즉시 반영되게 한다.

**Architecture:** `services/messages.ts`(조회·전송·수정·삭제·읽음)와 `services/realtime.ts`(`subscribeRoom`/`subscribeUser` → unsubscribe)가 경계다. Realtime payload는 services 안에서 도메인 `ChatMessage`로 변환되어 UI는 Supabase 형식을 모른다. `ChatProvider`(chat/layout)가 참여 중인 방마다 `room:<id>` 채널과 본인 `user:<uuid>` 채널을 구독하는 허브이고, `useChatMessages`가 현재 방 상태(메시지·읽음 위치)를 순수 함수(`lib/chat-state.ts`)로 갱신한다. 동기화는 스펙 §8.3대로 구독 → `SUBSCRIBED`(최초·재연결마다) 시 스냅샷(최신 30개 + 참여자 읽음 위치) → id 병합 → `mark_read`.

**Tech Stack:** Next.js 16.0.10, React 19.2, `@supabase/supabase-js@2.117.2`(Realtime 토큰 자동 갱신 확인됨: `_handleTokenChanged`가 TOKEN_REFRESHED/SIGNED_IN 시 `realtime.setAuth`), React Query 5, sonner, Node 24 `node --test`, pgTAP(`supabase test db`), Supabase CLI 2.120.0.

**Spec:** `docs/superpowers/specs/2026-10-13-supabase-migration-design.md` (§2.1, §5.4, §5.5, §8.1~8.4, §9, §12-4단계)

## Global Constraints

- pnpm, 명령은 `client/`에서(마이그레이션·pgTAP은 저장소 루트에서 `npx -y supabase@2.120.0 ...`). 새 의존성 추가 없음(socket.io-client 등 패키지 제거는 6단계).
- `@supabase/*`, `@/lib/supabase/*` import는 `src/services/**`, `src/lib/supabase/**`, `src/proxy.ts`, `src/app/auth/callback/**`에서만.
- Realtime 채널은 `supabase.channel('room:<id>' | 'user:<uuid>', { config: { private: true } })`. 클라이언트는 송신하지 않는다(수신 정책만 존재).
- 이벤트 이름·payload는 스펙 §8.1 계약 그대로(NestJS 복귀 시 socket.io에서도 동일). 이번 단계에서 `user:<uuid>`/`member_added` 1개를 추가하고 스펙 표에 기록한다.
- 읽음: `readState[userId] = max(기존, 수신값)`. 안 읽은 인원 수 = 발신자 제외 참여자 중 `readState[uid] < message.id` 수, 스냅샷의 `last_read_message_id` null은 0, **스냅샷 전에는 숫자를 표시하지 않음**. 숫자는 본인 메시지에만 표시(기존 UI 유지).
- `mark_read` 호출: 타인 메시지 수신 && 탭 visible && 그 방이 열려 있음, 또는 입장/재동기화 시.
- 메시지 내용: 앞뒤 공백 제거 후 1~2000자(Postgres `char_length` = 코드 포인트 기준).
- React 19 lint: effect 본문에서 동기 setState 금지, 렌더 중 ref 읽기/쓰기 금지(비동기 콜백·이벤트 핸들러에서만).
- 각 Task 완료 조건: 명시된 테스트 + `pnpm exec tsc --noEmit` + `pnpm lint`(에러 0, 경고 ≤ 6) 통과. 기준선: `pnpm test` 13 pass, pgTAP 135.
- 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. 처음 방을 열 때 안 읽은 인원 수가 틀리게 보이지 않는다(이전 리뷰 버그): 스냅샷 전에는 숫자 없음, 한 번도 안 읽은 참여자는 안 읽음으로 센다, 상대가 읽으면 새로고침 없이 줄어든다. → Task 3 단위 테스트(`toViews`) + Task 6 브라우저
2. 스크롤: 과거 메시지를 불러와도 보던 메시지가 제자리, 위쪽을 읽는 중 남의 메시지가 와도 튀지 않음, 내가 보내면 맨 아래, 빈 페이지(더 없음)를 받은 뒤에도 이후 스크롤이 정상(이전 리뷰 버그). → Task 3 단위 테스트(`scrollAction`) + Task 6
3. 연결이 끊겼다 돌아오면(절전·네트워크) 그 사이 메시지가 빠짐없이 보이고, 30개 넘게 쌓였으면 오래된 목록과 섞이지 않고 최신 페이지로 교체된다. → Task 3 단위 테스트(`mergeSnapshot`)
4. 채팅을 열어 둔 상태에서 강퇴·강제 로그아웃·정지되면 새로고침 없이 방이 사라지거나 로그인 화면으로 간다. 다른 기기 로그아웃(세션 삭제)에는 반응하지 않는다. → Task 2 통합 스크립트 + Task 6
5. 다른 사람이 나를 넣어 방을 만들면 목록에 바로 나타나고, 그 방 메시지가 토스트로 온다. 공백만/2000자 초과 메시지는 전송되지 않고 이유가 보인다. → Task 1 pgTAP + Task 2 단위·통합 + Task 6

---

## File Structure

```
supabase/
  migrations/<ts>_member_added.sql            # participants INSERT → user:<uuid> member_added
  tests/database/090_member_added.test.sql
docs/superpowers/specs/2026-10-13-supabase-migration-design.md   # §5.3·§8.1에 member_added 추가
client/
  scripts/verify-chat.mjs                      # 메시지 SELECT·매퍼·Realtime 이벤트 계약 통합 검증
  src/
    types/domain.ts                            # + MESSAGE_PAGE_SIZE, ChatMessage, MessagePage, RoomEvent, UserEvent
    services/mappers.ts (+ .test.ts)           # + PARTICIPANT_SELECT, MESSAGE_*, toParticipant, toChatMessage, toMessagePage,
                                               #   fromMessagePayload, normalizeMessageContent
    lib/chat-state.ts (+ .test.ts)             # 순수 상태 함수: merge·snapshot·edit/delete·read·views·scroll
    services/messages.ts                       # fetchMessages / sendMessage / editMessage / deleteMessage / markRead
    services/realtime.ts                       # subscribeRoom / subscribeUser
    services/rooms.ts                          # + listParticipants
    services/auth.ts                           # + getCurrentSessionId
    hooks/useRooms.ts                          # ROOMS_QUERY_KEY, useRooms (provider·탭 공용)
    components/chat-provider.tsx               # 재작성: Realtime 구독 허브
    hooks/useInAppNotification.ts              # 재작성
    app/(protected)/chat/[menu]/_components/ChatRooms/
      index.tsx, types.ts, hooks/useChatRooms.ts, hooks/useChatMessages.ts,
      components/{MessageList,MessageItem,MessageInput}.tsx
  삭제: ChatRooms/hooks/useMessagePagination.ts, src/services/chat/ (Orval)
```

---

### Task 1: `member_added` 이벤트(새 방 초대 즉시 반영)

스펙 §8.1에는 "방에 추가됨" 통지가 없어, 다른 사람이 나를 넣어 만든 방은 새로고침해야 보인다. 같은 패턴(`private.broadcast`)으로 user 토픽 이벤트 하나를 추가한다.

**Files:**
- Create: `supabase/migrations/<timestamp>_member_added.sql` (CLI가 생성)
- Create: `supabase/tests/database/090_member_added.test.sql`
- Modify: `docs/superpowers/specs/2026-10-13-supabase-migration-design.md` (§5.3 트리거 표, §8.1 이벤트 표)

**Interfaces:**
- Consumes: `private.broadcast(p_topic text, p_event text, p_payload jsonb)`(1단계), `tests.create_user`, `tests.uid`, `tests.login_as`, `tests.room_id`(pgTAP 헬퍼)
- Produces: Realtime `user:<uuid>` 이벤트 `member_added` payload `{roomId: number, userId: string}` — 방 생성 시 참여자 전원(만든 사람 포함)에게.

- [ ] **Step 1: 실패하는 pgTAP 작성** — `supabase/tests/database/090_member_added.test.sql`

```sql
begin;
select plan(2);

select tests.create_user('ma_alice@test.com', '{"username":"ma_alice"}');
select tests.create_user('ma_bob@test.com', '{"username":"ma_bob"}');

select tests.login_as(tests.uid('ma_alice@test.com'));
select public.create_room('ma_room', true, array['ma_bob']);
reset role;

select ok(
  exists(select 1 from realtime.messages
         where topic = 'user:' || tests.uid('ma_bob@test.com') and event = 'member_added'
           and (payload ->> 'roomId')::bigint = tests.room_id('ma_room')),
  '방에 추가된 사용자의 user 토픽에 member_added');
select is(
  (select payload ->> 'userId' from realtime.messages
   where topic = 'user:' || tests.uid('ma_bob@test.com') and event = 'member_added' limit 1),
  tests.uid('ma_bob@test.com')::text,
  'payload.userId는 추가된 사용자');

select * from finish();
rollback;
```

- [ ] **Step 2: 실패 확인** (저장소 루트)

Run: `npx -y supabase@2.120.0 test db 2>&1 | tail -5`
Expected: FAIL — `090_member_added.test.sql`의 2개 실패(`member_added` 행 없음). 나머지 135 통과.

- [ ] **Step 3: 마이그레이션 생성·작성**

Run: `npx -y supabase@2.120.0 migration new member_added` → 출력된 파일에 작성:

```sql
-- 방에 추가된 사용자에게 알린다(새 방이 목록에 바로 보이도록). 스펙 §8.1 확장.
create or replace function private.participants_added_broadcast() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  perform private.broadcast('user:' || new.user_id, 'member_added',
    jsonb_build_object('roomId', new.room_id, 'userId', new.user_id));
  return null;
end;
$$;
revoke execute on function private.participants_added_broadcast() from public, anon, authenticated;

create trigger participants_added_broadcast after insert on public.chat_room_participants
  for each row execute function private.participants_added_broadcast();
```

Run: `npx -y supabase@2.120.0 migration up`
Expected: `Applying migration <ts>_member_added.sql...` 후 종료 코드 0(로컬 데이터 유지).

- [ ] **Step 4: 통과 확인**

Run: `npx -y supabase@2.120.0 test db 2>&1 | tail -3`
Expected: `Files=10, Tests=137 ... Result: PASS`.

- [ ] **Step 5: 스펙 갱신** — §5.3 트리거 표의 `messages AFTER INSERT/UPDATE, ...` 행 아래에 추가:

```
| `chat_room_participants` AFTER INSERT | `user:<uuid>`로 `member_added` 송출(새 방 초대 즉시 반영, 4단계 추가) |
```

§8.1 표의 `user:<uuid>` / `member_removed` 행 아래에 추가:

```
| `user:<uuid>` | `member_added` | participants INSERT | `{roomId, userId}` |
```

- [ ] **Step 6: 보안 점검과 커밋**

Run: `npx -y supabase@2.120.0 db advisors --local 2>&1 | tail -5`
Expected: 새 함수 관련 경고 없음(`search_path` 고정·definer 함수 EXECUTE 회수됨).

```bash
git add supabase/migrations/*_member_added.sql supabase/tests/database/090_member_added.test.sql docs/superpowers/specs/2026-10-13-supabase-migration-design.md
git commit -m "feat(realtime): 방 참여 시 user 토픽 member_added 송출(pgTAP), 스펙 이벤트 표 갱신

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: 메시지 도메인 타입·매퍼와 계약 통합 검증

**Files:**
- Modify: `client/src/types/domain.ts`
- Modify: `client/src/services/mappers.ts`, `client/src/services/mappers.test.ts`
- Create: `client/scripts/verify-chat.mjs`

**Interfaces:**
- Consumes: Task 1 `member_added`; 기존 `PROFILE_COLUMNS`, `ProfileRow`, `toProfile`, `RoomRow`, `toRoom`
- Produces (`types/domain.ts`):
  - `MESSAGE_PAGE_SIZE = 30`
  - `type ChatMessage = { id: number; roomId: number; senderId: string | null; content: string; replyToId: number | null; editedAt: string | null; deletedAt: string | null; createdAt: string }`
  - `type MessagePage = { messages: ChatMessage[]; profiles: Profile[]; replyTargets: ChatMessage[] }` (messages는 id 오름차순)
  - `type RoomEvent` (`message` | `message_edited` | `message_deleted` | `read_update` | `member_removed` | `subscribed`), `type UserEvent` (`member_added` | `member_removed` | `force_logout`) — 아래 Step 3 정의
- Produces (`services/mappers.ts`): `PARTICIPANT_SELECT`, `MESSAGE_COLUMNS`, `MESSAGE_SELECT`, `type ParticipantRow`, `type MessageCoreRow`, `type MessageRow`, `type MessagePayload`, `toParticipant(row)`, `toChatMessage(row: MessageCoreRow): ChatMessage`, `toMessagePage(rows: MessageRow[]): MessagePage`, `fromMessagePayload(p: MessagePayload): ChatMessage`, `normalizeMessageContent(content: string): string`(위반 시 `DomainError` VALIDATION_FAILED throw)

- [ ] **Step 1: 실패하는 단위 테스트 추가** — `client/src/services/mappers.test.ts` 끝에 추가(기존 import 줄을 아래로 교체)

```ts
import {
  fromMessagePayload,
  normalizeMessageContent,
  toChatMessage,
  toFriend,
  toFriendRequest,
  toMessagePage,
  toRoom,
} from "./mappers.ts";
```

```ts
const core = (id: number, extra: Partial<Record<string, unknown>> = {}) => ({
  id,
  room_id: 9,
  sender_id: "a",
  content: `m${id}`,
  reply_to_id: null,
  edited_at: null,
  deleted_at: null,
  created_at: `2026-10-14T03:00:0${id}Z`,
  ...extra,
});

test("메시지 페이지: 최신순 행 → 오름차순, 발신자 프로필·답장 대상 수집", () => {
  const page = toMessagePage([
    { ...core(3, { reply_to_id: 1, sender_id: "k" }), sender: kakao, reply: core(1) },
    { ...core(2), sender: alice, reply: null },
    { ...core(4, { sender_id: null }), sender: null, reply: null },
  ] as never);
  assert.deepEqual(
    page.messages.map((m) => m.id),
    [2, 3, 4],
  );
  assert.deepEqual(page.messages[1], {
    id: 3,
    roomId: 9,
    senderId: "k",
    content: "m3",
    replyToId: 1,
    editedAt: null,
    deletedAt: null,
    createdAt: "2026-10-14T03:00:03Z",
  });
  assert.deepEqual(
    page.profiles.map((p) => p.id),
    ["k", "a"],
  );
  assert.deepEqual(
    page.replyTargets.map((m) => m.id),
    [1],
  );
});

test("Realtime message payload는 조회 행과 같은 ChatMessage가 된다", () => {
  const payload = { id: 5, roomId: 9, senderId: "a", content: "m5", replyToId: null, createdAt: "2026-10-14T03:00:05Z" };
  assert.deepEqual(fromMessagePayload(payload), toChatMessage(core(5) as never));
});

test("메시지 내용: 앞뒤 공백 제거, 공백만·2000자 초과 거부, 이모지는 코드 포인트로 센다", () => {
  assert.equal(normalizeMessageContent("  안녕  "), "안녕");
  assert.throws(() => normalizeMessageContent("   "), { code: "VALIDATION_FAILED" });
  assert.throws(() => normalizeMessageContent("a".repeat(2001)), { code: "VALIDATION_FAILED" });
  assert.equal(normalizeMessageContent("😀".repeat(2000)).length, 4000);
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|SyntaxError"`
Expected: FAIL — `does not provide an export named 'fromMessagePayload'`(mappers.test.ts 전체 실패). 다른 파일은 통과.

- [ ] **Step 3: 도메인 타입** — `client/src/types/domain.ts` 끝에 추가

```ts
// 메시지 조회 한 번의 개수(최신 스냅샷·과거 페이지 공통)
export const MESSAGE_PAGE_SIZE = 30;

export type ChatMessage = {
  id: number;
  roomId: number;
  senderId: string | null; // 탈퇴 사용자는 null
  content: string; // 삭제되면 ""
  replyToId: number | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

// messages: id 오름차순. profiles: 발신자(방을 나간 사람 이름 표시용). replyTargets: 페이지 밖 답장 대상.
export type MessagePage = { messages: ChatMessage[]; profiles: Profile[]; replyTargets: ChatMessage[] };

// Realtime 이벤트(스펙 §8.1). subscribed는 채널 구독 완료(최초·재연결) — 스냅샷 재조회 신호.
export type RoomEvent =
  | { type: "message"; roomId: number; message: ChatMessage }
  | { type: "message_edited"; roomId: number; id: number; content: string; editedAt: string }
  | { type: "message_deleted"; roomId: number; id: number }
  | { type: "read_update"; roomId: number; userId: string; lastReadMessageId: number }
  | { type: "member_removed"; roomId: number; userId: string }
  | { type: "subscribed"; roomId: number };

export type UserEvent =
  | { type: "member_added"; roomId: number; userId: string }
  | { type: "member_removed"; roomId: number; userId: string }
  | { type: "force_logout"; reason: string; sessionId?: string };
```

- [ ] **Step 4: 매퍼** — `client/src/services/mappers.ts`

import 줄 교체:

```ts
import type {
  ChatMessage,
  DomainError,
  Friend,
  FriendRequest,
  MessagePage,
  Participant,
  Profile,
  Room,
} from "../types/domain";
```

`ROOM_SELECT` 정의를 교체(참여자 SELECT 공용화):

```ts
export const PARTICIPANT_SELECT = `user_id, joined_at, last_read_message_id, profile:profiles(${PROFILE_COLUMNS})`;

// me: "내가 참여한 방" 필터 전용(.eq("me.user_id", 나)). RLS는 관리자에게 모든 방을 보여 주므로 필수.
// participants: 방의 전체 참여자.
export const ROOM_SELECT = `id, name, is_group, created_by, me:chat_room_participants!inner(user_id), participants:chat_room_participants(${PARTICIPANT_SELECT})`;

export const MESSAGE_COLUMNS = "id, room_id, sender_id, content, reply_to_id, edited_at, deleted_at, created_at";
// reply:reply_to_id(...) = 답장 대상(다대일). messages!fk 힌트는 자기참조에서 일대다로 해석되므로 쓰지 않는다.
export const MESSAGE_SELECT = `${MESSAGE_COLUMNS}, sender:profiles!messages_sender_id_fkey(${PROFILE_COLUMNS}), reply:reply_to_id(${MESSAGE_COLUMNS})`;
```

`RoomRow` 타입을 교체하고 행 타입 추가:

```ts
export type ParticipantRow = {
  user_id: string;
  joined_at: string;
  last_read_message_id: number | null;
  profile: ProfileRow;
};
export type RoomRow = {
  id: number;
  name: string | null;
  is_group: boolean;
  created_by: string | null;
  participants: ParticipantRow[];
};
export type MessageCoreRow = {
  id: number;
  room_id: number;
  sender_id: string | null;
  content: string;
  reply_to_id: number | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
};
export type MessageRow = MessageCoreRow & { sender: ProfileRow | null; reply: MessageCoreRow | null };
// Realtime message 이벤트 payload(스펙 §8.1)
export type MessagePayload = {
  id: number;
  roomId: number;
  senderId: string | null;
  content: string;
  replyToId: number | null;
  createdAt: string;
};
```

`toRoom`을 교체하고 아래 함수들 추가:

```ts
export const toParticipant = (p: ParticipantRow): Participant => ({
  user: toProfile(p.profile),
  joinedAt: p.joined_at,
  lastReadMessageId: p.last_read_message_id,
});

export const toRoom = (r: RoomRow): Room => ({
  id: r.id,
  name: r.name,
  isGroup: r.is_group,
  ownerId: r.created_by,
  participants: r.participants
    .map(toParticipant)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.user.id.localeCompare(b.user.id)),
});

export const toChatMessage = (r: MessageCoreRow): ChatMessage => ({
  id: r.id,
  roomId: r.room_id,
  senderId: r.sender_id,
  content: r.content,
  replyToId: r.reply_to_id,
  editedAt: r.edited_at,
  deletedAt: r.deleted_at,
  createdAt: r.created_at,
});

// 최신순(desc)으로 조회한 행 → 오름차순 메시지 + 발신자 프로필 + 답장 대상
export const toMessagePage = (rows: MessageRow[]): MessagePage => ({
  messages: rows.map(toChatMessage).sort((a, b) => a.id - b.id),
  profiles: rows.flatMap((r) => (r.sender ? [toProfile(r.sender)] : [])),
  replyTargets: rows.flatMap((r) => (r.reply ? [toChatMessage(r.reply)] : [])),
});

// 새 메시지 이벤트에는 수정·삭제 정보가 없다(INSERT 시점).
export const fromMessagePayload = (p: MessagePayload): ChatMessage => ({
  id: p.id,
  roomId: p.roomId,
  senderId: p.senderId,
  content: p.content,
  replyToId: p.replyToId,
  editedAt: null,
  deletedAt: null,
  createdAt: p.createdAt,
});

const MAX_MESSAGE_LENGTH = 2000;

// 전송 전 검증. Postgres char_length와 같게 코드 포인트로 센다(이모지 1자).
export const normalizeMessageContent = (content: string): string => {
  const text = content.trim();
  const length = [...text].length;
  if (length < 1 || length > MAX_MESSAGE_LENGTH) {
    throw { code: "VALIDATION_FAILED", message: "메시지는 1~2000자여야 합니다." } satisfies DomainError;
  }
  return text;
};
```

- [ ] **Step 5: 단위 테스트 통과 확인**

Run: `pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: tests 16, pass 16, fail 0.

- [ ] **Step 6: 실패하는 통합 스크립트 작성** — `client/scripts/verify-chat.mjs`

```js
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
```

- [ ] **Step 7: 통합 스크립트 실행**

Run: `SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-chat.mjs 2>&1 | grep -v -i warning | tail -3`
Expected: `verify-chat: OK`. (Step 4 이전에 실행하면 `does not provide an export named 'MESSAGE_COLUMNS'`로 실패 — 이 Task의 RED는 Step 2.)

- [ ] **Step 8: 회귀 확인** — `SUPABASE_PUBLISHABLE_KEY=... node scripts/verify-social.mjs`(ROOM_SELECT 공용화 회귀), `pnpm exec tsc --noEmit; pnpm lint`
Expected: `verify-social: OK`, tsc 출력 없음, lint 에러 0.

- [ ] **Step 9: 커밋**

```bash
git add client/src/types/domain.ts client/src/services/mappers.ts client/src/services/mappers.test.ts client/scripts/verify-chat.mjs
git commit -m "feat(chat): 메시지 도메인 타입·매퍼와 Realtime 계약 통합 검증

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 채팅 상태 순수 함수(병합·스냅샷·읽음·뷰·스크롤)

**Files:**
- Create: `client/src/lib/chat-state.ts`
- Create: `client/src/lib/chat-state.test.ts`

**Interfaces:**
- Consumes: Task 2 `ChatMessage`, `MESSAGE_PAGE_SIZE`; Task 1(3단계) `Participant`, `Profile`, `displayName`
- Produces:
  - `type ReadState = Record<string, number>`
  - `type MessageView = ChatMessage & { senderName: string; isMine: boolean; unreadCount: number | null; replyTo: { id: number; senderName: string; content: string; deleted: boolean } | null }`
  - `mergeMessages(base, incoming): ChatMessage[]`, `mergeSnapshot(current, latest): { messages: ChatMessage[]; replaced: boolean }`
  - `applyEdited(list, e: { id: number; content: string; editedAt: string })`, `applyDeleted(list, e: { id: number }, at: string)`
  - `bumpRead(state, userId, id): ReadState`, `seedReadState(participants, prev: ReadState | null): ReadState`
  - `toViews(messages, ctx: { me: string; participants: Participant[]; profiles: Record<string, Profile>; replyTargets: ChatMessage[]; readState: ReadState | null }): MessageView[]`
  - `type ListEdge = { firstId: number | null; lastId: number | null }`, `scrollAction(prev: ListEdge, next: ListEdge, opts: { mineAppended: boolean; nearBottom: boolean }): "bottom" | "keep-offset" | "none"`

이 파일은 Node 단위 테스트가 직접 import하므로 값 import는 확장자 포함 상대 경로(`../types/domain.ts`)를 쓴다(tsconfig `allowImportingTsExtensions: true`).

- [ ] **Step 1: 실패하는 단위 테스트** — `client/src/lib/chat-state.test.ts`

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyDeleted,
  applyEdited,
  bumpRead,
  mergeMessages,
  mergeSnapshot,
  scrollAction,
  seedReadState,
  toViews,
} from "./chat-state.ts";
import type { ChatMessage, Participant, Profile } from "../types/domain.ts";

const msg = (id: number, senderId: string | null = "a", extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  roomId: 1,
  senderId,
  content: `m${id}`,
  replyToId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: "2026-10-14T00:00:00Z",
  ...extra,
});
const profile = (id: string, username: string, nickname: string | null = null): Profile => ({
  id,
  username,
  nickname,
  avatarUrl: null,
});
const part = (p: Profile, lastRead: number | null): Participant => ({
  user: p,
  joinedAt: "2026-10-14T00:00:00Z",
  lastReadMessageId: lastRead,
});
const A = profile("a", "alice_dev");
const B = profile("b", "kakao_ab12cd34", "정동현");
const C = profile("c", "carol");

test("병합: id 중복 제거(새 값 우선), 오름차순", () => {
  const merged = mergeMessages([msg(3), msg(1)], [msg(2), msg(3, "a", { content: "new" })]);
  assert.deepEqual(
    merged.map((m) => [m.id, m.content]),
    [
      [1, "m1"],
      [2, "m2"],
      [3, "new"],
    ],
  );
});

test("스냅샷: 끊긴 사이 30개 넘게 쌓이면 최신 페이지로 교체, 아니면 병합 (Review Focus 3)", () => {
  const latest = Array.from({ length: 30 }, (_, i) => msg(100 + i));
  assert.deepEqual(mergeSnapshot([msg(1), msg(2)], latest), { messages: latest, replaced: true });
  const partial = mergeSnapshot([msg(1), msg(2)], [msg(2), msg(3)]);
  assert.equal(partial.replaced, false);
  assert.deepEqual(
    partial.messages.map((m) => m.id),
    [1, 2, 3],
  );
  assert.equal(mergeSnapshot([], latest).replaced, false, "첫 스냅샷은 교체가 아니라 병합");
});

test("수정·삭제 이벤트 반영", () => {
  const edited = applyEdited([msg(1), msg(2)], { id: 2, content: "고침", editedAt: "t1" });
  assert.deepEqual(edited[1], { ...msg(2), content: "고침", editedAt: "t1" });
  const deleted = applyDeleted(edited, { id: 2 }, "t2");
  assert.deepEqual(deleted[1], { ...msg(2), content: "", editedAt: "t1", deletedAt: "t2" });
  assert.equal(deleted[0], edited[0], "다른 메시지는 그대로");
});

test("읽음 위치는 단조 증가, 스냅샷의 null은 0", () => {
  assert.deepEqual(bumpRead({ a: 5 }, "a", 3), { a: 5 });
  assert.deepEqual(bumpRead({ a: 5 }, "a", 7), { a: 7 });
  assert.deepEqual(seedReadState([part(A, 4), part(B, null)], { a: 6 }), { a: 6 });
  assert.deepEqual(seedReadState([part(A, 4), part(B, null)], null), { a: 4 });
});

test("안 읽은 인원 수: 스냅샷 전 null, 발신자 제외, 한 번도 안 읽은 사람 포함 (Review Focus 1)", () => {
  const participants = [part(A, null), part(B, null), part(C, null)];
  const base = { me: "a", participants, profiles: {}, replyTargets: [] };
  assert.equal(toViews([msg(10)], { ...base, readState: null })[0].unreadCount, null);
  assert.equal(toViews([msg(10)], { ...base, readState: {} })[0].unreadCount, 2, "b, c 둘 다 안 읽음");
  assert.equal(toViews([msg(10)], { ...base, readState: { b: 10 } })[0].unreadCount, 1);
  assert.equal(toViews([msg(10)], { ...base, readState: { b: 10, c: 12 } })[0].unreadCount, 0);
});

test("뷰: 표시명·내 메시지·답장 미리보기(삭제·미로드 포함)", () => {
  const views = toViews(
    [
      msg(5, "b"),
      msg(6, "a", { replyToId: 5 }),
      msg(7, "x", { replyToId: 2 }),
      msg(8, null, { replyToId: 99 }),
    ],
    {
      me: "a",
      participants: [part(A, null), part(B, null)],
      profiles: { x: profile("x", "left_user") },
      replyTargets: [msg(2, "b", { content: "", deletedAt: "t" })],
      readState: {},
    },
  );
  assert.equal(views[0].senderName, "정동현");
  assert.equal(views[0].isMine, false);
  assert.equal(views[1].isMine, true);
  assert.deepEqual(views[1].replyTo, { id: 5, senderName: "정동현", content: "m5", deleted: false });
  assert.equal(views[2].senderName, "left_user", "방을 나간 발신자는 조회한 프로필로");
  assert.deepEqual(views[2].replyTo, { id: 2, senderName: "정동현", content: "", deleted: true });
  assert.equal(views[3].senderName, "(알 수 없음)");
  assert.deepEqual(views[3].replyTo, { id: 99, senderName: "", content: "이전 메시지", deleted: false });
});

test("스크롤: 첫 로드·과거 로드·새 메시지·변화 없음 (Review Focus 2)", () => {
  const none = { firstId: null, lastId: null };
  const opts = { mineAppended: false, nearBottom: false };
  assert.equal(scrollAction(none, { firstId: 1, lastId: 5 }, opts), "bottom", "첫 로드는 맨 아래");
  assert.equal(scrollAction(none, none, opts), "none", "빈 방");
  assert.equal(scrollAction({ firstId: 10, lastId: 20 }, { firstId: 1, lastId: 20 }, opts), "keep-offset", "과거 로드");
  assert.equal(scrollAction({ firstId: 10, lastId: 20 }, { firstId: 10, lastId: 20 }, opts), "none", "빈 과거 페이지·수정·읽음");
  assert.equal(scrollAction({ firstId: 10, lastId: 20 }, { firstId: 10, lastId: 21 }, opts), "none", "위를 읽는 중 남의 메시지");
  assert.equal(
    scrollAction({ firstId: 10, lastId: 20 }, { firstId: 10, lastId: 21 }, { mineAppended: false, nearBottom: true }),
    "bottom",
    "맨 아래 근처면 따라감",
  );
  assert.equal(
    scrollAction({ firstId: 10, lastId: 20 }, { firstId: 10, lastId: 21 }, { mineAppended: true, nearBottom: false }),
    "bottom",
    "내가 보낸 메시지",
  );
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail)|Cannot find module"`
Expected: FAIL — `Cannot find module '...src/lib/chat-state.ts'`. 나머지 16 통과.

- [ ] **Step 3: 구현** — `client/src/lib/chat-state.ts`

```ts
import { MESSAGE_PAGE_SIZE, displayName, type ChatMessage, type Participant, type Profile } from "../types/domain.ts";

// 채팅 화면 상태의 순수 함수. useChatMessages가 Realtime 이벤트·스냅샷을 이 함수들로 반영한다.

export type ReadState = Record<string, number>; // userId → last_read_message_id

export type MessageView = ChatMessage & {
  senderName: string;
  isMine: boolean;
  unreadCount: number | null; // null = 읽음 스냅샷 전(숫자 숨김)
  replyTo: { id: number; senderName: string; content: string; deleted: boolean } | null;
};

const byId = (a: ChatMessage, b: ChatMessage) => a.id - b.id;

// id로 병합(incoming 우선), id 오름차순
export const mergeMessages = (base: ChatMessage[], incoming: ChatMessage[]): ChatMessage[] => {
  const map = new Map(base.map((m) => [m.id, m]));
  for (const m of incoming) map.set(m.id, m);
  return [...map.values()].sort(byId);
};

// 재동기화 스냅샷 병합. 최신 페이지가 가득 찼고 모두 기존 마지막보다 새로우면 사이가 끊긴 것 → 최신 페이지로 교체.
export const mergeSnapshot = (
  current: ChatMessage[],
  latest: ChatMessage[],
): { messages: ChatMessage[]; replaced: boolean } => {
  const last = current[current.length - 1];
  if (last && latest.length === MESSAGE_PAGE_SIZE && latest[0].id > last.id) return { messages: latest, replaced: true };
  return { messages: mergeMessages(current, latest), replaced: false };
};

export const applyEdited = (list: ChatMessage[], e: { id: number; content: string; editedAt: string }): ChatMessage[] =>
  list.map((m) => (m.id === e.id ? { ...m, content: e.content, editedAt: e.editedAt } : m));

export const applyDeleted = (list: ChatMessage[], e: { id: number }, at: string): ChatMessage[] =>
  list.map((m) => (m.id === e.id ? { ...m, content: "", deletedAt: at } : m));

// 읽음 위치는 단조 증가(늦게 도착한 이전 값 무시)
export const bumpRead = (state: ReadState, userId: string, id: number): ReadState =>
  (state[userId] ?? 0) >= id ? state : { ...state, [userId]: id };

// 스냅샷 반영. 한 번도 안 읽은 참여자(null)는 0으로 본다.
export const seedReadState = (participants: Participant[], prev: ReadState | null): ReadState =>
  participants.reduce((acc, p) => bumpRead(acc, p.user.id, p.lastReadMessageId ?? 0), prev ?? {});

export const toViews = (
  messages: ChatMessage[],
  ctx: {
    me: string;
    participants: Participant[];
    profiles: Record<string, Profile>;
    replyTargets: ChatMessage[];
    readState: ReadState | null;
  },
): MessageView[] => {
  const nameOf = (id: string | null): string => {
    const p = id === null ? undefined : (ctx.participants.find((x) => x.user.id === id)?.user ?? ctx.profiles[id]);
    return p ? displayName(p) : "(알 수 없음)";
  };
  const known = new Map([...ctx.replyTargets, ...messages].map((m) => [m.id, m]));
  const readState = ctx.readState;

  return messages.map((m) => {
    const target = m.replyToId === null ? undefined : known.get(m.replyToId);
    return {
      ...m,
      senderName: nameOf(m.senderId),
      isMine: m.senderId === ctx.me,
      unreadCount:
        readState === null
          ? null
          : ctx.participants.filter((p) => p.user.id !== m.senderId && (readState[p.user.id] ?? 0) < m.id).length,
      replyTo:
        m.replyToId === null
          ? null
          : target
            ? { id: target.id, senderName: nameOf(target.senderId), content: target.content, deleted: target.deletedAt !== null }
            : { id: m.replyToId, senderName: "", content: "이전 메시지", deleted: false },
    };
  });
};

export type ListEdge = { firstId: number | null; lastId: number | null };

// 목록이 바뀐 뒤 스크롤 처리. keep-offset = 위에 붙은 만큼 내려 보던 메시지를 제자리에.
export const scrollAction = (
  prev: ListEdge,
  next: ListEdge,
  opts: { mineAppended: boolean; nearBottom: boolean },
): "bottom" | "keep-offset" | "none" => {
  if (next.lastId === null) return "none";
  if (prev.lastId === null) return "bottom";
  if (next.lastId !== prev.lastId) return opts.mineAppended || opts.nearBottom ? "bottom" : "none";
  if (next.firstId !== prev.firstId) return "keep-offset";
  return "none";
};
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected: tests 23, pass 23, fail 0.

- [ ] **Step 5: 타입·린트 확인과 커밋**

Run: `pnpm exec tsc --noEmit; pnpm lint`
Expected: tsc 출력 없음, lint 에러 0(경고 ≤ 6).

```bash
git add client/src/lib/chat-state.ts client/src/lib/chat-state.test.ts
git commit -m "feat(chat): 채팅 상태 순수 함수 — 병합·스냅샷·읽음·안 읽은 수·스크롤(단위 테스트)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 메시지·Realtime 서비스

**Files:**
- Create: `client/src/services/messages.ts`
- Create: `client/src/services/realtime.ts`
- Modify: `client/src/services/rooms.ts` (`listParticipants` 추가)
- Modify: `client/src/services/auth.ts` (`getCurrentSessionId` 추가)

**Interfaces:**
- Consumes: Task 2 `MESSAGE_SELECT`, `MESSAGE_COLUMNS`, `PARTICIPANT_SELECT`, `MessageRow`, `MessageCoreRow`, `ParticipantRow`, `MessagePayload`, `toMessagePage`, `toChatMessage`, `toParticipant`, `fromMessagePayload`, `normalizeMessageContent`, `RoomEvent`, `UserEvent`, `MESSAGE_PAGE_SIZE`
- Produces:
  - `messages.ts`: `fetchMessages(roomId: number, before?: number): Promise<MessagePage>`, `sendMessage(roomId: number, content: string, replyToId?: number): Promise<ChatMessage>`, `editMessage(id: number, content: string): Promise<void>`, `deleteMessage(id: number): Promise<void>`, `markRead(roomId: number): Promise<number | null>`
  - `realtime.ts`: `subscribeRoom(roomId: number, onEvent: (e: RoomEvent) => void): () => void`, `subscribeUser(userId: string, onEvent: (e: UserEvent) => void): () => void`
  - `rooms.ts`: `listParticipants(roomId: number): Promise<Participant[]>`
  - `auth.ts`: `getCurrentSessionId(): Promise<string | null>`

검증 방식: 쿼리 문자열·매퍼·이벤트 계약은 Task 2 통합 스크립트가 같은 상수로 검증했다. 이 Task는 그 상수를 supabase-js 호출에 연결하는 얇은 계층이며 게이트는 tsc·lint와 Task 6 브라우저다.

- [ ] **Step 1: 메시지 서비스** — `client/src/services/messages.ts`

```ts
import { createClient } from "@/lib/supabase/client";
import { MESSAGE_PAGE_SIZE, type ChatMessage, type MessagePage } from "@/types/domain";
import { toDomainError } from "./errors";
import {
  MESSAGE_COLUMNS,
  MESSAGE_SELECT,
  normalizeMessageContent,
  toChatMessage,
  toMessagePage,
  type MessageCoreRow,
  type MessageRow,
} from "./mappers";

// 메시지 경계. NestJS 복귀 시 이 파일 내부만 교체한다.
// before가 없으면 최신 페이지, 있으면 그 id보다 오래된 페이지. 결과는 id 오름차순.
export async function fetchMessages(roomId: number, before?: number): Promise<MessagePage> {
  let query = createClient()
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("room_id", roomId)
    .order("id", { ascending: false })
    .limit(MESSAGE_PAGE_SIZE);
  if (before !== undefined) query = query.lt("id", before);
  const { data, error } = await query;
  if (error) throw toDomainError(error);
  // ponytail: 동적 SELECT 문자열이라 행 타입 추론이 안 된다. 계약은 verify-chat.mjs가 검증.
  return toMessagePage(data as unknown as MessageRow[]);
}

// 발신자는 DB 기본값 auth.uid()(컬럼 권한상 지정 불가). 반환값으로 Realtime 에코 전에 화면에 반영한다.
export async function sendMessage(roomId: number, content: string, replyToId?: number): Promise<ChatMessage> {
  const text = normalizeMessageContent(content);
  const { data, error } = await createClient()
    .from("messages")
    .insert({ room_id: roomId, content: text, reply_to_id: replyToId ?? null })
    .select(MESSAGE_COLUMNS)
    .single();
  if (error) throw toDomainError(error);
  return toChatMessage(data as unknown as MessageCoreRow);
}

export async function editMessage(id: number, content: string): Promise<void> {
  const { error } = await createClient().rpc("edit_message", { p_id: id, p_content: normalizeMessageContent(content) });
  if (error) throw toDomainError(error);
}

export async function deleteMessage(id: number): Promise<void> {
  const { error } = await createClient().rpc("delete_message", { p_id: id });
  if (error) throw toDomainError(error);
}

// 방의 최신 메시지까지 읽음(단조 증가, 변화 없으면 DB가 UPDATE 생략).
export async function markRead(roomId: number): Promise<number | null> {
  const { data, error } = await createClient().rpc("mark_read", { p_room_id: roomId });
  if (error) throw toDomainError(error);
  return data;
}
```

- [ ] **Step 2: Realtime 서비스** — `client/src/services/realtime.ts`

```ts
import { createClient } from "@/lib/supabase/client";
import type { RoomEvent, UserEvent } from "@/types/domain";
import { fromMessagePayload, type MessagePayload } from "./mappers";

// Realtime 경계. 이벤트 이름·payload는 스펙 §8.1 계약(NestJS 복귀 시 socket.io에서 동일하게 유지).
// 참여 방 수만큼 채널을 연다. 수백 개 규모면 user 채널 단일 구독으로 전환(§8.4).
const ROOM_EVENTS = ["message", "message_edited", "message_deleted", "read_update", "member_removed"] as const;
const USER_EVENTS = ["member_added", "member_removed", "force_logout"] as const;

function listen(
  topic: string,
  events: readonly string[],
  onBroadcast: (event: string, payload: Record<string, unknown>) => void,
  onSubscribed?: () => void,
): () => void {
  const supabase = createClient();
  const channel = supabase.channel(topic, { config: { private: true } });
  for (const event of events) {
    channel.on("broadcast", { event }, ({ payload }) => onBroadcast(event, payload as Record<string, unknown>));
  }
  // SUBSCRIBED는 최초 구독과 재연결마다 온다 → 호출자가 스냅샷을 다시 받는다(§8.3 동기화 순서).
  channel.subscribe((status) => {
    if (status === "SUBSCRIBED") onSubscribed?.();
  });
  return () => {
    void supabase.removeChannel(channel);
  };
}

export function subscribeRoom(roomId: number, onEvent: (e: RoomEvent) => void): () => void {
  return listen(
    `room:${roomId}`,
    ROOM_EVENTS,
    (event, payload) =>
      onEvent(
        event === "message"
          ? { type: "message", roomId, message: fromMessagePayload(payload as unknown as MessagePayload) }
          : ({ type: event, ...payload } as RoomEvent),
      ),
    () => onEvent({ type: "subscribed", roomId }),
  );
}

export function subscribeUser(userId: string, onEvent: (e: UserEvent) => void): () => void {
  return listen(`user:${userId}`, USER_EVENTS, (event, payload) => onEvent({ type: event, ...payload } as UserEvent));
}
```

- [ ] **Step 3: 참여자 조회** — `client/src/services/rooms.ts`

import 줄 교체:

```ts
import type { Participant, Room } from "@/types/domain";
import { getCurrentUserId } from "./auth";
import { toDomainError } from "./errors";
import { PARTICIPANT_SELECT, ROOM_SELECT, toParticipant, toRoom, type ParticipantRow, type RoomRow } from "./mappers";
```

`createRoom` 위에 추가:

```ts
// 채팅 스냅샷용 최신 참여자(읽음 위치 포함). 정렬은 화면이 room.participants를 쓰므로 하지 않는다.
export async function listParticipants(roomId: number): Promise<Participant[]> {
  const { data, error } = await createClient()
    .from("chat_room_participants")
    .select(PARTICIPANT_SELECT)
    .eq("room_id", roomId);
  if (error) throw toDomainError(error);
  return (data as unknown as ParticipantRow[]).map(toParticipant);
}
```

- [ ] **Step 4: 현재 세션 id** — `client/src/services/auth.ts`의 `getCurrentUserId` 아래에 추가

```ts
// 현재 세션 id(JWT session_id). 다른 기기 세션 삭제 통지(force_logout.sessionId)와 비교하는 용도라 서명 검증은 하지 않는다.
export async function getCurrentSessionId(): Promise<string | null> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) return null;
  const payload = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return (JSON.parse(atob(payload)) as { session_id?: string }).session_id ?? null;
}
```

- [ ] **Step 5: 타입·린트·테스트·통합 확인**

Run: `pnpm exec tsc --noEmit; pnpm lint; pnpm test 2>&1 | grep -E "^ℹ (pass|fail)"; SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-chat.mjs 2>&1 | tail -1`
Expected: tsc 출력 없음, lint 에러 0(경고 ≤ 6), 23 pass, `verify-chat: OK`.

- [ ] **Step 6: 커밋**

```bash
git add client/src/services/messages.ts client/src/services/realtime.ts client/src/services/rooms.ts client/src/services/auth.ts
git commit -m "feat(chat): messages·realtime 서비스, 참여자 조회, 현재 세션 id

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 채팅 화면을 Supabase Realtime으로 전환

**Files:**
- Create: `client/src/hooks/useRooms.ts`
- Modify: `client/src/components/chat-provider.tsx` (전체 교체)
- Modify: `client/src/hooks/useInAppNotification.ts` (전체 교체)
- Modify: `ChatRooms/hooks/useChatRooms.ts`, `ChatRooms/hooks/useChatMessages.ts`(전체 교체), `ChatRooms/index.tsx`(전체 교체), `ChatRooms/types.ts`, `ChatRooms/components/MessageList.tsx`(전체 교체), `ChatRooms/components/MessageItem.tsx`(전체 교체), `ChatRooms/components/MessageInput.tsx`
- Delete: `ChatRooms/hooks/useMessagePagination.ts`, `client/src/services/chat/` (Orval)

(`ChatRooms/` = `client/src/app/(protected)/chat/[menu]/_components/ChatRooms/`)

**Interfaces:**
- Consumes: Task 3 `MessageView`, `ReadState`, 상태 함수들, `scrollAction`; Task 4 서비스 전부; 3단계 `listRooms`, `Room`, `displayName`, `roomTitle`, `useAuth`, `signOut`, `getErrorMessage`
- Produces:
  - `hooks/useRooms.ts`: `ROOMS_QUERY_KEY = ["rooms"]`, `useRooms()`
  - `useChat(): { onRoomEvent(listener: (e: RoomEvent) => void): () => void; pickedRoomId: number | null; setPickedRoomId(id: number | null): void; setViewingRoom(id: number | null): void; isViewing(id: number): boolean }`
  - `useChatMessages(room: Room | null): { messages: MessageView[]; sendMessage(content: string, replyToId?: number): Promise<void>; editMessage(id: number, content: string): Promise<void>; deleteMessage(id: number): Promise<void>; loadOlder(): Promise<void>; hasMore: boolean; loadingOlder: boolean }`

검증 방식: 상태 규칙은 Task 3 단위 테스트, 이벤트 계약은 Task 2 통합 스크립트가 고정한다. 이 Task의 게이트는 tsc·lint·단위 테스트와 Task 6 두 사용자 브라우저 확인이다.

- [ ] **Step 1: 공용 방 쿼리** — `client/src/hooks/useRooms.ts`

```ts
import { useQuery } from "@tanstack/react-query";
import { listRooms } from "@/services/rooms";

export const ROOMS_QUERY_KEY = ["rooms"] as const;

// 내가 참여한 방. ChatProvider(채널 구독)와 채팅 탭이 같은 캐시를 쓴다.
export const useRooms = () => useQuery({ queryKey: ROOMS_QUERY_KEY, queryFn: listRooms });
```

- [ ] **Step 2: Realtime 구독 허브** — `client/src/components/chat-provider.tsx` 전체 교체

```tsx
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import useAuth from "@/hooks/useAuth";
import { ROOMS_QUERY_KEY, useRooms } from "@/hooks/useRooms";
import { getErrorMessage } from "@/lib/error-handler";
import { getCurrentSessionId, signOut } from "@/services/auth";
import { subscribeRoom, subscribeUser } from "@/services/realtime";
import type { RoomEvent } from "@/types/domain";

type RoomListener = (e: RoomEvent) => void;

type ChatContextValue = {
  // 참여 중인 모든 방의 이벤트를 받는다. 반환값으로 해제.
  onRoomEvent: (listener: RoomListener) => () => void;
  // 채팅 탭에서 고른 방(탭을 오가도 유지). 인앱 알림 [열기]도 이 값을 바꾼다.
  pickedRoomId: number | null;
  setPickedRoomId: (id: number | null) => void;
  // 지금 화면에 열려 있는 방(채팅 탭이 아니면 null). 알림 판단용이라 렌더하지 않는다.
  setViewingRoom: (id: number | null) => void;
  isViewing: (id: number) => boolean;
};

const ChatContext = createContext<ChatContextValue | null>(null);

export const useChat = () => {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat은 ChatProvider 안에서만 사용할 수 있습니다.");
  return ctx;
};

// Realtime 구독 허브(§8.3): 참여 중인 방마다 room 채널, 본인 user 채널 하나.
export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const userId = user?.id;
  const queryClient = useQueryClient();
  const { data: rooms = [] } = useRooms();
  const listeners = useRef(new Set<RoomListener>());
  const roomSubs = useRef(new Map<number, () => void>());
  const viewingRoom = useRef<number | null>(null);
  const [pickedRoomId, setPickedRoomId] = useState<number | null>(null);

  const refreshRooms = useCallback(
    () => queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY }),
    [queryClient],
  );

  const emit = useCallback(
    (e: RoomEvent) => {
      // 멤버 변동(강퇴·나가기·방장 승계)은 방 목록·참여자에 반영. 내가 강퇴되면 목록에서 빠져 채널도 해제된다.
      if (e.type === "member_removed") void refreshRooms();
      listeners.current.forEach((listener) => listener(e));
    },
    [refreshRooms],
  );

  // 방 채널은 목록과의 차이만 구독/해제한다(같은 토픽을 해제 직후 다시 만들면 해제 중인 채널을 돌려받을 수 있음).
  useEffect(() => {
    const subs = roomSubs.current;
    if (!userId) return;
    const wanted = new Set(rooms.map((r) => r.id));
    for (const [id, unsubscribe] of subs) {
      if (!wanted.has(id)) {
        unsubscribe();
        subs.delete(id);
      }
    }
    for (const id of wanted) {
      if (!subs.has(id)) subs.set(id, subscribeRoom(id, emit));
    }
  }, [rooms, userId, emit]);

  useEffect(() => {
    const subs = roomSubs.current;
    return () => {
      subs.forEach((unsubscribe) => unsubscribe());
      subs.clear();
    };
  }, []);

  // 본인 채널: 방 초대·제외는 목록 갱신, 강제 로그아웃은 즉시 로그아웃(§9).
  useEffect(() => {
    if (!userId) return;
    return subscribeUser(userId, async (e) => {
      if (e.type !== "force_logout") {
        void refreshRooms();
        return;
      }
      // 다른 기기의 세션 삭제(그 기기 로그아웃)는 무시한다. 내 탭에서 로그아웃한 직후라면 세션이 없어 역시 무시.
      if (e.sessionId && e.sessionId !== (await getCurrentSessionId())) return;
      toast.error(getErrorMessage({ code: "AUTH_SESSION_REVOKED" }), { id: "auth-session-revoked" });
      await signOut(); // SIGNED_OUT → useAuth가 캐시를 비우고 /login으로
    });
  }, [userId, refreshRooms]);

  const onRoomEvent = useCallback((listener: RoomListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);
  const setViewingRoom = useCallback((id: number | null) => {
    viewingRoom.current = id;
  }, []);
  const isViewing = useCallback((id: number) => viewingRoom.current === id, []);

  const value = useMemo(
    () => ({ onRoomEvent, pickedRoomId, setPickedRoomId, setViewingRoom, isViewing }),
    [onRoomEvent, pickedRoomId, setViewingRoom, isViewing],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
};
```

- [ ] **Step 3: 인앱 알림** — `client/src/hooks/useInAppNotification.ts` 전체 교체

```ts
"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import { useRooms } from "@/hooks/useRooms";
import { displayName, roomTitle } from "@/types/domain";

// 지금 보고 있지 않은 방(또는 탭이 가려진 상태)의 새 메시지를 토스트로 알린다.
export function useInAppNotification() {
  const { onRoomEvent, isViewing, setPickedRoomId } = useChat();
  const { user } = useAuth();
  const { data: rooms = [] } = useRooms();
  const router = useRouter();
  const roomsRef = useRef(rooms);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    if (!user) return;
    return onRoomEvent((e) => {
      if (e.type !== "message" || e.message.senderId === user.id) return;
      if (isViewing(e.roomId) && document.visibilityState === "visible") return;
      const room = roomsRef.current.find((r) => r.id === e.roomId);
      const sender = room?.participants.find((p) => p.user.id === e.message.senderId)?.user;
      toast.info(`${sender ? displayName(sender) : "새 메시지"}: ${e.message.content}`, {
        description: room ? roomTitle(room, user.id) : undefined,
        action: {
          label: "열기",
          onClick: () => {
            setPickedRoomId(e.roomId);
            router.push("/chat/rooms");
          },
        },
        duration: 5000,
      });
    });
  }, [user, onRoomEvent, isViewing, setPickedRoomId, router]);
}
```

- [ ] **Step 4: 방 선택을 provider로** — `ChatRooms/hooks/useChatRooms.ts`

import 블록 교체:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@/components/chat-provider";
import useToast from "@/hooks/useToast";
import { ROOMS_QUERY_KEY, useRooms } from "@/hooks/useRooms";
import { getErrorMessage } from "@/lib/error-handler";
import { createRoom, kickMember, leaveRoom } from "@/services/rooms";
import type { CreateRoomPayload } from "../types";
```

`export const ROOMS_QUERY_KEY = ["rooms"] as const;` 줄을 삭제하고, 훅 앞부분을 교체:

```ts
export const useChatRooms = () => {
  const { success, error } = useToast();
  const queryClient = useQueryClient();
  // 선택한 방은 provider에 둔다(친구 탭을 다녀와도, 알림 [열기]로도 유지·변경).
  const { pickedRoomId, setPickedRoomId: setSelectedRoomId } = useChat();

  const { data: rooms = [], isLoading } = useRooms();
```

(이하 `selectedRoomId` 파생, mutation, return은 그대로)

- [ ] **Step 5: 현재 방 메시지 훅** — `ChatRooms/hooks/useChatMessages.ts` 전체 교체

```ts
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import useToast from "@/hooks/useToast";
import { getErrorMessage } from "@/lib/error-handler";
import {
  applyDeleted,
  applyEdited,
  bumpRead,
  mergeMessages,
  mergeSnapshot,
  seedReadState,
  toViews,
  type ReadState,
} from "@/lib/chat-state";
import { deleteMessage, editMessage, fetchMessages, markRead, sendMessage } from "@/services/messages";
import { listParticipants } from "@/services/rooms";
import { MESSAGE_PAGE_SIZE, type ChatMessage, type DomainError, type Profile, type Room } from "@/types/domain";

type RoomState = {
  messages: ChatMessage[];
  replyTargets: ChatMessage[];
  profiles: Record<string, Profile>;
  readState: ReadState | null; // null = 스냅샷 전(안 읽은 수 숨김)
  hasMore: boolean;
};
const EMPTY: RoomState = { messages: [], replyTargets: [], profiles: {}, readState: null, hasMore: false };

const withProfiles = (prev: Record<string, Profile>, list: Profile[]) =>
  list.reduce((acc, p) => ({ ...acc, [p.id]: p }), prev);

// 읽음 처리는 탭이 보일 때만(§8.3). 실패(강퇴 직후 등)는 방 목록 갱신이 처리하므로 무시한다.
const markReadIfVisible = (roomId: number) => {
  if (document.visibilityState === "visible") markRead(roomId).catch(() => undefined);
};

const message = (e: unknown) => getErrorMessage(e as DomainError);

// 현재 방의 메시지·읽음 상태. 방별로 보관해 방을 오가도 다시 받기 전까지 이전 내용을 보여 준다.
export const useChatMessages = (room: Room | null) => {
  const { user } = useAuth();
  const { onRoomEvent } = useChat();
  const { error } = useToast();
  const roomId = room?.id ?? null;
  const [byRoom, setByRoom] = useState<Record<number, RoomState>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);

  const update = useCallback(
    (id: number, fn: (s: RoomState) => RoomState) => setByRoom((prev) => ({ ...prev, [id]: fn(prev[id] ?? EMPTY) })),
    [],
  );

  // 스냅샷: 최신 30개 + 참여자 읽음 위치를 받아 병합한다. 방 입장과 채널 (재)구독마다 호출.
  const sync = useCallback(
    async (id: number) => {
      try {
        const [page, participants] = await Promise.all([fetchMessages(id), listParticipants(id)]);
        update(id, (s) => {
          const { messages, replaced } = mergeSnapshot(s.messages, page.messages);
          return {
            messages,
            replyTargets: mergeMessages(s.replyTargets, page.replyTargets),
            profiles: withProfiles(s.profiles, [...page.profiles, ...participants.map((p) => p.user)]),
            readState: seedReadState(participants, s.readState),
            hasMore: s.messages.length === 0 || replaced ? page.messages.length === MESSAGE_PAGE_SIZE : s.hasMore,
          };
        });
        markReadIfVisible(id);
      } catch (e) {
        error(`메시지를 불러오지 못했습니다: ${message(e)}`);
      }
    },
    [update, error],
  );

  // 입장 시 스냅샷(채널이 이미 SUBSCRIBED여도 받도록). setState는 응답 후 비동기로 일어난다.
  useEffect(() => {
    if (roomId !== null) void sync(roomId);
  }, [roomId, sync]);

  // 이 방의 Realtime 이벤트
  useEffect(() => {
    if (roomId === null) return;
    return onRoomEvent((e) => {
      if (e.roomId !== roomId) return;
      switch (e.type) {
        case "subscribed":
          void sync(roomId);
          break;
        case "message":
          update(roomId, (s) => ({ ...s, messages: mergeMessages(s.messages, [e.message]) }));
          if (e.message.senderId !== user?.id) markReadIfVisible(roomId);
          break;
        case "message_edited":
          update(roomId, (s) => ({
            ...s,
            messages: applyEdited(s.messages, e),
            replyTargets: applyEdited(s.replyTargets, e),
          }));
          break;
        case "message_deleted": {
          const at = new Date().toISOString();
          update(roomId, (s) => ({
            ...s,
            messages: applyDeleted(s.messages, e, at),
            replyTargets: applyDeleted(s.replyTargets, e, at),
          }));
          break;
        }
        case "read_update":
          // 스냅샷 전 값은 버린다(스냅샷이 최신 위치를 준다)
          update(roomId, (s) =>
            s.readState ? { ...s, readState: bumpRead(s.readState, e.userId, e.lastReadMessageId) } : s,
          );
          break;
      }
    });
  }, [roomId, onRoomEvent, sync, update, user?.id]);

  // 다른 탭·창에서 돌아오면 읽음 처리
  useEffect(() => {
    if (roomId === null) return;
    const onVisible = () => markReadIfVisible(roomId);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [roomId]);

  const send = useCallback(
    async (content: string, replyToId?: number) => {
      if (roomId === null) return;
      try {
        const sent = await sendMessage(roomId, content, replyToId);
        update(roomId, (s) => ({ ...s, messages: mergeMessages(s.messages, [sent]) })); // 에코보다 먼저 표시
      } catch (e) {
        error(`전송 실패: ${message(e)}`);
      }
    },
    [roomId, update, error],
  );

  const edit = useCallback(
    async (id: number, content: string) => {
      try {
        await editMessage(id, content); // 반영은 message_edited 이벤트로
      } catch (e) {
        error(`수정 실패: ${message(e)}`);
      }
    },
    [error],
  );

  const remove = useCallback(
    async (id: number) => {
      try {
        await deleteMessage(id); // 반영은 message_deleted 이벤트로
      } catch (e) {
        error(`삭제 실패: ${message(e)}`);
      }
    },
    [error],
  );

  const current = roomId === null ? EMPTY : (byRoom[roomId] ?? EMPTY);

  const loadOlder = useCallback(async () => {
    const oldest = current.messages[0]?.id;
    if (roomId === null || loadingOlder || !current.hasMore || oldest === undefined) return;
    setLoadingOlder(true);
    try {
      const page = await fetchMessages(roomId, oldest);
      update(roomId, (s) => ({
        ...s,
        messages: mergeMessages(s.messages, page.messages),
        replyTargets: mergeMessages(s.replyTargets, page.replyTargets),
        profiles: withProfiles(s.profiles, page.profiles),
        hasMore: page.messages.length === MESSAGE_PAGE_SIZE,
      }));
    } catch (e) {
      error(`이전 메시지를 불러오지 못했습니다: ${message(e)}`);
    } finally {
      setLoadingOlder(false);
    }
  }, [roomId, loadingOlder, current, update, error]);

  const messages = useMemo(
    () =>
      user && room
        ? toViews(current.messages, {
            me: user.id,
            participants: room.participants,
            profiles: current.profiles,
            replyTargets: current.replyTargets,
            readState: current.readState,
          })
        : [],
    [current, room, user],
  );

  return {
    messages,
    sendMessage: send,
    editMessage: edit,
    deleteMessage: remove,
    loadOlder,
    hasMore: current.hasMore,
    loadingOlder,
  };
};
```

- [ ] **Step 6: 메시지 목록(스크롤 규칙)** — `ChatRooms/components/MessageList.tsx` 전체 교체

```tsx
"use client";

import { useLayoutEffect, useRef } from "react";
import { CardContent } from "@/components/ui/card";
import { scrollAction, type MessageView } from "@/lib/chat-state";
import { MessageItem } from "./MessageItem";

type MessageListProps = {
  messages: MessageView[];
  hasRoom: boolean;
  onReply: (message: MessageView) => void;
  onEdit: (messageId: number, content: string) => void;
  onDelete: (messageId: number) => void;
  onLoadOlder: () => void;
  hasMore: boolean;
  loadingOlder: boolean;
};

const NEAR_BOTTOM_PX = 80;
const LOAD_OLDER_PX = 40;

// 방이 바뀌면 부모가 key로 다시 마운트한다(스크롤 기준 초기화).
export const MessageList = ({
  messages,
  hasRoom,
  onReply,
  onEdit,
  onDelete,
  onLoadOlder,
  hasMore,
  loadingOlder,
}: MessageListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 직전 렌더의 목록 끝 id·스크롤 높이·맨 아래 근처 여부
  const last = useRef({ firstId: null as number | null, lastId: null as number | null, height: 0, nearBottom: true });

  const isNearBottom = (el: HTMLDivElement) => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    last.current.nearBottom = isNearBottom(el);
    if (el.scrollTop < LOAD_OLDER_PX && hasMore && !loadingOlder) onLoadOlder();
  };

  // 그리기 전에 위치를 맞춰 깜빡임·점프를 없앤다.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = { firstId: messages[0]?.id ?? null, lastId: messages[messages.length - 1]?.id ?? null };
    const action = scrollAction(last.current, next, {
      mineAppended: messages[messages.length - 1]?.isMine ?? false,
      nearBottom: last.current.nearBottom,
    });
    if (action === "bottom") el.scrollTop = el.scrollHeight;
    else if (action === "keep-offset") el.scrollTop += el.scrollHeight - last.current.height;
    last.current = { ...next, height: el.scrollHeight, nearBottom: isNearBottom(el) };
  }, [messages]);

  return (
    <CardContent className="flex-1 flex flex-col overflow-hidden pt-4">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto mb-4 space-y-2 p-2 border rounded-md bg-white"
      >
        {loadingOlder && <div className="text-center text-xs text-gray-400">불러오는 중…</div>}
        {!hasMore && messages.length > 0 && <div className="text-center text-xs text-gray-300">대화의 시작입니다.</div>}
        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} onReply={onReply} onEdit={onEdit} onDelete={onDelete} />
        ))}
        {hasRoom && messages.length === 0 && <div className="text-sm text-gray-500">메시지가 없습니다.</div>}
        {!hasRoom && <div className="text-sm text-gray-500">채팅방을 선택하세요.</div>}
      </div>
    </CardContent>
  );
};
```

(기존 "채팅" CardHeader는 3단계 RoomHeader와 중복이라 뺀다.)

- [ ] **Step 7: 메시지 항목** — `ChatRooms/components/MessageItem.tsx` 전체 교체

```tsx
"use client";

import { useState } from "react";
import { Pencil, Trash2, Reply, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { MessageView } from "@/lib/chat-state";

type MessageItemProps = {
  message: MessageView;
  onReply: (message: MessageView) => void;
  onEdit: (messageId: number, content: string) => void;
  onDelete: (messageId: number) => void;
};

// 단일 메시지 + 안 읽은 인원 수/수정/삭제/답장
export const MessageItem = ({ message, onReply, onEdit, onDelete }: MessageItemProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  const { isMine } = message;
  const isDeleted = message.deletedAt !== null;
  const time = new Date(message.createdAt).toLocaleTimeString();

  const submitEdit = () => {
    if (draft.trim() && draft.trim() !== message.content) {
      onEdit(message.id, draft.trim());
    }
    setEditing(false);
  };

  return (
    <div className={`group flex flex-col ${isMine ? "items-end" : "items-start"}`}>
      <span className="text-xs text-gray-500">
        {message.senderName}
        {` • ${time}`}
        {message.editedAt && !isDeleted ? " • 수정됨" : ""}
      </span>

      {message.replyTo && !isDeleted && (
        <div className="mb-1 max-w-[80%] border-l-2 border-gray-300 pl-2 text-xs text-gray-500">
          <span className="font-medium">{message.replyTo.senderName}</span>{" "}
          {message.replyTo.deleted ? "(삭제된 메시지)" : message.replyTo.content}
        </div>
      )}

      <div className="flex items-end gap-1">
        {isMine && !isDeleted && !editing && (
          <div className="hidden items-center gap-1 group-hover:flex">
            <button
              type="button"
              aria-label="수정"
              className="text-gray-400 hover:text-gray-600"
              onClick={() => {
                setDraft(message.content);
                setEditing(true);
              }}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              aria-label="삭제"
              className="text-gray-400 hover:text-red-500"
              onClick={() => onDelete(message.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}

        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitEdit();
                }
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
              className="h-8 w-48"
            />
            <Button type="button" size="sm" onClick={submitEdit} aria-label="저장">
              <Check size={14} />
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} aria-label="취소">
              <X size={14} />
            </Button>
          </div>
        ) : (
          <div
            className={`max-w-full rounded-lg p-2 ${
              isDeleted ? "bg-gray-100 italic text-gray-400" : isMine ? "bg-blue-500 text-white" : "bg-gray-200 text-black"
            }`}
          >
            {isDeleted ? "삭제된 메시지입니다" : message.content}
          </div>
        )}

        {!isMine && !isDeleted && (
          <button
            type="button"
            aria-label="답장"
            className="hidden text-gray-400 hover:text-gray-600 group-hover:block"
            onClick={() => onReply(message)}
          >
            <Reply size={14} />
          </button>
        )}
      </div>

      {/* 안 읽은 인원 수: 본인 메시지, 스냅샷 이후 값이 있을 때만 */}
      {isMine && !isDeleted && message.unreadCount !== null && message.unreadCount > 0 && (
        <span className="mt-0.5 text-xs font-medium text-yellow-600">{message.unreadCount}</span>
      )}
    </div>
  );
};
```

- [ ] **Step 8: 입력창 타입** — `ChatRooms/components/MessageInput.tsx`

`import type { ChatMessage } from "../types";` → `import type { MessageView } from "@/lib/chat-state";`
`replyTarget?: ChatMessage | null;` → `replyTarget?: MessageView | null;`
답장 바의 `{replyTarget.sender}` → `{replyTarget.senderName}`, `{replyTarget.message || "(삭제된 메시지)"}` → `{replyTarget.content || "(삭제된 메시지)"}`

- [ ] **Step 9: 기능 타입 정리** — `ChatRooms/types.ts` 전체 교체

```ts
export type CreateRoomPayload = {
  name?: string;
  participants: string[];
  isGroup: boolean;
};

export type CreateRoomModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateRoomPayload) => void;
};
```

- [ ] **Step 10: 채팅 탭** — `ChatRooms/index.tsx` 전체 교체

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import type { MessageView } from "@/lib/chat-state";
import CreateRoomModal from "./CreateRoomModal";
import { RoomList } from "./components/RoomList";
import { RoomHeader } from "./components/RoomHeader";
import { MessageList } from "./components/MessageList";
import { MessageInput } from "./components/MessageInput";
import { useChatRooms } from "./hooks/useChatRooms";
import { useChatMessages } from "./hooks/useChatMessages";
import type { CreateRoomPayload } from "./types";

const ChatRoomsTab = () => {
  const { user } = useAuth();
  const { setViewingRoom } = useChat();
  const { rooms, selectedRoom, selectedRoomId, setSelectedRoomId, createRoom, leaveRoom, kickMember, isMutating } =
    useChatRooms();
  const { messages, sendMessage, editMessage, deleteMessage, loadOlder, hasMore, loadingOlder } =
    useChatMessages(selectedRoom);

  const [showModal, setShowModal] = useState(false);
  const [replyTarget, setReplyTarget] = useState<MessageView | null>(null);

  // 인앱 알림이 "지금 보고 있는 방"을 알 수 있도록(탭을 떠나면 해제)
  useEffect(() => {
    setViewingRoom(selectedRoomId);
    return () => setViewingRoom(null);
  }, [selectedRoomId, setViewingRoom]);

  const handleSelectRoom = (roomId: number) => {
    setSelectedRoomId(roomId);
    setReplyTarget(null);
  };

  const handleSend = (content: string) => {
    void sendMessage(content, replyTarget?.id);
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
          onSelectRoom={handleSelectRoom}
          onCreateRoom={() => setShowModal(true)}
        />
        <Card className="md:col-span-2 h-[80vh] flex flex-col">
          {selectedRoom && user && (
            <RoomHeader
              room={selectedRoom}
              currentUserId={user.id}
              disabled={isMutating}
              onLeave={() => leaveRoom(selectedRoom.id)}
              onKick={(userId) => kickMember(selectedRoom.id, userId)}
            />
          )}
          <MessageList
            key={selectedRoomId ?? "none"}
            messages={messages}
            hasRoom={selectedRoom !== null}
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
              disabled={!selectedRoom}
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

- [ ] **Step 11: 옛 파일 삭제와 잔존 참조 확인** (저장소 루트)

```bash
git rm -q "client/src/app/(protected)/chat/[menu]/_components/ChatRooms/hooks/useMessagePagination.ts"
git rm -rq client/src/services/chat
grep -rn -E "socket|IncomingMessage|useMessagePagination|services/chat/|getAccessToken" client/src --include=*.ts --include=*.tsx | grep -v "^client/src/services/\(app\|users\|push\)/" | grep -v "lib/api-client.ts"
```
Expected: grep 결과 없음(남은 axios/Orval 정리는 5·6단계).

- [ ] **Step 12: 타입·린트·테스트·빌드 확인** (`client/`)

Run: `pnpm exec tsc --noEmit; pnpm lint; pnpm test 2>&1 | grep -E "^ℹ (pass|fail)"; pnpm build 2>&1 | tail -3`
Expected: tsc 출력 없음, lint 에러 0(경고 ≤ 6), 23 pass, build 성공(Turbopack이 `lib/chat-state.ts`의 `../types/domain.ts` 확장자 import를 해석).

- [ ] **Step 13: 커밋**

```bash
git add -A client/src/hooks client/src/components/chat-provider.tsx client/src/services "client/src/app/(protected)/chat/[menu]/_components/ChatRooms"
git commit -m "feat(chat): 채팅 화면을 Supabase Realtime으로 전환 — 구독 허브, 스냅샷 동기화, 읽음·스크롤, 인앱 알림

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 두 사용자 브라우저 확인

**Files:** 없음(문제 발견 시 해당 Task 파일 수정 후 재검증·커밋)

- [ ] **Step 1: 자동 검증 전체 재실행** (`client/`)

```bash
pnpm exec tsc --noEmit; pnpm lint; pnpm test
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-chat.mjs
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-social.mjs
SUPABASE_PUBLISHABLE_KEY=sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH node scripts/verify-auth.mjs
```
그리고 저장소 루트에서 `npx -y supabase@2.120.0 test db`.
Expected: 전부 통과(test 23, pgTAP 137).

- [ ] **Step 2: 브라우저 확인** — `pnpm dev` 실행 중에, Chrome 확장 도구가 있으면 그것으로, 없으면 설치된 Chrome을 `playwright-core`(세션 scratch에 설치, 저장소에 추가하지 않음, `chromium.launch({ channel: "chrome" })`)로 **브라우저 컨텍스트 2개**(alice, bob)를 띄워 자동 실행한다. `page.on("dialog", d => d.accept())`. 시작 전 alice·bob이 함께 있는 방이 없도록 정리한다.
  1. bob은 채팅 탭에 있다. alice가 bob과 1:1 방 생성 → bob 화면 방 목록에 새로고침 없이 나타난다(Review Focus 5).
  2. bob이 친구 탭으로 이동. alice가 "안녕" 전송 → bob에게 `alice_dev: 안녕` 토스트, [열기] → 채팅 탭에서 그 방이 선택되고 "안녕"이 보인다.
  3. bob이 방을 열기 전 alice 화면의 "안녕" 아래 `1`; bob이 열면 새로고침 없이 사라진다(Review Focus 1).
  4. bob이 "안녕"에 답장 "반가워" → 양쪽에 답장 미리보기 `alice_dev 안녕`.
  5. alice가 "안녕"을 수정 → bob 화면 "수정됨"; 삭제 → bob 화면 "삭제된 메시지입니다", 답장 미리보기는 "(삭제된 메시지)".
  6. SQL로 그 방에 alice 메시지 45개 삽입(`insert into public.messages (room_id, sender_id, content) select <roomId>, '<alice uuid>', 'seed ' || g from generate_series(1,45) g;`) 후 bob이 방을 다시 연다 → 맨 아래 최신. 맨 위로 스크롤 → 과거 로드 후 보던 메시지 위치 유지, 결국 "대화의 시작입니다.". 위쪽을 보는 중 alice가 전송 → bob 스크롤 그대로; bob이 전송 → 맨 아래(Review Focus 2).
  7. 공백만 입력 → 전송 안 됨; 2001자 → "전송 실패: 메시지는 1~2000자여야 합니다." 토스트(Review Focus 5).
  8. alice가 bob·admin과 그룹방 생성, bob이 그 방을 연 상태에서 alice가 bob 강퇴 → bob 화면에서 새로고침 없이 방이 사라지고 선택이 다른 방으로 바뀐다(Review Focus 4).
  9. bob이 채팅 탭에 있는 동안 SQL `update private.user_access ... sessions_revoked_at = now()`(bob) → 새로고침 없이 "세션이 만료되었습니다" 토스트와 `/login`(Review Focus 4). 다른 컨텍스트에서 bob으로 로그인했다가 로그아웃해도 첫 bob 탭은 유지되는지(세션 삭제 무시) 함께 확인.

- [ ] **Step 3: 마무리** — 테스트 데이터(seed 메시지·방)는 방 나가기로 정리. 발견한 문제는 해당 Task를 고치고 Step 1을 재통과시킨 뒤 커밋. dev 서버는 유지.

---

## Self-Review 결과

- 스펙 §12-4: `services/{messages,realtime}` → Task 4, ChatProvider 재작성 → Task 5 Step 2, 동기화(구독→SUBSCRIBED→스냅샷→병합→mark_read) → Task 5 Step 5 `sync`, 읽음·안 읽은 수 → Task 3 + Step 5, 무한 스크롤 → Step 5 `loadOlder` + Step 6, 토스트 → Step 3, 리뷰 버그 3종 → Review Focus 1·2(Task 3 테스트).
- §8.3: `member_removed`(본인) → 목록 갱신으로 방·채널 제거, `force_logout`(sessionId 없거나 내 세션) → `signOut()` 후 `/login`(useAuth SIGNED_OUT). 관리자 비멤버 열람·`mark_read` 생략은 5단계(`/admin/rooms`).
- §8.4 한계(방마다 채널, JWT 만료까지 수신)는 `realtime.ts` 주석.
- 타입 일관성: `RoomEvent.message`(ChatMessage) — Task 2 정의, Task 4 생성, Task 5 소비 일치. `useChat()` 반환 이름 — Step 2 정의와 Step 3·4·10 사용 일치.
