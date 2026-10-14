# AGENTS.md

이 저장소에서 코드를 작성·수정할 때 따르는 규칙입니다.

## 구조
- `client/` — Next.js 16 프론트엔드. 세부 규칙은 [client/AGENTS.md](client/AGENTS.md).
- `supabase/` — 백엔드: `migrations/`(스키마·RLS·RPC·트리거), `tests/database/`(pgTAP), `functions/`(Edge Function), `seed.sql`.
- 설계 기준 문서: `docs/superpowers/specs/2026-10-13-supabase-migration-design.md`.

## 백엔드 (Supabase)
- DB 변경은 항상 마이그레이션으로: 테이블·함수 생성과 함께 명시적 GRANT/REVOKE, 모든 public 테이블 RLS.
- 함수는 `security definer`이면 `set search_path = ''`와 스키마 한정 이름, `revoke execute from public, anon`.
- 권한 판단은 DB(`private.is_active_session()`, `private.is_admin()`, RLS)가 한다. 클라 검사는 표시용.
- RPC 에러는 `raise exception '<CODE>' using hint = '<사용자 메시지>'`. 코드는 스펙 §5.5.
- 변경 후 `npx -y supabase@2.120.0 test db`와 `db advisors --local` 확인, 새 동작에는 pgTAP을 먼저 쓴다.

## 프론트엔드 (React / Next.js)
- **`/vercel-react-best-practices`**, **`/vercel-composition-patterns`**, **`/vercel-react-view-transitions`**, **`/frontend-design`** 스킬을 참고한다. 적용 대상: `client/`.

## 라이브러리·프레임워크 코드 작성 규칙
라이브러리나 프레임워크 관련 코드를 작성할 때는 **항상 context7 MCP를 참고**하여 최신 API 스펙에 기반해 작성합니다.
- 사용 도구: `mcp__plugin_context7_context7__resolve-library-id` → `mcp__plugin_context7_context7__get-library-docs`
