# dongchat 모바일 UI 개편(1단계) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 폰에서 카카오톡처럼 쓰는 dongchat — 방마다 주소, 하단 탭, 채팅 목록 요약(마지막 메시지·시간·안 읽은 수), 친구 탭에서 1:1 바로 열기, 키보드 안전 입력창, 사용자 테마(민트·파랑·노을 × 라이트·다크·기기), 홈 화면 설치(PWA).

**Architecture:** 백엔드는 RPC 2개(`list_my_rooms`, `open_direct_room`)만 추가한다. 화면은 `/chat/{friends,rooms,rooms/[id],settings}` 라우트로 다시 짜고, 선택된 방 상태(`pickedRoomId`)를 주소로 대체한다. 목록 요약은 React Query 캐시 하나(`["rooms","summaries"]`)를 채팅 레이아웃에서 실시간 이벤트로 갱신한다(순수 함수 `lib/room-list.ts`). 테마 색은 `lib/theme.ts` 한 곳에서 정의해 서버 렌더 `<style>`로 내보내고(단일 출처·대비 테스트), 밝기는 `next-themes`, 팔레트는 `<html data-palette>` + localStorage.

**Tech Stack:** Next.js 16.0.10(App Router), React 19, Tailwind v4, shadcn/ui(Radix), next-themes 0.4.6, TanStack Query, Supabase(로컬 CLI 2.120.0), pgTAP, Node 24 `node:test`(타입 스트리핑), playwright-core(세션 스크래치패드, 커밋 안 함).

**Spec:** `docs/superpowers/specs/2026-10-15-mobile-ui-overhaul-design.md` (선행 계약: `docs/superpowers/specs/2026-10-13-supabase-migration-design.md` §3·§5·§8.1)

## Global Constraints

- 명령: 클라 작업은 `client/`에서 pnpm, 마이그레이션·pgTAP·CLI는 저장소 루트에서 `npx -y supabase@2.120.0 … < /dev/null`.
- **새 npm 의존성 없음.** 하단 시트는 네이티브 `<dialog>`, 아이콘은 `lucide-react`, 앱 아이콘 PNG는 `next/og`의 `ImageResponse`, 글꼴은 Pretendard CDN `<link>`(jsDelivr `orioncactus/pretendard@v1.3.9`).
- `client/src/services/` 경계: 화면·훅은 `@/lib/supabase/*`·`@supabase/*`를 import하지 않는다.
- DB: 마이그레이션 + pgTAP 선행. `security definer` 함수는 `set search_path = ''`, 스키마 한정 이름, `revoke execute … from public, anon`, `grant execute … to authenticated`. 에러는 선행 스펙 §5.5 코드(`AUTH_SESSION_REVOKED`, `ROOM_INVALID_PARTICIPANTS`).
- 순수 함수 파일(`lib/*.ts`, `services/mappers.ts`)은 상대 경로 + `.ts` 확장자 import(Node 테스트가 직접 import).
- 대비: 본문·버튼·말풍선 글자 대비 4.5:1 이상(테스트로 고정).
- 문구: 존댓말 해요체, 버튼은 동작 이름(“보내기”, “만들기”, “나가기”).
- 각 Task 완료 조건: 명시된 테스트 + `pnpm exec tsc --noEmit` + `pnpm lint`(에러 0). 기준선: `pnpm test` 34 pass, pgTAP 157(`Result: PASS`).
- pgTAP 실행 전 alice/bob 수동 테스트 방과 `private.user_access` 행이 남아 있으면 지운다(030은 DB 전체의 삭제 메시지에 민감).
- 커밋 메시지 끝: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. CRLF 파일은 CRLF 유지.

## Review Focus

1. **한글 입력 중 Enter**: IME 조합 중 Enter로 반쯤 조합된 글자가 전송되거나 두 번 전송되면 안 된다. → Task 7 `composer-keys` 단위 테스트(`shouldSend`)
2. **알림·직접 주소로 방 진입 후 ‹**: 앱 안에서 들어온 게 아니면 ‹가 앱 밖으로 나가지 않고 채팅 목록으로 간다. 잘못된/남의 방 주소는 토스트 후 목록. → Task 3 `nav` 테스트 + Task 12 브라우저(직접 주소 진입)
3. **목록 안 읽은 수가 실제와 어긋남**: 같은 이벤트 중복 수신, 보고 있는 방, 내 메시지, 삭제, 재연결 후 값이 서버와 같아야 한다. → Task 3 `room-list` 테스트 + Task 1 pgTAP + Task 12 브라우저
4. **1:1 방 중복**: 친구를 여러 번 누르거나 상대가 동시에 눌러도 같은 방. 상대가 나간 방은 재사용하지 않는다. → Task 1 pgTAP + Task 2 verify-chat
5. **테마 깜빡임·잘못된 저장값**: 새로고침 때 기본 테마가 번쩍이지 않고, localStorage에 이상한 값이 있어도 민트로 동작. → Task 4 `theme` 테스트(부트 스크립트 문자열·`isPalette`) + Task 12 브라우저(새로고침 후 유지)

---

## File Structure

```
supabase/migrations/<ts>_room_list.sql                 # list_my_rooms, open_direct_room
supabase/tests/database/130_room_list.test.sql
supabase/tests/database/140_direct_room.test.sql
supabase/functions/send-push/index.ts                  # 알림 URL → /chat/rooms/<id>

client/src/lib/supabase/database.types.ts              # gen types 재생성
client/src/types/domain.ts                             # RoomSummary
client/src/services/mappers.ts (+test)                 # RoomSummaryRow, toRoomSummary
client/src/services/rooms.ts                           # listMyRooms, openDirectRoom
client/src/services/profile.ts                         # updateNickname, normalizeNickname
client/scripts/verify-chat.mjs                         # 새 RPC 계약

client/src/lib/format.ts (+test)                       # 시간·날짜·배지·미리보기 문구
client/src/lib/message-groups.ts (+test)               # 날짜 구분선·연속 메시지 묶기
client/src/lib/room-list.ts (+test)                    # 요약 정렬·실시간 반영
client/src/lib/push-url.ts (+test)                     # roomPath 추가
client/src/lib/nav.ts (+test)                          # 앱 안 이동 표시(‹ 동작)
client/src/lib/theme.ts (+test)                        # 팔레트 토큰·CSS·부트 스크립트·대비
client/src/lib/install.ts (+test)                      # 설치 안내 모드
client/src/lib/composer-keys.ts (+test)                # Enter 전송 판정

client/src/app/layout.tsx                              # lang=ko, 테마 style·script, Pretendard, viewport, metadata
client/src/app/globals.css                             # 색 블록 제거, bubble 토큰·폰트 매핑
client/src/app/manifest.ts                             # PWA manifest
client/src/app/icons/[file]/route.tsx                  # 앱 아이콘 PNG
client/src/app/page.tsx                                # → /chat/rooms
client/src/proxy.ts / lib/supabase/proxy.ts            # HOME → /chat/rooms
client/src/components/providers.tsx                    # ThemeProvider + ThemeColorSync
client/src/hooks/usePalette.ts
client/src/hooks/useRoomSummaries.ts
client/src/hooks/useRoomActions.ts
client/src/hooks/useChatMessages.ts                    # (이동) _components/ChatRooms/hooks → hooks
client/src/hooks/useLongPress.ts
client/src/hooks/useInstallPrompt.ts
client/src/hooks/useInAppNotification.ts               # 열기 → roomPath
client/src/hooks/useRouter.tsx                         # goChat → /chat/rooms
client/src/components/chat-provider.tsx                # pickedRoomId 제거
client/src/components/ui/sheet.tsx                     # 네이티브 dialog 하단 시트
client/src/components/chat/{BottomTabs,ScreenHeader,UserAvatar,RoomRow,MessageList,MessageBubble,
  Composer,MessageActionsSheet,RoomMenuSheet,CreateGroupSheet,AddFriendSheet,InstallBanner}.tsx
client/src/app/(protected)/layout.tsx                  # 헤더 제거
client/src/app/(protected)/chat/layout.tsx             # 한 열 + 하단 탭 + 요약 동기화
client/src/app/(protected)/chat/page.tsx               # → /chat/rooms
client/src/app/(protected)/chat/{friends,rooms,settings}/page.tsx
client/src/app/(protected)/chat/rooms/[id]/page.tsx
client/src/app/(protected)/admin/layout.tsx            # 자체 상단 바·여백
client/src/app/(protected)/admin/rooms/RoomDetail.tsx  # import 경로·MessageList props
client/src/app/(public)/(auth)/{login,join}/page.tsx   # AuthShell
client/src/components/auth/AuthShell.tsx
client/src/components/auth/login/LoginForm.tsx         # 카카오 최상단
client/public/service-worker.js                        # 기본 URL 유지(확인만)

삭제: client/src/app/(protected)/chat/[menu]/ (전체), components/layout/ProtectedHeader.tsx,
      components/push-notification-button.tsx, components/auth/AuthTabs.tsx, hooks/useRooms.ts는 유지
```

---

### Task 1: DB — `list_my_rooms`, `open_direct_room`

**Files:**
- Create: `supabase/migrations/<타임스탬프>_room_list.sql` (`npx -y supabase@2.120.0 migration new room_list < /dev/null`로 파일명만 만들고, 비어 있거나 멈추면 Ctrl+C 후 Write로 채운다)
- Create: `supabase/tests/database/130_room_list.test.sql`, `supabase/tests/database/140_direct_room.test.sql`
- Modify: `client/src/lib/supabase/database.types.ts` (재생성)

**Interfaces:**
- Produces: `public.list_my_rooms() returns table(room_id bigint, name text, is_group boolean, created_at timestamptz, member_count int, last_message_id bigint, last_message_content text, last_message_deleted boolean, last_message_sender_id uuid, last_message_at timestamptz, unread_count int)`; `public.open_direct_room(p_username text) returns bigint`.

- [ ] **Step 1: 실패하는 pgTAP — 목록**

`supabase/tests/database/130_room_list.test.sql`:
```sql
begin;
select plan(12);

select tests.create_user('rl_alice@test.com', '{"username":"rl_alice"}');
select tests.create_user('rl_bob@test.com', '{"username":"rl_bob"}');
select tests.create_user('rl_carol@test.com', '{"username":"rl_carol"}');

select tests.login_as(tests.uid('rl_alice@test.com'));
select public.create_room('rl_dm', false, array['rl_bob']);
select public.create_room('rl_grp', true, array['rl_bob', 'rl_carol']);
select public.create_room('rl_empty', true, array['rl_carol']);
reset role;
select tests.login_as(tests.uid('rl_carol@test.com'));
select public.create_room('rl_other', false, array['rl_bob']);
reset role;

-- 메시지: dm(bob b1, bob b2, alice a1), grp(carol c1 → 삭제)
select tests.login_as(tests.uid('rl_bob@test.com'));
insert into public.messages (room_id, content) values (tests.room_id('rl_dm'), 'b1'), (tests.room_id('rl_dm'), 'b2');
reset role;
select tests.login_as(tests.uid('rl_alice@test.com'));
insert into public.messages (room_id, content) values (tests.room_id('rl_dm'), 'a1');
reset role;
select tests.login_as(tests.uid('rl_carol@test.com'));
insert into public.messages (room_id, content) values (tests.room_id('rl_grp'), 'c1');
reset role;
update public.messages set deleted_at = now(), content = '' where content = 'c1';

-- 같은 트랜잭션의 now()는 같으므로 시각을 직접 정한다: grp(10분 전) > dm(1시간 전) > empty(생성 2시간 전)
update public.messages set created_at = now() - interval '1 hour' where room_id = tests.room_id('rl_dm');
update public.messages set created_at = now() - interval '10 minutes' where room_id = tests.room_id('rl_grp');
update public.chat_rooms set created_at = now() - interval '2 hours' where id = tests.room_id('rl_empty');

select tests.login_as(tests.uid('rl_alice@test.com'));
select is((select count(*)::int from public.list_my_rooms()), 3, '참여 방만 3개');
select ok(not exists (select 1 from public.list_my_rooms() where name = 'rl_other'), '남의 방 제외');
select is((select array_agg(name) from public.list_my_rooms()), array['rl_grp', 'rl_dm', 'rl_empty'], '최근 활동 순');
select is((select unread_count from public.list_my_rooms() where name = 'rl_dm'), 2, '안 읽은 수: 내 메시지 제외');
select is((select last_message_content from public.list_my_rooms() where name = 'rl_dm'), 'a1', '마지막 메시지');
select is((select member_count from public.list_my_rooms() where name = 'rl_grp'), 3, '인원 수');
select ok((select last_message_deleted and last_message_content is null from public.list_my_rooms() where name = 'rl_grp'), '삭제된 마지막 메시지는 내용 없음');
select is((select unread_count from public.list_my_rooms() where name = 'rl_grp'), 0, '삭제된 메시지는 안 읽은 수 제외');
select ok((select last_message_id is null and unread_count = 0 from public.list_my_rooms() where name = 'rl_empty'), '메시지 없는 방');
reset role;

-- 읽음 위치 반영: b1까지 읽음 → 1
update public.chat_room_participants set last_read_message_id = (select id from public.messages where content = 'b1')
where room_id = tests.room_id('rl_dm') and user_id = tests.uid('rl_alice@test.com');
select tests.login_as(tests.uid('rl_alice@test.com'));
select is((select unread_count from public.list_my_rooms() where name = 'rl_dm'), 1, '읽음 위치 이후만 셈');
reset role;

-- 정지 세션 거부, anon 실행 불가
insert into private.user_access (user_id, banned_until) values (tests.uid('rl_alice@test.com'), now() + interval '1 day');
select tests.login_as(tests.uid('rl_alice@test.com'));
select throws_ok($$ select * from public.list_my_rooms() $$, 'P0001', 'AUTH_SESSION_REVOKED', '정지 세션 거부');
reset role;
select ok(not has_function_privilege('anon', 'public.list_my_rooms()', 'execute'), 'anon 실행 불가');

select * from finish();
rollback;
```

- [ ] **Step 2: 실패하는 pgTAP — 1:1 방**

`supabase/tests/database/140_direct_room.test.sql`:
```sql
begin;
select plan(10);

select tests.create_user('dr_alice@test.com', '{"username":"dr_alice"}');
select tests.create_user('dr_bob@test.com', '{"username":"dr_bob"}');
-- 반환된 방 id는 트랜잭션 로컬 설정값(t.*)에 담는다(역할 전환과 무관하게 읽힘).
create or replace function pg_temp.room(p_tag text) returns bigint language sql as $$ select current_setting('t.' || p_tag)::bigint $$;

-- alice·bob만 있는 그룹방이 먼저 있어도 1:1로 재사용하지 않는다
select tests.login_as(tests.uid('dr_alice@test.com'));
select public.create_room('dr_group', true, array['dr_bob']);
select set_config('t.first', public.open_direct_room('dr_bob')::text, true);
select set_config('t.again', public.open_direct_room('dr_bob')::text, true);
reset role;

select ok(pg_temp.room('first') <> tests.room_id('dr_group'), '그룹방은 재사용 안 함');
select ok((select not is_group from public.chat_rooms where id = pg_temp.room('first')), '1:1 방 생성');
select is((select count(*)::int from public.chat_room_participants where room_id = pg_temp.room('first')), 2, '참여자 2명');
select is(pg_temp.room('again'), pg_temp.room('first'), '다시 열면 같은 방');

select tests.login_as(tests.uid('dr_bob@test.com'));
select set_config('t.reverse', public.open_direct_room('  DR_ALICE ')::text, true);
reset role;
select is(pg_temp.room('reverse'), pg_temp.room('first'), '상대가 열어도 같은 방(대소문자·공백 무시)');

select tests.login_as(tests.uid('dr_alice@test.com'));
select throws_ok($$ select public.open_direct_room('dr_alice') $$, 'P0001', 'ROOM_INVALID_PARTICIPANTS', '본인 거부');
select throws_ok($$ select public.open_direct_room('nobody_here') $$, 'P0001', 'ROOM_INVALID_PARTICIPANTS', '없는 사용자 거부');
reset role;

-- bob이 나간 방은 재사용하지 않는다
select tests.login_as(tests.uid('dr_bob@test.com'));
select public.leave_room(current_setting('t.first')::bigint); -- authenticated 역할에서는 pg_temp 함수 대신 직접 읽는다
reset role;
select tests.login_as(tests.uid('dr_alice@test.com'));
select set_config('t.after_leave', public.open_direct_room('dr_bob')::text, true);
reset role;
select ok(pg_temp.room('after_leave') <> pg_temp.room('first'), '상대가 나간 방은 새로 만듦');
select is((select count(*)::int from public.chat_room_participants where room_id = pg_temp.room('after_leave')), 2, '새 방 참여자 2명');
select ok(not has_function_privilege('anon', 'public.open_direct_room(text)', 'execute'), 'anon 실행 불가');

select * from finish();
rollback;
```

- [ ] **Step 3: 실패 확인**

Run (루트): `npx -y supabase@2.120.0 test db < /dev/null 2>&1 | tail -20`
Expected: 130·140 FAIL(`function public.list_my_rooms() does not exist` 등), 나머지 PASS.

- [ ] **Step 4: 마이그레이션 작성**

`supabase/migrations/<ts>_room_list.sql`:
```sql
-- 채팅 목록 요약과 1:1 방 열기(모바일 UI 개편 스펙 §5).

-- 내가 참여한 방의 요약: 마지막 메시지(삭제 포함)·안 읽은 수(남이 보낸, 삭제 안 된, 내 읽음 위치 이후)·인원 수.
create or replace function public.list_my_rooms()
returns table (
  room_id bigint, name text, is_group boolean, created_at timestamptz, member_count int,
  last_message_id bigint, last_message_content text, last_message_deleted boolean,
  last_message_sender_id uuid, last_message_at timestamptz, unread_count int
)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
begin
  perform private.require_active_session();
  return query
  select r.id, r.name, r.is_group, r.created_at,
         (select count(*)::int from public.chat_room_participants c where c.room_id = r.id),
         lm.id,
         case when lm.deleted_at is null then lm.content end,
         lm.id is not null and lm.deleted_at is not null,
         lm.sender_id, lm.created_at,
         (select count(*)::int from public.messages m
           where m.room_id = r.id
             and m.id > coalesce(me.last_read_message_id, 0)
             and m.sender_id is distinct from auth.uid()
             and m.deleted_at is null)
  from public.chat_room_participants me
  join public.chat_rooms r on r.id = me.room_id
  left join lateral (
    select m.id, m.content, m.deleted_at, m.sender_id, m.created_at
    from public.messages m where m.room_id = r.id
    order by m.id desc limit 1
  ) lm on true
  where me.user_id = auth.uid()
  order by coalesce(lm.created_at, r.created_at) desc, r.id desc;
end;
$$;
revoke execute on function public.list_my_rooms() from public, anon;
grant execute on function public.list_my_rooms() to authenticated;

-- 친구와의 1:1 방을 연다: 두 사람이 모두 남아 있는 1:1 방이 있으면 그 방, 없으면 새로 만든다.
create or replace function public.open_direct_room(p_username text) returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_me uuid := auth.uid();
  v_other uuid;
  v_other_name text;
  v_room bigint;
begin
  perform private.require_active_session();

  select p.id, p.username into v_other, v_other_name
  from public.profiles p where p.username = lower(trim(coalesce(p_username, '')));
  if v_other is null then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '존재하지 않는 사용자입니다.';
  end if;
  if v_other = v_me then
    raise exception 'ROOM_INVALID_PARTICIPANTS' using hint = '자기 자신과는 대화할 수 없습니다.';
  end if;

  -- 두 사람이 동시에 눌러도 방이 하나만 생기도록 쌍 단위로 직렬화한다.
  perform pg_advisory_xact_lock(hashtextextended(
    'dm:' || least(v_me::text, v_other::text) || ':' || greatest(v_me::text, v_other::text), 0));

  select r.id into v_room
  from public.chat_rooms r
  where not r.is_group
    and exists (select 1 from public.chat_room_participants a where a.room_id = r.id and a.user_id = v_me)
    and exists (select 1 from public.chat_room_participants b where b.room_id = r.id and b.user_id = v_other)
  order by r.id desc limit 1;
  if v_room is not null then
    return v_room;
  end if;

  return public.create_room(null, false, array[v_other_name]);
end;
$$;
revoke execute on function public.open_direct_room(text) from public, anon;
grant execute on function public.open_direct_room(text) to authenticated;
```

- [ ] **Step 5: 적용 후 통과 확인**

Run (루트):
```bash
npx -y supabase@2.120.0 migration up --local < /dev/null
npx -y supabase@2.120.0 test db < /dev/null 2>&1 | tail -5
npx -y supabase@2.120.0 db advisors --local < /dev/null 2>&1 | grep -c '"level":"ERROR"'
```
Expected: `Result: PASS`(157 + 22 = 179), advisors ERROR 0(WARN의 `authenticated_security_definer_function_executable`은 기존과 같은 의도된 경고).

- [ ] **Step 6: 타입 재생성**

Run (루트): `npx -y supabase@2.120.0 gen types --local --lang typescript --schema public < /dev/null > client/src/lib/supabase/database.types.ts`
그다음 `client/`에서 `pnpm exec tsc --noEmit` → 0 에러. `git diff --stat client/src/lib/supabase/database.types.ts`에 `list_my_rooms`·`open_direct_room`만 추가돼야 한다(다른 변화가 있으면 원인 확인).

- [ ] **Step 7: 커밋**

```bash
git add supabase/migrations supabase/tests/database/130_room_list.test.sql supabase/tests/database/140_direct_room.test.sql client/src/lib/supabase/database.types.ts
git commit -m "feat(db): 채팅 목록 요약 list_my_rooms, 1:1 방 열기 open_direct_room

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: services — 요약·1:1·닉네임

**Files:**
- Modify: `client/src/types/domain.ts`, `client/src/services/mappers.ts`, `client/src/services/mappers.test.ts`, `client/src/services/rooms.ts`, `client/scripts/verify-chat.mjs`
- Create: `client/src/services/profile.ts`, `client/src/services/profile-rules.ts`, `client/src/services/profile-rules.test.ts`

**Interfaces:**
- Consumes: Task 1 RPC.
- Produces:
  - `type RoomSummary = { id: number; name: string | null; isGroup: boolean; createdAt: string; memberCount: number; lastMessage: { id: number; content: string; deleted: boolean; senderId: string | null; at: string } | null; unreadCount: number }`
  - `toRoomSummary(row: RoomSummaryRow): RoomSummary`
  - `listMyRooms(): Promise<RoomSummary[]>`, `openDirectRoom(username: string): Promise<number>`
  - `normalizeNickname(input: string): string | null` (공백 제거, 빈 값 → null, 21자 이상 → `VALIDATION_FAILED` DomainError throw), `updateNickname(input: string): Promise<void>`

- [ ] **Step 1: 실패하는 단위 테스트**

`client/src/services/mappers.test.ts` 맨 아래에 추가(import에 `toRoomSummary` 추가):
```ts
test("방 요약 행은 RoomSummary로, 메시지 없는 방은 lastMessage null", () => {
  const base = {
    room_id: 7, name: null, is_group: false, created_at: "2026-10-15T00:00:00Z", member_count: 2,
    last_message_id: null, last_message_content: null, last_message_deleted: false,
    last_message_sender_id: null, last_message_at: null, unread_count: 0,
  };
  assert.deepEqual(toRoomSummary(base), {
    id: 7, name: null, isGroup: false, createdAt: "2026-10-15T00:00:00Z", memberCount: 2, lastMessage: null, unreadCount: 0,
  });
  assert.deepEqual(
    toRoomSummary({ ...base, last_message_id: 3, last_message_content: null, last_message_deleted: true, last_message_sender_id: "u", last_message_at: "2026-10-15T01:00:00Z", unread_count: 4 }).lastMessage,
    { id: 3, content: "", deleted: true, senderId: "u", at: "2026-10-15T01:00:00Z" },
  );
});
```
`client/src/services/profile-rules.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeNickname } from "./profile-rules.ts";

test("닉네임: 앞뒤 공백 제거, 빈 값은 null, 20자까지", () => {
  assert.equal(normalizeNickname("  동현 "), "동현");
  assert.equal(normalizeNickname("   "), null);
  assert.equal(normalizeNickname("가".repeat(20)), "가".repeat(20));
  assert.throws(() => normalizeNickname("가".repeat(21)), (e: { code?: string }) => e.code === "VALIDATION_FAILED");
});
```
(규칙은 Supabase import가 없는 `services/profile-rules.ts`에 둔다 — Node 테스트가 직접 import)

- [ ] **Step 2: 실패 확인**

Run (client/): `pnpm test 2>&1 | tail -15`
Expected: `toRoomSummary`·`profile-rules.ts` 없음으로 FAIL.

- [ ] **Step 3: 구현**

`client/src/types/domain.ts` — `Room` 정의 아래에 추가:
```ts
// 채팅 목록 한 줄(list_my_rooms). 참여자·표시 이름은 Room(listRooms)과 합쳐서 쓴다.
export type RoomSummary = {
  id: number;
  name: string | null;
  isGroup: boolean;
  createdAt: string;
  memberCount: number;
  lastMessage: { id: number; content: string; deleted: boolean; senderId: string | null; at: string } | null;
  unreadCount: number;
};
```
`client/src/services/mappers.ts` — import 목록에 `RoomSummary` 추가, 파일 끝에:
```ts
export type RoomSummaryRow = {
  room_id: number;
  name: string | null;
  is_group: boolean;
  created_at: string;
  member_count: number;
  last_message_id: number | null;
  last_message_content: string | null;
  last_message_deleted: boolean;
  last_message_sender_id: string | null;
  last_message_at: string | null;
  unread_count: number;
};

export const toRoomSummary = (r: RoomSummaryRow): RoomSummary => ({
  id: r.room_id,
  name: r.name,
  isGroup: r.is_group,
  createdAt: r.created_at,
  memberCount: r.member_count,
  lastMessage:
    r.last_message_id === null || r.last_message_at === null
      ? null
      : {
          id: r.last_message_id,
          content: r.last_message_content ?? "",
          deleted: r.last_message_deleted,
          senderId: r.last_message_sender_id,
          at: r.last_message_at,
        },
  unreadCount: r.unread_count,
});
```
`client/src/services/rooms.ts` — import에 `RoomSummary`, `toRoomSummary` 추가, 파일 끝에:
```ts
// 채팅 목록 요약(최근 활동 순). 안 읽은 수는 서버 기준(남이 보낸·삭제 안 된·내 읽음 위치 이후).
export async function listMyRooms(): Promise<RoomSummary[]> {
  const { data, error } = await createClient().rpc("list_my_rooms");
  if (error) throw toDomainError(error);
  return data.map(toRoomSummary);
}

// 친구와의 1:1 방(있으면 그 방, 없으면 생성)
export async function openDirectRoom(username: string): Promise<number> {
  const { data, error } = await createClient().rpc("open_direct_room", { p_username: username });
  if (error) throw toDomainError(error);
  return data;
}
```
`client/src/services/profile-rules.ts`:
```ts
import type { DomainError } from "../types/domain.ts";

export const NICKNAME_MAX = 20;

// 빈 값이면 null(아이디가 대신 보인다). 길이는 화면·서버 공통 규칙.
export const normalizeNickname = (input: string): string | null => {
  const v = input.trim();
  if (v === "") return null;
  if ([...v].length > NICKNAME_MAX) {
    const e: DomainError = { code: "VALIDATION_FAILED", message: `닉네임은 ${NICKNAME_MAX}자까지예요.` };
    throw e;
  }
  return v;
};
```
`client/src/services/profile.ts`:
```ts
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "./auth";
import { toDomainError } from "./errors";
import { normalizeNickname } from "./profile-rules";

// 내 프로필 경계. profiles 본인 update(nickname) 권한은 DB에 이미 있다(선행 스펙 §3).
export async function updateNickname(input: string): Promise<void> {
  const nickname = normalizeNickname(input);
  const me = await getCurrentUserId();
  const { error } = await createClient().from("profiles").update({ nickname }).eq("id", me);
  if (error) throw toDomainError(error);
}
```

- [ ] **Step 4: 통과 확인**

Run (client/): `pnpm test 2>&1 | tail -5` → 36 pass. `pnpm exec tsc --noEmit` → 0.

- [ ] **Step 5: verify-chat 확장**

`client/scripts/verify-chat.mjs` — import에 `toRoomSummary` 추가하고 `// 나가기 → …` 줄 바로 위에:
```js
// 채팅 목록 요약 + 1:1 방 재사용 (모바일 UI 스펙 §5)
const summary = (await ok(u1.client.rpc("list_my_rooms"))).map(toRoomSummary).find((s) => s.id === roomId);
assert.ok(summary, "참여 방이 요약 목록에 있다");
assert.equal(summary.memberCount, 2, "요약 인원 수");
assert.ok(summary.lastMessage !== null, "요약 마지막 메시지");
assert.equal(typeof summary.unreadCount, "number", "요약 안 읽은 수");
assert.equal(await ok(u1.client.rpc("open_direct_room", { p_username: u2.username })), roomId, "기존 1:1 방 재사용");
assert.equal(await ok(u2.client.rpc("open_direct_room", { p_username: u1.username })), roomId, "상대도 같은 방");
```
Run (client/, 로컬 Supabase 실행 중): `pnpm verify 2>&1 | tail -6` → 5개 모두 `OK`.

- [ ] **Step 6: 커밋**

```bash
git add client/src/types/domain.ts client/src/services client/scripts/verify-chat.mjs
git commit -m "feat(services): 채팅 목록 요약·1:1 방 열기·닉네임 수정

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: 순수 로직 — 표시 형식·묶기·목록 반영·주소·이동

**Files:**
- Create: `client/src/lib/format.ts`, `format.test.ts`, `message-groups.ts`, `message-groups.test.ts`, `room-list.ts`, `room-list.test.ts`, `nav.ts`, `nav.test.ts`
- Modify: `client/src/lib/push-url.ts`, `push-url.test.ts`

**Interfaces:**
- Consumes: `RoomSummary`, `RoomEvent`(domain), `MessageView`(chat-state).
- Produces:
  - `formatListTime(iso: string, now?: Date): string`, `formatClock(iso: string): string`, `formatDateDivider(iso: string): string`, `badgeText(n: number): string | null`, `previewText(s: RoomSummary, ctx: { me: string; senderName: (id: string) => string }): string`
  - `type TimelineItem = { kind: "date"; key: string; label: string } | { kind: "message"; key: string; view: MessageView; first: boolean; last: boolean }`; `buildTimeline(views: MessageView[]): TimelineItem[]`; `GROUP_GAP_MS = 300_000`
  - `sortSummaries(list: RoomSummary[]): RoomSummary[]`; `applyRoomEvent(list: RoomSummary[], e: RoomEvent, ctx: { me: string; isViewing: (roomId: number) => boolean }): { list: RoomSummary[]; refetch: boolean }`; `totalUnread(list: RoomSummary[]): number`
  - `roomPath(id: number): string` (`/chat/rooms/<id>`)
  - `markInAppNav(store?: Storage): void`, `consumeInAppNav(store?: Storage): boolean` (키 `dongchat.inAppNav`)

- [ ] **Step 1: 실패하는 테스트**

`client/src/lib/format.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeText, formatDateDivider, formatListTime, previewText } from "./format.ts";
import type { RoomSummary } from "../types/domain.ts";

const now = new Date(2026, 9, 15, 18, 0); // 로컬 2026-10-15 18:00
const iso = (...a: [number, number, number, number, number]) => new Date(...a).toISOString();

test("목록 시간: 오늘=시각, 어제, 올해=월일, 이전=연월일", () => {
  assert.equal(formatListTime(iso(2026, 9, 15, 15, 12), now), "오후 3:12");
  assert.equal(formatListTime(iso(2026, 9, 15, 0, 5), now), "오전 12:05");
  assert.equal(formatListTime(iso(2026, 9, 14, 23, 59), now), "어제");
  assert.equal(formatListTime(iso(2026, 9, 9, 10, 0), now), "10월 9일");
  assert.equal(formatListTime(iso(2025, 11, 3, 10, 0), now), "2025. 12. 3.");
});

test("날짜 구분선은 요일까지", () => {
  assert.equal(formatDateDivider(iso(2026, 9, 15, 9, 0)), "2026년 10월 15일 목요일");
});

test("배지: 0은 숨김, 100부터 99+", () => {
  assert.equal(badgeText(0), null);
  assert.equal(badgeText(7), "7");
  assert.equal(badgeText(99), "99");
  assert.equal(badgeText(100), "99+");
});

test("미리보기: 없음·삭제·그룹 보낸사람·내 메시지·1:1", () => {
  const s: RoomSummary = { id: 1, name: "g", isGroup: true, createdAt: "", memberCount: 3, lastMessage: null, unreadCount: 0 };
  const ctx = { me: "me", senderName: (id: string) => (id === "u2" ? "준호" : "?") };
  assert.equal(previewText(s, ctx), "아직 메시지가 없어요");
  const msg = { id: 1, content: "사진 올렸어", deleted: false, senderId: "u2", at: "" };
  assert.equal(previewText({ ...s, lastMessage: { ...msg, deleted: true, content: "" } }, ctx), "삭제된 메시지입니다");
  assert.equal(previewText({ ...s, lastMessage: msg }, ctx), "준호: 사진 올렸어");
  assert.equal(previewText({ ...s, lastMessage: { ...msg, senderId: "me" } }, ctx), "사진 올렸어");
  assert.equal(previewText({ ...s, isGroup: false, lastMessage: msg }, ctx), "사진 올렸어");
});
```
`client/src/lib/message-groups.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildTimeline } from "./message-groups.ts";
import type { MessageView } from "./chat-state.ts";

const v = (id: number, senderId: string, at: Date, deleted = false): MessageView => ({
  id, roomId: 1, senderId, content: `m${id}`, replyToId: null, editedAt: null,
  deletedAt: deleted ? at.toISOString() : null, createdAt: at.toISOString(),
  senderName: senderId, isMine: senderId === "me", unreadCount: null, replyTo: null,
});

test("날짜가 바뀌면 구분선, 같은 사람 5분 이내는 한 묶음", () => {
  const d = (h: number, m: number, day = 15) => new Date(2026, 9, day, h, m);
  const items = buildTimeline([v(1, "a", d(9, 0, 14)), v(2, "a", d(9, 0)), v(3, "a", d(9, 4)), v(4, "a", d(9, 10)), v(5, "b", d(9, 11))]);
  assert.deepEqual(items.map((i) => (i.kind === "date" ? `D:${i.label}` : `${i.view.id}${i.first ? "F" : ""}${i.last ? "L" : ""}`)), [
    "D:2026년 10월 14일 수요일", "1FL",
    "D:2026년 10월 15일 목요일", "2F", "3L", "4FL", "5FL",
  ]);
});

test("삭제된 메시지는 묶음을 끊는다", () => {
  const t = new Date(2026, 9, 15, 9, 0);
  const items = buildTimeline([v(1, "a", t), v(2, "a", t, true), v(3, "a", t)]).filter((i) => i.kind === "message");
  assert.deepEqual(items.map((i) => (i.kind === "message" ? [i.first, i.last] : null)), [[true, true], [true, true], [true, true]]);
});
```
`client/src/lib/room-list.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { applyRoomEvent, sortSummaries, totalUnread } from "./room-list.ts";
import type { ChatMessage, RoomSummary } from "../types/domain.ts";

const s = (id: number, at: string | null, unread = 0, createdAt = "2026-10-01T00:00:00Z"): RoomSummary => ({
  id, name: null, isGroup: false, createdAt, memberCount: 2, unreadCount: unread,
  lastMessage: at === null ? null : { id: id * 10, content: "x", deleted: false, senderId: "u", at },
});
const msg = (roomId: number, id: number, senderId: string): ChatMessage => ({
  id, roomId, senderId, content: "새", replyToId: null, editedAt: null, deletedAt: null, createdAt: "2026-10-15T10:00:00Z",
});
const ctx = { me: "me", isViewing: () => false };

test("정렬: 마지막 메시지(없으면 생성) 시각 내림차순, 같으면 id 내림차순", () => {
  const list = sortSummaries([s(1, "2026-10-14T00:00:00Z"), s(2, null, 0, "2026-10-15T00:00:00Z"), s(3, "2026-10-14T00:00:00Z")]);
  assert.deepEqual(list.map((r) => r.id), [2, 3, 1]);
});

test("새 메시지: 맨 위로, 남의 메시지면 +1, 내 것·보고 있는 방은 그대로", () => {
  const list = [s(1, "2026-10-15T09:00:00Z"), s(2, "2026-10-14T00:00:00Z", 3)];
  const a = applyRoomEvent(list, { type: "message", roomId: 2, message: msg(2, 100, "u2") }, ctx);
  assert.deepEqual(a.list.map((r) => [r.id, r.unreadCount]), [[2, 4], [1, 0]]);
  assert.equal(a.list[0].lastMessage?.content, "새");
  assert.equal(a.refetch, false);
  assert.equal(applyRoomEvent(list, { type: "message", roomId: 2, message: msg(2, 100, "me") }, ctx).list[0].unreadCount, 3);
  assert.equal(applyRoomEvent(list, { type: "message", roomId: 2, message: msg(2, 100, "u2") }, { ...ctx, isViewing: (id) => id === 2 }).list[0].unreadCount, 3);
});

test("같은 메시지가 두 번 와도 한 번만 센다", () => {
  const once = applyRoomEvent([s(2, "2026-10-14T00:00:00Z", 0)], { type: "message", roomId: 2, message: msg(2, 100, "u2") }, ctx).list;
  const twice = applyRoomEvent(once, { type: "message", roomId: 2, message: msg(2, 100, "u2") }, ctx);
  assert.equal(twice.list[0].unreadCount, 1);
  assert.equal(twice.list, once);
});

test("모르는 방·삭제·멤버 변동·재구독은 다시 불러오기", () => {
  const list = [s(1, "2026-10-15T09:00:00Z")];
  assert.equal(applyRoomEvent(list, { type: "message", roomId: 9, message: msg(9, 1, "u2") }, ctx).refetch, true);
  assert.equal(applyRoomEvent(list, { type: "message_deleted", roomId: 1, id: 10 }, ctx).refetch, true);
  assert.equal(applyRoomEvent(list, { type: "member_removed", roomId: 1, userId: "u2" }, ctx).refetch, true);
  assert.equal(applyRoomEvent(list, { type: "subscribed", roomId: 1 }, ctx).refetch, true);
});

test("수정은 마지막 메시지일 때만 미리보기 갱신, 내 읽음은 0", () => {
  const list = [s(1, "2026-10-15T09:00:00Z", 5)];
  assert.equal(applyRoomEvent(list, { type: "message_edited", roomId: 1, id: 10, content: "고침", editedAt: "" }, ctx).list[0].lastMessage?.content, "고침");
  assert.equal(applyRoomEvent(list, { type: "message_edited", roomId: 1, id: 9, content: "고침", editedAt: "" }, ctx).list, list);
  assert.equal(applyRoomEvent(list, { type: "read_update", roomId: 1, userId: "me", lastReadMessageId: 10 }, ctx).list[0].unreadCount, 0);
  assert.equal(applyRoomEvent(list, { type: "read_update", roomId: 1, userId: "u2", lastReadMessageId: 10 }, ctx).list, list);
});

test("전체 안 읽은 수", () => {
  assert.equal(totalUnread([s(1, null, 2), s(2, null, 5)]), 7);
});
```
`client/src/lib/nav.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { consumeInAppNav, markInAppNav } from "./nav.ts";

const memory = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, get length() { return m.size; } };
};

test("앱 안 이동 표시는 한 번만 소비된다", () => {
  const store = memory();
  assert.equal(consumeInAppNav(store), false);
  markInAppNav(store);
  assert.equal(consumeInAppNav(store), true);
  assert.equal(consumeInAppNav(store), false);
});
```
`client/src/lib/push-url.test.ts`에 추가(import에 `roomPath`):
```ts
test("방 주소", () => {
  assert.equal(roomPath(42), "/chat/rooms/42");
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test 2>&1 | tail -15` → 새 파일들 모듈 없음으로 FAIL.

- [ ] **Step 3: 구현**

`client/src/lib/format.ts`:
```ts
import type { RoomSummary } from "../types/domain.ts";

// 화면 표시 문자열. 기기 시간대·ko-KR 기준.
const clock = new Intl.DateTimeFormat("ko-KR", { hour: "numeric", minute: "2-digit" });
const monthDay = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" });
const fullDate = new Intl.DateTimeFormat("ko-KR", { year: "numeric", month: "numeric", day: "numeric" });
const divider = new Intl.DateTimeFormat("ko-KR", { dateStyle: "full" });

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

export const formatClock = (iso: string): string => clock.format(new Date(iso));

export const formatListTime = (iso: string, now: Date = new Date()): string => {
  const d = new Date(iso);
  if (dayKey(d) === dayKey(now)) return clock.format(d);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dayKey(d) === dayKey(yesterday)) return "어제";
  if (d.getFullYear() === now.getFullYear()) return monthDay.format(d);
  return fullDate.format(d);
};

export const formatDateDivider = (iso: string): string => divider.format(new Date(iso));

export const badgeText = (n: number): string | null => (n <= 0 ? null : n > 99 ? "99+" : String(n));

export const previewText = (s: RoomSummary, ctx: { me: string; senderName: (id: string) => string }): string => {
  const m = s.lastMessage;
  if (!m) return "아직 메시지가 없어요";
  if (m.deleted) return "삭제된 메시지입니다";
  if (s.isGroup && m.senderId && m.senderId !== ctx.me) return `${ctx.senderName(m.senderId)}: ${m.content}`;
  return m.content;
};
```
`client/src/lib/message-groups.ts`:
```ts
import { formatDateDivider } from "./format.ts";
import type { MessageView } from "./chat-state.ts";

export const GROUP_GAP_MS = 5 * 60_000;

export type TimelineItem =
  | { kind: "date"; key: string; label: string }
  | { kind: "message"; key: string; view: MessageView; first: boolean; last: boolean };

const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

// 같은 보낸이·같은 날·5분 이내·둘 다 삭제 안 됨이면 이어진 묶음. first = 이름/아바타, last = 시간/안 읽은 수.
const joins = (a: MessageView, b: MessageView) =>
  a.senderId === b.senderId &&
  a.deletedAt === null &&
  b.deletedAt === null &&
  sameDay(a.createdAt, b.createdAt) &&
  new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime() <= GROUP_GAP_MS;

export const buildTimeline = (views: MessageView[]): TimelineItem[] => {
  const items: TimelineItem[] = [];
  views.forEach((view, i) => {
    const prev = views[i - 1];
    const next = views[i + 1];
    if (!prev || !sameDay(prev.createdAt, view.createdAt)) {
      items.push({ kind: "date", key: `d-${view.id}`, label: formatDateDivider(view.createdAt) });
    }
    items.push({
      kind: "message",
      key: `m-${view.id}`,
      view,
      first: !prev || !joins(prev, view),
      last: !next || !joins(view, next),
    });
  });
  return items;
};
```
`client/src/lib/room-list.ts`:
```ts
import type { RoomEvent, RoomSummary } from "../types/domain.ts";

// 채팅 목록 요약 캐시를 실시간 이벤트로 갱신하는 순수 함수. 서버가 기준이고, 확신할 수 없으면 refetch.
const activity = (r: RoomSummary) => new Date(r.lastMessage?.at ?? r.createdAt).getTime();

export const sortSummaries = (list: RoomSummary[]): RoomSummary[] =>
  [...list].sort((a, b) => activity(b) - activity(a) || b.id - a.id);

export const totalUnread = (list: RoomSummary[]): number => list.reduce((n, r) => n + r.unreadCount, 0);

const replace = (list: RoomSummary[], i: number, next: RoomSummary) => list.map((r, j) => (j === i ? next : r));

export const applyRoomEvent = (
  list: RoomSummary[],
  e: RoomEvent,
  ctx: { me: string; isViewing: (roomId: number) => boolean },
): { list: RoomSummary[]; refetch: boolean } => {
  const i = list.findIndex((r) => r.id === e.roomId);
  switch (e.type) {
    case "message": {
      if (i < 0) return { list, refetch: true };
      const r = list[i];
      const m = e.message;
      if (r.lastMessage && r.lastMessage.id >= m.id) return { list, refetch: false }; // 중복·늦게 온 이벤트
      const counts = m.senderId !== ctx.me && !ctx.isViewing(r.id);
      return {
        list: sortSummaries(
          replace(list, i, {
            ...r,
            lastMessage: { id: m.id, content: m.content, deleted: false, senderId: m.senderId, at: m.createdAt },
            unreadCount: r.unreadCount + (counts ? 1 : 0),
          }),
        ),
        refetch: false,
      };
    }
    case "message_edited": {
      const r = list[i];
      if (!r || r.lastMessage?.id !== e.id) return { list, refetch: false };
      return { list: replace(list, i, { ...r, lastMessage: { ...r.lastMessage, content: e.content } }), refetch: false };
    }
    case "read_update": {
      const r = list[i];
      if (!r || e.userId !== ctx.me || r.unreadCount === 0) return { list, refetch: false };
      return { list: replace(list, i, { ...r, unreadCount: 0 }), refetch: false };
    }
    // 삭제(보낸이·읽음 여부를 모름)·멤버 변동·재구독(놓친 이벤트)은 서버에서 다시 받는다.
    case "message_deleted":
    case "member_removed":
    case "subscribed":
      return { list, refetch: true };
  }
};
```
`client/src/lib/nav.ts`:
```ts
// 방 화면의 ‹: 앱 안에서 들어왔으면 history.back, 알림·직접 주소로 들어왔으면 목록으로 replace.
const KEY = "dongchat.inAppNav";

const session = (): Storage | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

export const markInAppNav = (store: Storage | null = session()): void => {
  try {
    store?.setItem(KEY, "1");
  } catch {
    // 저장 불가(사파리 개인정보 보호 모드 등)면 ‹가 목록으로 replace한다
  }
};

export const consumeInAppNav = (store: Storage | null = session()): boolean => {
  try {
    const hit = store?.getItem(KEY) === "1";
    store?.removeItem(KEY);
    return hit;
  } catch {
    return false;
  }
};
```
`client/src/lib/push-url.ts` 끝에 추가하고 첫 줄 주석을 바꾼다:
```ts
// 예전 푸시 알림 클릭 URL(/chat/rooms?room=<id>)에서 열 방 id를 읽는다(새 주소로 넘기기용). 잘못된 값은 무시(null).
```
```ts
export const roomPath = (id: number): string => `/chat/rooms/${id}`;
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test 2>&1 | tail -5` → 모두 pass(36 + 12 = 48 근처; 숫자를 ledger에 기록). `pnpm exec tsc --noEmit` 0.

- [ ] **Step 5: 커밋**

```bash
git add client/src/lib
git commit -m "feat(lib): 목록 시간·배지·미리보기, 메시지 묶기, 목록 실시간 반영, 방 주소·앱 안 이동

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: 테마 — 팔레트 토큰, 밝기, 글꼴, theme-color

**Files:**
- Create: `client/src/lib/theme.ts`, `client/src/lib/theme.test.ts`, `client/src/hooks/usePalette.ts`
- Modify: `client/src/app/globals.css`, `client/src/app/layout.tsx`, `client/src/components/providers.tsx`

**Interfaces:**
- Produces: `PALETTES`, `type Palette = "mint" | "blue" | "dusk"`, `DEFAULT_PALETTE`, `PALETTE_LABELS`, `PALETTE_STORAGE_KEY = "dongchat.palette"`, `THEME_TOKENS`, `isPalette(v: unknown): v is Palette`, `paletteCss(): string`, `paletteBootScript: string`, `contrastRatio(a: string, b: string): number`; `usePalette(): { palette: Palette; setPalette(p: Palette): void }`. Tailwind 색: `bg-bubble-me`, `text-bubble-me-foreground`, `bg-bubble-them`.

- [ ] **Step 1: 실패하는 테스트**

`client/src/lib/theme.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PALETTES, THEME_TOKENS, contrastRatio, isPalette, paletteBootScript, paletteCss } from "./theme.ts";

test("모든 팔레트·밝기에서 글자 대비 4.5:1 이상", () => {
  for (const p of PALETTES) {
    for (const mode of ["light", "dark"] as const) {
      const t = THEME_TOKENS[p][mode];
      const pairs: [string, string, string][] = [
        ["본문", t.foreground, t.background],
        ["보조 글자", t.mutedForeground, t.background],
        ["버튼", t.primaryForeground, t.primary],
        ["내 말풍선", t.bubbleMeForeground, t.bubbleMe],
        ["상대 말풍선", t.foreground, t.bubbleThem],
      ];
      for (const [label, fg, bg] of pairs) {
        assert.ok(contrastRatio(fg, bg) >= 4.5, `${p}/${mode} ${label} ${fg} on ${bg} = ${contrastRatio(fg, bg).toFixed(2)}`);
      }
    }
  }
});

test("대비 계산 기준값", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
});

test("CSS: 기본 팔레트는 :root, 나머지는 data-palette, 다크는 .dark", () => {
  const css = paletteCss();
  assert.match(css, /:root\{--background:#fbfaf7;/);
  assert.match(css, /:root\.dark\{--background:#121816;/);
  assert.match(css, /:root\[data-palette="blue"\]\{/);
  assert.match(css, /:root\[data-palette="dusk"\]\.dark\{/);
  assert.match(css, /--bubble-me:/);
});

test("저장값 검증과 부트 스크립트", () => {
  assert.equal(isPalette("blue"), true);
  assert.equal(isPalette("pink"), false);
  assert.equal(isPalette(null), false);
  assert.match(paletteBootScript, /localStorage\.getItem\("dongchat\.palette"\)/);
  assert.match(paletteBootScript, /\["blue","dusk"\]/); // 기본(mint)은 속성 없이
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm test 2>&1 | tail -8` → theme.ts 없음 FAIL.

- [ ] **Step 3: 구현**

`client/src/lib/theme.ts`:
```ts
// 색 테마 단일 출처. layout이 paletteCss()를 <style>로 내보내고, 테스트가 대비를 검증한다.
// 스펙 §3.1 값에서 대비 미달 4개를 조정: mint/light muted, blue/light primary·bubble-me·muted, dusk/light primary·muted.
export const PALETTES = ["mint", "blue", "dusk"] as const;
export type Palette = (typeof PALETTES)[number];
export const DEFAULT_PALETTE: Palette = "mint";
export const PALETTE_STORAGE_KEY = "dongchat.palette";
export const PALETTE_LABELS: Record<Palette, string> = { mint: "민트", blue: "파랑", dusk: "노을" };

export type ThemeTokens = {
  background: string;
  foreground: string;
  card: string;
  primary: string;
  primaryForeground: string;
  bubbleMe: string;
  bubbleMeForeground: string;
  bubbleThem: string;
  mutedForeground: string;
  border: string;
  destructive: string;
};

export const THEME_TOKENS: Record<Palette, { light: ThemeTokens; dark: ThemeTokens }> = {
  mint: {
    light: { background: "#fbfaf7", foreground: "#1d2a26", card: "#ffffff", primary: "#0f7a63", primaryForeground: "#ffffff", bubbleMe: "#cfeee2", bubbleMeForeground: "#0d3b30", bubbleThem: "#efece5", mutedForeground: "#66736e", border: "#ebe8e1", destructive: "#c2410c" },
    dark: { background: "#121816", foreground: "#e6efeb", card: "#1a221f", primary: "#4cc9a4", primaryForeground: "#0b1512", bubbleMe: "#1f5c4b", bubbleMeForeground: "#e6fff6", bubbleThem: "#1f2a26", mutedForeground: "#86958f", border: "#223029", destructive: "#f87171" },
  },
  blue: {
    light: { background: "#ffffff", foreground: "#14181f", card: "#ffffff", primary: "#2a62f0", primaryForeground: "#ffffff", bubbleMe: "#2a62f0", bubbleMeForeground: "#ffffff", bubbleThem: "#f1f3f7", mutedForeground: "#6b7383", border: "#eef0f4", destructive: "#c2410c" },
    dark: { background: "#10131a", foreground: "#e8ecf4", card: "#171b24", primary: "#6b95ff", primaryForeground: "#0b1020", bubbleMe: "#2f5bd6", bubbleMeForeground: "#ffffff", bubbleThem: "#1c212c", mutedForeground: "#8a93a3", border: "#232936", destructive: "#f87171" },
  },
  dusk: {
    light: { background: "#fff8f4", foreground: "#2a1d18", card: "#ffffff", primary: "#c2452b", primaryForeground: "#ffffff", bubbleMe: "#ffd9cc", bubbleMeForeground: "#4a1d10", bubbleThem: "#f3ebe6", mutedForeground: "#7a6a63", border: "#efe3dc", destructive: "#b91c1c" },
    dark: { background: "#171a26", foreground: "#eef0f7", card: "#1e2231", primary: "#ff7a59", primaryForeground: "#1b1410", bubbleMe: "#ff7a59", bubbleMeForeground: "#1b1410", bubbleThem: "#262a3a", mutedForeground: "#8d93a8", border: "#262a3a", destructive: "#f87171" },
  },
};

export const isPalette = (v: unknown): v is Palette => typeof v === "string" && (PALETTES as readonly string[]).includes(v);

// shadcn 변수 이름 그대로 + 채팅 전용(bubble-*)
const vars = (t: ThemeTokens): string =>
  [
    ["background", t.background], ["foreground", t.foreground],
    ["card", t.card], ["card-foreground", t.foreground],
    ["popover", t.card], ["popover-foreground", t.foreground],
    ["primary", t.primary], ["primary-foreground", t.primaryForeground],
    ["secondary", t.bubbleThem], ["secondary-foreground", t.foreground],
    ["muted", t.bubbleThem], ["muted-foreground", t.mutedForeground],
    ["accent", t.bubbleThem], ["accent-foreground", t.foreground],
    ["destructive", t.destructive],
    ["border", t.border], ["input", t.border], ["ring", t.primary],
    ["bubble-me", t.bubbleMe], ["bubble-me-foreground", t.bubbleMeForeground], ["bubble-them", t.bubbleThem],
  ]
    .map(([k, v]) => `--${k}:${v};`)
    .join("");

// 기본 팔레트는 속성 없이(:root). 다른 팔레트의 라이트 블록이 기본 다크 뒤에 오고 .dark 블록(특이도 높음)이 그 뒤를 덮는다.
export const paletteCss = (): string =>
  PALETTES.flatMap((p) => {
    const base = p === DEFAULT_PALETTE ? ":root" : `:root[data-palette="${p}"]`;
    return [`${base}{${vars(THEME_TOKENS[p].light)}}`, `${base}.dark{${vars(THEME_TOKENS[p].dark)}}`];
  }).join("\n");

// 첫 페인트 전에 data-palette를 맞춘다(깜빡임 방지). 잘못된 저장값·저장소 접근 실패는 기본 팔레트.
export const paletteBootScript = `try{var p=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)});if(${JSON.stringify(
  PALETTES.filter((p) => p !== DEFAULT_PALETTE),
)}.indexOf(p)>=0)document.documentElement.dataset.palette=p}catch(e){}`;

// WCAG 2 상대 휘도 대비
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
```
`client/src/hooks/usePalette.ts`:
```ts
"use client";

import { useCallback, useSyncExternalStore } from "react";
import { DEFAULT_PALETTE, PALETTE_STORAGE_KEY, isPalette, type Palette } from "@/lib/theme";

const EVENT = "dongchat:palette";
const read = (): Palette => {
  const v = document.documentElement.dataset.palette;
  return isPalette(v) ? v : DEFAULT_PALETTE;
};
const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
};

// 색 테마(이 기기에만 저장). 밝기는 next-themes가 따로 관리한다.
export const usePalette = () => {
  const palette = useSyncExternalStore(subscribe, read, () => DEFAULT_PALETTE);
  const setPalette = useCallback((p: Palette) => {
    if (p === DEFAULT_PALETTE) delete document.documentElement.dataset.palette;
    else document.documentElement.dataset.palette = p;
    try {
      localStorage.setItem(PALETTE_STORAGE_KEY, p);
    } catch {
      // 저장 불가면 이번 방문에만 적용
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return { palette, setPalette };
};
```
`client/src/app/globals.css`:
- `@theme inline` 블록에서 `--font-sans: var(--font-geist-sans);`·`--font-mono: var(--font-geist-mono);` 두 줄을 지우고 다음을 넣는다:
```css
  --font-sans: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
  --color-bubble-me: var(--bubble-me);
  --color-bubble-me-foreground: var(--bubble-me-foreground);
  --color-bubble-them: var(--bubble-them);
```
- `:root { … }` 블록은 `--radius: 0.75rem;` 한 줄만 남기고 색 변수를 모두 지운다. `.dark { … }` 블록은 통째로 지운다(색은 layout의 `<style>`이 낸다).
- `@layer base`의 `body`를 `@apply bg-background text-foreground antialiased;`로, 끝에 추가:
```css
  html, body { height: 100%; overscroll-behavior-y: none; }
```

`client/src/app/layout.tsx` 전체 교체:
```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { paletteBootScript, paletteCss, THEME_TOKENS } from "@/lib/theme";

export const metadata: Metadata = {
  title: "dongchat",
  description: "친구들과 가볍게 대화해요",
  appleWebApp: { capable: true, title: "dongchat", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-180.png" },
};

// interactiveWidget: 안드로이드 크롬에서 키보드가 올라오면 레이아웃 높이(100dvh)가 줄어든다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: THEME_TOKENS.mint.light.background,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <style dangerouslySetInnerHTML={{ __html: paletteCss() }} />
        <script dangerouslySetInnerHTML={{ __html: paletteBootScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```
`client/src/components/providers.tsx` 전체 교체:
```tsx
"use client";

import { useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { ReactQueryProvider } from "@/components/react-query-provider";
import { usePalette } from "@/hooks/usePalette";
import { Toaster } from "./ui/sonner";

// 상태 표시줄 색(<meta name="theme-color">)을 현재 테마 배경으로 맞춘다.
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  const { palette } = usePalette();
  useEffect(() => {
    const color = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    if (color) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
  }, [resolvedTheme, palette]);
  return null;
}

// 앱 전역 Provider. 인증 세션은 Supabase 쿠키 + useAuth(React Query)로 관리한다.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ThemeColorSync />
      <ReactQueryProvider>
        <Toaster position="top-center" />
        {children}
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm test 2>&1 | tail -5` → 모두 pass. `pnpm exec tsc --noEmit` 0, `pnpm lint` 에러 0. `pnpm build` 성공.

- [ ] **Step 5: 커밋**

```bash
git add client/src/lib/theme.ts client/src/lib/theme.test.ts client/src/hooks/usePalette.ts client/src/app/globals.css client/src/app/layout.tsx client/src/components/providers.tsx
git commit -m "feat(theme): 민트·파랑·노을 팔레트 × 라이트·다크·기기, Pretendard, theme-color

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: 앱 셸·주소 구조 — 하단 탭, 라우트, 선택 상태 제거

이 Task가 끝나면 새 주소로 이동은 되지만 화면 내용은 Task 6~9에서 채운다(그 사이 친구·채팅·설정·대화 화면은 상단 바만 있는 임시 화면). 옛 `[menu]` 채팅 탭은 이 Task에서 지운다.

**Files:**
- Create: `client/src/components/ui/sheet.tsx`, `client/src/components/chat/{BottomTabs,ScreenHeader,UserAvatar}.tsx`, `client/src/hooks/useRoomSummaries.ts`, `client/src/hooks/useRoomActions.ts`, `client/src/app/(protected)/chat/page.tsx`, `client/src/app/(protected)/chat/{friends,rooms,settings}/page.tsx`, `client/src/app/(protected)/chat/rooms/[id]/page.tsx`
- Move (`git mv`, 내용 그대로):
  - `…/chat/[menu]/_components/ChatRooms/hooks/useChatMessages.ts` → `client/src/hooks/useChatMessages.ts`
  - `…/chat/[menu]/_components/Friends/hooks/useFriendsActions.ts` → `client/src/hooks/useFriendsActions.ts`
  - `…/chat/[menu]/_components/ChatRooms/components/MessageList.tsx`·`MessageItem.tsx` → `client/src/components/chat/` (관리자 열람이 Task 7 전까지 쓰는 옛 버전. Task 7이 MessageList를 다시 쓰고 MessageItem을 지운다)
- Modify: `client/src/app/(protected)/layout.tsx`, `client/src/app/(protected)/chat/layout.tsx`, `client/src/app/(protected)/admin/layout.tsx`, `client/src/app/(protected)/admin/rooms/RoomDetail.tsx`(import 2줄), `client/src/components/chat-provider.tsx`, `client/src/hooks/useInAppNotification.ts`, `client/src/hooks/useRouter.tsx`, `client/src/app/page.tsx`, `client/src/lib/supabase/proxy.ts`, `supabase/functions/send-push/index.ts`
- Delete: `client/src/components/layout/ProtectedHeader.tsx`, `client/src/app/(protected)/chat/[menu]/` 나머지 전체(`pickedRoomId`를 쓰는 옛 채팅 탭이라 이 Task에서 함께 지워야 tsc가 통과한다)

**Interfaces:**
- Consumes: Task 2 `listMyRooms`, `openDirectRoom`; Task 3 `applyRoomEvent`, `totalUnread`, `roomPath`, `markInAppNav`.
- Produces:
  - `<Sheet open onClose title? children />` (네이티브 dialog, 아래에서 올라옴, 바깥 클릭·Esc로 닫힘)
  - `<ScreenHeader title subtitle? onBack? actions? />`, `<UserAvatar name src? className? />`, `<BottomTabs />`
  - `ROOM_SUMMARIES_QUERY_KEY = ["rooms","summaries"]`, `useRoomSummaries()`, `useRoomSummariesSync()`
  - `useRoomActions(): { create(input), openDirect(username), leave(roomId), kick(roomId,userId), isPending }` — 성공 시 방으로 `markInAppNav()` 후 `router.push(roomPath(id))`; leave 성공 시 `/chat/rooms`로 replace.
  - `ChatContextValue`에서 `pickedRoomId`·`setPickedRoomId` 제거.

- [ ] **Step 1: 공용 컴포넌트**

`client/src/components/ui/sheet.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type SheetProps = { open: boolean; onClose: () => void; title?: string; className?: string; children: React.ReactNode };

// 아래에서 올라오는 시트. 네이티브 <dialog>(포커스 가두기·Esc·뒤 화면 비활성)를 쓴다.
export function Sheet({ open, onClose, title, className, children }: SheetProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()} // 바깥(backdrop) 클릭
      aria-label={title}
      className={cn(
        "fixed inset-x-0 bottom-0 top-auto m-0 mx-auto w-full max-w-md max-h-[85dvh] overflow-y-auto rounded-t-2xl border-0 bg-card p-0 text-card-foreground backdrop:bg-black/40",
        className,
      )}
    >
      <div className="px-4 pt-2 pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-border" aria-hidden />
        {title && <h2 className="mb-3 text-base font-semibold">{title}</h2>}
        {children}
      </div>
    </dialog>
  );
}
```
`client/src/components/chat/ScreenHeader.tsx`:
```tsx
import { ChevronLeft } from "lucide-react";

type Props = { title: string; subtitle?: string; onBack?: () => void; actions?: React.ReactNode };

export function ScreenHeader({ title, subtitle, onBack, actions }: Props) {
  return (
    <header className="flex shrink-0 items-center gap-1 border-b bg-background px-2 pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 min-w-0 flex-1 items-center gap-1">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="뒤로" className="flex size-10 items-center justify-center rounded-full hover:bg-muted">
            <ChevronLeft className="size-6" />
          </button>
        )}
        <h1 className={`min-w-0 truncate text-lg font-bold ${onBack ? "" : "pl-2"}`}>
          {title}
          {subtitle && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{subtitle}</span>}
        </h1>
      </div>
      {actions && <div className="flex items-center gap-1">{actions}</div>}
    </header>
  );
}
```
`client/src/components/chat/UserAvatar.tsx`:
```tsx
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

// 사진이 있으면 사진(카카오 프로필), 없거나 실패하면 이름 첫 글자.
export function UserAvatar({ name, src, className }: { name: string; src?: string | null; className?: string }) {
  return (
    <Avatar className={cn("size-11 rounded-[12px]", className)}>
      {src ? <AvatarImage src={src} alt="" className="object-cover" /> : null}
      <AvatarFallback className="rounded-[12px] bg-primary/12 font-semibold text-primary">
        {[...name][0]?.toUpperCase() ?? "?"}
      </AvatarFallback>
    </Avatar>
  );
}
```
`client/src/components/chat/BottomTabs.tsx`:
```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Settings, Users } from "lucide-react";
import { useRoomSummaries } from "@/hooks/useRoomSummaries";
import { badgeText } from "@/lib/format";
import { totalUnread } from "@/lib/room-list";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/chat/friends", label: "친구", Icon: Users },
  { href: "/chat/rooms", label: "채팅", Icon: MessageCircle },
  { href: "/chat/settings", label: "설정", Icon: Settings },
];

export function BottomTabs() {
  const pathname = usePathname();
  const { data: summaries = [] } = useRoomSummaries();
  const badge = badgeText(totalUnread(summaries));
  return (
    <nav className="flex shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)]" aria-label="주요 메뉴">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs", active ? "font-semibold text-primary" : "text-muted-foreground")}
          >
            <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} />
            {label}
            {href === "/chat/rooms" && badge && (
              <span className="absolute left-1/2 top-1.5 ml-2 min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-bold leading-5 text-primary-foreground">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 2: 요약·방 동작 훅**

`client/src/hooks/useRoomSummaries.ts`:
```ts
"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import { ROOMS_QUERY_KEY } from "@/hooks/useRooms";
import { applyRoomEvent } from "@/lib/room-list";
import { listMyRooms } from "@/services/rooms";
import type { RoomSummary } from "@/types/domain";

// ["rooms", ...] 아래라 방 목록을 무효화하면(방 생성·나가기·초대) 요약도 다시 받는다.
export const ROOM_SUMMARIES_QUERY_KEY = [...ROOMS_QUERY_KEY, "summaries"] as const;

export const useRoomSummaries = () => useQuery({ queryKey: ROOM_SUMMARIES_QUERY_KEY, queryFn: listMyRooms });

// 채팅 레이아웃에서 한 번만: 실시간 이벤트로 요약 캐시를 직접 고치고, 확신할 수 없으면 500ms 모아 다시 받는다.
export const useRoomSummariesSync = () => {
  const queryClient = useQueryClient();
  const { onRoomEvent, isViewing } = useChat();
  const { user } = useAuth();
  const me = user?.id;

  useEffect(() => {
    if (!me) return;
    let timer: number | undefined;
    const refetchSoon = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: ROOM_SUMMARIES_QUERY_KEY }), 500);
    };
    const off = onRoomEvent((e) => {
      const prev = queryClient.getQueryData<RoomSummary[]>(ROOM_SUMMARIES_QUERY_KEY);
      if (!prev) return;
      const { list, refetch } = applyRoomEvent(prev, e, {
        me,
        isViewing: (id) => isViewing(id) && document.visibilityState === "visible",
      });
      if (list !== prev) queryClient.setQueryData(ROOM_SUMMARIES_QUERY_KEY, list);
      if (refetch) refetchSoon();
    });
    return () => {
      off();
      window.clearTimeout(timer);
    };
  }, [queryClient, onRoomEvent, isViewing, me]);
};
```
`client/src/hooks/useRoomActions.ts`:
```ts
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import useToast from "@/hooks/useToast";
import { ROOMS_QUERY_KEY } from "@/hooks/useRooms";
import { getErrorMessage } from "@/lib/error-handler";
import { markInAppNav } from "@/lib/nav";
import { roomPath } from "@/lib/push-url";
import { createRoom, kickMember, leaveRoom, openDirectRoom } from "@/services/rooms";

// 방 만들기·1:1 열기·나가기·강퇴. 성공하면 목록(요약 포함)을 다시 받고 해당 화면으로 이동한다.
export const useRoomActions = () => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { success, error } = useToast();
  const refresh = () => queryClient.invalidateQueries({ queryKey: ROOMS_QUERY_KEY });
  const enter = async (id: number) => {
    await refresh();
    markInAppNav();
    router.push(roomPath(id));
  };

  const create = useMutation({
    mutationFn: createRoom,
    onSuccess: enter,
    onError: (e) => error(`채팅방을 만들지 못했어요: ${getErrorMessage(e)}`),
  });
  const openDirect = useMutation({
    mutationFn: openDirectRoom,
    onSuccess: enter,
    onError: (e) => error(`대화를 열지 못했어요: ${getErrorMessage(e)}`),
  });
  const leave = useMutation({
    mutationFn: leaveRoom,
    onSuccess: async () => {
      router.replace("/chat/rooms");
      await refresh();
      success("채팅방에서 나왔어요.");
    },
    onError: (e) => error(`나가지 못했어요: ${getErrorMessage(e)}`),
  });
  const kick = useMutation({
    mutationFn: ({ roomId, userId }: { roomId: number; userId: string }) => kickMember(roomId, userId),
    onSuccess: async () => {
      await refresh();
      success("멤버를 내보냈어요.");
    },
    onError: (e) => error(`내보내지 못했어요: ${getErrorMessage(e)}`),
  });

  return {
    create: create.mutate,
    openDirect: openDirect.mutate,
    leave: leave.mutate,
    kick: (roomId: number, userId: string) => kick.mutate({ roomId, userId }),
    isPending: create.isPending || openDirect.isPending || leave.isPending || kick.isPending,
  };
};
```

- [ ] **Step 3: 선택 상태 제거·알림 이동**

`client/src/components/chat-provider.tsx`:
- `ChatContextValue`에서 `pickedRoomId`, `setPickedRoomId` 두 필드와 주석을 지운다. `setViewingRoom` 주석은 `// 지금 화면에 열려 있는 방(방 화면이 아니면 null). 알림·안 읽은 수 판단용이라 렌더하지 않는다.`로.
- `const [pickedRoomId, setPickedRoomId] = useState<number | null>(null);` 삭제.
- `value` useMemo: `() => ({ onRoomEvent, setViewingRoom, isViewing, watchRoom })`, deps `[onRoomEvent, setViewingRoom, isViewing, watchRoom]`.

`client/src/hooks/useInAppNotification.ts`:
- import에 `import { markInAppNav } from "@/lib/nav";`, `import { roomPath } from "@/lib/push-url";` 추가.
- `const { onRoomEvent, isViewing, setPickedRoomId } = useChat();` → `const { onRoomEvent, isViewing } = useChat();`
- action `onClick`을:
```ts
          onClick: () => {
            markInAppNav();
            router.push(roomPath(e.roomId));
          },
```
- effect deps에서 `setPickedRoomId` 제거.

`client/src/hooks/useRouter.tsx`: `goChat: () => router.push("/chat/rooms"),`
`client/src/app/page.tsx`: `redirect("/chat/rooms");`
`client/src/lib/supabase/proxy.ts`: `const HOME = "/chat/rooms";`
`supabase/functions/send-push/index.ts` 28행: ``data: { roomId: t.room_id, url: `/chat/rooms/${t.room_id}` },``

- [ ] **Step 4: 레이아웃·라우트**

`client/src/app/(protected)/layout.tsx` 전체:
```tsx
"use client";
import { ChatProvider } from "@/components/chat-provider";

// Realtime 허브: 채팅(참여 방)과 관리자 방 열람(watchRoom)이 공유. 강제 로그아웃 통지도 여기서 받는다.
const ProtectedLayout = ({ children }: { children: React.ReactNode }) => <ChatProvider>{children}</ChatProvider>;

export default ProtectedLayout;
```
`client/src/app/(protected)/chat/layout.tsx` 전체:
```tsx
"use client";

import { usePathname } from "next/navigation";
import { BottomTabs } from "@/components/chat/BottomTabs";
import { useInAppNotification } from "@/hooks/useInAppNotification";
import { useRoomSummariesSync } from "@/hooks/useRoomSummaries";

// 폰 한 화면: 위 화면 내용(각 페이지가 자기 상단 바), 아래 하단 탭(방 안에서는 숨김). PC는 가운데 한 열.
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  useInAppNotification();
  useRoomSummariesSync();
  const inRoom = /^\/chat\/rooms\/\d+/.test(usePathname());
  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-background md:border-x">
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {!inRoom && <BottomTabs />}
    </div>
  );
}
```
`client/src/app/(protected)/chat/page.tsx`:
```tsx
import { redirect } from "next/navigation";

export default function ChatIndex() {
  redirect("/chat/rooms");
}
```
`client/src/app/(protected)/chat/friends/page.tsx`·`settings/page.tsx`(Task 8·9에서 교체할 임시):
```tsx
import { ScreenHeader } from "@/components/chat/ScreenHeader";

export default function Page() {
  return <ScreenHeader title="친구" />; // settings 파일은 title="설정"
}
```
`client/src/app/(protected)/chat/rooms/page.tsx`·`rooms/[id]/page.tsx`는 Task 6·7에서 작성한다. 이 Task에서는 같은 형태의 임시(`title="채팅"`, `title="대화"`)로 둔다.

`client/src/app/(protected)/admin/layout.tsx` — return 부분을 다음으로(상단 바·여백을 관리자 화면이 직접 가진다):
```tsx
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4">
          <Link href="/chat/rooms" className="text-sm text-muted-foreground hover:text-foreground">‹ 채팅으로</Link>
          <span className="font-semibold">관리자</span>
        </div>
      </header>
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-6">
        <nav className="flex gap-2">
          {TABS.map((tab) => (
            <Button key={tab.href} variant={pathname === tab.href ? "default" : "outline"} asChild>
              <Link href={tab.href}>{tab.label}</Link>
            </Button>
          ))}
        </nav>
        {children}
      </main>
    </div>
  );
```
같은 파일의 `router.replace("/chat/friends")` → `router.replace("/chat/rooms")`.

옮기기·삭제:
```bash
M="client/src/app/(protected)/chat/[menu]/_components"
git mv "$M/ChatRooms/hooks/useChatMessages.ts" client/src/hooks/useChatMessages.ts
git mv "$M/Friends/hooks/useFriendsActions.ts" client/src/hooks/useFriendsActions.ts
mkdir -p client/src/components/chat
git mv "$M/ChatRooms/components/MessageList.tsx" client/src/components/chat/MessageList.tsx
git mv "$M/ChatRooms/components/MessageItem.tsx" client/src/components/chat/MessageItem.tsx
git rm -r -q "client/src/app/(protected)/chat/[menu]" client/src/components/layout/ProtectedHeader.tsx
```
`RoomDetail.tsx` 12·13행 import를 `import { MessageList } from "@/components/chat/MessageList";`, `import { useChatMessages } from "@/hooks/useChatMessages";`로. `grep -rn "\[menu\]\|_components/" client/src` → 0건.

- [ ] **Step 5: 확인**

Run (client/): `pnpm exec tsc --noEmit`(0), `pnpm lint`(에러 0), `pnpm test`(pass), `pnpm build`(성공; 라우트 목록에 `/chat/friends`, `/chat/rooms`, `/chat/rooms/[id]`, `/chat/settings` 표시).
Edge Function 변경 반영: `docker restart supabase_edge_runtime_dongchat` 후 `pnpm verify`(push 포함 OK).

- [ ] **Step 6: 커밋**

```bash
git add -A client/src supabase/functions/send-push/index.ts
git commit -m "feat(shell): 방마다 주소·하단 탭·한 열 레이아웃, 선택 상태를 주소로, 알림 URL /chat/rooms/<id>

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: 채팅 목록 화면

**Files:**
- Create: `client/src/components/chat/RoomRow.tsx`, `client/src/components/chat/CreateGroupSheet.tsx`
- Modify: `client/src/app/(protected)/chat/rooms/page.tsx`

**Interfaces:**
- Consumes: `useRoomSummaries`, `useRooms`, `useRoomActions().create`, `formatListTime`, `badgeText`, `previewText`, `roomIdFromSearch`, `roomPath`, `markInAppNav`, `roomTitle`, `displayName`.
- Produces: `<RoomRow summary room me />`, `<CreateGroupSheet open onClose onCreate(input: { name?: string; usernames: string[] }) pending />`.

- [ ] **Step 1: 목록 행**

`client/src/components/chat/RoomRow.tsx`:
```tsx
import Link from "next/link";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { badgeText, formatListTime, previewText } from "@/lib/format";
import { markInAppNav } from "@/lib/nav";
import { roomPath } from "@/lib/push-url";
import { displayName, roomTitle, type Room, type RoomSummary } from "@/types/domain";

type Props = { summary: RoomSummary; room: Room | undefined; me: string };

export function RoomRow({ summary, room, me }: Props) {
  const title = room ? roomTitle(room, me) : (summary.name ?? "채팅방");
  const other = !summary.isGroup ? room?.participants.find((p) => p.user.id !== me)?.user : undefined;
  const nameOf = (id: string) => {
    const u = room?.participants.find((p) => p.user.id === id)?.user;
    return u ? displayName(u) : "알 수 없음";
  };
  const badge = badgeText(summary.unreadCount);
  return (
    <li>
      <Link
        href={roomPath(summary.id)}
        onClick={() => markInAppNav()}
        className="flex items-center gap-3 px-4 py-2.5 active:bg-muted"
      >
        <UserAvatar name={other ? displayName(other) : title} src={other?.avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">
            {title}
            {summary.isGroup && <span className="ml-1.5 text-sm font-normal text-muted-foreground">{summary.memberCount}</span>}
          </div>
          <div className="truncate text-sm text-muted-foreground">{previewText(summary, { me, senderName: nameOf })}</div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 self-start pt-0.5">
          <time className="text-xs text-muted-foreground tabular-nums">
            {formatListTime(summary.lastMessage?.at ?? summary.createdAt)}
          </time>
          {badge && (
            <span className="min-w-5 rounded-full bg-primary px-1.5 text-center text-xs font-bold leading-5 text-primary-foreground tabular-nums">
              {badge}
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
```

- [ ] **Step 2: 그룹방 만들기 시트**

`client/src/components/chat/CreateGroupSheet.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { useFriendsList } from "@/hooks/useFriends";
import { cn } from "@/lib/utils";
import { displayName } from "@/types/domain";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { name?: string; usernames: string[] }) => void;
  pending: boolean;
};

export function CreateGroupSheet({ open, onClose, onCreate, pending }: Props) {
  const { data: friends = [] } = useFriendsList();
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const toggle = (u: string) => setPicked((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]));
  const close = () => {
    setPicked([]);
    setName("");
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title="그룹 채팅 만들기">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="방 이름(선택)" maxLength={50} className="mb-3" />
      {friends.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">먼저 친구를 추가해 주세요.</p>
      ) : (
        <ul className="-mx-4 max-h-[45dvh] overflow-y-auto">
          {friends.map((f) => {
            const on = picked.includes(f.user.username);
            return (
              <li key={f.id}>
                <button type="button" onClick={() => toggle(f.user.username)} aria-pressed={on} className="flex w-full items-center gap-3 px-4 py-2 text-left active:bg-muted">
                  <UserAvatar name={displayName(f.user)} src={f.user.avatarUrl} className="size-10" />
                  <span className="flex-1 truncate">{displayName(f.user)}</span>
                  <span className={cn("flex size-6 items-center justify-center rounded-full border", on && "border-primary bg-primary text-primary-foreground")}>
                    {on && <Check className="size-4" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Button
        className="mt-4 h-12 w-full text-base"
        disabled={picked.length === 0 || pending}
        onClick={() => onCreate({ name: name.trim() || undefined, usernames: picked })}
      >
        {picked.length === 0 ? "함께할 친구를 골라 주세요" : `만들기 (${picked.length + 1}명)`}
      </Button>
    </Sheet>
  );
}
```

- [ ] **Step 3: 목록 화면**

`client/src/app/(protected)/chat/rooms/page.tsx`:
```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/chat/ScreenHeader";
import { RoomRow } from "@/components/chat/RoomRow";
import { CreateGroupSheet } from "@/components/chat/CreateGroupSheet";
import useAuth from "@/hooks/useAuth";
import { useRooms } from "@/hooks/useRooms";
import { useRoomActions } from "@/hooks/useRoomActions";
import { useRoomSummaries } from "@/hooks/useRoomSummaries";
import { roomIdFromSearch, roomPath } from "@/lib/push-url";

export default function RoomsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: summaries, isLoading, isError, refetch } = useRoomSummaries();
  const { data: rooms = [] } = useRooms();
  const { create, isPending } = useRoomActions();
  const [creating, setCreating] = useState(false);

  // 예전 알림 주소(/chat/rooms?room=<id>)는 새 주소로
  useEffect(() => {
    const id = roomIdFromSearch(window.location.search);
    if (id !== null) router.replace(roomPath(id));
  }, [router]);

  return (
    <>
      <ScreenHeader
        title="채팅"
        actions={
          <button type="button" onClick={() => setCreating(true)} aria-label="그룹 채팅 만들기" className="flex size-10 items-center justify-center rounded-full hover:bg-muted">
            <Plus className="size-6" />
          </button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">불러오는 중…</p>}
        {isError && (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">채팅 목록을 불러오지 못했어요.</p>
            <Button variant="outline" onClick={() => void refetch()}>다시 시도</Button>
          </div>
        )}
        {summaries && summaries.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="font-medium">아직 대화가 없어요</p>
            <p className="text-sm text-muted-foreground">친구를 눌러 바로 대화를 시작할 수 있어요.</p>
            <Button asChild><Link href="/chat/friends">친구 목록 보기</Link></Button>
          </div>
        )}
        {summaries && summaries.length > 0 && user && (
          <ul className="py-1">
            {summaries.map((s) => (
              <RoomRow key={s.id} summary={s} room={rooms.find((r) => r.id === s.id)} me={user.id} />
            ))}
          </ul>
        )}
      </div>
      <CreateGroupSheet
        open={creating}
        onClose={() => setCreating(false)}
        pending={isPending}
        onCreate={({ name, usernames }) => {
          setCreating(false);
          create({ name, isGroup: true, usernames });
        }}
      />
    </>
  );
}
```
(설치 안내 배너는 Task 11에서 이 화면 하단에 붙인다.)

- [ ] **Step 4: 확인**

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`. 개발 서버(`pnpm dev`)에서 alice 로그인 → `/chat/rooms`에 방 목록(미리보기·시간·배지) 표시, ＋ → 친구 선택 → 만들기 → 새 방 주소로 이동(대화 화면은 Task 7 전이라 임시)을 눈으로 확인.

- [ ] **Step 5: 커밋**

```bash
git add client/src/components/chat/RoomRow.tsx client/src/components/chat/CreateGroupSheet.tsx "client/src/app/(protected)/chat/rooms/page.tsx"
git commit -m "feat(rooms): 채팅 목록(미리보기·시간·안 읽은 수), 그룹 채팅 만들기 시트

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: 대화방 화면

**Files:**
- Create: `client/src/lib/composer-keys.ts`, `client/src/lib/composer-keys.test.ts`, `client/src/hooks/useLongPress.ts`, `client/src/components/chat/{MessageBubble,Composer,MessageActionsSheet,RoomMenuSheet}.tsx`
- Modify (전체 교체): `client/src/components/chat/MessageList.tsx`
- Modify: `client/src/app/(protected)/chat/rooms/[id]/page.tsx`, `client/src/app/(protected)/admin/rooms/RoomDetail.tsx`
- Delete: `client/src/components/chat/MessageItem.tsx`

**Interfaces:**
- Consumes: `useChatMessages(room)`(이동한 훅, 반환 `{ messages, sendMessage(content, replyToId?), editMessage(id, content), deleteMessage(id), loadOlder, hasMore, loadingOlder, participants }`), `buildTimeline`, `formatClock`, `scrollAction`, `consumeInAppNav`, `useRoomActions().leave/kick`.
- Produces:
  - `shouldSend(e: { key: string; shiftKey: boolean; isComposing: boolean }, coarsePointer: boolean): boolean`
  - `useLongPress(onLongPress: () => void, ms?: number)` → 포인터·contextmenu 핸들러 객체
  - `<MessageList messages isGroup readOnly? onOpenActions? onLoadOlder hasMore loadingOlder />`
  - `<Composer disabled? replyTarget editTarget onCancel onSend(content) onEdit(id, content) />`
  - `<MessageActionsSheet target onClose onReply onCopy onEdit onDelete />`
  - `<RoomMenuSheet open onClose room participants me disabled onLeave onKick />`

- [ ] **Step 1: 실패하는 테스트 — Enter 판정**

`client/src/lib/composer-keys.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldSend } from "./composer-keys.ts";

test("PC: Enter 전송, Shift+Enter 줄바꿈, 한글 조합 중 Enter는 전송 안 함", () => {
  assert.equal(shouldSend({ key: "Enter", shiftKey: false, isComposing: false }, false), true);
  assert.equal(shouldSend({ key: "Enter", shiftKey: true, isComposing: false }, false), false);
  assert.equal(shouldSend({ key: "Enter", shiftKey: false, isComposing: true }, false), false);
  assert.equal(shouldSend({ key: "a", shiftKey: false, isComposing: false }, false), false);
});

test("폰(터치): Enter는 줄바꿈, 보내기 버튼으로만 전송", () => {
  assert.equal(shouldSend({ key: "Enter", shiftKey: false, isComposing: false }, true), false);
});
```
Run: `pnpm test 2>&1 | tail -5` → FAIL(모듈 없음).

- [ ] **Step 2: 판정·길게 누르기 구현**

`client/src/lib/composer-keys.ts`:
```ts
// 입력창 Enter 처리. 한글 IME 조합 중 Enter는 조합 확정용이라 보내지 않는다(반쪽 글자·중복 전송 방지).
export const shouldSend = (e: { key: string; shiftKey: boolean; isComposing: boolean }, coarsePointer: boolean): boolean =>
  e.key === "Enter" && !e.shiftKey && !e.isComposing && !coarsePointer;
```
`client/src/hooks/useLongPress.ts`:
```ts
"use client";

import { useRef } from "react";

const MOVE_TOLERANCE_PX = 10;

// 길게 누르기(터치·마우스) 또는 우클릭으로 onLongPress. 스크롤하려고 움직이면 취소한다.
export const useLongPress = (onLongPress: () => void, ms = 500) => {
  const timer = useRef<number | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const clear = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      clear();
      start.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        onLongPress();
      }, ms);
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > MOVE_TOLERANCE_PX) clear();
    },
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      clear();
      onLongPress();
    },
  };
};
```
Run: `pnpm test 2>&1 | tail -5` → PASS.

- [ ] **Step 3: 말풍선·목록**

`client/src/components/chat/MessageBubble.tsx`:
```tsx
"use client";

import { UserAvatar } from "@/components/chat/UserAvatar";
import { useLongPress } from "@/hooks/useLongPress";
import type { MessageView } from "@/lib/chat-state";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

type Props = {
  view: MessageView;
  first: boolean;
  last: boolean;
  isGroup: boolean;
  readOnly: boolean;
  onOpenActions: (view: MessageView) => void;
  onJumpTo: (id: number) => void;
};

export function MessageBubble({ view, first, last, isGroup, readOnly, onOpenActions, onJumpTo }: Props) {
  const deleted = view.deletedAt !== null;
  const press = useLongPress(() => onOpenActions(view));
  const interactive = !readOnly && !deleted;
  const mine = view.isMine;
  const showSender = !mine && isGroup && first;

  const meta = last && (
    <div className={cn("flex shrink-0 flex-col justify-end pb-0.5 text-[11px] leading-tight", mine ? "items-end" : "items-start")}>
      {mine && !deleted && view.unreadCount !== null && view.unreadCount > 0 && (
        <span className="font-semibold text-primary tabular-nums">{view.unreadCount}</span>
      )}
      <time className="text-muted-foreground tabular-nums">{formatClock(view.createdAt)}</time>
    </div>
  );

  return (
    <div id={`msg-${view.id}`} className={cn("flex gap-2", mine ? "justify-end" : "justify-start", first ? "mt-2" : "mt-0.5")}>
      {!mine && isGroup && (
        <div className="w-9 shrink-0">{showSender && <UserAvatar name={view.senderName} className="size-9 rounded-[10px]" />}</div>
      )}
      <div className={cn("flex min-w-0 max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
        {showSender && <div className="mb-1 text-xs text-muted-foreground">{view.senderName}</div>}
        <div className={cn("flex items-end gap-1.5", mine && "flex-row-reverse")}>
          <div
            {...(interactive ? press : {})}
            className={cn(
              "min-w-0 select-none whitespace-pre-wrap break-words px-3 py-2 text-[15px] leading-snug [-webkit-touch-callout:none]",
              mine ? "rounded-[18px_6px_18px_18px] bg-bubble-me text-bubble-me-foreground" : "rounded-[6px_18px_18px_18px] bg-bubble-them text-foreground",
              deleted && "bg-transparent italic text-muted-foreground ring-1 ring-border",
            )}
          >
            {view.replyTo && !deleted && (
              <button
                type="button"
                onClick={() => onJumpTo(view.replyTo!.id)}
                className="mb-1 block max-w-full truncate border-l-2 border-current pl-2 text-left text-xs opacity-70"
              >
                {view.replyTo.senderName && `${view.replyTo.senderName}: `}
                {view.replyTo.deleted ? "삭제된 메시지" : view.replyTo.content}
              </button>
            )}
            {deleted ? "삭제된 메시지입니다" : view.content}
            {view.editedAt && !deleted && <span className="ml-1 text-[11px] opacity-60">수정됨</span>}
          </div>
          {meta}
        </div>
      </div>
    </div>
  );
}
```
`client/src/components/chat/MessageList.tsx`:
```tsx
"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown } from "lucide-react";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { scrollAction, type MessageView } from "@/lib/chat-state";
import { buildTimeline } from "@/lib/message-groups";

type Props = {
  messages: MessageView[];
  isGroup: boolean;
  readOnly?: boolean;
  onOpenActions?: (view: MessageView) => void;
  onLoadOlder: () => void;
  hasMore: boolean;
  loadingOlder: boolean;
};

const NEAR_BOTTOM_PX = 80;
const LOAD_OLDER_PX = 40;
const noop = () => {};

// 방이 바뀌면 부모가 key로 다시 마운트한다(스크롤 기준 초기화).
export function MessageList({ messages, isGroup, readOnly = false, onOpenActions = noop, onLoadOlder, hasMore, loadingOlder }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const last = useRef({ firstId: null as number | null, lastId: null as number | null, height: 0, nearBottom: true });
  const [atBottom, setAtBottom] = useState(true);
  const [seenId, setSeenId] = useState<number | null>(null);
  const timeline = useMemo(() => buildTimeline(messages), [messages]);

  const isNearBottom = (el: HTMLDivElement) => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const near = isNearBottom(el);
    last.current.nearBottom = near;
    setAtBottom(near);
    if (near) setSeenId(messages[messages.length - 1]?.id ?? null);
    if (el.scrollTop < LOAD_OLDER_PX && hasMore && !loadingOlder) onLoadOlder();
  };

  // 그리기 전에 위치를 맞춰 깜빡임·점프를 없앤다(위를 보고 있으면 끌어내리지 않음).
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

  const unseen = atBottom || seenId === null ? 0 : messages.filter((m) => m.id > seenId && !m.isMine).length;
  const jumpTo = (id: number) => document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto overscroll-contain px-3 py-2">
        {loadingOlder && <p className="py-2 text-center text-xs text-muted-foreground">불러오는 중…</p>}
        {!hasMore && messages.length > 0 && <p className="py-2 text-center text-xs text-muted-foreground">대화의 시작이에요</p>}
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">첫 메시지를 보내 보세요</p>}
        {timeline.map((item) =>
          item.kind === "date" ? (
            <div key={item.key} className="my-3 flex justify-center">
              <span className="rounded-full bg-muted px-3 py-0.5 text-xs text-muted-foreground">{item.label}</span>
            </div>
          ) : (
            <MessageBubble
              key={item.key}
              view={item.view}
              first={item.first}
              last={item.last}
              isGroup={isGroup}
              readOnly={readOnly}
              onOpenActions={onOpenActions}
              onJumpTo={jumpTo}
            />
          ),
        )}
      </div>
      {unseen > 0 && (
        <button
          type="button"
          onClick={() => scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })}
          className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow"
        >
          새 메시지 {unseen}개 <ArrowDown className="size-3.5" />
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 입력창·시트**

`client/src/components/chat/Composer.tsx`:
```tsx
"use client";

import { useRef, useState } from "react";
import { CornerUpLeft, Pencil, SendHorizontal, X } from "lucide-react";
import type { MessageView } from "@/lib/chat-state";
import { shouldSend } from "@/lib/composer-keys";

type Props = {
  disabled?: boolean;
  replyTarget: MessageView | null;
  editTarget: MessageView | null;
  onCancel: () => void;
  onSend: (content: string) => void;
  onEdit: (id: number, content: string) => void;
};

const MAX_HEIGHT_PX = 128; // 약 5줄

// 수정 대상이 바뀌면 부모가 key로 다시 마운트해 기존 내용으로 시작한다.
export function Composer({ disabled = false, replyTarget, editTarget, onCancel, onSend, onEdit }: Props) {
  const [text, setText] = useState(editTarget?.content ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  };

  const submit = () => {
    const content = text.trim();
    if (!content || disabled) return;
    if (editTarget) onEdit(editTarget.id, content);
    else onSend(content);
    setText("");
    requestAnimationFrame(resize);
    ref.current?.focus();
  };

  const bar = editTarget
    ? { Icon: Pencil, label: "메시지 수정 중", detail: "" }
    : replyTarget
      ? { Icon: CornerUpLeft, label: `${replyTarget.senderName}에게 답장`, detail: replyTarget.content || "삭제된 메시지" }
      : null;

  return (
    <div className="shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)]">
      {bar && (
        <div className="flex items-center gap-2 bg-muted px-4 py-2 text-xs">
          <bar.Icon className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold">{bar.label}</span>
            {bar.detail && <span className="text-muted-foreground">: {bar.detail}</span>}
          </span>
          <button type="button" onClick={onCancel} aria-label={editTarget ? "수정 취소" : "답장 취소"} className="p-1">
            <X className="size-4" />
          </button>
        </div>
      )}
      <form
        className="flex items-end gap-2 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            resize();
          }}
          onKeyDown={(e) => {
            const coarse = window.matchMedia("(pointer: coarse)").matches;
            if (shouldSend({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing }, coarse)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="메시지 입력"
          aria-label="메시지 입력"
          enterKeyHint="send"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-[20px] bg-muted px-4 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={disabled || text.trim() === ""}
          aria-label={editTarget ? "수정 저장" : "보내기"}
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <SendHorizontal className="size-5" />
        </button>
      </form>
    </div>
  );
}
```
`client/src/components/chat/MessageActionsSheet.tsx`:
```tsx
"use client";

import { Sheet } from "@/components/ui/sheet";
import type { MessageView } from "@/lib/chat-state";

type Props = {
  target: MessageView | null;
  onClose: () => void;
  onReply: (v: MessageView) => void;
  onCopy: (v: MessageView) => void;
  onEdit: (v: MessageView) => void;
  onDelete: (v: MessageView) => void;
};

// 길게 누른 메시지의 메뉴. 남의 메시지는 답장·복사만.
export function MessageActionsSheet({ target, onClose, onReply, onCopy, onEdit, onDelete }: Props) {
  const run = (fn: (v: MessageView) => void) => () => {
    if (target) fn(target);
    onClose();
  };
  const item = "flex h-12 w-full items-center px-1 text-left text-base active:bg-muted";
  return (
    <Sheet open={target !== null} onClose={onClose} title="메시지">
      {target && (
        <>
          <p className="mb-2 line-clamp-3 rounded-xl bg-muted px-3 py-2 text-sm">{target.content}</p>
          <div className="divide-y">
            <button type="button" className={item} onClick={run(onReply)}>답장</button>
            <button type="button" className={item} onClick={run(onCopy)}>복사</button>
            {target.isMine && <button type="button" className={item} onClick={run(onEdit)}>수정</button>}
            {target.isMine && <button type="button" className={`${item} text-destructive`} onClick={run(onDelete)}>삭제</button>}
          </div>
        </>
      )}
    </Sheet>
  );
}
```
`client/src/components/chat/RoomMenuSheet.tsx`:
```tsx
"use client";

import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { displayName, type Participant, type Room } from "@/types/domain";

type Props = {
  open: boolean;
  onClose: () => void;
  room: Room;
  participants: Participant[];
  me: string;
  disabled: boolean;
  onLeave: () => void;
  onKick: (userId: string) => void;
};

// 멤버 목록·내보내기(그룹방 방장만, DB도 같은 규칙)·나가기
export function RoomMenuSheet({ open, onClose, room, participants, me, disabled, onLeave, onKick }: Props) {
  const canKick = room.isGroup && room.ownerId === me;
  return (
    <Sheet open={open} onClose={onClose} title={`대화 상대 ${participants.length}`}>
      <ul className="-mx-4 max-h-[50dvh] overflow-y-auto">
        {participants.map(({ user }) => (
          <li key={user.id} className="flex items-center gap-3 px-4 py-2">
            <UserAvatar name={displayName(user)} src={user.avatarUrl} className="size-10" />
            <span className="min-w-0 flex-1 truncate">
              {displayName(user)}
              {user.id === me && <span className="ml-1 text-xs text-muted-foreground">(나)</span>}
              {room.isGroup && user.id === room.ownerId && <span className="ml-1 text-xs text-primary">방장</span>}
            </span>
            {canKick && user.id !== me && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={disabled}
                onClick={() => confirm(`${displayName(user)}님을 내보낼까요?`) && onKick(user.id)}
              >
                내보내기
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        className="mt-4 h-12 w-full text-base text-destructive"
        disabled={disabled}
        onClick={() => confirm("이 채팅방에서 나갈까요?") && onLeave()}
      >
        채팅방 나가기
      </Button>
    </Sheet>
  );
}
```

- [ ] **Step 5: 방 화면**

`client/src/app/(protected)/chat/rooms/[id]/page.tsx`:
```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/chat/ScreenHeader";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { MessageActionsSheet } from "@/components/chat/MessageActionsSheet";
import { RoomMenuSheet } from "@/components/chat/RoomMenuSheet";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useRooms } from "@/hooks/useRooms";
import { useRoomActions } from "@/hooks/useRoomActions";
import type { MessageView } from "@/lib/chat-state";
import { consumeInAppNav } from "@/lib/nav";
import { roomTitle } from "@/types/domain";

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = Number(params.id);
  const router = useRouter();
  const { user } = useAuth();
  const { data: rooms, isLoading } = useRooms();
  const room = rooms?.find((r) => r.id === roomId) ?? null;
  const { setViewingRoom } = useChat();
  const { leave, kick, isPending } = useRoomActions();
  const { messages, sendMessage, editMessage, deleteMessage, loadOlder, hasMore, loadingOlder, participants } = useChatMessages(room);

  const [replyTarget, setReplyTarget] = useState<MessageView | null>(null);
  const [editTarget, setEditTarget] = useState<MessageView | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageView | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const cameFromApp = useRef<boolean | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    cameFromApp.current ??= consumeInAppNav();
  }, []);

  // 잘못된 주소·남의 방·강퇴되어 목록에서 사라진 방 → 목록으로(직접 나간 경우는 useRoomActions가 이동)
  useEffect(() => {
    if (isLoading || !rooms || room || leaving.current) return;
    toast.error("참여 중인 채팅방이 아니에요.", { id: "room-missing" });
    router.replace("/chat/rooms");
  }, [isLoading, rooms, room, router]);

  // 인앱 알림·목록 안 읽은 수가 "지금 보고 있는 방"을 알 수 있도록
  useEffect(() => {
    setViewingRoom(room ? roomId : null);
    return () => setViewingRoom(null);
  }, [room, roomId, setViewingRoom]);

  if (!room || !user) return <ScreenHeader title="" onBack={() => router.replace("/chat/rooms")} />;

  const back = () => (cameFromApp.current ? router.back() : router.replace("/chat/rooms"));
  const clearTargets = () => {
    setReplyTarget(null);
    setEditTarget(null);
  };

  return (
    <>
      <ScreenHeader
        title={roomTitle(room, user.id)}
        subtitle={room.isGroup ? String(participants.length) : undefined}
        onBack={back}
        actions={
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="채팅방 메뉴" className="flex size-10 items-center justify-center rounded-full hover:bg-muted">
            <Menu className="size-6" />
          </button>
        }
      />
      <MessageList
        key={room.id}
        messages={messages}
        isGroup={room.isGroup}
        onOpenActions={setActionTarget}
        onLoadOlder={loadOlder}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
      />
      <Composer
        key={editTarget ? `edit-${editTarget.id}` : "new"}
        replyTarget={replyTarget}
        editTarget={editTarget}
        onCancel={clearTargets}
        onSend={(content) => {
          void sendMessage(content, replyTarget?.id);
          setReplyTarget(null);
        }}
        onEdit={(id, content) => {
          void editMessage(id, content);
          setEditTarget(null);
        }}
      />
      <MessageActionsSheet
        target={actionTarget}
        onClose={() => setActionTarget(null)}
        onReply={(v) => {
          setEditTarget(null);
          setReplyTarget(v);
        }}
        onCopy={(v) =>
          void navigator.clipboard.writeText(v.content).then(
            () => toast.success("복사했어요."),
            () => toast.error("복사하지 못했어요."),
          )
        }
        onEdit={(v) => {
          setReplyTarget(null);
          setEditTarget(v);
        }}
        onDelete={(v) => confirm("메시지를 삭제할까요?") && void deleteMessage(v.id)}
      />
      <RoomMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        room={room}
        participants={participants}
        me={user.id}
        disabled={isPending}
        onLeave={() => {
          leaving.current = true;
          setMenuOpen(false);
          leave(room.id, { onError: () => (leaving.current = false) });
        }}
        onKick={(userId) => kick(room.id, userId)}
      />
    </>
  );
}
```
`useRoomActions`의 `leave`는 `leave.mutate`이므로 두 번째 인자(`{ onError }`)를 받는다.

- [ ] **Step 6: 관리자 열람 화면 맞춤**

`git rm client/src/components/chat/MessageItem.tsx`

`client/src/app/(protected)/admin/rooms/RoomDetail.tsx`(import는 Task 5에서 이미 새 경로):
- `const noop = () => {};` 삭제.
- MessageList 사용부를:
```tsx
      <div className="flex h-[60vh] flex-col rounded-md border">
        <MessageList
          key={room.id}
          messages={messages}
          isGroup={room.isGroup}
          readOnly
          onLoadOlder={loadOlder}
          hasMore={hasMore}
          loadingOlder={loadingOlder}
        />
      </div>
```
(기존 래퍼 높이·Card 구조가 있으면 바깥을 위 div로 교체.)

- [ ] **Step 7: 확인**

`pnpm test`(composer-keys 포함 pass), `pnpm exec tsc --noEmit`, `pnpm lint`. 개발 서버에서 alice·bob 두 창: 메시지 묶음·날짜선·안 읽은 수, bob 위로 스크롤 중 alice 전송 → "새 메시지 1개 ↓", 길게 눌러 답장/수정/삭제/복사, ‹ 동작, ☰ 나가기 → 목록 이동(토스트 "참여 중인…" 안 뜸).

- [ ] **Step 8: 커밋**

```bash
git add -A "client/src/app/(protected)/chat/rooms" "client/src/app/(protected)/admin/rooms/RoomDetail.tsx" client/src/components/chat client/src/hooks/useLongPress.ts client/src/lib/composer-keys.ts client/src/lib/composer-keys.test.ts
git commit -m "feat(room): 전체 화면 대화방(묶음·날짜선·새 메시지 버튼·길게 눌러 메뉴·답장/수정 입력창·키보드 안전)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: 친구 화면

**Files:**
- Create: `client/src/components/chat/AddFriendSheet.tsx`
- Modify: `client/src/app/(protected)/chat/friends/page.tsx` (`useFriendsActions`는 Task 5에서 `client/src/hooks/`로 옮김)

**Interfaces:**
- Consumes: `useFriendsList`, `usePendingFriends`, `useFriendsActions()`(`sendFriendRequest(username)`, `respondFriendRequest(id, action)`, `isRequestPending`, `isResponding`), `useRoomActions().openDirect`.
- Produces: `<AddFriendSheet open onClose onSubmit(username) pending />`.

- [ ] **Step 1: 친구 추가 시트**

`client/src/components/chat/AddFriendSheet.tsx`:
```tsx
"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const USERNAME = /^[a-zA-Z0-9_]{3,20}$/;

export function AddFriendSheet({ open, onClose, onSubmit, pending }: { open: boolean; onClose: () => void; onSubmit: (username: string) => void; pending: boolean }) {
  const [value, setValue] = useState("");
  const valid = USERNAME.test(value.trim());
  const close = () => {
    setValue("");
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title="친구 추가">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSubmit(value.trim());
          close();
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="친구 아이디" autoCapitalize="none" autoCorrect="off" aria-label="친구 아이디" />
        <p className="mt-2 text-xs text-muted-foreground">영문·숫자·밑줄 3~20자. 상대가 수락하면 친구가 돼요.</p>
        <Button type="submit" className="mt-4 h-12 w-full text-base" disabled={!valid || pending}>요청 보내기</Button>
      </form>
    </Sheet>
  );
}
```

- [ ] **Step 2: 친구 화면**

`client/src/app/(protected)/chat/friends/page.tsx`:
```tsx
"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/chat/ScreenHeader";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { AddFriendSheet } from "@/components/chat/AddFriendSheet";
import useAuth from "@/hooks/useAuth";
import { useFriendsList, usePendingFriends } from "@/hooks/useFriends";
import { useFriendsActions } from "@/hooks/useFriendsActions";
import { useRoomActions } from "@/hooks/useRoomActions";
import { displayName } from "@/types/domain";

export default function FriendsPage() {
  const { user } = useAuth();
  const { data: friends = [], isLoading } = useFriendsList();
  const { data: pending = [] } = usePendingFriends();
  const { sendFriendRequest, respondFriendRequest, isRequestPending, isResponding } = useFriendsActions();
  const { openDirect, isPending: opening } = useRoomActions();
  const [adding, setAdding] = useState(false);
  const section = "px-4 pb-1 pt-4 text-xs font-medium text-muted-foreground";

  return (
    <>
      <ScreenHeader
        title="친구"
        actions={
          <button type="button" onClick={() => setAdding(true)} aria-label="친구 추가" className="flex size-10 items-center justify-center rounded-full hover:bg-muted">
            <UserPlus className="size-6" />
          </button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {user && (
          <div className="mx-4 mt-3 flex items-center gap-3 rounded-2xl bg-muted p-3">
            <UserAvatar name={displayName(user)} src={user.avatarUrl} className="size-12" />
            <div className="min-w-0">
              <div className="truncate font-semibold">{displayName(user)}</div>
              <div className="truncate text-sm text-muted-foreground">@{user.username}</div>
            </div>
          </div>
        )}

        {pending.length > 0 && (
          <>
            <h2 className={section}>받은 요청 {pending.length}</h2>
            <ul>
              {pending.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                  <UserAvatar name={displayName(p.requester)} src={p.requester.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{displayName(p.requester)}</div>
                    <div className="truncate text-xs text-muted-foreground">@{p.requester.username}</div>
                  </div>
                  <Button size="sm" disabled={isResponding} onClick={() => respondFriendRequest(p.id, "ACCEPT")}>수락</Button>
                  <Button size="sm" variant="secondary" disabled={isResponding} onClick={() => respondFriendRequest(p.id, "BLOCK")}>차단</Button>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className={section}>친구 {friends.length}</h2>
        {!isLoading && friends.length === 0 && (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            아직 친구가 없어요. 오른쪽 위 버튼으로 아이디를 검색해 친구를 추가해 보세요.
          </p>
        )}
        <ul>
          {friends.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                disabled={opening}
                onClick={() => openDirect(f.user.username)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left active:bg-muted disabled:opacity-60"
              >
                <UserAvatar name={displayName(f.user)} src={f.user.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{displayName(f.user)}</div>
                  <div className="truncate text-xs text-muted-foreground">@{f.user.username}</div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <AddFriendSheet open={adding} onClose={() => setAdding(false)} onSubmit={sendFriendRequest} pending={isRequestPending} />
    </>
  );
}
```

- [ ] **Step 3: 확인**

`pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`. 개발 서버에서 친구 → 1:1 방 이동, 다시 친구 눌러 같은 방(목록에 방 하나만), 친구 추가 시트.

- [ ] **Step 4: 커밋**

```bash
git add -A client/src
git commit -m "feat(friends): 친구 탭(내 프로필·받은 요청·친구 눌러 1:1)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: 설정 화면

**Files:**
- Modify: `client/src/app/(protected)/chat/settings/page.tsx`
- Delete: `client/src/components/push-notification-button.tsx`

**Interfaces:**
- Consumes: `usePalette`, `PALETTES`, `PALETTE_LABELS`, `THEME_TOKENS`, `useTheme`(next-themes), `usePushNotification()`(`isSupported, isSubscribed, isLoading, subscribe, unsubscribe`), `updateNickname`, `signOut`, `AUTH_QUERY_KEY`.

- [ ] **Step 1: 화면**

`client/src/app/(protected)/chat/settings/page.tsx`:
```tsx
"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScreenHeader } from "@/components/chat/ScreenHeader";
import useAuth, { AUTH_QUERY_KEY } from "@/hooks/useAuth";
import { usePalette } from "@/hooks/usePalette";
import { usePushNotification } from "@/hooks/usePushNotification";
import { getErrorMessage } from "@/lib/error-handler";
import { PALETTES, PALETTE_LABELS, THEME_TOKENS } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { signOut } from "@/services/auth";
import { updateNickname } from "@/services/profile";
import type { DomainError } from "@/types/domain";

const MODES = [
  { value: "light", label: "라이트" },
  { value: "dark", label: "다크" },
  { value: "system", label: "기기 설정" },
] as const;
const noSubscribe = () => () => {};

export default function SettingsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { palette, setPalette } = usePalette();
  const { theme, setTheme } = useTheme();
  const mounted = useSyncExternalStore(noSubscribe, () => true, () => false); // next-themes 값은 브라우저에서만
  const push = usePushNotification();
  const [nickname, setNickname] = useState<string | null>(null); // null = 편집 전(현재 값 표시)

  const saveNickname = useMutation({
    mutationFn: updateNickname,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      setNickname(null);
      toast.success("닉네임을 바꿨어요.");
    },
    onError: (e) => toast.error(getErrorMessage(e as unknown as DomainError)),
  });

  const togglePush = async () => {
    if (push.isSubscribed) {
      if (await push.unsubscribe()) toast.success("알림을 껐어요.");
      else toast.error("알림을 끄지 못했어요.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      toast.error("브라우저 설정에서 알림을 허용해 주세요.");
      return;
    }
    if (await push.subscribe()) toast.success("알림을 켰어요.");
    else toast.error("알림을 켜지 못했어요.");
  };

  const logout = async () => {
    await signOut();
    queryClient.clear(); // 이전 사용자 데이터가 다음 로그인에 보이지 않도록
    queryClient.setQueryData(AUTH_QUERY_KEY, null);
    router.replace("/login");
  };

  const section = "px-4 pb-2 pt-5 text-xs font-medium text-muted-foreground";
  const row = "flex min-h-12 w-full items-center justify-between gap-3 px-4 py-2 text-left";

  return (
    <>
      <ScreenHeader title="설정" />
      <div className="min-h-0 flex-1 overflow-y-auto pb-6">
        <h2 className={section}>색 테마</h2>
        <div className="grid grid-cols-3 gap-2 px-4" role="radiogroup" aria-label="색 테마">
          {PALETTES.map((p) => {
            const t = THEME_TOKENS[p].light;
            return (
              <button
                key={p}
                type="button"
                role="radio"
                aria-checked={palette === p}
                onClick={() => setPalette(p)}
                className={cn("rounded-xl border-2 p-2 text-sm", palette === p ? "border-primary font-semibold" : "border-border")}
              >
                <div className="mb-1.5 flex h-12 flex-col justify-center gap-1.5 rounded-lg px-2" style={{ background: t.background }}>
                  <div className="h-2.5 w-3/5 rounded-full" style={{ background: t.bubbleThem }} />
                  <div className="ml-auto h-2.5 w-3/5 rounded-full" style={{ background: t.bubbleMe }} />
                </div>
                {PALETTE_LABELS[p]}
              </button>
            );
          })}
        </div>

        <h2 className={section}>밝기</h2>
        <div className="mx-4 flex rounded-xl bg-muted p-1" role="radiogroup" aria-label="밝기">
          {MODES.map((m) => {
            const on = mounted && (theme ?? "system") === m.value;
            return (
              <button
                key={m.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setTheme(m.value)}
                className={cn("flex-1 rounded-lg py-2 text-sm", on ? "bg-primary font-semibold text-primary-foreground" : "text-muted-foreground")}
              >
                {m.label}
              </button>
            );
          })}
        </div>

        <h2 className={section}>알림</h2>
        {push.isSupported ? (
          <button type="button" className={row} onClick={() => void togglePush()} disabled={push.isLoading}>
            <span>새 메시지 알림</span>
            <span className={push.isSubscribed ? "font-semibold text-primary" : "text-muted-foreground"}>
              {push.isSubscribed ? "켜짐" : "꺼짐"}
            </span>
          </button>
        ) : (
          <p className="px-4 text-sm text-muted-foreground">이 브라우저는 알림을 지원하지 않아요. 홈 화면에 추가하면 쓸 수 있어요.</p>
        )}

        <h2 className={section}>내 프로필</h2>
        {user && (
          <form
            className="flex items-center gap-2 px-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (nickname !== null) saveNickname.mutate(nickname);
            }}
          >
            <Input
              value={nickname ?? user.nickname ?? ""}
              onChange={(e) => setNickname(e.target.value)}
              placeholder={user.username}
              maxLength={20}
              aria-label="닉네임"
            />
            <Button type="submit" disabled={nickname === null || saveNickname.isPending}>저장</Button>
          </form>
        )}
        <p className="px-4 pt-1 text-xs text-muted-foreground">비워 두면 아이디(@{user?.username})가 보여요.</p>

        <div className="mt-6 divide-y border-y">
          {user?.isAdmin && (
            <Link href="/admin/users" className={row}>
              <span>관리자 화면</span>
              <ChevronRight className="size-5 text-muted-foreground" />
            </Link>
          )}
          <button type="button" className={`${row} text-destructive`} onClick={() => void logout()}>로그아웃</button>
        </div>
      </div>
    </>
  );
}
```
- [ ] **Step 2: 정리·확인**

`git rm client/src/components/push-notification-button.tsx`. `grep -rn "PushNotificationButton" client/src` → 0. `pnpm exec tsc --noEmit`, `pnpm lint`. 개발 서버에서 팔레트 3개·밝기 3개 전환(새로고침 후 유지), 닉네임 저장 → 친구 탭 내 프로필에 반영, 21자 입력 불가(maxLength), 로그아웃.

- [ ] **Step 3: 커밋**

```bash
git add -A client/src
git commit -m "feat(settings): 색 테마·밝기·알림·닉네임·관리자·로그아웃

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: 로그인·가입 화면

**Files:**
- Create: `client/src/components/auth/AuthShell.tsx`
- Modify: `client/src/app/(public)/(auth)/login/page.tsx`, `client/src/app/(public)/(auth)/join/page.tsx`, `client/src/components/auth/login/LoginForm.tsx`
- Delete: `client/src/components/auth/AuthTabs.tsx`

- [ ] **Step 1: 구현**

`client/src/components/auth/AuthShell.tsx`:
```tsx
import Link from "next/link";

type Props = { children: React.ReactNode; footer: { text: string; href: string; link: string } };

export function AuthShell({ children, footer }: Props) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center px-6 py-[calc(2rem+env(safe-area-inset-top))]">
      <h1 className="text-center text-4xl font-extrabold tracking-tight text-primary">dongchat</h1>
      <p className="mb-10 mt-2 text-center text-muted-foreground">친구들과 가볍게 대화해요</p>
      {children}
      <p className="mt-8 text-center text-sm text-muted-foreground">
        {footer.text}{" "}
        <Link href={footer.href} className="font-semibold text-primary">{footer.link}</Link>
      </p>
    </main>
  );
}
```
`login/page.tsx`:
```tsx
import { AuthShell } from "@/components/auth/AuthShell";
import LoginForm from "@/components/auth/login/LoginForm";

export default function LoginPage() {
  return (
    <AuthShell footer={{ text: "처음이신가요?", href: "/join", link: "회원가입" }}>
      <LoginForm />
    </AuthShell>
  );
}
```
`join/page.tsx`:
```tsx
import { AuthShell } from "@/components/auth/AuthShell";
import JoinForm from "@/components/auth/join/JoinForm";

export default function JoinPage() {
  return (
    <AuthShell footer={{ text: "이미 계정이 있나요?", href: "/login", link: "로그인" }}>
      <JoinForm />
    </AuthShell>
  );
}
```
`LoginForm.tsx` — `return` 안 `<form>` 내용 순서를 카카오 → 구분선 → 이메일로 바꾼다:
```tsx
      <form onSubmit={methods.handleSubmit((data) => login.mutate(data))} className="space-y-3">
        <Button
          type="button"
          onClick={() => kakao.mutate()}
          className="h-12 w-full bg-[#FEE500] text-base font-semibold text-[#191600] hover:bg-[#FEE500]/90"
          disabled={busy}
        >
          {kakao.isPending ? "카카오로 이동 중…" : "카카오로 시작하기"}
        </Button>
        <div className="relative py-3">
          <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
          <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">또는 이메일로</span></div>
        </div>
        <FormInput name="email" label="이메일" type="email" placeholder="이메일" disabled={busy} />
        <FormInput name="password" label="비밀번호" type="password" placeholder="비밀번호" disabled={busy} />
        <Button type="submit" className="h-12 w-full text-base" disabled={busy}>
          {login.isPending ? "로그인 중…" : "로그인"}
        </Button>
      </form>
```
`git rm client/src/components/auth/AuthTabs.tsx`. JoinForm 안에 카카오 버튼이 있으면 그대로 둔다(가입 화면에서도 카카오 가능).

- [ ] **Step 2: 확인·커밋**

`pnpm exec tsc --noEmit`, `pnpm lint`, 개발 서버에서 `/login`·`/join` 표시와 이메일 로그인 성공.
```bash
git add -A client/src
git commit -m "feat(auth): 카카오 우선 로그인, 가입 화면 분리

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: PWA — manifest, 아이콘, 설치 안내

**Files:**
- Create: `client/src/app/manifest.ts`, `client/src/app/icons/[file]/route.tsx`, `client/src/lib/install.ts`, `client/src/lib/install.test.ts`, `client/src/hooks/useInstallPrompt.ts`, `client/src/components/chat/InstallBanner.tsx`
- Modify: `client/src/app/(protected)/chat/rooms/page.tsx`

**Interfaces:**
- Produces: `installMode(s: { standalone: boolean; ios: boolean; dismissed: boolean; canPrompt: boolean }): "prompt" | "ios" | null`; `useInstallPrompt(): { mode; install(): Promise<void>; dismiss(): void }`; `<InstallBanner />`.

- [ ] **Step 1: 실패하는 테스트**

`client/src/lib/install.test.ts`:
```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { installMode } from "./install.ts";

const base = { standalone: false, ios: false, dismissed: false, canPrompt: false };

test("설치 안내: 설치 가능하면 prompt, iOS 사파리면 안내 문구, 이미 설치·닫음이면 없음", () => {
  assert.equal(installMode({ ...base, canPrompt: true }), "prompt");
  assert.equal(installMode({ ...base, ios: true }), "ios");
  assert.equal(installMode(base), null);
  assert.equal(installMode({ ...base, canPrompt: true, standalone: true }), null);
  assert.equal(installMode({ ...base, ios: true, dismissed: true }), null);
});
```
Run: `pnpm test 2>&1 | tail -5` → FAIL.

- [ ] **Step 2: 구현**

`client/src/lib/install.ts`:
```ts
export const INSTALL_DISMISS_KEY = "dongchat.installDismissed";

// 홈 화면 설치 안내 종류. iOS 사파리는 설치 이벤트가 없어 "공유 → 홈 화면에 추가" 문구.
export const installMode = (s: { standalone: boolean; ios: boolean; dismissed: boolean; canPrompt: boolean }): "prompt" | "ios" | null => {
  if (s.standalone || s.dismissed) return null;
  if (s.canPrompt) return "prompt";
  if (s.ios) return "ios";
  return null;
};
```
`client/src/hooks/useInstallPrompt.ts`:
```ts
"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { INSTALL_DISMISS_KEY, installMode } from "@/lib/install";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
const EVENT = "dongchat:install";

const snapshot = (): string => {
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(INSTALL_DISMISS_KEY) === "1";
  } catch {
    dismissed = false;
  }
  return `${+standalone}${+ios}${+dismissed}`;
};
const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};

export const useInstallPrompt = () => {
  const env = useSyncExternalStore(subscribe, snapshot, () => "100"); // 서버: standalone 취급(안 보임)
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault(); // 브라우저 기본 미니 배너 대신 우리 배너
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(INSTALL_DISMISS_KEY, "1");
    } catch {
      // 저장 불가면 이번 방문에만 숨김
    }
    setEvent(null);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  const install = useCallback(async () => {
    if (!event) return;
    await event.prompt();
    await event.userChoice;
    dismiss();
  }, [event, dismiss]);

  const mode = installMode({ standalone: env[0] === "1", ios: env[1] === "1", dismissed: env[2] === "1", canPrompt: event !== null });
  return { mode, install, dismiss };
};
```
`client/src/components/chat/InstallBanner.tsx`:
```tsx
"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";

export function InstallBanner() {
  const { mode, install, dismiss } = useInstallPrompt();
  if (!mode) return null;
  return (
    <div className="mx-3 mb-3 flex items-center gap-3 rounded-2xl bg-foreground px-4 py-3 text-sm text-background">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-extrabold text-primary-foreground">d</div>
      <p className="min-w-0 flex-1">
        {mode === "prompt" ? "홈 화면에 추가하면 앱처럼 쓸 수 있어요" : "공유 버튼 → ‘홈 화면에 추가’로 앱처럼 쓸 수 있어요"}
      </p>
      {mode === "prompt" && <Button size="sm" onClick={() => void install()}>추가</Button>}
      <button type="button" onClick={dismiss} aria-label="설치 안내 닫기" className="p-1 opacity-70">
        <X className="size-4" />
      </button>
    </div>
  );
}
```
`client/src/app/manifest.ts`:
```ts
import type { MetadataRoute } from "next";
import { THEME_TOKENS } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  const bg = THEME_TOKENS.mint.light.background;
  return {
    name: "dongchat",
    short_name: "dongchat",
    description: "친구들과 가볍게 대화해요",
    lang: "ko",
    start_url: "/chat/rooms",
    scope: "/",
    display: "standalone",
    background_color: bg,
    theme_color: bg,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
```
`client/src/app/icons/[file]/route.tsx` (경로가 `.png`로 끝나 proxy 대상이 아니다 → 로그인 없이 받음):
```tsx
import { ImageResponse } from "next/og";
import { THEME_TOKENS } from "@/lib/theme";

// 앱 아이콘. maskable·apple은 OS가 모양을 자르므로 꽉 찬 사각형, 일반 아이콘은 둥근 모서리.
const ICONS: Record<string, { size: number; rounded: boolean }> = {
  "icon-192.png": { size: 192, rounded: true },
  "icon-512.png": { size: 512, rounded: true },
  "maskable-512.png": { size: 512, rounded: false },
  "apple-180.png": { size: 180, rounded: false },
};

export const dynamic = "force-static";
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(ICONS).map((file) => ({ file }));

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const icon = ICONS[(await params).file];
  if (!icon) return new Response("Not found", { status: 404 });
  const { primary, background } = THEME_TOKENS.mint.light;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: primary,
          color: background,
          fontSize: icon.size * 0.56,
          fontWeight: 800,
          borderRadius: icon.rounded ? icon.size * 0.22 : 0,
        }}
      >
        d
      </div>
    ),
    { width: icon.size, height: icon.size },
  );
}
```
`rooms/page.tsx`: import `InstallBanner`를 추가하고 목록 스크롤 영역 바로 뒤(CreateGroupSheet 앞)에 `<InstallBanner />`.

- [ ] **Step 3: 확인**

`pnpm test`(install 포함 pass), `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`. 그다음 `pnpm start -p 3100`(백그라운드)로:
```bash
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3100/manifest.webmanifest
curl -s -o /dev/null -w "%{http_code} %{content_type}\n" http://localhost:3100/icons/icon-512.png
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/icons/nope.png
```
Expected: `200 application/manifest+json`, `200 image/png`, `404`. 확인 후 3100 서버 종료.

- [ ] **Step 4: 커밋**

```bash
git add client/src/app/manifest.ts "client/src/app/icons" client/src/lib/install.ts client/src/lib/install.test.ts client/src/hooks/useInstallPrompt.ts client/src/components/chat/InstallBanner.tsx "client/src/app/(protected)/chat/rooms/page.tsx"
git commit -m "feat(pwa): manifest·앱 아이콘·홈 화면 설치 안내

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: 브라우저 확인·문서

**Files:**
- Create(커밋 안 함): 세션 스크래치패드 `ui-check.mjs`(playwright-core, `chromium.launch({ channel: "chrome" })`)
- Modify: `client/AGENTS.md`(라우트·테마·시트 규칙), `docs/superpowers/specs/2026-10-13-supabase-migration-design.md` §10 푸시 URL(`/chat/rooms/<id>`)

- [ ] **Step 1: 헤드리스 확인 스크립트**

로컬 Supabase + `pnpm dev`(:3000) 실행 상태에서, 시드 계정 alice·bob(`password123`)으로 다음을 순서대로 확인하고 각 단계 결과를 출력한다. 뷰포트 390×844, `hasTouch: true`, `isMobile: true`.
1. alice `/login` → 이메일 로그인 → URL `/chat/rooms`, 하단 탭 3개(`nav[aria-label="주요 메뉴"] a` 3개).
2. 친구 탭 → bob 행 클릭 → URL `/chat/rooms/<id>`, 하단 탭 없음. ‹ 클릭 → `/chat/rooms`. 친구 탭에서 bob 다시 클릭 → 같은 `<id>`(1:1 중복 없음).
3. 별도 컨텍스트로 bob 로그인 → 그 방에 "안녕" 전송 → alice 목록에서 그 방 미리보기 "안녕"·배지 "1"·채팅 탭 배지. alice가 방에 들어가면 1초 안에 목록 배지 사라짐(돌아와서 확인).
4. alice 방에서 bob 메시지 말풍선을 길게 누르기(`page.mouse.down` 600ms 후 up 또는 `dispatchEvent('contextmenu')`) → 시트에 답장·복사만. 답장 → 입력창 위 "bob에게 답장" → 보내기 → 말풍선 안 인용 줄.
5. 직접 주소 `/chat/rooms/999999` → 토스트 "참여 중인 채팅방이 아니에요." 후 `/chat/rooms`. 새 탭에서 방 주소로 직접 진입 → ‹ → `/chat/rooms`(앱 밖으로 안 나감).
6. 설정 → 파랑 → `document.documentElement.dataset.palette === "blue"`, 다크 → `classList.contains("dark")`. 새로고침 후 둘 다 유지, `<meta name="theme-color">` 값이 `#10131a`. localStorage `dongchat.palette`를 `"pink"`로 바꾸고 새로고침 → `data-palette` 없음(민트).
7. 옛 알림 주소 `/chat/rooms?room=<id>` → `/chat/rooms/<id>`.
8. 뷰포트 1280×800에서 `/chat/rooms` 본문 폭 ≤ 448px(가운데 한 열).
9. 콘솔 에러 0(React hydration 경고 포함).

Expected: 9단계 모두 OK. 실패 항목은 원인 수정 후 해당 Task 커밋에 이어서 고치고 재실행.

- [ ] **Step 2: 전체 회귀**

```bash
# client/
pnpm test && pnpm exec tsc --noEmit && pnpm lint && pnpm build && pnpm verify
# 루트
npx -y supabase@2.120.0 test db < /dev/null 2>&1 | tail -3
```
Expected: 모두 성공, pgTAP `Result: PASS`.

- [ ] **Step 3: 문서**

`client/AGENTS.md`에 "화면 구조" 절 추가:
```md
## 화면 구조(모바일 우선)
- 라우트: `/chat/friends`, `/chat/rooms`, `/chat/rooms/[id]`(하단 탭 숨김), `/chat/settings`, `/login`, `/join`, `/admin/*`(PC용).
- 선택된 방은 주소가 기준이다(전역 상태 없음). 방으로 이동할 때는 `markInAppNav()` 후 `roomPath(id)`.
- 색은 `lib/theme.ts`가 단일 출처(대비 테스트 포함). 컴포넌트는 `bg-background`, `text-muted-foreground`, `bg-bubble-me` 같은 토큰만 쓰고 hex·`gray-*`·`blue-*`를 쓰지 않는다.
- 시트·메뉴는 `components/ui/sheet.tsx`(네이티브 dialog). 새 UI 의존성을 추가하지 않는다.
- 높이는 `h-dvh`·`env(safe-area-inset-*)` 기준, `100vh`·`h-screen` 금지.
```
선행 스펙 §10의 `url: '/chat/rooms?room=<roomId>'` 표기를 `url: '/chat/rooms/<roomId>'`로 바꾸고 옆에 `(2026-10-15 모바일 UI 개편)`.

- [ ] **Step 4: 커밋**

```bash
git add client/AGENTS.md docs/superpowers/specs/2026-10-13-supabase-migration-design.md
git commit -m "docs: 모바일 화면 구조 규칙, 푸시 URL 갱신

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: 운영 반영 안내(실행은 사용자 확인 후)**

병합·push 전 사용자에게 확인받을 것: 운영 DB `db push`(Task 1 마이그레이션), Edge Function `send-push` 재배포(`functions deploy send-push --no-verify-jwt`), 이후 `main` push(Vercel 배포). 실기기 체크리스트(사용자 수동): 안드로이드 크롬·iOS 사파리에서 홈 화면 추가, 키보드 올라올 때 입력창 위치, 길게 누르기, 다크 모드 상태 표시줄 색.
