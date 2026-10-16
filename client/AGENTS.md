# client/AGENTS.md — 프론트엔드 가이드

루트 [AGENTS.md](../AGENTS.md)의 규칙 위에 프론트엔드 고유 규칙을 정의합니다.

## 기술 스택
- Next.js 16 (App Router, `proxy.ts`) / React 19 / TypeScript, pnpm
- Supabase: `@supabase/supabase-js`, `@supabase/ssr`(쿠키 세션) — 버전 고정
- TanStack React Query v5(서버 상태), shadcn/ui + Tailwind v4, react-hook-form + yup/zod, sonner

## 계층과 경계 (백엔드 교체 경계)

```
app/, components/   UI — Supabase를 모른다
  hooks/            React Query 훅, ChatProvider(Realtime 구독 허브)
    services/       순수 async 함수 + subscribe 함수, types/domain.ts 타입 반환 ★교체 경계
    lib/supabase/   브라우저·서버 클라이언트
```

- `@supabase/*`, `@/lib/supabase/*` import는 `src/services/**`, `src/lib/supabase/**`, `src/proxy.ts`, `src/app/auth/callback/**`에서만(ESLint로 강제).
- `database.types.ts`는 services 내부 전용(`supabase gen types`로 재생성). services는 `types/domain.ts`로 변환해 반환하고, 에러는 `DomainError {code, message}`로 던진다(`services/errors.ts`).
- PostgREST SELECT 문자열과 row→domain 매퍼는 `services/mappers.ts`(상대 경로·type-only import만 — Node 테스트·통합 스크립트가 직접 import).
- 표시명은 `displayName()`(nickname ?? username). 사용자 알림은 `useToast`, 확인은 `confirm()`, `alert()` 금지.

## 실시간 규칙
- `ChatProvider`(`(protected)` 레이아웃)가 참여 방마다 `room:<id>`, 본인 `user:<uuid>` 비공개 채널을 구독한다. 관리자 열람은 `watchRoom(id)`.
- 채널 (재)구독(`SUBSCRIBED`)마다 스냅샷을 다시 받아 id로 병합한다. user 채널은 구독 성공·거부 때 세션(`get_me`)·방 목록을 재확인한다(10초 제한). 상태 규칙은 `lib/chat-state.ts`(순수 함수, 단위 테스트).
- 같은 토픽 재구독은 `lib/topic-gate.ts`를 거친다(realtime-js가 해제 중인 채널을 돌려주는 문제).
- 접속자가 없으면 Realtime이 약 10분 뒤 테넌트를 내리고, 다음 접속 때 복제 슬롯을 다시 만든다. `SUBSCRIBED`가 슬롯 생성(~0.1초)보다 먼저 와서 그 사이 DB 송출은 유실된다(2026-10-17 로그로 확인). 앱은 재구독 스냅샷으로 메우므로 영향 없음. 검증 스크립트가 오래 쉰 뒤 첫 실행에서 이벤트를 못 받으면 다시 실행한다.

## 웹 푸시
- 켜는 흐름: 브라우저는 사용자 동작 없이 허락 창을 띄울 수 없다. 채팅 목록의 `PushPrompt`가 [켜기]로 묻고(닫으면 7일 숨김), 이미 허용한 브라우저는 채팅 레이아웃의 `usePushNotification({ autoRegister: true })`가 로그인마다 자동 등록한다. 설정에서 직접 끄면 `dongchat.pushOptOut`이 남아 자동 등록·안내를 하지 않는다. 판단은 `lib/push-prompt.ts`(단위 테스트).
- 구독 저장은 `services/push.ts`(`register_push_subscription` RPC — 같은 브라우저 endpoint는 등록한 사용자에게 이전). 로그아웃 시 이 브라우저 구독을 지운다.
- 발송은 서버(메시지 트리거 → Edge Function `send-push`). 알림 URL은 `/chat/rooms/<id>`(예전 `?room=<id>`는 목록 화면이 새 주소로 넘긴다).

## 화면 구조(모바일 우선)
- 라우트: `/chat/friends`, `/chat/rooms`, `/chat/rooms/[id]`(하단 탭 숨김), `/chat/settings`, `/invite/[code]`(친구 초대 수락), `/login`, `/join`, `/admin/*`(PC용).
- 로그인 복귀: proxy가 비로그인 접근을 `/login?next=<경로>`로 보내고, 로그인·가입·카카오 콜백은 `lib/safe-next.ts`의 `safeNext`로 검증한 경로로 돌아간다(같은 사이트 경로만, 로그인 화면 제외).
- 선택된 방은 주소가 기준이다(전역 상태 없음). 방으로 이동할 때는 `markInAppNav()` 후 `roomPath(id)`.
- 색은 `lib/theme.ts`가 단일 출처(대비 테스트 포함). 컴포넌트는 `bg-background`, `text-muted-foreground`, `bg-bubble-me` 같은 토큰만 쓰고 hex·`gray-*`·`blue-*`를 쓰지 않는다.
- 시트·메뉴는 `components/ui/sheet.tsx`(네이티브 dialog). 새 UI 의존성을 추가하지 않는다. 예외: 반응 이모지 선택기 `frimousse`(2026-10-17 사용자 요청, `EmojiPickerSheet`를 next/dynamic으로 필요할 때만 로드).
- 높이는 `h-dvh`·`env(safe-area-inset-*)` 기준, `100vh`·`h-screen` 금지.
- 누름 반응: 폰에는 hover가 없다. 새 버튼·링크는 `pressable`(작아짐+어두워짐), 목록 행은 `pressable-row`(배경만)를 붙이고, 서버 요청 버튼은 `<Button loading>`으로 처리 중을 보인다. `hover:`만으로 상태를 표시하지 않는다.
- 토스트는 상단 바 아래(offset 64px)에 뜬다 — 상단 버튼을 가리지 않게.

## React 규칙
- effect 본문에서 동기 setState 금지, 렌더 중 ref 읽기/쓰기 금지(React 19 hooks lint). 브라우저 전용 값은 `useSyncExternalStore`(서버 스냅샷)로.
- 훅이 돌려주는 함수는 렌더마다 같아야 한다(의존성에 넣으면 effect가 반복된다 — `useToast` 사례).

## 명령

```bash
pnpm dev | pnpm build | pnpm lint | pnpm test     # test = node --test (src/**/*.test.ts)
pnpm verify                                        # 로컬 Supabase 통합 검증(DEV_SETUP.md 참고)
```
