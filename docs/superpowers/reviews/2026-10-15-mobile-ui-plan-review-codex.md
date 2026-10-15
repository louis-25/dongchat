# 모바일 UI 개편 계획 검토 (Codex)

**판정: 수정 후 진행 가능 (ready with fixes).** Task 3의 컴파일 오류와 목록 실시간 정합성 검증 공백을 먼저 고쳐야 한다.

## Critical

### C1. Task 3 / Step 3 `room-list.ts` (계획 788행)

- **실패:** 제시된 코드에서 `const counts = ...`가 바로 앞 `//` 주석 뒤에 붙어 주석 처리된다. 이어지는 794행의 `counts`가 미정의여서 `pnpm exec tsc --noEmit`가 실패한다.
- **근거:** 계획 788행은 `return ...; // ... const counts = ...` 한 줄이고, 794행이 `counts`를 참조한다.
- **수정:** 중복 반환문 뒤에서 줄을 바꿔 `const counts = ...`를 독립 실행문으로 둔다. 이 코드 경로(타인/내 메시지, viewing 여부)를 unit test로 유지한다.

### C2. Task 3·5 / 목록 Realtime 설계 및 검증

- **실패:** `applyRoomEvent`는 방 채널에서 온 `message`만 요약 캐시에 반영한다. 그러나 `member_added`는 본인 `user:<uuid>` 채널로만 수신되며, 현재 `ChatProvider`는 이 이벤트를 listener에 emit하지 않는다. 계획은 `invalidateQueries({ queryKey: ROOMS_QUERY_KEY })`의 prefix 특성에 암묵적으로 의존하지만, `useRoomSummariesSync` 테스트는 이 경로·새 방 추가·요약 캐시 갱신을 전혀 검증하지 않아 친구에서 새 1:1 방을 연 뒤 목록이 stale한 회귀를 잡지 못한다.
- **근거:** 실제 [chat-provider.tsx](C:/Exception/Project/louis-25/dongchat/client/src/components/chat-provider.tsx:101)는 user 이벤트에서 `refreshRooms()`만 호출하고 listener를 호출하지 않는다. 계획 1322~1325행은 요약 키를 `['rooms','summaries']`로 만들고 1376행은 부모 키 `['rooms']`를 invalidate한다.
- **수정:** `member_added`/자기 `member_removed`의 요약 무효화를 명시적 요구사항으로 만들고, 새 방 user 이벤트 뒤 `['rooms','summaries']`가 refetch되는 hook/integration test를 추가한다. 더 단순하게는 user 이벤트도 hub로 emit하고 reducer가 `member_added`를 `refetch: true`로 처리하되, 중복 refetch는 500ms debounce 하나로 통합한다.

## Important

### I1. Task 1 / Step 1 `130_room_list.test.sql` (132~136행)

- **실패:** 삭제 메시지를 `update public.messages`로 만들면 `messages_broadcast`와 push/realtime trigger까지 실제로 실행된다. 테스트 목적은 RPC 집계인데 외부 Realtime/웹훅 상태에 의존해 로컬 환경에서 느려지거나 실패할 수 있고, 삭제 update가 이벤트를 내보낸다는 계약도 별도로 검증하지 않는다.
- **근거:** 실제 메시지 테이블은 deleted 상태에서 빈 content를 허용한다([20261013061219_rooms.sql](C:/Exception/Project/louis-25/dongchat/supabase/migrations/20261013061219_rooms.sql:23)); UPDATE trigger는 항상 broadcast한다([20261013062012_realtime.sql](C:/Exception/Project/louis-25/dongchat/supabase/migrations/20261013062012_realtime.sql:59)). 현재 realtime 테스트도 이 side effect를 따로 다룬다([070_realtime.test.sql](C:/Exception/Project/louis-25/dongchat/supabase/tests/database/070_realtime.test.sql:42)).
- **수정:** 이 테스트는 트리거가 실행되는 것을 전제로 `lives_ok`/격리 방침을 명시하거나, 테스트 fixture 생성 방법을 정한다. 삭제 RPC와 트리거 계약은 070 계열에 독립 assertion으로 둬 목록 테스트의 원인을 분리한다.

### I2. Task 1 / Step 1 `array_agg(name)` 정렬 assertion (142행)

- **실패:** SQL 외부 쿼리의 `array_agg(name)`에는 순서 보장이 없다. 함수의 `ORDER BY` 결과를 현재 PostgreSQL 실행계획에서 우연히 보존하더라도 계획 변경 시 `최근 활동 순` 테스트가 flaky해진다.
- **근거:** 계획은 `select array_agg(name) from public.list_my_rooms()`로 검사한다. 함수 자체의 정렬은 계획 258행에만 있다.
- **수정:** `array_agg(name order by coalesce(last_message_at, created_at) desc, room_id desc)` 또는 `array(select name from public.list_my_rooms())`로 순서를 assertion에 고정한다.

### I3. Task 1 / `open_direct_room`의 기존 방 선택 (289~299행)

- **실패:** 현재 조건은 두 사용자가 포함된 `is_group=false` 방이면 참여자 수가 2명인지 확인하지 않고 재사용한다. 현재 RPC만으로는 보통 만들 수 없지만, 운영 데이터/관리자 SQL로 3인 direct 방이 생기면 잘못된 방을 반환한다.
- **근거:** 설계는 “둘 모두 참여 중인 기존 1:1 방”만 재사용하도록 요구한다(명세 §5.2). 실제 `create_room`은 1:1에 다른 참여자 1명만 허용한다([20261013061219_rooms.sql](C:/Exception/Project/louis-25/dongchat/supabase/migrations/20261013061219_rooms.sql:126)), 하지만 DB에 direct-room participant-count 제약은 없다.
- **수정:** 후보 쿼리에 `and (select count(*) from public.chat_room_participants p where p.room_id = r.id) = 2`를 추가하고, 3인 비정상 후보를 건너뛰는 pgTAP을 넣는다. advisory lock·`lower(trim())`·definer에서 `public.create_room` 호출 자체는 현재 계약과 호환된다.

### I4. Task 5 / 이동 상태와 알림 액션 (1428~1438행)

- **실패:** 계획은 in-app 토스트의 “열기”에만 `markInAppNav()`를 추가한다. 친구 행/RoomRow/그룹 생성 등 모든 방 진입 경로가 `useRoomActions.enter()`만 사용하지 않으면 상세 화면의 `consumeInAppNav()`가 stale한 sessionStorage 값에 의해 `router.back()`을 수행해 앱 밖으로 나갈 수 있다.
- **근거:** 현재 토스트는 `setPickedRoomId` 후 `/chat/rooms`로만 이동한다([useInAppNotification.ts](C:/Exception/Project/louis-25/dongchat/client/src/hooks/useInAppNotification.ts:25)). 명세 §2는 직접/알림 주소와 앱 내 이동을 구별한다. 계획의 nav test는 key의 일회 소비만 확인한다(667~673행).
- **수정:** 방으로 가는 모든 UI를 `enterRoom(id)` 한 함수로 통일(마크 후 `push(roomPath(id))`)하고, 실제 history가 없는 직접 진입·알림·친구 행·목록 행 각각의 browser test를 추가한다. back 시에는 `history.length`만으로 판단하지 않는다.

### I5. Task 7 / `useLongPress`와 메시지 버블 (1823~1937행)

- **실패:** touch pointer의 500ms 타이머가 시작된 뒤 텍스트 선택/브라우저 long-press와 경쟁하고, 스크롤 시작이 10px 이하인 경우에도 메뉴가 열린다. 반대로 버블의 `select-none`과 `-webkit-touch-callout:none`는 복사/선택 UX를 막아 “길게 눌러 복사”가 불안정하다.
- **근거:** 계획은 pointer capture, `touch-action`, passive scroll/cancel 또는 long-press 후 click 억제를 제공하지 않는다(1840~1859행). 명세 §4.2는 500ms long press와 copy를 요구한다.
- **수정:** touch에는 `onPointerDown`에서 pointer capture, 이동/scroll 시 취소, long-press 발생 뒤 `onClick` 억제, `touch-action: pan-y`를 설계하고 실제 mobile browser에서 스크롤·텍스트 선택·contextmenu를 모두 시험한다. `select-none`/touch-callout 금지는 필요한 범위만 적용한다.

### I6. Task 4 / 테마 부트스트랩과 외부 폰트 (1064~1137행)

- **실패:** 인라인 palette script는 `next-themes`가 `.dark`를 붙이기 전 light CSS를 먼저 그릴 수 있어 다크 FOUC를 막지 못한다. 또한 CDN Pretendard가 차단/지연되면 레이아웃이 바뀌는데 fallback·font-display·CSP 영향 검증이 없다.
- **근거:** 계획은 palette만 head script로 동기 설정하고 ThemeProvider는 client hydration 뒤에 실행한다(1095~1096, 1129행). 현재 Toaster도 `next-themes`의 resolved theme를 소비한다([sonner.tsx](C:/Exception/Project/louis-25/dongchat/client/src/components/ui/sonner.tsx:10)).
- **수정:** `ThemeProvider`의 no-flash script가 head에서 palette script보다 앞서도록 구현/검증하고, headless 새로고침에서 초기 `html.classList`와 `data-palette`를 paint 전 확인한다. 가능하면 허용된 정적 CSS 또는 `next/font/local`로 폰트를 self-host하고, CDN 유지 시 fallback 및 실패 시나리오를 명시한다.

### I7. Task 11 / 아이콘 라우트·proxy 검증 (3018~3072행)

- **실패:** `dynamicParams=false`로 인해 `/icons/nope.png`는 handler의 404가 아니라 static param 단계에서 404가 되며, 현재 proxy matcher가 `.png`를 제외하는 이유를 테스트하지 않는다. 향후 matcher 변경 시 manifest/icon 요청이 인증 redirect를 받아 PWA 설치가 실패할 수 있다.
- **근거:** 계획 3031~3035행, 실제 proxy matcher는 `png|webmanifest`를 제외한다([proxy.ts](C:/Exception/Project/louis-25/dongchat/client/src/proxy.ts:9)).
- **수정:** 기대를 “404”로만 두고 handler 응답이라고 주장하지 말며, unauthenticated curl로 manifest와 세 아이콘의 status/content-type/redirect 없음까지 검사한다. `MetadataRoute.Manifest`, async `params: Promise<...>`, `ImageResponse`, `generateStaticParams` 조합은 Next 16.0.10 API와 양립한다.

## Minor

### M1. Task 4 / `<dialog>` Sheet 스타일

- **실패:** native `<dialog>`는 UA 기본 margin, border, backdrop을 갖고 Tailwind preflight만으로 바텀 시트가 되지 않는다. 모바일에서 중앙 작은 dialog 또는 backdrop 없는 화면이 될 수 있다.
- **근거:** 계획은 “네이티브 `<dialog>`”만 지정하고 reset/`::backdrop`/`showModal()` 실패·Esc·focus restore 요구를 제시하지 않는다. 명세 §6은 Radix Dialog 기반 Sheet를 요구해 계획의 선택과도 충돌한다.
- **수정:** 명세대로 기존 Radix 기반 Sheet를 쓰거나, native 선택을 승인받고 `fixed inset-x-0 bottom-0 m-0`, `max-w-none`, `::backdrop`, focus/close 이벤트와 접근성 테스트를 명시한다.

### M2. Task 4·7 / 키보드 높이

- **실패:** `viewport.interactiveWidget='resizes-content'`와 `h-dvh`만으로 iOS Safari/PWA의 IME가 항상 입력창을 피한다는 보장은 없다.
- **근거:** 명세 §4.2는 safe-area 고정 입력창을 요구하지만, 계획은 Android Chrome 주석만 둔다(1078~1084행). iOS는 interactive-widget를 지원하지 않는 경우가 있다.
- **수정:** composer에 `padding-bottom: env(safe-area-inset-bottom)`을 명시하고 iOS 실기기/PWA 수동 체크를 필수 gate로 둔다. 필요 시 `visualViewport` 보정은 별도 범위와 테스트를 잡아 도입한다.

### M3. Task 3 / 시간·timeline 테스트의 환경 고정

- **실패:** 테스트가 로컬 timezone에 의존한다. Node 24의 `Intl('ko-KR')` 출력 자체는 계획 기대값(예: `오후 3:12`, `10월 9일`, `2026. 10. 15. 목요일`)과 맞지만, ISO를 local Date로 만들고 formatter timezone을 지정하지 않아 CI timezone이 달라지면 날짜 경계와 divider가 바뀐다.
- **근거:** 계획 537~539, 583~585행은 local `new Date(...)`와 `toISOString()`을 섞고, format 구현은 timezone을 지정하지 않는다(693~711행).
- **수정:** `TZ=Asia/Seoul`로 test script를 고정하거나 모든 fixture/formatter에 `timeZone: 'Asia/Seoul'`을 지정한다. 날짜 경계(자정 전후)도 추가한다.

### M4. Task 5·7 / 관리자 호환성 순서

- **실패:** Task 5에서 옛 `MessageList`를 이동한 뒤 Task 7에서 prop API를 전면 교체한다. Task 5의 RoomDetail import 변경은 필요하지만, Task 7까지 admin 화면은 옛 props(`hasRoom`, `onReply`, `onEdit`, `onDelete`)를 계속 제공해야 한다. 계획의 “Task 5 완료마다 lint/tsc” 규칙상 이동 커밋에서 누락하면 즉시 깨진다.
- **근거:** 실제 admin 호출은 해당 옛 props를 준다([RoomDetail.tsx](C:/Exception/Project/louis-25/dongchat/client/src/app/(protected)/admin/rooms/RoomDetail.tsx:83)); 실제 옛 MessageList도 이를 필수로 선언한다([MessageList.tsx](C:/Exception/Project/louis-25/dongchat/client/src/app/(protected)/chat/[menu]/_components/ChatRooms/components/MessageList.tsx:8)). 새 API는 Task 7의 1949~1957행이다.
- **수정:** Task 5 이동 직후 admin `tsc` 체크를 명시하고, Task 7에서 RoomDetail의 새 props 교체를 같은 원자적 변경으로 유지한다. `leave.mutate`는 두 번째 options 인자를 받을 수 있으므로 2372행은 타입상 문제 없다.

### M5. 명세/계획 커버리지

- **실패:** 명세 §7의 목록 로드 실패 재시도 UI와 §8의 `verify-chat.mjs` RPC 계약 확장은 계획의 파일 구조·Task 12에서 구체적인 구현/검증이 없다. “브라우저 9단계”도 route/UI 중심이라 RPC 응답 mapping과 retry button 회귀를 잡지 못한다.
- **근거:** 명세 146~157행, 현재 verify는 별도 Node script([verify-chat.mjs](C:/Exception/Project/louis-25/dongchat/client/scripts/verify-chat.mjs))이며 Task 2의 일부 예시만 수정한다.
- **수정:** Task 2에 `verify-chat.mjs`의 `list_my_rooms`/`open_direct_room` 정상·재사용·매핑 assertion을, Task 6에 error/retry state와 test를 추가한다.

---

## Claude 판정 (2026-10-15)

검증: 계획의 SQL(마이그레이션 + 130·140 pgTAP 22개)을 로컬 DB에서 롤백 트랜잭션으로 실행 → 22/22 ok(I2 반영 후 130 재실행 12/12). Node 24 `Intl ko-KR` 출력이 계획 기대값과 일치.

| 항목 | 판정 | 근거 / 조치 |
|---|---|---|
| C1 | 기각 | 계획 797·798행은 서로 다른 줄(`cat -A`로 확인). 주석이 `const counts`를 삼키지 않는다. |
| C2 | 부분 반영(Important로 조정) | TanStack `invalidateQueries(["rooms"])`는 기본이 접두사 매칭이라 `["rooms","summaries"]`도 다시 받는다 — 동작은 맞음. 검증 공백은 인정 → Task 12 Step 1-3에 "상대가 만든 방이 새로고침 없이 목록에 나타남" 확인 추가. |
| I1 | 기각 | 030·070도 같은 방식으로 UPDATE·트리거를 실행한다. 트랜잭션 롤백이라 broadcast·pg_net 큐는 남지 않고, 실제 실행이 빠르게 통과했다. |
| I2 | 반영 | `array(select name from public.list_my_rooms())`로 교체. |
| I3 | 기각(YAGNI) | 방·참여자는 `create_room`으로만 생기며 1:1은 정확히 2명을 강제한다. 참여자 추가 RPC가 없어 3인 1:1은 만들 수 없다. |
| I4 | 기각 | 방 진입 경로는 `RoomRow`·`useRoomActions.enter`·인앱 알림 세 곳 모두 `markInAppNav()`를 호출하고, 방 화면은 마운트 때 값을 바로 소비한다. 직접 주소 진입은 Task 12 Step 1-5가 확인. |
| I5 | 기각 | 터치 스크롤이 시작되면 브라우저가 `pointercancel`을 보내 타이머가 취소된다(기본 touch-action). 글자 선택 차단은 의도(복사는 메뉴로). 실기기 길게 누르기는 수동 체크리스트에 있음. |
| I6 | 기각 | next-themes 0.4는 ThemeProvider가 렌더하는 동기 `<script>`로 첫 페인트 전에 `.dark`를 붙인다. 팔레트 스크립트는 `<head>`. Pretendard CSS는 `font-display: swap`이고 글꼴 스택에 시스템 폴백이 있다. Task 12 Step 1-6이 새로고침 유지를 확인. |
| I7 | 기각 | Task 11 Step 3의 curl은 쿠키 없이(비로그인) 요청하고 200·content-type을 본다(redirect면 307). 404의 출처는 중요하지 않다. |
| M1 | 기각 | 클래스로 UA 기본값(위치·margin·max-width/height·backdrop)을 모두 덮는다. Radix 대신 네이티브는 "새 의존성 없음" 원칙에 따른 계획 ruling. |
| M2 | 기각 | Composer에 `pb-[env(safe-area-inset-bottom)]`가 이미 있고 iOS 실기기 확인은 수동 체크리스트에 있다. |
| M3 | 기각 | 테스트 fixture(로컬 `new Date(y,m,d,h,mi)`)와 formatter가 같은 로컬 시간대를 쓰므로 TZ와 무관하게 같은 결과. |
| M4 | 기각 | 계획대로다: Task 5는 옛 MessageList를 옮겨 옛 props 그대로 쓰고, Task 7이 MessageList와 RoomDetail을 함께 바꾼다. |
| M5 | 기각 | 목록 실패 재시도 UI는 Task 6 Step 3(`isError` → 다시 시도), verify-chat 확장은 Task 2 Step 5에 있다. |
