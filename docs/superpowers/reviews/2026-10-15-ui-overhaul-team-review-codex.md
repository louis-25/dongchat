# UI overhaul 팀 구성 검토 (2026-10-15)

## 결론

**Phase 1은 단일 구현자 + 독립 최종 검토자**로 진행한다. 시작 전에 디자이너 역할의
짧은 디자인 리뷰(토큰·정보 구조·모바일 상태를 스펙에 고정)만 추가하고, 화면별 병렬
구현자·별도 worktree는 두지 않는다. Phase 2는 기능 하나를 세로로 끝내는 기본 원칙을
유지하되, 서로 다른 스키마/서비스/화면을 건드리는 기능 묶음에 한해 작은 병렬 pod를 쓴다.

## 실제 구조에 근거한 이유

- 전역 토큰은 `client/src/app/globals.css` 한 곳이고, 보호 셸은
  `client/src/app/(protected)/layout.tsx`에서 `ProtectedHeader`와 본문 폭/여백을 함께
  결정한다. 하단 내비게이션, safe-area, 모바일 높이, 색·타이포 토큰은 이 셸과 모든
  화면을 동시에 바꾸므로 소유자를 나누면 재작업과 충돌이 크다.
- 현 채팅은 `client/src/app/(protected)/chat/[menu]/page.tsx`의 친구/채팅 탭,
  `.../ChatRooms/index.tsx`의 목록·대화 2열 상태, 그리고 `chat-provider.tsx`의 선택 방과
  Realtime 허브가 결합돼 있다. 전화 화면에서 “한 화면씩” 전환하는 결정은 단순 CSS 작업이
  아니라 이 선택 상태·뒤로가기·알림 진입의 UX 계약이다.
- `MessageList.tsx`는 자체 스크롤 고정/과거 메시지 로딩을, `MessageInput.tsx`는 답장
  상태를 가진다. 키보드 안전 입력창을 목록/입력 담당으로 쪼개 병렬 변경하면 viewport,
  스크롤, safe-area에서 충돌하기 쉽다.
- 이미 `ChatProvider`가 방·사용자 채널을 중앙 구독하고 `useChatMessages.ts`가 스냅샷과
  이벤트를 병합한다. 기능별 에이전트가 이 경계를 각각 바꾸면 재연결·읽음·알림 회귀를
  발견하기 어려워진다.

## 권장 운영 방식

1. **Phase 1 설계 게이트 (한 명, 짧게):** 디자인 리뷰어가 모바일 우선 화면 흐름,
   토큰, 하단 탭, 빈/로딩/키보드 상태를 스펙과 와이어프레임으로 확정한다. 구현 코드는
   작성하지 않으며, 결정 로그만 남긴다.
2. **Phase 1 구현 (한 명):** 같은 worktree에서 design system → protected app shell/
   navigation → 채팅 한 화면 흐름 → 친구·로그인·관리자 순으로 적용한다. 공용 primitive와
   레이아웃 API를 먼저 안정화한 뒤에 화면을 옮긴다.
3. **Phase 1 검증 (별도 한 명):** 원 구현자와 분리된 리뷰어가 변경 범위, 접근성,
   작은/큰 viewport, 모바일 키보드와 deep link(`/chat/rooms?room=`)를 검토한다. 구현자
   자가 테스트와 headless Chrome 확인 후에 수행하며, 리뷰어는 첫 구현을 병렬로 만들지
   않는다.
4. **Phase 2 (기능 단위):** 매 기능은 `DB migration/RLS/RPC·Storage → pgTAP → service/domain
   → Realtime → UI → Chrome → 리뷰`를 한 owner가 끝까지 소유한다. migration과 공유
   `chat-provider.tsx`를 수정하는 작업은 동시에 진행하지 않는다.

## Phase 2에서만 가능한 제한적 병렬화

| 조합 | 조건 | 팀 형태 |
| --- | --- | --- |
| 이미지 업로드와 메시지 검색 | 스키마·Storage 정책·service/UI 파일이 겹치지 않고 migration 순번을 사전 예약 | 기능 owner 2명 + 통합/보안 리뷰어 1명 |
| typing 표시와 독립적인 프로필/설정 UI | 둘 다 `ChatProvider`/메시지 이벤트 계약을 바꾸지 않을 때 | 구현자 2명, 한 명이 통합 |
| 답장 UX 개선 | 현재 `reply_to_id`, RLS 검증, 메시지 매핑/표시가 이미 존재 (`supabase/migrations/20261013061219_rooms.sql`, `MessageItem.tsx`) | 단일 owner; 대규모 신규 백엔드 기능으로 취급하지 않음 |

병렬 owner는 각각 별도 worktree를 쓸 수 있지만, 통합 담당자가 migration 순서와 공용 타입을
먼저 예약하고 병합한다. 한 기능 안에서 DB와 프론트를 분리 소유하지 않는다. typing은
`realtime.messages` 수신 정책이 현재 클라이언트 INSERT를 의도적으로 만들지 않는
`supabase/migrations/20261013062012_realtime.sql`에 걸리므로, 별도 broadcast/권한 설계와
pgTAP을 포함한 단일 세로 작업이어야 한다.

## 위험과 반대 의견

- “Phase 1을 화면별 병렬 구현”에는 반대한다. 공용 CSS, `ProtectedHeader.tsx`, 보호 레이아웃,
  채팅 선택 상태를 동시에 건드려 merge conflict보다 디자인 불일치 비용이 더 크다. 이 규모
  (비 UI TSX 약 2,200줄)에서는 병렬화 이득도 작다.
- “답장도 Phase 2에서 DB부터”에는 반대한다. 답장 데이터 모델·동일 방 검증·Realtime payload와
  기본 UI가 이미 있으므로, 필요한 것은 모바일 UX 다듬기일 가능성이 높다. 먼저 gap 분석을
  하고 UI-only 보완이면 Phase 1 후반의 작은 범위로 처리한다.
- PWA는 단순 장식으로 미루지 말고 Phase 1의 수용 기준(installability, manifest, safe-area,
  좁은 화면)을 명시한다. 다만 오프라인 동기화/첨부 캐시는 Phase 2 기능으로 분리한다.
- 최종 리뷰어는 DB 변경 시 `supabase/tests/database/030_messages.test.sql`,
  `070_realtime.test.sql`까지 검토해 UI 데모만 통과하는 회귀를 막아야 한다.

## 단일 스레드로 유지할 것

디자인 토큰·앱 셸·모바일 내비게이션, `ChatProvider`/이벤트 도메인 계약, migration 순서와
RLS/Realtime 정책, 그리고 최종 통합·접근성 검토는 항상 한 명의 명시적 owner가 관리한다.
이는 팀을 줄이자는 뜻이 아니라, 병렬화는 독립된 세로 기능에만 써서 리뷰 품질과 제품
일관성을 지키자는 권고다.
