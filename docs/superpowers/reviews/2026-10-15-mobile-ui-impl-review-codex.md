# 모바일 UI 구현 리뷰 (4a3dd2b1..HEAD)

검토 기준: 계획·설계 문서, 현재 `client/src`·`supabase/` 코드, SDD ledger의 rulings. 실행 검증은 요청에 따라 하지 않았고, 이미 기록된 통과 결과를 전제로 코드 경로를 확인했다.

## Critical

- 없음.

## Important

- `client/src/components/chat/RoomRow.tsx:20-23`, `client/src/lib/nav.ts:12-24`, `client/src/app/(protected)/chat/rooms/[id]/page.tsx:39-40,58`: 목록의 `Link`는 모든 클릭에서 전역 `sessionStorage` 표식을 먼저 기록한다. 예를 들어 Ctrl/Cmd+클릭·가운데 클릭으로 새 탭을 열거나 클릭 뒤 이동이 취소되면 현재 탭에는 표식이 남고, 이후 그 탭에서 푸시/직접 URL로 방에 들어가면 `consumeInAppNav()`가 이를 인앱 이동으로 오인하여 ‹가 `router.back()`을 실행한다. 따라서 요구사항과 달리 앱 밖의 이전 페이지로 나갈 수 있다. 보조 클릭/수정 클릭은 표식을 남기지 않게 하고, 더 근본적으로는 방 id와 현재 history entry에 결합한 이동 상태를 `router.push` 직전에 기록·소비하도록 변경한다.

## Minor

- `client/src/hooks/useRouter.tsx:12`, `docs/superpowers/specs/2026-10-13-supabase-migration-design.md:322`: `git diff --check 4a3dd2b1..HEAD`가 두 trailing whitespace를 보고한다. 사용자 화면에는 즉시 영향이 없지만 표준 diff-hygiene 검사가 실패한다. 해당 줄 끝 공백을 제거한다.

판정: **ready after fixes**.

---

## Claude 판정 (2026-10-15)

| 항목 | 판정 | 조치 |
|---|---|---|
| Important: 새 탭·수정키 클릭이 이동 표시를 남김 | 반영 | `lib/nav.ts`에 `isPlainClick` 추가, `RoomRow`는 평범한 왼쪽 클릭에서만 `markInAppNav()`. 테스트 `새 탭·수정키 클릭은 앱 안 이동이 아니다` RED→GREEN, 단위 58/58. 방 화면이 마운트 때 표시를 바로 소비하므로 남는 경우는 이 경로뿐이었다. |
| Minor: trailing whitespace 2건 | 보류(deferred) | 두 파일 모두 기존 CRLF 혼용 줄의 `\r`이 원인. 화면 영향 없음, 줄바꿈 정리는 별도 작업. |
