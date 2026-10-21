# 투표 기능 설계 리뷰

검토 대상: `2026-10-21-polls-design.md` 및 현행 마이그레이션/클라이언트 코드. 아래는 구현 전에 명세를 보완해야 하는 항목만 기록한다.

## 발견 사항

### 1. blocker — §2.2, §2.6 — 방 삭제를 FK가 막을 수 있다

**문제.** `polls.room_id`는 `chat_rooms`를 참조한다고만 되어 있고 `on delete cascade`가 없다. 현재 빈 방이 되면 트리거가 `public.chat_rooms`를 실제로 삭제하며(`supabase/migrations/20261013061219_rooms.sql:86-99`), 기존 `messages`는 방 FK의 cascade로 삭제된다(`:25-32`). 투표가 있는 방에서는 `polls`의 기본 `NO ACTION` FK가 부모 방 삭제를 거부하므로, 마지막 참여자의 `leave_room`이 실패한다.

**제안.** `polls.room_id bigint not null references public.chat_rooms(id) on delete cascade`로 명시하고, `messages.poll_id`도 삭제 경로와 충돌하지 않도록 `on delete set null`(또는 poll 삭제를 금지하는 명확한 정책)으로 정한다. 마지막 참여자 퇴장과 투표 메시지를 포함한 방 삭제를 pgTAP으로 검증한다.

### 2. major — §2.2~2.4 — 탈퇴 시 null 허용이라는 FK 요구가 실제 정의에 없다

**문제.** §2.2는 `creator_id`를 “탈퇴 시 null 허용”이라 하지만 FK의 `on delete set null`을 명시하지 않았고, §2.3의 `added_by`도 동일하다. 현행 메시지 작성자 FK는 의도를 위해 명시적으로 `on delete set null`을 사용한다(`supabase/migrations/20261013061219_rooms.sql:25-31`); 기본 FK 동작은 탈퇴/프로필 삭제를 거부한다. 반면 vote의 `user_id`는 `on delete cascade`라고만 되어 있어, 탈퇴한 사람의 익명/비익명 집계가 보존되어야 하는지도 결정되지 않았다.

**제안.** `creator_id`, `added_by`에 `on delete set null`을 명시하고, `poll_votes.user_id`는 “탈퇴 뒤 표를 보존할지”를 결정해 `cascade` 또는 별도 익명화/보존 정책으로 적는다. 각 삭제 경로의 pgTAP을 추가한다.

### 3. major — §2.2, §3.2~3.4, §3.6 — 메시지 삭제와 투표 쓰기의 직렬화가 정의되지 않았다

**문제.** 열림 판정에는 연결 메시지가 삭제되지 않았다는 조건이 있으나(명세:46-47), `vote_poll`은 polls 행만 `FOR UPDATE`로 잠근다(명세:91-94). 현행 `delete_message`는 messages 행만 `FOR UPDATE` 후 soft-delete한다(`supabase/migrations/20261020120000_room_notice.sql:37-52`). 따라서 투표 RPC가 삭제 전 메시지를 읽어 열림으로 판단한 뒤, 동시에 삭제가 커밋되고도 표/항목 추가가 커밋될 수 있다. `close_poll`도 잠금/조건부 update가 명세에 없어 vote/add와 경쟁할 때 성공 broadcast 수와 최종 상태가 구현마다 달라진다.

**제안.** 모든 쓰기 RPC에서 poll과 연결 messages 행을 일관된 순서로 잠그고(`FOR UPDATE`), 잠금 후 `poll_open`을 재평가한다. `close_poll`은 `update ... where closed_at is null ... returning`으로 성공 여부를 판정해 정확히 한 번만 broadcast하도록 명세화하고, delete-vote/add/close 동시성 pgTAP을 넣는다.

### 4. major — §3.3 — `add_poll_option`의 20개 상한과 마감은 경쟁 상태에서 깨진다

**문제.** §3.3은 열림 확인과 20개 상한만 기술하고 poll 행 잠금을 요구하지 않는다(명세:96-98). 두 요청이 동시에 19개를 읽으면 둘 다 20번째를 삽입하여 21개가 되고, 닫기와 추가도 서로 엇갈릴 수 있다. `unique (poll_id, lower(label))`도 동시 중복에는 DB 오류를 낼 뿐 요구한 `VALIDATION_FAILED` 계약을 보장하지 않는다(명세:59).

**제안.** `polls`를 `FOR UPDATE`로 잠근 뒤 열린 상태, 정규화 라벨, 현재 개수를 검사하고 insert한다. unique-violation은 명시적으로 `VALIDATION_FAILED`로 변환하며, 동시 19→20개/동일 라벨/close-add 테스트를 작성한다.

### 5. major — §3.2 — 중복 option id 입력의 의미와 오류가 정해지지 않았다

**문제.** `p_option_ids`를 “최종 선택”이라 하지만 중복 제거 또는 중복 거부가 없다(명세:91-94). 단일 선택 검사를 배열 길이로 하면 `[x, x]`가 잘못 거부되고, unique id 개수로 하면 같은 입력이 통과한다. 그대로 delete 후 insert하면 PK `(poll_id, option_id, user_id)` 위반이 원시 DB 오류로 새어 나와 §3의 `VALIDATION_FAILED` 계약과 다르다(명세:63-70, 81).

**제안.** 입력을 먼저 distinct한 option-id 배열로 정규화할지, 중복을 `VALIDATION_FAILED`로 거부할지 명시한다. 빈 배열의 취소, 단일/복수 투표, 중복 입력 각각의 기대 결과와 테스트를 추가한다.

### 6. major — §2.1, §4~5 — `poll_id`를 클라이언트 메시지 경로 전체로 운반하는 변경 목록이 빠져 있다

**문제.** 명세는 Realtime payload에만 `pollId`를 추가한다(명세:121). 그러나 현재 `MESSAGE_COLUMNS`/중첩 reply select는 `poll_id`가 없고(`client/src/services/mappers.ts:17-19`), `MessageCoreRow`, `MessagePayload`, `toChatMessage`, `fromMessagePayload`도 이를 버린다(`:43-77`, `:109-136`). `ChatMessage`/`MessageView`가 그 값을 보유해야 `PollCard`를 선택할 수 있는데 현재 도메인 타입은 그 필드가 없다(`client/src/types/domain.ts:59-76`, `client/src/lib/chat-state.ts:8-14`). 생성 RPC를 호출할 서비스도 명세에 없다.

**제안.** `pollId: number | null`을 DB row→mapper→domain→realtime payload→view까지 추가하고, `services/polls.ts`의 create/vote/add/close/get 경계와 `useChatMessages`/`MessageBubble`의 카드 분기를 명세에 포함한다. reply의 `MESSAGE_COLUMNS`에도 같은 필드를 넣어 투표를 답장 대상으로 삼을 때 미리보기/카드 정책을 일관되게 적용한다.

### 7. major — §4 — `poll_updated`를 현재 Realtime 계약과 훅이 수신하지 못한다

**문제.** 명세는 `poll_updated` 후 `['poll', pollId]` 무효화를 요구하지만(명세:119, 125-128), 현재 구독 이벤트 허용 목록에는 해당 이벤트가 없고(`client/src/services/realtime.ts:20-21`), `RoomEvent` union에도 없다(`client/src/types/domain.ts:89-99`). `useChatMessages` switch도 알 수 없는 이벤트를 처리하지 않는다(`client/src/hooks/useChatMessages.ts:114-161`). 이 상태로는 broadcast가 발생해도 handler가 등록되지 않아 열린 카드의 결과가 갱신되지 않는다.

**제안.** `RoomEvent`에 `{ type: 'poll_updated'; roomId; pollId }`를 추가하고 `ROOM_EVENTS`와 채팅 화면의 React Query invalidation을 명시한다. 구독 후 snapshot 재조회와 poll query의 race(이벤트가 query 응답보다 먼저/나중에 오는 경우)를 테스트한다.

### 8. major — §6 — 생성 타입과 기존 Realtime composite 리터럴 갱신 범위가 불완전하다

**문제.** §6은 `070_realtime.test.sql`의 `row(...)::public.messages`만 언급한다(명세:162). 이는 실제로 column 수가 바뀌면 깨지는 리터럴이다(`supabase/tests/database/070_realtime.test.sql:31-40`). 또한 클라이언트 생성 타입의 `messages` Row/Insert/Update/Relationships는 현행 스키마를 직접 모델링하지만 `poll_id`가 없으며(`client/src/lib/supabase/database.types.ts:122-185`), 새 tables/RPC 역시 타입에 없다. 타입을 갱신하지 않으면 `.rpc('get_polls')`와 messages select가 정확히 추론되지 않는다.

**제안.** 마이그레이션 뒤 `supabase gen types`로 `database.types.ts`를 재생성하고, 새 세 tables, messages FK/열, 다섯 RPC의 Args/Returns를 포함한 diff를 커밋 대상으로 명시한다. 070의 모든 composite literal 및 mapper/서비스 단위 테스트를 갱신한다.

### 9. minor — §2.6, §3.5 — 삭제된 투표의 `get_polls` 결과 정책이 모순된다

**문제.** §2.6은 삭제된 메시지를 기존 “삭제된 메시지”로 그리고 투표 데이터 행은 남긴다고 한다(명세:76-77). 동시에 `get_polls`는 삭제를 `closed`에 포함해 정상 options/count/voterIds를 반환하는 형태다(명세:103-110). 현재 사용자는 삭제된 message id를 알고 있으면 RPC를 직접 호출할 수 있으므로, “카드만 숨김”인지 “삭제 뒤 결과도 반환하지 않음”인지에 따라 구현과 개인정보 노출 범위가 달라진다.

**제안.** 삭제 투표를 `get_polls`에서 생략할지, `{ closed: true, options: [] }` 같은 최소 정보만 줄지, 혹은 결과를 계속 공개할지를 명시한다. 선택한 정책을 direct-RPC pgTAP으로 고정한다.

### 10. minor — §3.5 — 배치 RPC 입력/출력 계약이 부족하다

**문제.** `get_polls(p_poll_ids bigint[])`는 반환 배열의 입력 순서 보장, 중복/NULL 처리, 빈 배열, 최대 길이를 정의하지 않는다(명세:103-110). 클라이언트가 카드별 호출을 batched prefetch로 바꾸면 결과를 id로 재매핑할지 위치로 읽을지가 달라지고, 인증 사용자가 큰 배열로 집계 쿼리를 유발할 수도 있다.

**제안.** unique non-null ids만 받고 페이지 크기(예: 메시지 페이지 30개) 이하로 제한하며, 반환은 입력 순서와 무관한 `id` keyed 결과라고 명시한다. 빈/중복/과대 배열 테스트를 추가한다.

### 11. minor — §5.1 — `datetime-local`의 시간대 변환 책임이 빠져 있다

**문제.** UI는 timezone 정보가 없는 `<input type="datetime-local">` 값을 받고 RPC는 `timestamptz`를 받는다(명세:85, 135). 브라우저 문자열을 그대로 넘길지, local time을 ISO offset으로 변환할지 명시하지 않으면 클라이언트/드라이버/DB timezone에 따라 사용자가 고른 마감 시각과 실제 `closes_at`이 달라질 수 있다.

**제안.** 브라우저 local 값을 `Date`로 해석해 UTC ISO 문자열로 전송하고, 화면은 사용자 timezone으로 표시한다고 정한다. DST 경계와 최소 1분 검증을 단위 테스트에 넣는다.

## 요청한 관점별 확인 결과

- **익명성 / Realtime / push / reactions:** 명세의 `poll_updated` payload가 id만 담고(명세:119), `poll_votes` 직접 권한을 제거하는 방향(명세:72-74)은 voter identity를 broadcast/push에 싣지 않는다. 현행 push는 `messages.content`만 전송하고(`supabase/migrations/20261020100000_system_messages.sql:160-181`), reactions는 message id 기준 별도 이벤트이므로 poll vote와 연결하지 않는 한 추가 누출은 없다. 다만 발견 사항 9의 삭제 후 `get_polls` 접근 정책은 반드시 결정해야 한다.
- **`push_targets`, `search_messages`, `list_my_rooms`:** `content = '(투표) ' || question`을 계속 쓰는 설계라면 별도 schema 변경은 필요 없다. 현행 push는 content/body를 쓰고(`20261020100000_system_messages.sql:164-169`), 목록은 마지막 content를 쓰며(`:134-154`), 검색도 일반 user 텍스트 message를 찾는다(`20261020140000_search_messages.sql:18-30`); 이는 §2.1의 의도와 일치한다.
- **delete path / reply preview:** soft delete 자체는 `poll_open`이 메시지 삭제를 확인하도록 구현하면 기능상 닫힘을 만들 수 있지만, 경쟁 상태는 발견 사항 3을 해결해야 한다. 답장 미리보기는 현재 content만 표시한다(`client/src/lib/chat-state.ts:112-117`, `client/src/components/chat/MessageBubble.tsx:68-76`)므로 §2.1의 fallback content는 동작한다. 다만 PollCard를 렌더링하려면 발견 사항 6의 `pollId` 매핑이 선행돼야 한다.
- **RLS·grant·security-definer 규약:** §2.5와 §3의 방향은 저장소 규약과 맞는다. 기존 RPC도 `security definer set search_path = ''` 및 public/anon revoke를 사용한다(예: `supabase/migrations/20261020140000_search_messages.sql:3-5,33-34`). 구현 마이그레이션에서 새 세 table에 RLS enable + `anon, authenticated`의 명시적 revoke, 모든 새 RPC의 overload별 revoke/grant를 실제 SQL로 빠짐없이 넣어야 한다.
- **YAGNI:** 예정 마감용 별도 작업/알림을 제외하고 poll 목록 화면을 만들지 않는 범위는 적절하다. 다만 카드마다 독립 `useQuery`보다 메시지 페이지의 unique poll id를 한 번에 `get_polls`하는 방식이 필요해질 때까지는 배치 최적화를 요구사항으로 추가하지 않는 편이 낫다.

