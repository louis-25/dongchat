# 수신 웹훅(Incoming Webhooks) 설계

상태: 초안 (2026-10-23, Codex 교차 검토 반영 — `2026-10-23-webhooks-review-codex.md`) · 기준 문서: `2026-10-13-supabase-migration-design.md`

## 1. 목적과 범위

외부 스크립트·자동화 도구가 HTTP 요청 하나로 채팅방에 글을 올린다. 첫 용도는 **매일 아침 채용공고 목록 전달**.

포함:
- 웹훅마다 봇 계정 하나(이름·프로필을 가진 일반 말풍선으로 보임)
- 관리자(Supabase 대시보드 SQL Editor) 전용 발급·재발급·삭제
- Edge Function `webhook`: 토큰 확인, 긴 글을 2,000자 단위로 나눠 저장
- 말풍선 속 `http(s)://` 링크를 누를 수 있게(모든 메시지 공통)

제외(YAGNI):
- 앱 안의 웹훅 관리 화면, 방 멤버의 직접 발급
- 서비스별 페이로드 변환(GitHub 등) — 나중에 `?source=` 분기로 추가
- 요청 횟수 제한, 봇 프로필의 "1:1 채팅" 버튼 숨김(서버가 거절하고 토스트로 안내)
- URL `?token=` — 토큰이 로그·기록에 남으므로 헤더만 받는다
- `www.`·이메일 링크 인식, 링크 미리보기 카드

## 2. 데이터 모델

### 2.1 봇 계정
- `auth.users`에 행을 직접 넣는다: 이메일·비밀번호·identity 없음 → 로그인 불가(`is_active_session()`이 항상 false).
  - `aud = 'authenticated'`, `role = 'authenticated'`, `raw_app_meta_data = {"provider": "webhook"}`
  - `raw_user_meta_data = {"username": "bot_<id 앞 16자리>", "nickname": <웹훅 이름>}` — 16자리라 충돌 걱정 없이 20자 규칙 안에 든다
- 기존 트리거 `private.handle_new_user`가 프로필을 만든다(`bot_xxxxxxxx`는 username 규칙 `^[a-z0-9_]{3,20}$`을 통과).
- 봇은 `chat_room_participants`에 멤버로 들어간다.
- `profiles.is_bot boolean not null default false`를 추가한다(사용자 update grant 없음). 웹훅을 지워도 봇 프로필은 남으므로 `private.webhooks`가 아닌 이 칼럼으로 판단한다.
- 봇은 사람 전용 경로에서 **없는 사용자처럼** 취급한다(조회에 `and not p.is_bot` 추가, 기존 에러 그대로):
  - `send_friend_request` → `FRIEND_USER_NOT_FOUND`
  - `open_direct_room`, `create_room`, `invite_to_room` → `ROOM_INVALID_PARTICIPANTS`
  - `admin_list_users`(목록·총계)에서 제외
- 봇 강퇴(`kick_member`)는 허용한다 — 그 뒤 `webhook_post`가 거절한다.
- 생성은 한 트랜잭션: `auth.users` insert → 트리거가 만든 프로필에 `is_bot = true` → 참여자·웹훅 insert. 어느 단계든 실패하면 전부 롤백.

### 2.2 `private.webhooks`
private 스키마(Data API 비노출), `revoke all ... from public, anon, authenticated`.

| 칼럼 | 타입 | 비고 |
|---|---|---|
| id | bigint identity PK | |
| room_id | bigint not null → chat_rooms on delete cascade | |
| bot_id | uuid not null unique → profiles on delete cascade | |
| name | text not null | trim 후 1~20자(프로필 nickname으로도 쓰임) |
| token_hash | text not null unique | `encode(extensions.digest(token, 'sha256'), 'hex')` |
| created_at | timestamptz not null default now() | |
| last_used_at | timestamptz | |

- 토큰 원문: `'dch_' || encode(extensions.gen_random_bytes(32), 'hex')`. 저장하지 않고 발급 때 한 번만 돌려준다.
- `room_id` 인덱스(FK).

### 2.3 방 규칙
- 웹훅은 **그룹 방**에만 붙는다. 1:1 방에 봇이 들어가면 1:1 화면 규칙(상대 한 명)이 깨지므로 거절(`VALIDATION_FAILED`).
- 혼자 받는 방이 필요하면 `create_webhook`의 새 방 만들기 형태를 쓴다(§3).
- 참여자 삭제 트리거(방장 넘기기·마지막 사람이 나가면 방 삭제)를 고친다:
  - 다음 방장 후보에서 봇(`is_bot`)을 뺀다.
  - 남은 사람이 0명이면(봇만 남아도) 방을 지운다(웹훅도 cascade). 기존 방 행 잠금은 유지.

## 3. 관리 함수 (SQL Editor 전용)

모두 `security definer`, `set search_path = ''`, `revoke execute ... from public, anon, authenticated`(service_role에도 부여하지 않음). 대시보드 접근 권한 = 관리자로 본다(`is_admin()` 검사 없음).

SQL Editor에는 JWT가 없어 `auth.uid()`가 null이다. 그래서 `require_active_session()`을 부르는 기존 RPC(`create_room`, `invite_to_room` 등)는 쓰지 않고 테이블에 직접 넣는다. auth 문맥이 필요 없는 `private.add_system_message`, `private.display_name`만 재사용한다.

| 함수 | 반환 | 동작 |
|---|---|---|
| `public.create_webhook(p_name text, p_room_id bigint)` | text(토큰) | 기존 그룹 방에 봇을 만들어 넣는다 |
| `public.create_webhook(p_name text, p_usernames text[])` | text(토큰) | 사람 프로필(봇 아님)을 확인한 뒤 이름이 `p_name`인 그룹 방(`created_by` = 첫 사용자)과 참여자들 + 봇을 직접 넣는다 |
| `public.rotate_webhook(p_id bigint)` | text(토큰) | `token_hash`만 바꾼다. 봇·이전 메시지 유지 |
| `public.delete_webhook(p_id bigint)` | void | 봇을 방에서 빼고 웹훅 행을 지운다. 봇 프로필·`auth.users` 행은 남긴다(이전 메시지의 보낸 사람 이름 유지) |

- 봇을 넣거나 뺄 때 시스템 메시지("채용봇님이 들어왔어요"/"나갔어요")를 기존 `private.add_system_message`로 남긴다.
- 존재하지 않는 방·사용자·웹훅 → `VALIDATION_FAILED`.

## 4. 메시지 저장 함수

`public.webhook_post(p_token text, p_parts text[]) returns int` — **service_role만 실행**.

1. `p_token`을 해시해 웹훅을 찾는다(`for update`). 없으면 `WEBHOOK_INVALID`.
2. 봇이 여전히 그 방 멤버인지 확인한다(방장이 강퇴했을 수 있음). 아니면 `WEBHOOK_INVALID`.
3. `p_parts`가 비었거나 조각이 1~2,000자가 아니면 `VALIDATION_FAILED`. 조각 수 최대 10.
4. 조각마다 `insert into public.messages (room_id, sender_id, content) values (room, bot, part)` — 순서대로 id가 붙는다. `kind`는 기본값 `'user'`.
5. `last_used_at = now()`, 저장 개수 반환.

기존 트리거가 실시간 방송·방 목록 갱신·푸시를 처리한다(푸시는 보낸 사람 = 봇 제외, 봇은 구독이 없음).

## 5. Edge Function `webhook`

- 경로: `POST /functions/v1/webhook`. `config.toml`에 `[functions.webhook] verify_jwt = false`, 배포는 `--no-verify-jwt`.
- 토큰: `Authorization: Bearer <토큰>`만. 형식(`dch_` + 64 hex)이 아니면 DB를 부르지 않고 401.
- 로그에 Authorization 헤더와 본문을 남기지 않는다.
- 본문:
  - `Content-Type: application/json` → `{"text": string}`
  - `text/plain` → 본문 전체
- 처리: 전체 길이 검사 → `splitMessage(text, 2000)` → service role 클라이언트로 `webhook_post` 호출.
- 응답:

| 경우 | 상태 |
|---|---|
| 성공 | 200 `{"posted": n}` |
| POST 아님 | 405 |
| 토큰 없음·틀림·봇이 방에 없음 | 401 (구분하지 않음) |
| JSON 깨짐·`text` 없음·나눈 뒤 빈 결과 | 400 |
| 전체 20,000자 초과 | 413 |
| 그 밖의 DB 오류 | 500 (내용은 로그에만) |

### 5.1 `splitMessage(text, max)` — `functions/webhook/split.ts`
- 줄바꿈(`\n`, `\r\n`) 기준으로 `max`자까지 이어 붙인다 → 한 공고(제목 줄 + 링크 줄)가 중간에 잘리지 않게.
- 한 줄이 혼자 `max`를 넘으면 그 줄만 `max`자 단위로 자른다.
- 각 조각은 앞뒤 공백 제거, 빈 조각 버림.
- 길이는 `[...str].length`(코드 포인트) 기준 — DB의 `char_length`와 같게.

## 6. 링크 자동 인식 (클라이언트)

### 6.1 `lib/linkify.ts`
- `splitLinks(text): Array<{ text: string; href?: string }>`
- 패턴: `https?://` 뒤 공백·`<>"`가 아닌 문자들. 다른 스킴(`javascript:` 등)은 링크로 만들지 않는다.
- 끝 문장부호 `.,!?;:'")]`는 뺀다. 단 `)`는 링크 안의 `(` 개수가 더 많을 때 남긴다(`…/Foo_(bar)`).

### 6.2 표시
- `MessageBubble.tsx`의 본문(`view.content`) 자리만 바꾼다. 답장 인용·방 목록 미리보기·푸시·검색 결과는 그대로 글자.
- `<a href target="_blank" rel="noopener noreferrer" className="underline break-all">` — 색은 말풍선 글자색을 그대로(테마 대비 유지).
- 길게 누르기: 링크 위에서도 메시지 메뉴가 우선이다. 현재 `useLongPress`는 `<a>`를 제외하지 않고 발동 뒤의 click을 막으므로(`useLongPress.ts`) 고칠 것 없음 — 링크 주소 복사는 메뉴의 "복사"로 한다. `ignoresLongPress`에 `a`가 없음을 단위 테스트로 고정한다.

## 7. 에러 코드
- `WEBHOOK_INVALID` (새로 추가): 토큰이 틀렸거나 봇이 방에 없음.
- `VALIDATION_FAILED`: 기존 코드 재사용.

## 8. 테스트
- pgTAP `330_webhooks.test.sql`: 발급(봇 프로필·`is_bot`·멤버·해시만 저장·1:1 방 거절·새 방 형태·봇 username 거절), 저장(조각 수·보낸 사람·`last_used_at`·틀린 토큰·강퇴된 봇), 재발급(옛 토큰 거절), 삭제(멤버 아님·토큰 거절·메시지 보낸 사람 유지), 권한(anon·authenticated·service_role의 관리 함수 실행 불가, webhook_post는 service_role만), 봇 로그인 불가.
- pgTAP `340_bot_guards.test.sql`: 봇에게 친구 요청·1:1 방·방 만들기·초대 거절, 관리자 목록 제외, 방장 넘기기(사람 우선·방장이 먼저 나감), 봇만 남은 방 삭제.
- `useLongPress.test.ts`: `ignoresLongPress(<a>)`가 false.
- Deno `split.test.ts`: 줄 단위, 긴 한 줄, 공백·빈 조각, 2,000자 경계, 이모지(코드 포인트).
- node `linkify.test.ts`: 끝 문장부호, 괄호 짝, 다른 스킴 무시, 여러 링크, 링크 없음.
- 로컬 통합: `functions serve` + `curl` → 방에 실시간 표시, 401/400/413 확인.

## 9. 배포
1. 커밋 → `db push` → `migration list --linked` 확인
2. `functions deploy webhook --no-verify-jwt` (새 비밀 없음 — `SUPABASE_URL`, service role 키는 런타임이 제공)
3. `git push` (Vercel)
4. 사용자: SQL Editor에서 `select public.create_webhook('채용봇', <방 id>);` 또는 `select public.create_webhook('채용봇', array['<내 username>']);` → 토큰을 스크립트에 저장
5. `DEPLOYMENT.md`에 발급·재발급·삭제와 `curl` 예시 추가
