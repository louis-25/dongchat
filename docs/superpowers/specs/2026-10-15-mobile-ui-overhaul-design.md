# dongchat 모바일 UI 개편 (1단계) 설계

- 작성: 2026-10-15
- 상태: 브레인스토밍 섹션 1~4 승인, spec 리뷰 대기
- 근거: 브레인스토밍 시안(`.superpowers/brainstorm/`), 팀 구성 검토 `../reviews/2026-10-15-ui-overhaul-team-review-codex.md`
- 선행 스펙: `2026-10-13-supabase-migration-design.md`(스키마·RPC·이벤트·에러 계약의 기준)

---

## 1. 목적·범위

### 1.1 목적
요즘 채팅 앱 수준으로 **폰에서 쓰기 편한** dongchat. 친구들과 실제로 쓰는 앱이며 홈 화면에 설치해 앱처럼 쓴다.

### 1.2 성공 기준
1. 채팅 목록에서 방마다 마지막 메시지·시간·안 읽은 수가 한눈에 보인다.
2. 방에 들어갔다가 폰 뒤로가기로 목록에 돌아온다(방마다 고유 주소).
3. 폰 키보드가 올라와도 입력창이 가려지지 않는다.
4. 친구를 누르면 1:1 대화로 바로 들어간다(같은 친구와 방이 중복 생성되지 않음).
5. 홈 화면에 설치할 수 있다(manifest·아이콘·테마색).
6. 사용자가 색 테마(민트·파랑·노을)와 밝기(라이트·다크·기기 설정)를 고를 수 있다.

### 1.3 범위
- **포함:** 디자인 토큰·테마, 앱 셸·하단 탭, 주소 구조, 채팅 목록 정보(백엔드 RPC 1개), 1:1 방 열기(RPC 1개), 대화방 UX(묶기·날짜선·메시지 메뉴·답장·수정·새 메시지 버튼), 친구 화면, 로그인/가입 화면, 설정 화면(테마·밝기·알림·닉네임·로그아웃·관리자 이동), PWA 설치.
- **제외(2단계):** 입력 중 표시, 이미지/파일 전송, 메시지 검색, 프로필 사진 업로드, 관리자 화면 개편(공통 토큰만 자동 적용), PC 2열 배치, 오프라인 동기화.

### 1.4 제약
- `client/src/services/` 경계 유지(NestJS 복귀 가능성). 화면은 services·`lib/chat-state.ts`를 통해서만 데이터에 접근.
- DB 변경은 마이그레이션 + pgTAP 선행, 선행 스펙 §3·§5 원칙(GRANT/REVOKE, `security definer` + `search_path = ''`, 에러는 §5.5 코드) 그대로.
- 새 런타임 의존성 없음. `next-themes`, `lucide-react`, shadcn/ui(Radix)는 이미 설치됨. Pretendard 글꼴만 추가(정적 웹폰트 CSS 또는 `next/font/local`).

---

## 2. 화면 구조와 이동

| 주소 | 화면 | 하단 탭 |
|---|---|---|
| `/chat/friends` | 내 프로필 카드, 받은 요청(수락·거절), 친구 목록. 상단 ＋ = 아이디로 친구 추가 | 보임 |
| `/chat/rooms` | 채팅 목록. 상단 ＋ = 그룹방 만들기 | 보임 |
| `/chat/rooms/[id]` | 대화방 전체 화면. 상단 ‹(목록으로)·방 이름·인원·☰(멤버/나가기/강퇴) | 숨김 |
| `/chat/settings` | 색 테마, 밝기, 알림 켜기/끄기, 내 프로필(닉네임 수정), 로그아웃, 관리자 화면(관리자만) | 보임 |
| `/login` | 카카오로 시작하기(최상단) → 이메일 로그인 → "회원가입" 링크 | – |
| `/join` | 이메일·아이디·비밀번호 가입 | – |

- 기존 `/chat/[menu]` 동적 세그먼트와 공통 `ProtectedHeader`는 제거하고, 화면마다 자기 상단 바를 둔다. `/chat`은 `/chat/rooms`로 보낸다.
- 하단 탭은 `(protected)/chat` 레이아웃에서 그리고, 방 화면(`/chat/rooms/[id]`)에서는 숨긴다.
- 알림 진입: 푸시 URL을 `/chat/rooms/<id>`로 바꾼다(Edge Function `send-push`). 이미 발송된 `/chat/rooms?room=<id>`는 목록 화면이 `/chat/rooms/<id>`로 `replace` 한다.
- 접근 불가 방(`CHAT_FORBIDDEN`/`CHAT_ROOM_NOT_FOUND`, 강퇴됨 등)으로 들어오면 토스트 후 `/chat/rooms`로 `replace`.
- PC: 같은 화면을 가운데 한 열(`max-w-md`)로 표시.
- 관리자(`/admin/*`)는 기존 구조 유지, 토큰 변경만 적용.

---

## 3. 시각 디자인

### 3.1 테마 토큰
shadcn 변수 이름(`--background`, `--foreground`, `--primary`, `--primary-foreground`, `--muted`, `--muted-foreground`, `--border`, `--card`, …)을 그대로 쓰고, 채팅 전용 변수 `--bubble-me`, `--bubble-me-foreground`, `--bubble-them`, `--bubble-them-foreground`를 추가한다. 테마는 `<html data-palette>` × `.dark` 클래스 조합으로 정의.

| 팔레트 | 모드 | background | foreground | primary | bubble-me / fg | bubble-them | muted-fg | border |
|---|---|---|---|---|---|---|---|---|
| mint(기본) | light | `#fbfaf7` | `#1d2a26` | `#0f7a63` | `#cfeee2` / `#0d3b30` | `#efece5` | `#7d8a85` | `#ebe8e1` |
| mint | dark | `#121816` | `#e6efeb` | `#4cc9a4` | `#1f5c4b` / `#e6fff6` | `#1f2a26` | `#86958f` | `#223029` |
| blue | light | `#ffffff` | `#14181f` | `#2f6bff` | `#2f6bff` / `#ffffff` | `#f1f3f7` | `#8a93a3` | `#eef0f4` |
| blue | dark | `#10131a` | `#e8ecf4` | `#6b95ff` | `#2f5bd6` / `#ffffff` | `#1c212c` | `#8a93a3` | `#232936` |
| dusk | light | `#fff8f4` | `#2a1d18` | `#e2583a` | `#ffd9cc` / `#4a1d10` | `#f3ebe6` | `#8f7f78` | `#efe3dc` |
| dusk | dark | `#171a26` | `#eef0f7` | `#ff7a59` | `#ff7a59` / `#1b1410` | `#262a3a` | `#8d93a8` | `#262a3a` |

- 상대 말풍선 글자색 = `foreground`. 접근성: 본문 대비 4.5:1 이상을 구현 시 확인하고 미달 값은 조정(값 변경은 ruling으로 기록).
- 모서리: 말풍선 상대 `6px 14px 14px 14px`, 내 것 `14px 6px 14px 14px`(mint 기준 시안), 아바타 `10px` 라운드 사각.
- 글꼴: Pretendard(본문 15px 기준), 숫자는 tabular.

### 3.2 테마 선택 저장
- 밝기: `next-themes`(`attribute="class"`, `defaultTheme="system"`, `enableSystem`).
- 팔레트: localStorage `dongchat.palette`(`mint|blue|dusk`, 기본 `mint`). `<head>`의 짧은 인라인 스크립트가 첫 페인트 전에 `data-palette`를 설정해 깜빡임 방지. 잘못된 값은 `mint`.
- `<meta name="theme-color">`는 현재 테마의 `background`로 갱신.

---

## 4. 화면별 동작

### 4.1 채팅 목록
- 정렬: 마지막 메시지 시각(없으면 방 생성 시각) 내림차순.
- 행: 아바타(1:1=상대, 그룹=방 이름 첫 글자), 이름(그룹은 옆에 인원 수), 미리보기(그룹은 `보낸사람: 내용`), 시간, 안 읽은 수 배지.
- 미리보기 예외: 삭제된 마지막 메시지 → "삭제된 메시지입니다", 메시지 없음 → "아직 메시지가 없어요".
- 시간: 오늘 → `오후 3:12`, 어제 → `어제`, 올해 → `10월 9일`, 그 이전 → `2025. 12. 3.`(ko-KR, 기기 시간대).
- 배지: 0이면 숨김, 100 이상은 `99+`.
- 빈 목록: "아직 대화가 없어요" + 친구 탭으로 가는 버튼.

### 4.2 대화방
- 날짜 구분선(날짜가 바뀌는 첫 메시지 위, `2026년 10월 15일 목요일`).
- 묶기: 같은 보낸이가 연속이고 간격 5분 이내면 한 묶음. 묶음 첫 메시지에만 상대 아바타·이름, 마지막 메시지에만 시간과 (내 메시지면) 안 읽은 인원 수.
- 안 읽은 인원 수: 기존 `chat-state.toViews`의 `unreadCount` 그대로(0이면 숨김).
- 메시지 메뉴: 길게 누르기(500ms) 또는 우클릭 → 하단 시트. 내 메시지 = 답장·복사·수정·삭제, 남의 메시지 = 답장·복사, 삭제된 메시지 = 메뉴 없음. 삭제는 확인 후 실행.
- 수정: 입력창에 기존 내용을 채우고 상단에 "메시지 수정 중 ✕" 바. 전송 = 저장.
- 답장: 입력창 위 "↩ 이름에게 답장: 내용 ✕" 바. 말풍선 안 인용 줄을 누르면 원문으로 스크롤(로드돼 있을 때만).
- 스크롤: 맨 아래 근처(80px)면 새 메시지에 자동으로 내려가고, 위를 보고 있으면 "새 메시지 N개 ↓" 버튼. 위 끝에 닿으면 과거 메시지 로드(기존 `loadOlder`).
- 키보드: 화면 높이를 `100dvh` 기반으로 잡고 입력창은 하단 고정 + `env(safe-area-inset-bottom)`. 입력창은 자동 높이(최대 5줄), Enter=전송·Shift+Enter=줄바꿈(PC), 폰은 전송 버튼.
- 상단 ☰: 기존 RoomHeader 기능(멤버 목록, 방장 강퇴, 나가기)을 시트로 옮김.

### 4.3 친구
- 친구 행 탭 → `open_direct_room(username)` → `/chat/rooms/<id>`.
- 추가: ＋ → 시트에서 아이디 입력 → 기존 `sendRequest`. 에러는 기존 코드 메시지.
- 아바타: `avatarUrl` 있으면 이미지, 없으면 표시 이름 첫 글자.

### 4.4 설정
- 색 테마 3개 카드(미리보기 색), 밝기 3단 세그먼트, 알림(기존 `usePushNotification`), 내 프로필(닉네임 수정: `profiles` 본인 update 권한 이미 있음, 1~20자, 빈 값이면 null), 로그아웃, 관리자(관리자만).

### 4.5 PWA
- `app/manifest.ts`: name `dongchat`, `display: standalone`, `start_url: /chat/rooms`, 아이콘 192/512(+maskable), `theme_color`·`background_color` = mint light.
- 설치 안내 배너: `beforeinstallprompt` 지원 브라우저에서 채팅 목록 하단에 표시, ✕로 닫으면 localStorage에 기록해 다시 안 띄움. iOS Safari(standalone 아님)는 "공유 → 홈 화면에 추가" 안내 문구. 이미 standalone이면 표시 안 함.
- 기존 `public/service-worker.js`(푸시)는 유지. 오프라인 캐시는 범위 밖.

---

## 5. 백엔드 (마이그레이션 1개)

### 5.1 `public.list_my_rooms()`
- `security definer`, `set search_path = ''`, `revoke execute from public, anon`, `grant execute to authenticated`. `private.is_active_session()` 아니면 `AUTH_SESSION_REVOKED`.
- 반환(행마다): `room_id bigint, name text, is_group boolean, created_at timestamptz, member_count int, last_message_id bigint, last_message_content text, last_message_deleted boolean, last_message_sender_id uuid, last_message_at timestamptz, unread_count int`.
- 대상: 호출자가 참여 중인 방만.
- 마지막 메시지: 방의 `id` 최대 메시지(삭제 포함, 삭제면 content는 null·deleted true).
- 안 읽은 수: `id > coalesce(내 last_read_message_id, 0)` 이고 `sender_id <> 나` 이고 삭제되지 않은 메시지 수.
- 정렬: `coalesce(last_message_at, created_at) desc`.
- 참여자 목록·프로필은 기존 방 조회(`services/rooms.ts`)를 그대로 쓰고, 이 RPC는 요약 정보만 준다. services에서 둘을 합쳐 `RoomSummary`로 매핑.

### 5.2 `public.open_direct_room(p_username text) returns bigint`
- 같은 보안 규칙. 상대 검증은 기존 `create_room`의 1:1 검증과 동일(없는 사용자·본인 → `ROOM_INVALID_PARTICIPANTS`).
- 두 사람이 모두 참여한 기존 1:1 방(`is_group = false`)이 있으면 그 id, 없으면 새로 만들어 id 반환(`create_room`과 같은 생성 경로 → 기존 `member_added` 브로드캐스트 유지).
- 동시성: 두 사용자 id를 정렬해 만든 키로 `pg_advisory_xact_lock` → 확인 → 생성.
- 한쪽이 나가 1명만 남은 1:1 방은 "기존 방"으로 보지 않는다(새로 만든다).

### 5.3 pgTAP (`supabase/tests/database/130_room_list.test.sql`, `140_direct_room.test.sql`)
- 목록: 비참여 방 제외, 정렬, 마지막 메시지 삭제 시 deleted true/content null, 안 읽은 수(내 메시지 제외, 삭제 제외, last_read 반영), 메시지 없는 방, 정지 세션 거부, anon 실행 불가.
- 1:1: 없으면 생성, 다시 부르면 같은 id(양방향), 본인/없는 사용자 거부, 그룹방은 재사용 안 함, 상대가 나간 방은 재사용 안 함.

---

## 6. 프론트 구조

- `app/(protected)/chat/layout.tsx`: 하단 탭 + 한 열 컨테이너. `chat/friends/page.tsx`, `chat/rooms/page.tsx`, `chat/rooms/[id]/page.tsx`, `chat/settings/page.tsx`. 기존 `chat/[menu]` 삭제.
- `components/chat-provider.tsx`: `pickedRoomId`/`setPickedRoomId` 제거(주소가 대신). `setViewingRoom`·`isViewing`·이벤트 허브는 유지.
- 목록 상태: `useRoomList` 훅 = 최초 `listMyRooms()` + 실시간 이벤트로 로컬 갱신(`message` → 해당 방 미리보기·시간·정렬, 내 메시지가 아니고 보고 있는 방이 아니면 unread+1; `message_edited` → 마지막 메시지면 미리보기 갱신; `message_deleted` → 보낸 사람·읽음 여부를 클라가 알 수 없으므로 `listMyRooms()` 재조회(500ms 디바운스); 내 `read_update` → unread 0; `member_added`(나) → 목록 재조회; `member_removed`(나) → 행 제거). 순수 갱신 함수는 `lib/room-list.ts`로 분리해 단위 테스트.
- 표시 계산 순수 함수(`lib/format.ts` 등): 목록 시간 포맷, 배지 텍스트, 날짜 구분선·묶기, 미리보기 문구, `?room=` → 새 주소 변환.
- services: `rooms.ts`에 `listMyRooms()`, `openDirectRoom(username)`; `auth.ts` 또는 `profile.ts`에 `updateNickname()`. 화면은 Supabase 직접 호출 금지.
- 컴포넌트는 기존 shadcn/ui를 토큰으로 다시 입히고, 하단 시트는 Radix Dialog 기반 공용 `Sheet` 하나로 메시지 메뉴·방 메뉴·친구 추가·그룹방 만들기에 재사용(새 의존성 추가 시 shadcn `sheet` 컴포넌트 추가만).

---

## 7. 에러 처리
- RPC/권한 에러는 기존 `DomainError` + 토스트. 새 코드 없음(§5.5 재사용).
- 목록 로드 실패: 다시 시도 버튼이 있는 빈 상태.
- 방 진입 실패: §2의 토스트 후 목록으로.
- 실시간 재연결 후: 목록은 `listMyRooms()` 재조회, 방은 기존 스냅샷 재동기화 유지.

---

## 8. 테스트·검증
1. pgTAP §5.3 먼저(RED→GREEN), `supabase test db`, `db advisors --local`.
2. `node:test` 단위: `lib/room-list.ts`, `lib/format.ts`, 주소 변환, 팔레트 값 검증.
3. 기존 `pnpm test`, `pnpm verify`, `tsc`, `lint` 통과(verify 스크립트는 새 RPC 계약 포함하도록 `verify-chat.mjs` 확장).
4. 헤드리스 Chrome 390×844: 로그인 → 친구 탭에서 친구 눌러 1:1 방 → 메시지 전송 → 뒤로가기로 목록 복귀 → 다른 계정 메시지로 배지·미리보기 갱신 → 방 진입 시 배지 0 → 길게 눌러 답장 → 설정에서 팔레트·다크 전환 후 새로고침 유지 → `/manifest.webmanifest` 응답 확인. 1280 폭에서 한 열 배치 확인.
5. Codex 구현 리뷰 후 수정 패스. 실기기(폰) 설치·키보드 확인은 사용자 수동 체크리스트.

## 9. 진행 방식
단일 구현자(Claude, inline executing-plans + TDD) → 헤드리스 확인 → Codex 구현 리뷰 → 수정. 계획 단계에서 Codex 플랜 리뷰. 병렬 서브에이전트는 쓰지 않는다(근거: 팀 구성 검토 문서).
