# 투표(Polls) 설계

상태: 초안 (2026-10-21, Codex 교차 검토 반영 — `2026-10-21-polls-review-codex.md`) · 기준 문서: `2026-10-13-supabase-migration-design.md`

## 1. 목적과 범위

친구·가족 채팅방에서 "점심 뭐 먹지" 같은 의견을 모으는 카카오톡 수준의 투표.

포함:
- 한 개 선택 / 여러 개 선택
- 익명 투표 — 누가 골랐는지 **만든 사람 포함 누구에게도** 숨기고 표 수만 보인다. DB가 보장한다.
- 다른 참여자의 선택지 추가 허용(옵션)
- 마감 시각 예약(옵션), 만든 사람의 일찍 마감
- 결과(표 수)는 투표 전에도 항상 보인다
- 마감 전 표 변경·취소
- 1:1 방에서도 사용 가능

제외(YAGNI):
- 마감 시각 도달 시 안내 메시지·푸시 (조용히 마감, 예약 작업 없음)
- 표를 던질 때의 알림
- 투표 수정(질문·설정 변경)
- 방별 투표 목록 화면

## 2. 데이터 모델

### 2.1 메시지 연결
- `public.messages`에 `poll_id bigint references public.polls(id)` (nullable) 추가.
- 투표 메시지는 `kind = 'user'`. 안 읽은 수·방 목록 미리보기·푸시·검색이 `kind = 'user'` 기준이므로 그대로 동작한다.
- `content = '(투표) ' || question` — 미리보기·푸시·답장 인용·검색에 쓰인다.
- 사용자에게 `poll_id` 컬럼 insert grant를 주지 않는다. `create_poll` RPC만 넣는다.

### 2.2 `public.polls`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | bigint identity PK | |
| room_id | bigint not null → chat_rooms on delete cascade | 마지막 참여자가 나가 방이 지워질 때 함께 삭제 |
| creator_id | uuid → profiles on delete set null | 탈퇴하면 null(마감 버튼은 아무에게도 안 보임) |
| question | text not null | trim 후 1~100자 |
| multiple | boolean not null default false | |
| anonymous | boolean not null default false | |
| allow_add | boolean not null default false | |
| closes_at | timestamptz | null = 마감 시각 없음 |
| closed_at | timestamptz | 일찍 마감한 시각 |
| created_at | timestamptz not null default now() | |

열림 판정은 `private.poll_open(p polls) returns boolean` 하나로 모은다:
`closed_at is null and (closes_at is null or closes_at > now())` 그리고 연결된 메시지가 삭제되지 않았을 것.

### 2.3 `public.poll_options`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| id | bigint identity PK | |
| poll_id | bigint not null → polls on delete cascade | |
| label | text not null | trim 후 1~50자 |
| added_by | uuid → profiles on delete set null | |
| created_at | timestamptz not null default now() | |

- 투표당 2~20개(개수는 RPC가 검사).
- `unique (poll_id, lower(label))` 인덱스로 같은 문구 차단(trim·연속 공백 정리는 RPC가 저장 전에).

### 2.4 `public.poll_votes`
| 컬럼 | 타입 | 비고 |
|---|---|---|
| poll_id | bigint not null → polls on delete cascade | |
| option_id | bigint not null → poll_options on delete cascade | |
| user_id | uuid not null → profiles on delete cascade | 탈퇴하면 그 사람의 표도 사라진다 |
| created_at | timestamptz not null default now() | |

- PK `(poll_id, option_id, user_id)`.
- 한 개 선택 투표에서 1인 1표는 `vote_poll`이 지킨다.

### 2.5 권한
- 세 테이블 모두 RLS on, 정책 없음, `authenticated`·`anon`에 테이블 grant 없음 → 읽기·쓰기는 RPC로만.
- 특히 `poll_votes`는 직접 select 불가 — 익명 보장의 핵심.

### 2.6 삭제
- 투표 메시지 삭제(기존 soft delete)는 투표를 닫힌 것으로 취급하고, 카드는 기존 "삭제된 메시지"로 그린다. 투표 데이터 행은 남긴다.
- 삭제된 투표는 `get_poll`이 `POLL_NOT_FOUND`로 답한다(삭제 뒤에는 결과도 보이지 않는다).
- `messages.poll_id`의 FK는 기본 동작(no action). 방 삭제 시 messages·polls가 같은 문장에서 함께 cascade 삭제되므로 충돌하지 않는다(pgTAP으로 확인).

## 3. RPC

공통: `security definer`, `set search_path = ''`, 스키마 한정 이름, `revoke execute from public, anon`, `grant execute to authenticated`. 시작 시 `private.require_active_session()`, 방 참여 확인 `private.is_room_member`. 에러는 `raise exception '<CODE>' using hint = '<사용자 메시지>'`.

새 에러 코드: `POLL_NOT_FOUND`(없거나 내가 참여하지 않은 방의 투표), `POLL_CLOSED`(마감·삭제됨). 그 외 `VALIDATION_FAILED`, `CHAT_FORBIDDEN`.

쓰기 RPC(`vote_poll`·`add_poll_option`·`close_poll`)의 잠금 순서: **연결 메시지 행 `for update` → polls 행 `for update` → `private.poll_open` 판정**. `delete_message`도 메시지 행을 먼저 잠그므로 삭제와 투표 쓰기가 직렬화되고, 같은 투표의 쓰기끼리는 polls 행에서 직렬화된다.

### 3.1 `create_poll(p_room_id bigint, p_question text, p_options text[], p_multiple boolean, p_anonymous boolean, p_allow_add boolean, p_closes_at timestamptz) returns bigint`
- 반환: 만든 메시지 id.
- 선택지: trim·공백 정리 → 빈 값 제거 → 대소문자 무시 중복 제거(첫 등장 순서 유지) → 2~20개.
- `p_closes_at`이 있으면 `now() + interval '1 minute'` 이후여야 한다.
- 한 트랜잭션에서 polls → poll_options → messages(`poll_id`, content `'(투표) ' || question`) insert. 메시지 insert 트리거가 기존 broadcast·푸시를 처리한다.

### 3.2 `vote_poll(p_poll_id bigint, p_option_ids bigint[]) returns void`
- 배열이 내 최종 선택. 빈 배열 = 취소.
- 입력은 null 제거 후 distinct로 정리한다(`[x, x]` = `[x]`).
- 잠금(§3 공통) → 열림 확인(`POLL_CLOSED`) → 한 개 선택이면 원소 ≤ 1 → 모든 id가 이 투표의 선택지(`VALIDATION_FAILED`) → 내 기존 표 delete 후 insert.
- 성공 시 `poll_updated` broadcast(§4).

### 3.3 `add_poll_option(p_poll_id bigint, p_label text) returns bigint`
- 잠금(§3 공통) 후 열림 확인. 만든 사람이 아니면 `allow_add` 필요(`CHAT_FORBIDDEN`). 문구 정리 후 20개 초과·중복은 `VALIDATION_FAILED`(잠금 덕에 개수 검사는 경쟁하지 않고, 혹시 모를 unique 위반도 `VALIDATION_FAILED`로 바꿔 던진다).
- 추가한 사람의 표는 자동으로 넣지 않는다. 성공 시 `poll_updated` broadcast.

### 3.4 `close_poll(p_poll_id bigint) returns void`
- 만든 사람만(`CHAT_FORBIDDEN`). 잠금(§3 공통) 후 `update ... set closed_at = now() where id = … and closed_at is null`. 갱신된 행이 있을 때만 `poll_updated` broadcast(정확히 한 번). 이미 닫혔으면 아무 일도 하지 않는다(멱등).

### 3.5 `get_poll(p_poll_id bigint) returns jsonb`
- 카드마다 하나씩 부르므로 단건 RPC로 둔다(묶음 호출은 필요해질 때).
- 없음·내가 참여하지 않은 방·메시지 삭제됨 → `POLL_NOT_FOUND`.
- 반환:
  - `id, roomId, messageId, creatorId, question, multiple, anonymous, allowAdd, closesAt, closed`(서버 시각 기준 판정)
  - `voterCount`(서로 다른 투표자 수)
  - `options: [{ id, label, count, voters }]` — 추가 순서(id 오름차순). `voters`는 고른 사람의 표시 이름(투표한 순). 익명이면 항상 `[]`(만든 사람 포함)
  - `myOptionIds`

### 3.6 기존 RPC 변경
- `edit_message`: 투표 메시지 수정 불가 → `VALIDATION_FAILED`.
- `set_room_notice`: 투표 메시지 공지 등록 불가 → `VALIDATION_FAILED`.
- `delete_message`: 변경 없음(보낸 사람이 삭제). 삭제 후 `vote_poll`·`add_poll_option`은 `POLL_CLOSED`, `close_poll`은 아무 일도 하지 않는다.

## 4. 실시간

- `vote_poll`·`add_poll_option`·`close_poll` 성공 시 `private.broadcast('room:' || room_id, 'poll_updated', {roomId, pollId})`. 표 수·투표자는 싣지 않는다(익명 고려 불필요). 공지의 `notice_updated`와 같은 방식.
- 생성은 기존 `message`, 삭제는 기존 `message_deleted` 이벤트.
- `message_event` payload에 `pollId` 추가.
- 시각 도달 마감은 이벤트 없음.

클라이언트(손댈 곳):
- `pollId: number | null`을 메시지 경로 전체에 싣는다: `MESSAGE_COLUMNS`(답장 중첩 select 포함)·`MessageCoreRow`·`MessagePayload`·`toChatMessage`·`fromMessagePayload`(`services/mappers.ts`), `ChatMessage`(`types/domain.ts`), `MessageView`(`lib/chat-state.ts`).
- `services/polls.ts`: `createPoll`·`votePoll`·`addPollOption`·`closePoll`·`getPoll`.
- `RoomEvent`에 `{ type: 'poll_updated'; roomId; pollId }`, `services/realtime.ts`의 `ROOM_EVENTS`에 `poll_updated` 추가.
- 카드마다 `useQuery(['poll', pollId])` → `get_poll(pollId)`.
- `usePoll` 훅이 `onRoomEvent`로 `poll_updated`(같은 pollId)·`subscribed`를 받아 `['poll', pollId]` 무효화(`useRoomNotice`와 같은 방식).
- `MessageBubble`은 `pollId`가 있으면 `PollCard`로 분기.
- `room-list` 리듀서에서 `poll_updated`는 no-op.
- 재연결(`subscribed`) 시 화면의 각 카드가 다시 받는다(위 `usePoll`).
- 마감 표시: `closesAt`까지 `setTimeout` 하나로 다시 그려 "마감됨". 최종 판정은 서버.

## 5. 화면

### 5.1 만들기
- 방 메뉴(☰)에 "투표 만들기" → `CreatePollSheet`.
- 질문, 선택지 칸(처음 2칸, "+ 항목 추가"로 최대 20, 칸마다 X), 스위치: 여러 개 선택 / 익명 투표 / 참여자도 항목 추가 / 마감 시각(켜면 `<input type="datetime-local">`, 기본 지금+24시간). 입력값(시간대 없는 로컬 시각)은 `new Date(value).toISOString()`으로 바꿔 보내고, 화면 표시는 기기 시간대.
- "만들기"는 질문이 있고 정리된 선택지가 2개 이상일 때만 활성. 서버 에러는 토스트.

### 5.2 투표 카드 `PollCard`
- `poll_id`가 있는 메시지는 말풍선 대신 카드. 정렬·이름·시각·반응·답장 표시는 기존과 같다.
- 위: 📊 + 질문, 작은 글씨 "익명 · 여러 개 선택 · 10/22 18:00 마감" 또는 "마감됨".
- 선택지 줄: 문구 + 표 수 + 줄 배경을 채우는 비율 막대. 내 선택은 체크와 강조색.
- 열려 있으면 줄 탭으로 즉시 반영: 한 개 선택은 옮기기, 같은 줄 다시 탭은 취소. 낙관적 업데이트 후 실패 시 되돌리고 토스트.
- 아래: "N명 참여", 허용 시 "+ 항목 추가"(그 자리 입력 한 줄), 만든 사람에게만 "투표 마감".
- 익명이 아니면 표 수 탭 → 고른 사람 이름 목록 시트(`get_poll`의 `voters`).
- 삭제된 투표는 기존 "삭제된 메시지".

### 5.3 메시지 메뉴
- 투표 메시지에서 "수정"·"공지 등록" 숨김. 답장·반응·삭제 유지.

## 6. 테스트

pgTAP `supabase/tests/database/300_polls.test.sql`:
- 생성 검증(선택지 정리·개수·질문 길이·마감 시각 하한), 메시지 content·poll_id
- 한 개 선택 / 여러 개 선택 규칙, 표 변경·취소, 다른 투표의 선택지 거부
- 마감 시각 경과·일찍 마감·삭제 후 쓰기 거부(`POLL_CLOSED`)
- 선택지 추가 권한·중복·20개 상한
- 익명: 만든 사람에게도 `voters = []`
- 다른 방·삭제된 투표는 `get_poll`이 `POLL_NOT_FOUND`, 비참여자 쓰기 거부
- 중복 option id 입력은 한 개로 처리
- `close_poll` 두 번째 호출은 broadcast 없음
- 투표가 있는 방에서 마지막 참여자가 나가면 방·투표가 함께 삭제됨
- 만든 사람 탈퇴 시 `creator_id` null
- 세 테이블 직접 select/insert 거부
- `edit_message`·`set_room_notice` 거부
- `poll_updated` broadcast 발생
- `070_realtime.test.sql`의 `row(...)::public.messages` 리터럴에 `poll_id` 값 추가
- `client/src/lib/supabase/database.types.ts`는 손으로 관리하는 압축 형식이라 재생성하지 않고, `messages.poll_id`·새 세 테이블·다섯 RPC를 직접 추가한다.
- 동시성(잠금 순서)은 pgTAP 단일 세션으로 재현할 수 없어 코드 리뷰로 확인한다.

단위 테스트(`client/src/lib/polls.ts`):
- 낙관적 표 계산(한 개 선택 옮기기·취소, 여러 개 선택 토글, count·voterCount 갱신)
- 마감 표시 문구
- 생성 폼 선택지 정리(trim·빈 칸·중복 제거, 서버 규칙과 동일)

## 7. 배포
마이그레이션 1개(`20261021100000_polls.sql`) → `db push` → `git push`. Edge Function 변경 없음(푸시는 content를 그대로 사용).
