# client/AGENTS.md — 프론트엔드 가이드

dongchat 프론트엔드(Next.js)에서 코드를 작성·수정할 때 따라야 하는 규칙입니다.
루트 [AGENTS.md](../AGENTS.md)의 스킬·context7 규칙이 그대로 적용되며, 이 문서는 그 위에 프로젝트 고유의 구조·컨벤션을 정의합니다.

## 기술 스택

- **Next.js 16** (App Router) / **React 19** / **TypeScript**
- **pnpm** (패키지 매니저) — `npm`이 아닌 `pnpm` 사용
- **TanStack React Query v5** + **Orval** (백엔드 OpenAPI에서 API 클라이언트·훅 자동 생성)
- **Jotai** — 전역 클라이언트 상태
- **NextAuth v5 (beta)** — Credentials + Kakao OAuth
- **axios** — 커스텀 인스턴스 + 토큰 갱신 인터셉터
- **socket.io-client** — 실시간 채팅
- **shadcn/ui** (new-york 스타일) + **Tailwind CSS v4** + **Radix UI** + **lucide-react**
- **react-hook-form** + **yup** / **zod** (폼·검증)
- **sonner** (토스트), **web-push** (브라우저 푸시 알림)

## 디렉터리 구조

```
src/
  app/                       # App Router 라우트
    (protected)/             # 인증 필요 라우트 그룹 (chat, admin)
    (public)/(auth)/         # 비인증 라우트 (login, join)
    api/auth/[...nextauth]/  # NextAuth 핸들러
  components/
    ui/                      # shadcn/ui 컴포넌트 (직접 수정 지양)
    auth/ layout/ common/    # 도메인·공용 컴포넌트
    *-provider.tsx           # 전역 Provider
  hooks/                     # 공용 훅 (useAuth, useToast, usePushNotification …)
  hooks/api/                 # Orval 훅을 감싼 의미 있는 별칭 훅
  services/                  # ⚠️ Orval 자동 생성 — 직접 수정 금지
  lib/api/models/            # ⚠️ Orval 자동 생성 타입 — 직접 수정 금지
  lib/api-client.ts          # axios 커스텀 인스턴스 (Orval mutator)
  lib/error-handler.ts       # 에러 code → 한글 메시지 매핑
  store/                     # Jotai atom
  config/                    # 환경 변수 정규화 (BASE_URL, joinUrl …)
```

기능별 화면은 **feature 폴더 패턴**을 따릅니다. 라우트 폴더 안 `_components/<Feature>/`에
`components/`, `hooks/`, `schemas.ts`, `types.ts`, `index.tsx`를 둡니다
(예: [chat/[menu]/_components/ChatRooms](src/app/(protected)/chat/[menu]/_components/ChatRooms)).

## API 통신 규칙

- **API 훅은 직접 작성하지 않습니다.** 백엔드 Swagger(`/api-docs-json`)에서 Orval로 생성합니다.
  - 백엔드 변경 후: `pnpm generate:api` 실행 → `src/services/`, `src/lib/api/models/` 재생성
  - 설정: [orval.config.ts](orval.config.ts) (react-query v5, `staleTime` 60s, mutator = `customInstance`)
- 생성된 훅은 [hooks/api/](src/hooks/api/)에서 의미 있는 이름으로 re-export 해 사용합니다.
- 모든 요청은 [lib/api-client.ts](src/lib/api-client.ts)의 axios 인스턴스를 거칩니다.
  - 401 응답 시 `refreshToken`으로 자동 토큰 갱신 + 실패 요청 큐 재시도
  - 에러는 `ApiError` 형태로 정규화 → [lib/error-handler.ts](src/lib/error-handler.ts)에서 `code` 기준 한글 메시지 변환

## 인증·토큰 규칙

- **NextAuth(JWT 전략)** 세션에서 백엔드 토큰을 받아 클라이언트로 전달 ([auth.ts](src/auth.ts)).
- 토큰 저장 위치를 반드시 지킬 것:
  - `refreshToken` → **localStorage**
  - `accessToken` → **sessionStorage** + 메모리(`setAccessToken`)
  - 사용자 정보 → sessionStorage + Jotai `userAtom`
- 세션·토큰 동기화는 [hooks/useAuth.tsx](src/hooks/useAuth.tsx)에서 처리. 새 인증 흐름은 여기에 맞춥니다.

## 상태·실시간 규칙

- 서버 상태는 React Query, 전역 클라이언트 상태는 Jotai atom([store/](src/store/))로 분리.
- **Hydration mismatch 방지**: atom 초기값은 항상 `null`로 두고 실제 값은 `useEffect`(클라이언트)에서 주입.
- 소켓은 [components/chat-provider.tsx](src/components/chat-provider.tsx)의 `ChatProvider`/`useChat`로만 접근.
  cleanup에서 `disconnect()`하지 않습니다(탭 이동 시 재연결 끊김 방지) — `beforeunload`에서만 해제.

## 컨벤션

- import 경로는 `@/` alias 사용 ([components.json](components.json) 참조).
- UI는 `src/components/ui`(shadcn) 위에 조합. 새 primitive가 필요하면 shadcn CLI로 추가.
- 폼은 react-hook-form + resolver(yup/zod), 검증 스키마는 feature 폴더의 `schemas.ts`에 둡니다.
- 사용자 알림은 `useToast`(sonner) 사용. `alert()` 금지.
- 프로덕션 머지 전 `console.log` 디버그 로그는 제거하거나 의도된 것만 남깁니다(현재 다수 존재).

## 자주 쓰는 명령

```bash
pnpm dev            # 개발 서버
pnpm build          # 프로덕션 빌드
pnpm lint           # ESLint
pnpm generate:api   # 백엔드 Swagger 기반 API 코드 재생성
```
