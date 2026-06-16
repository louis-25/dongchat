# AGENTS.md

이 문서는 이 저장소에서 코드를 작성·수정할 때 따라야 하는 규칙을 정의합니다.

## 코드 작성 가이드

### 백엔드 (NestJS)

백엔드 코드를 작성하거나 리뷰·리팩터링할 때는 **`/nestjs-best-practices`** 스킬을 참고합니다.

- 모듈 구성, 의존성 주입(DI), 보안, 성능 패턴을 프로덕션 기준으로 적용
- 적용 대상: `server/` 등 NestJS 기반 코드

### 프론트엔드 (React / Next.js)

프론트엔드 코드를 작성하거나 리뷰·리팩터링할 때는 아래 스킬을 참고합니다.

- **`/vercel-react-best-practices`** — React/Next.js 성능 최적화, 데이터 패칭, 번들 최적화
- **`/vercel-composition-patterns`** — 컴포넌트 합성 패턴(compound components, render props, context), React 19 API 변경 사항
- **`/vercel-react-view-transitions`** — View Transition API 기반 페이지·요소 전환 애니메이션
- **`/frontend-design`** — 의도적이고 차별화된 비주얼 디자인 방향, 타이포그래피

적용 대상: `client/` 등 React/Next.js 기반 코드

## 라이브러리·프레임워크 코드 작성 규칙

라이브러리나 프레임워크 관련 코드를 작성할 때는 **항상 context7 MCP를 참고**하여 최신 API 스펙에 기반한 답변과 코드를 제공합니다.

- 사용 도구: `mcp__plugin_context7_context7__resolve-library-id` → `mcp__plugin_context7_context7__get-library-docs`
- 기억(memory)이나 추측에 의존하지 말고, 해당 라이브러리의 최신 문서를 조회한 뒤 코드 작성
- 적용 시점: 외부 라이브러리/프레임워크의 API·설정·패턴을 사용할 때
