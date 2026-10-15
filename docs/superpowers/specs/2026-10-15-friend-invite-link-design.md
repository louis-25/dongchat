# 친구 초대 링크 설계

- 작성: 2026-10-15
- 상태: 브레인스토밍 승인(사용자 "진행시켜")
- 선행: `2026-10-15-mobile-ui-overhaul-design.md`(화면 구조), `2026-10-13-supabase-migration-design.md`(§3·§5 DB 원칙·에러 계약)

## 1. 목적
카카오 가입자의 자동 아이디(`kakao_xxxxxxxx`)는 주고받기 어렵다. **아이디 없이 링크 하나로** 친구가 되게 한다. 기존 아이디 친구 추가(＋)는 유지.

## 2. 흐름
1. 초대자: 친구 탭 "친구 초대" → `navigator.share({ title, text, url })`(폰 공유 창) / 미지원·실패(취소 제외) 시 클립보드 복사 + 토스트. URL = `<origin>/invite/<code>`.
2. 수신자: 링크 열기 → 비로그인이면 `/login?next=/invite/<code>` → 로그인·가입·카카오 후 `next`로 복귀.
3. 초대 화면: 초대자 사진·표시 이름 + "친구 되기" 버튼(수신자 동의). 누르면 친구 → 그 사람과 1:1 방(`open_direct_room`)으로 이동.

## 3. 경우별 결과(`accept_invite`)
| 상황 | 결과 |
|---|---|
| 친구 관계 없음 | ACCEPTED 행 생성(requester = 초대자, receiver = 수신자) |
| 대기 중 요청(어느 방향이든) | ACCEPTED로 전환 |
| 이미 친구 | 그대로(성공) |
| 차단(BLOCKED, 어느 쪽이든) | `FRIEND_BLOCKED` "친구를 추가할 수 없어요"(누가 차단했는지 숨김) |
| 내 코드 | `FRIEND_SELF_REQUEST` |
| 없는/재발급으로 무효된 코드 | `INVITE_NOT_FOUND` "만료되었거나 잘못된 초대 링크예요" |

반환: 초대자 `username`(1:1 방 열기용)과 `already boolean`.

## 4. DB (마이그레이션 1개)
- `private.friend_invites(user_id uuid pk → profiles on delete cascade, code text unique not null, created_at timestamptz default now())`. private 스키마라 API에 노출되지 않음.
- 코드: `encode(extensions.gen_random_bytes(9), 'base64')`에서 `+/` → `-_` 치환한 12자(URL 안전, 72비트).
- RPC(모두 `security definer`, `search_path = ''`, `require_active_session`, anon 실행 불가):
  - `get_my_invite_code() returns text` — 없으면 생성.
  - `reset_my_invite_code() returns text` — 새 코드로 교체(예전 링크 무효).
  - `preview_invite(p_code text) returns table(username text, nickname text, avatar_url text)` — 없으면 0행.
  - `accept_invite(p_code text) returns table(username text, already boolean)` — §3.
- 새 에러 코드 2개(선행 스펙 §5.5 확장): `INVITE_NOT_FOUND`, `FRIEND_BLOCKED`. 사용자 문구는 RPC `hint`가 계약이다(`services/errors.ts`가 hint를 message로 옮기고 `getErrorMessage` default가 보여 준다) — `error-handler.ts` 변경 없음.
- pgTAP: 생성·재사용·재발급 무효화, 미리보기, 수락 4가지 관계 상태, 차단, 본인, 없는 코드, 정지 세션, anon 불가.

## 5. 로그인 후 돌아오기
- `lib/safe-next.ts` `safeNext(raw: string | null, fallback = "/chat/rooms"): string` — `/`로 시작하고 `//`·`/\`로 시작하지 않으며 `/login`·`/join`·`/auth`가 아닌 경로만. 단위 테스트.
- proxy: 비로그인 보호 경로 접근 시 `/login?next=<pathname+search>`.
- 로그인·가입 성공 → `safeNext(next)`. 가입 후 이메일 확인 필요 시 `/login?next=…` 유지. 로그인↔가입 링크도 `next` 유지.
- 카카오: `signInWithKakao(next?)` → `redirectTo = <origin>/auth/callback?next=<encoded>`. 콜백은 `safeNext` 사용, 기본값 `/chat/rooms`(기존 `/chat/friends` 잔재 수정). 카카오 콘솔·Supabase Redirect URL은 쿼리 문자열과 무관(`/auth/callback` 경로 일치)이라 설정 변경 없음 — 구현 시 운영 Redirect URLs 매칭 방식을 확인하고 필요하면 `/auth/callback**`로 바꾼다.

## 6. 화면
- 친구 탭: 상단 actions에 "친구 초대"(Share 아이콘) + 기존 ＋. 프로필 카드 아래 "친구 초대 링크 보내기" 버튼(눈에 잘 띄게).
- `/invite/[code]`(`(protected)` 안, 하단 탭 없음): 로딩 → 미리보기 카드 → "친구 되기"; 무효 코드·본인 코드는 안내 + "채팅으로" 버튼.
- 설정: "초대 링크 새로 만들기"(confirm 후 재발급, 토스트).
- services: `services/invites.ts`(`getMyInviteCode`, `resetMyInviteCode`, `previewInvite`, `acceptInvite`), 공유 판단은 `lib/share.ts`(`shareOrCopy` — `AbortError`(사용자 취소)는 복사로 넘어가지 않음).

## 7. 비범위
QR, 카카오톡 공유 SDK, 초대 만료 기간·사용 횟수 제한, 초대자 친구 목록 실시간 반영(친구 탭 재진입·포커스 시 반영).

## 8. 검증
pgTAP, `node:test`(safeNext·shareOrCopy·에러 메시지), `verify-social.mjs`에 초대 계약, 헤드리스: alice 초대 링크 → 비로그인 새 컨텍스트에서 열기 → 로그인 화면(`next` 포함) → bob 로그인 → 초대 화면 → 친구 되기 → 1:1 방 주소.
