# Supabase 백엔드 이전 — 설계 (Spec)

- 일자: 2026-10-13
- 브랜치: `feat/supabase-migration` (base: `main` @ 727a322b)
- 상태: 설계 승인 완료(브레인스토밍 섹션 1~7 + 5.5), spec 리뷰 대기
- 이력: 초안 `2026-10-13-supabase-migration-draft.md` → 외부 리뷰(`../reviews/2026-10-13-supabase-draft-review-{codex,cursor}.md`) 반영

---

## 1. 목적·범위

### 1.1 목적
- 배포 비용 최소화: **Supabase Free + Vercel Hobby, 월 0원**으로 운영 시작.
- **NestJS로 되돌릴 수 있는 구조** 유지. 정의: *NestJS 복귀 시 Postgres는 유지하고, 클라이언트는 `client/src/services/` 내부만 교체한다.* SQL 함수 목록(§5.4, §6)이 NestJS 이식 체크리스트다.

### 1.2 확정 결정
| 항목 | 결정 |
|---|---|
| 기존 MySQL 데이터 | 이전 안 함, 새로 시작 |
| 로그인 | 이메일+비밀번호, 카카오 OAuth. `username`은 표시·친구 검색용 |
| 개발 환경 | 로컬 Supabase(`supabase start`, Docker). 클라우드는 배포 시 `supabase db push` |
| 데이터 접근 | 클라이언트 `supabase-js` 직접 접근(A안), `services/` 경계 뒤로 숨김. BFF 없음 |
| 컷오버 | 단계별 배포 안 함. 본 브랜치에서 전 단계 완료 후 한 번에 병합 |
| 운영 이메일 인증 | 초기에는 끔(Free 기본 SMTP 시간당 2통). 실사용자 전 커스텀 SMTP 연결(배포 체크리스트) |

### 1.3 기능 범위
- **동등 이전:** 친구 요청/수락/차단, 1:1·그룹 방 생성/목록, 채팅(전송, 읽음·안 읽은 인원 수, 수정, soft delete, 답장, cursor 무한스크롤), 다른 방 메시지 인앱 토스트, 웹 푸시, 관리자 사용자 목록(페이지네이션/정렬), 카카오 로그인.
- **신규(모더레이션):** 방 나가기, 강퇴(그룹방 방장·관리자), 서비스 정지/강제 로그아웃, 관리자 방·메시지 열람 UI, **DB 값 변경만으로도 즉시 반영**.
- **제외:** `OBSERVER` 역할, 푸시 멱등성 저장소·데드레터, Broadcast Replay, 기존 데이터 이전.

---

## 2. 아키텍처

### 2.1 클라이언트 계층
```
app/, components/          UI. supabase를 모름
  └ hooks/                 React Query 훅 + ChatProvider(Realtime 구독 허브)
      └ services/          ★ 교체 경계: 순수 async 함수 + subscribe 함수만 노출, domain 타입 반환
          ├ auth.ts        signUp / signIn / signInWithKakao / signOut / getCurrentUser / onAuthChange
          ├ rooms.ts       listRooms / createRoom / leaveRoom / kickMember / listParticipants
          ├ messages.ts    fetchMessages(roomId, before?) / sendMessage / editMessage / deleteMessage / markRead
          ├ friends.ts     listFriends / listPending / sendRequest / respond
          ├ users.ts       isUsernameAvailable
          ├ admin.ts       listUsers / ban / unban / forceLogout / listRooms
          ├ push.ts        saveSubscription / removeSubscription
          └ realtime.ts    subscribeRoom(roomId, handlers) / subscribeUser(handlers) → unsubscribe
      └ lib/supabase/      client.ts(createBrowserClient) / server.ts(createServerClient). services/·proxy.ts·서버 컴포넌트만 import
types/domain.ts            ChatMessage, Room, Participant, Friend, Profile, DomainError, RoomEvents, UserEvents
proxy.ts                   Next 16 세션 갱신(getClaims)
```
- **경계 강제:** ESLint `no-restricted-imports` — `services/`, `lib/supabase/`, `proxy.ts`, `app/auth/callback`, 서버 컴포넌트 인증 헬퍼 외에서 `@supabase/*`·`@/lib/supabase/*` import 금지.
- **타입:** `supabase gen types`로 만든 `database.types.ts`는 `services/` 내부 전용. services가 domain 타입으로 변환해 반환.
- **에러:** services는 PostgREST/RPC 에러를 `DomainError { code, message }`로 변환. 코드는 기존 `client/src/lib/error-handler.ts` 체계 유지·확장(§5.5).

### 2.2 삭제·추가
- **삭제:** `server/`(마지막 단계), 의존성 `next-auth`·`axios`·`socket.io-client`·`orval`·`openapi-typescript-codegen`, `src/lib/api/`, `src/lib/models/`, `src/lib/api-client.ts`, `src/auth.ts`, `src/app/api/auth/[...nextauth]`, `src/store/auth.ts`(jotai 토큰), `orval.config.ts`, Orval 생성 `src/services/*`(수기 services로 대체).
- **추가:** `@supabase/supabase-js`, `@supabase/ssr` (정확한 버전 고정 + lockfile 커밋).
- **신규 디렉터리:** `supabase/`(`config.toml`, `migrations/`, `tests/`, `functions/send-push/`, `seed.sql`).
- **환경 변수(클라):** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`. secret/service role 키는 클라에 절대 두지 않음.

---

## 3. 스키마

### 3.1 원칙
- `bigint generated always as identity` PK(사용자만 `uuid` = `auth.users.id`), `timestamptz`, `text`. 모든 FK에 인덱스.
- 스키마 분리: `public`(Data API 노출) / `private`(비노출: 헬퍼·권한 데이터).
- **모든 마이그레이션은 테이블/함수 생성과 함께 명시적 최소 `GRANT`/`REVOKE`를 포함**(Data API 자동 노출 중단 대응). 모든 `public` 테이블 RLS 활성.

### 3.2 테이블
```sql
public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null check (username ~ '^[a-z0-9_]{3,20}$'),   -- unique index on (username)
  nickname text, avatar_url text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
)
private.user_roles (user_id uuid primary key references auth.users on delete cascade,
                    role text not null check (role = 'ADMIN'))
private.user_access (
  user_id uuid primary key references auth.users on delete cascade,
  banned_until timestamptz, sessions_revoked_at timestamptz, reason text,
  updated_at timestamptz not null default now()
)
public.chat_rooms (
  id bigint generated always as identity primary key,
  name text, is_group boolean not null default false,
  created_by uuid references public.profiles on delete set null,          -- 방장
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
)  -- index (created_by)
public.chat_room_participants (
  room_id bigint references public.chat_rooms on delete cascade,
  user_id uuid references public.profiles on delete cascade,
  last_read_message_id bigint,
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
)  -- index (user_id)
public.messages (
  id bigint generated always as identity primary key,
  room_id bigint not null references public.chat_rooms on delete cascade,
  sender_id uuid default auth.uid() references public.profiles on delete set null,
  content text not null,
  reply_to_id bigint references public.messages on delete set null,
  edited_at timestamptz, deleted_at timestamptz,
  created_at timestamptz not null default now(),
  check (deleted_at is not null or char_length(content) between 1 and 2000)
)  -- index (room_id, id desc), (sender_id), (reply_to_id)
public.friends (
  id bigint generated always as identity primary key,
  requester_id uuid not null references public.profiles on delete cascade,
  receiver_id uuid not null references public.profiles on delete cascade,
  status text not null default 'PENDING' check (status in ('PENDING','ACCEPTED','BLOCKED')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check (requester_id <> receiver_id)
)  -- unique index (least(requester_id, receiver_id), greatest(requester_id, receiver_id)); index (receiver_id)
public.push_subscriptions (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles on delete cascade,
  endpoint text not null unique, p256dh text not null, auth text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
)  -- index (user_id)
```

### 3.3 권한표 (`anon`: 모든 테이블 권한 없음)
| 테이블 | `authenticated` GRANT | 쓰기 경로 |
|---|---|---|
| profiles | SELECT, UPDATE(nickname, avatar_url) | 생성은 가입 트리거 |
| chat_rooms | SELECT | RPC |
| chat_room_participants | SELECT | RPC |
| messages | SELECT, INSERT(room_id, content, reply_to_id) | 수정·삭제는 RPC |
| friends | SELECT | RPC |
| push_subscriptions | SELECT, INSERT, UPDATE, DELETE | 직접(upsert) |
| private.* | 없음 | 헬퍼·관리자 RPC·Studio |

`sender_id`는 INSERT 컬럼 권한에서 제외 + 기본값 `auth.uid()` → 발신자 위조 불가. role은 `private`에만 존재 → 클라 승격 불가.

---

## 4. 권한 헬퍼 (`private`, 비노출)

모두 `security definer`, `set search_path = ''`, 모든 객체 스키마 한정, `revoke execute from public, anon`, `grant execute to authenticated`(RLS 정책에서 호출되므로). 인자로 다른 사용자를 받지 않고 항상 `auth.uid()`/`auth.jwt()` 기준.

| 함수 | 반환 true 조건 |
|---|---|
| `private.is_active_session()` | ① `auth.jwt()->>'session_id'`가 `auth.sessions`에 존재 ② `private.user_access.banned_until`이 미래 아님 ③ 세션 생성 시각(`auth.sessions.created_at`) > `sessions_revoked_at`(없으면 통과). 토큰 갱신은 같은 세션에 새 `iat`를 주므로 `iat` 기준은 강제 로그아웃을 무력화한다 ④ `auth.users.banned_until`이 미래 아님 |
| `private.is_room_member(p_room_id bigint)` | `is_active_session()` and 본인이 해당 방 참여자 |
| `private.is_admin()` | `is_active_session()` and `private.user_roles`에 본인 ADMIN |

> 구현 시 검증: 정책에서 쓰는 헬퍼의 `authenticated` EXECUTE 필요 여부를 pgTAP으로 확인(스킬 예시는 회수하나, invoker 권한 검사 시 거부될 수 있음). `private` 스키마는 Data API `exposed schemas`에 포함하지 않는다.

---

## 5. RLS·RPC

### 5.1 공통
모든 정책 `to authenticated`, `auth.uid()`는 `(select auth.uid())`로 감쌈, 헬퍼도 `(select ...)`로 감쌈.

### 5.2 RLS 정책
| 테이블 | 동작 | 조건 |
|---|---|---|
| profiles | select | `is_active_session()` |
| profiles | update | using/with check `id = uid and is_active_session()` |
| chat_rooms | select | `is_room_member(id) or is_admin()` |
| chat_room_participants | select | `is_room_member(room_id) or is_admin()` |
| messages | select | `is_room_member(room_id) or is_admin()` |
| messages | insert | `sender_id = uid and is_room_member(room_id) and (reply_to_id is null or exists(같은 room_id의 messages))` |
| friends | select | `uid in (requester_id, receiver_id) and is_active_session()` |
| push_subscriptions | all | using/with check `user_id = uid and is_active_session()` |

관리자는 **열람만**(쓰기 정책 확장 없음).

### 5.3 트리거
| 트리거 | 동작 |
|---|---|
| `auth.users` AFTER INSERT → `public.handle_new_user()` | profiles 생성(§7.1). 예외를 최소화(가입 차단 방지) |
| `messages` AFTER INSERT/UPDATE, `chat_room_participants` AFTER UPDATE OF last_read_message_id / AFTER DELETE | Realtime 송출(§8.1) |
| `chat_room_participants` AFTER INSERT | `user:<uuid>`로 `member_added` 송출(새 방 초대 즉시 반영, 4단계 추가) |
| `private.user_access` AFTER INSERT/UPDATE | `user:<uuid>`로 `force_logout` 송출 |
| `auth.sessions` AFTER DELETE (가능 시) | `user:<uuid>`로 `force_logout {sessionId}` 송출. 불가하면 생략하고 토큰 갱신 실패로 처리(§9) |
| `*.updated_at` BEFORE UPDATE | `updated_at = now()` |

### 5.4 RPC (`public`, `security definer`, `search_path = ''`, `revoke from public, anon`, `grant to authenticated`)
모든 RPC는 첫 줄에서 `is_active_session()`을 검사(실패 시 `AUTH_SESSION_REVOKED`).

| 함수 | 검증 | 효과 |
|---|---|---|
| `create_room(p_name text, p_is_group boolean, p_usernames text[]) → bigint` | 사용자 존재, 본인 제외·중복 제거, 1:1이면 총 2명 | 방(created_by=본인)+참여자 원자 생성 |
| `leave_room(p_room_id)` | 참여자 본인 | 참여자 삭제. 방장이면 `joined_at` 가장 빠른 멤버에게 승계. 남은 멤버 0명이면 방 삭제 |
| `kick_member(p_room_id, p_user_id)` | 그룹방 방장 또는 관리자. 1:1 방 불가. 본인 강퇴 불가(→ leave) | 참여자 삭제 |
| `send_friend_request(p_username text) → friends` | 대상 존재, 본인 아님, 양방향 기존 행 없음 | PENDING 생성 |
| `respond_friend_request(p_id bigint, p_action text)` | 수신자 본인, action ∈ ACCEPT/BLOCK | 상태 변경 |
| `edit_message(p_id bigint, p_content text)` | 작성자 본인, 미삭제, 1~2000자 | content, edited_at 갱신 |
| `delete_message(p_id bigint)` | 작성자 본인, 미삭제 | deleted_at=now(), **content=''** |
| `mark_read(p_room_id bigint) → bigint` | 참여자 본인 | `greatest(기존, 방 최신 id)`, 변경 없으면 UPDATE 안 함 |
| `get_me() → jsonb` | 활성 세션 | `{id, username, nickname, avatarUrl, isAdmin}` — 클라가 관리자 여부를 알 수 있는 유일한 경로 |
| `is_username_available(p_username text) → boolean` | 형식 검사 | `anon`에도 EXECUTE 허용(가입 전 확인). 존재 여부 외 정보 노출 없음 |
| `admin_list_users(p_page, p_limit ≤100, p_sort, p_order) → jsonb` | `is_admin()`, sort ∈ {created_at, username, updated_at} | `{items[{id, username, nickname, email, createdAt, isAdmin, bannedUntil}], total, page, limit}` |
| `admin_list_rooms(p_page, p_limit ≤100) → jsonb` | `is_admin()` | 방, 멤버 수, 방장 |
| `admin_ban(p_user_id, p_until timestamptz, p_reason text)` / `admin_unban(p_user_id)` | `is_admin()`, 본인 정지 불가 | `private.user_access` upsert |
| `admin_force_logout(p_user_id)` | `is_admin()` | `sessions_revoked_at = now()` |

### 5.5 에러 계약
RPC는 `raise exception '<CODE>' using hint = '<사용자 메시지>'`. services가 `message`를 `DomainError.code`로, RLS 거부(SQLSTATE 42501)는 `CHAT_FORBIDDEN`으로 변환.

| 코드 | 상황 |
|---|---|
| `AUTH_SESSION_REVOKED` | 정지·강제 로그아웃·세션 삭제 |
| `AUTH_DUPLICATE_USER` | username 경합 충돌(기존 코드) |
| `CHAT_FORBIDDEN` | 비멤버/비소유/권한 없음 |
| `CHAT_ROOM_NOT_FOUND`, `MESSAGE_NOT_FOUND` | 대상 없음 |
| `ROOM_INVALID_PARTICIPANTS` | 1:1 인원 오류·없는 사용자 |
| `ROOM_KICK_FORBIDDEN` | 1:1 방 강퇴·본인 강퇴·방장/관리자 아님 |
| `FRIEND_USER_NOT_FOUND`, `FRIEND_SELF_REQUEST`, `FRIEND_DUPLICATE` | 친구 요청 검증 |
| `ADMIN_FORBIDDEN` | 관리자 아님 |
| `VALIDATION_FAILED` | 길이·형식 |

---

## 6. NestJS 이식 체크리스트
§4 헬퍼 3개 + §5.4 RPC 15개 + §5.3 트리거 + §8.1 이벤트 계약. NestJS 복귀 시 동일 Postgres에서 함수를 그대로 호출하거나 서비스 코드로 이식하고, `services/` 내부를 fetch/socket.io로 교체한다. 이벤트 이름·payload(§8.1)는 socket.io에서도 동일하게 유지한다.

---

## 7. 인증

### 7.1 이메일 가입
1. `services/auth.signUp`: `rpc('is_username_available')` 사전 확인 → `auth.signUp({ email, password, options: { data: { username } } })`.
2. `handle_new_user()`(`security definer`, `search_path=''`): `raw_user_meta_data->>'username'`을 소문자화·형식 검사. 형식 불일치/누락이면 `user_<uuid 앞 8자>`. 이메일 가입에서 경합으로 unique 충돌 시에만 예외 → services가 `AUTH_DUPLICATE_USER`로 변환. `raw_user_meta_data`는 **초기 username 결정에만** 사용, 권한 판단 금지.

### 7.2 카카오
- `signInWithOAuth({ provider: 'kakao', options: { redirectTo: `${origin}/auth/callback` } })` → `app/auth/callback/route.ts`에서 `exchangeCodeForSession(code)` → `/chat`.
- 비즈 앱이 아니면 `account_email` 불가 → Supabase Kakao provider "이메일 없는 사용자 허용". scope: `profile_nickname`, `profile_image`.
- username = `kakao_<uuid 앞 8자>`, nickname/avatar_url = 카카오 프로필(메타데이터 키는 구현 시 확인). **표시명 = `nickname ?? username`** (앱 전역).
- 로컬 콜백 `http://localhost:54321/auth/v1/callback`을 카카오 Redirect URI에 추가(사용자 작업). client id/secret은 `config.toml`에서 env 참조, 값은 gitignore된 env 파일.

### 7.3 세션
- `client/src/proxy.ts`(Next 16): `createServerClient` + `getClaims()`로 쿠키 세션 갱신, `setAll`이 만든 response 반환.
- `(protected)/layout.tsx`: 서버에서 `getClaims()` 없으면 `/login` 리다이렉트. 서버 코드에서 `getSession()` 신뢰 금지.
- `useAuth` = `services/auth.getCurrentUser()` + `onAuthChange`. `SIGNED_OUT` 수신 시 로그인 화면으로.
- JWT 만료 **10분**(Auth settings / `config.toml`).
- 관리자 지정: `supabase/seed.sql`(로컬), 운영은 Studio SQL로 `insert into private.user_roles`.

---

## 8. Realtime

### 8.1 이벤트 계약 (`realtime.send(payload, event, topic, true)`, 트리거에서 송출)
| 토픽 | 이벤트 | 트리거 | payload |
|---|---|---|---|
| `room:<id>` | `message` | messages INSERT | `{id, roomId, senderId, content, replyToId, createdAt}` |
| `room:<id>` | `message_deleted` | messages UPDATE, `deleted_at` null→값 | `{id, roomId}` |
| `room:<id>` | `message_edited` | messages UPDATE, 그 외 | `{id, roomId, content, editedAt}` |
| `room:<id>` | `read_update` | participants UPDATE OF last_read_message_id | `{roomId, userId, lastReadMessageId}` |
| `room:<id>` | `member_removed` | participants DELETE | `{roomId, userId}` |
| `user:<uuid>` | `member_removed` | participants DELETE | `{roomId, userId}` |
| `user:<uuid>` | `member_added` | participants INSERT | `{roomId, userId}` |
| `user:<uuid>` | `force_logout` | user_access 변경 / sessions DELETE | `{reason, sessionId?}` |

- `broadcast_changes()`는 payload 형식이 문서화되지 않아 사용하지 않음.
- 송출 실패가 원 트랜잭션을 깨지 않도록 `begin ... exception when others then raise warning ... end`로 감쌈(일별 파티션 미생성 시 send 실패 대응).
- 표시명·답장 미리보기는 payload에 넣지 않고 클라가 참여자/메시지 캐시에서 해석.

### 8.2 수신 정책 (`realtime.messages`, SELECT만 — 클라 송신 불가)
```sql
create policy "room members/admin receive" on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast'
  and (
    ( (select realtime.topic()) ~ '^room:[0-9]+$'
      and ( (select private.is_room_member(split_part((select realtime.topic()), ':', 2)::bigint))
            or (select private.is_admin()) ) )
    or ( (select realtime.topic()) = 'user:' || (select auth.uid())::text
         and (select private.is_active_session()) )
  )
);
```
- `realtime.messages`에 `ALTER`/`ENABLE RLS` 실행 금지(realtime 스키마 변경 차단). Realtime 설정 "Allow public access" 끔.

### 8.3 클라이언트
- `ChatProvider`(chat/layout 유지): 참여 중인 모든 방 `subscribeRoom` + `subscribeUser`, `onRoomEvent`/`onUserEvent` 리스너 노출.
  - `useChatMessages`: 현재 방 이벤트만 반영. `useInAppNotification`: 다른 방 `message`로 토스트.
  - `member_removed`(본인) → 방 목록에서 제거, 구독 해제, 열려 있으면 닫기. `force_logout`(sessionId 없거나 내 세션) → `signOut()` 후 `/login`.
- 채널: `supabase.channel('room:<id>', { config: { private: true } })`.
- **동기화 순서:** 구독 → `SUBSCRIBED`(최초·재연결마다) 시 스냅샷 재조회(최신 30개 메시지 + 참여자 `last_read`) → 메시지 id로 병합(중복 제거) → `mark_read`.
- **읽음 상태:** `readState[userId] = max(기존, 수신값)`. `unreadCount`는 **클라 계산이 단일 소스**: 발신자 제외 참여자 중 `readState[uid] < message.id` 수. 스냅샷에서 `last_read_message_id`가 null인 참여자는 `0`으로 시드(한 번도 안 읽음). 방의 스냅샷 수신 전에는 숫자를 표시하지 않음.
- **`mark_read` 호출 조건:** 타인 메시지 수신 && 탭 visible && 그 방이 열려 있음, 또는 입장/재동기화 시. 관리자 비멤버 열람 시 호출 안 함.
- 토큰 갱신 시 Realtime JWT 갱신: supabase-js 자동 여부 구현 시 확인, 아니면 `onAuthStateChange`에서 `realtime.setAuth()`.

### 8.4 알려진 한계 (코드 주석)
- 참여 방 수만큼 채널. 수백 개 규모면 사용자 채널 단일 구독으로 전환.
- 정책 캐시: 강퇴/정지 후 클라가 통지를 무시해도 수신은 JWT 만료(≤10분)까지. 데이터 조회·쓰기는 즉시 차단.
- Free: Realtime 월 200만 메시지(수신자 수만큼 계산), 피크 200 연결.

---

## 9. 모더레이션 (DB 값 변경 → 즉시 반영)

| Studio/UI 조작 | 데이터 차단 | 클라 반응 |
|---|---|---|
| `private.user_access.banned_until` 설정 / `admin_ban` | 즉시(`is_active_session`) | `force_logout` → 즉시 로그아웃 |
| `sessions_revoked_at = now()` / `admin_force_logout` | 즉시(이전에 생성된 세션 전부, 토큰 갱신해도 유지) | 동일 |
| `chat_room_participants` 행 삭제 / `kick_member` / `leave_room` | 즉시(해당 방) | `member_removed` |
| `auth.sessions` 행 삭제, 기본 Ban user | 즉시 | 트리거 가능 시 즉시 `force_logout`, 불가 시 다음 토큰 갱신 실패(≤10분)로 `SIGNED_OUT` |

UI:
- `/admin/users`: 상태 배지(정상/정지), [정지][해제][강제 로그아웃], 페이지네이션·정렬.
- `/admin/rooms`(신규): 전체 방 → 멤버 목록([강퇴]) + 메시지 읽기 전용 열람(Realtime 수신 포함, `mark_read` 없음).
- 채팅 화면: 방 메뉴 [나가기], 그룹방 방장에게 멤버 [강퇴].

---

## 10. 푸시
```
messages INSERT → Database Webhook(pg_net 비동기) [헤더 x-webhook-secret: Vault 비밀]
 → Edge Function send-push
    1) 비밀 검증, 불일치 401
    2) service role: 방 참여자 − 발신자 − 비활성(정지) 사용자
    3) push_subscriptions 조회 → web-push 발송(VAPID: Function secrets)
    4) 410/404 → 구독 삭제
```
- payload: `{title: 방 이름 ?? 발신자 표시명, body: content, data: {roomId, url: '/chat/rooms?room=<roomId>'}}` (현행 동일).
- 클라: `usePushNotification`·서비스워커 유지, 저장만 `services/push`(endpoint upsert).
- 구현 시 확인: Deno에서 `npm:web-push` 동작(불가 시 Deno용 webpush 라이브러리), 로컬 webhook → function 주소.

---

## 11. 테스트

| 층 | 도구 | 범위 |
|---|---|---|
| DB | pgTAP (`supabase test db`) | 비멤버 거부, sender 위조·타 방 답장 불가, role 승격·private 접근 불가, realtime topic 정책(멤버/관리자/user 토픽), `is_active_session`(정지·강제 로그아웃·세션 삭제 → 전면 거부), RPC 규칙(1:1=2명, 친구 양방향 중복, 수신자만 응답, 강퇴 권한, 방장 승계, 마지막 멤버 퇴장 시 방 삭제, 읽음 단조 증가) |
| 통합 | Node 스크립트(로컬 Supabase, supabase-js, 사용자 2~3명) | 가입→방→메시지→Broadcast 수신→수정/삭제/읽음→강퇴 `member_removed`→정지 `force_logout` + 데이터 거부 |
| 클라 | `tsc`, ESLint | `no-restricted-imports` 경계 |
| 보안 | `supabase db advisors` | 마이그레이션 확정 전 매번 |
| 수동 | 체크리스트 | 카카오 로그인, 푸시 수신, 관리자 UI |

각 단계 완료 = 해당 테스트 통과. 병합은 전 단계 완료 후.

---

## 12. 작업 분할 (각각 plan → 구현 → 검증)
1. **기반:** `supabase init`, 스키마·권한·헬퍼·RPC·트리거·Realtime 정책(§3~§5, §8.1~8.2, §9 DB 부분), seed, pgTAP.
2. **인증:** `@supabase/ssr`, `proxy.ts`, 콜백 라우트, 로그인/가입 UI(email+username), 카카오, `services/auth`, `useAuth`, NextAuth 제거.
3. **친구·방·사용자:** `services/{friends,rooms,users}` + hooks + UI. 방 나가기/강퇴 UI 포함.
4. **채팅:** `services/{messages,realtime}`, ChatProvider 재작성, 동기화·읽음·무한스크롤·토스트. 기존 리뷰 버그(초기 unread 오계산, 스크롤 점프, 빈 페이지 로드 후 스크롤 오류) 해소.
5. **관리자:** `services/admin`, `/admin/users` 확장, `/admin/rooms` 신규, `force_logout`/`member_removed` 처리.
6. **푸시 + 정리:** Edge Function·webhook, `services/push`, `server/`·미사용 의존성·Orval 삭제, ESLint 경계 규칙, `AGENTS.md`/`DEPLOYMENT.md` 갱신(커스텀 SMTP·pause·한도 리스크 포함), 통합 스크립트.

## 13. 구현 시 확인 목록 (문서 미확인 항목)
- `auth.users`/`auth.sessions` 트리거 생성 가능 여부 및 `auth.sessions` 조회 권한(헬퍼 owner 기준).
- 정책 내 헬퍼 함수의 `authenticated` EXECUTE 필요 여부.
- supabase-js의 Realtime 토큰 자동 갱신 여부.
- 카카오 메타데이터 키(nickname/avatar), "이메일 없는 사용자 허용"의 `config.toml` 설정 방법.
- Deno `npm:web-push` 호환, 로컬 webhook 주소.
- Realtime "Allow public access" 로컬 설정 방법.
