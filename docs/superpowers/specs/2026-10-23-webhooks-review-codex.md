# 수신 웹훅 설계 검토 (Codex)

검토 대상: `2026-10-23-webhooks-design.md`와 현재 마이그레이션/클라이언트 구현. 아래 항목은 구현 전에 설계에 반영할 것을 권장한다.

## [blocker] 봇을 일반 사용자로 취급하면 친구 요청과 1:1 방이 영구적으로 깨진다

- **설계 절:** §1, §2.1 (YAGNI로 `profiles.is_bot` 및 1:1 숨김 제외)
- **근거:** `send_friend_request`는 모든 `profiles`를 대상으로 요청을 생성한다([20261013061608_friends.sql:27-44](../../../supabase/migrations/20261013061608_friends.sql#L27-L44)). `open_direct_room`도 username만으로 상대를 찾아 1:1 방을 만들 수 있다([20261015082423_room_list.sql:42-76](../../../supabase/migrations/20261015082423_room_list.sql#L42-L76)). 봇은 로그인/수락을 할 수 없으므로 pending 친구 요청 또는 봇과의 1:1 방이 남는다.
- **수정:** 이것은 YAGNI가 아니라 접근 제어 규칙이다. 영속적인 `profiles.is_bot`(권장) 또는 삭제 후에도 남는 전용 봇 레지스트리를 두고, 친구 요청·1:1 방 열기·일반 사용자 선택 쿼리에서 봇을 제외하라. `private.webhooks`만으로 판별하면 §3의 삭제 후 남겨 둔 봇을 더 이상 구분할 수 없다.

## [major] 기존 방장 이전 트리거는 봇을 방장으로 만들고, 봇만 남은 방을 삭제하지 않는다

- **설계 절:** §2.3
- **근거:** 현재 삭제 트리거는 남은 참여자를 `joined_at` 순서로 무조건 다음 방장으로 선택한다([20261013061219_rooms.sql:81-103](../../../supabase/migrations/20261013061219_rooms.sql#L81-L103)). 따라서 사람이 나간 뒤 봇이 가장 먼저 남아 있으면 `created_by = bot_id`가 되며, 마지막 사람이 나가도 봇이 있으면 방이 보존된다. 이는 §2.3의 사람 우선/봇만 남으면 방 삭제와 정면으로 다르다.
- **수정:** 트리거에서 영속적 봇 표식을 제외해 다음 사람 방장을 선택하고, 사람 참여자가 0명이면 `chat_rooms`를 삭제하라. 동시 삭제를 고려해 현재의 room row 잠금은 유지하고, 사람·봇 혼합/봇만 남음/방장이 먼저 나감의 pgTAP을 추가하라.

## [major] `?token=` 허용은 발급 토큰을 로그·히스토리·프록시로 유출시킨다

- **설계 절:** §5
- **근거:** §5는 `Authorization: Bearer`가 없을 때 URL query의 `token`을 수용한다. 이 토큰은 해당 봇의 발신 권한 자체이며, 현재 푸시 함수도 JWT를 끄는 대신 별도 비밀 헤더만으로 보호한다([config.toml:393-395](../../../supabase/config.toml#L393-L395), [send-push/index.ts:63-70](../../../supabase/functions/send-push/index.ts#L63-L70)).
- **수정:** query fallback을 삭제하고 `Authorization: Bearer dch_…`만 허용하라. 요청/오류 로그에는 Authorization과 본문을 기록하지 말고, 토큰 형식·최대 길이를 Edge와 RPC 양쪽에서 빠르게 검증한 뒤 항상 동일한 401을 반환하라.

## [major] SQL Editor 경로는 기존 로그인 전제 RPC를 재사용할 수 없다

- **설계 절:** §3
- **근거:** SQL Editor 호출은 `auth.uid()`/JWT가 없어 `private.require_active_session()`을 통과하지 못한다([20261013060943_foundation.sql:51-65](../../../supabase/migrations/20261013060943_foundation.sql#L51-L65)). 따라서 `public.create_room`은 사용할 수 없다([20261013061219_rooms.sql:112-151](../../../supabase/migrations/20261013061219_rooms.sql#L112-L151)). 반면 `private.add_system_message`와 `private.display_name`은 auth 문맥을 요구하지 않아 사용할 수 있다([20261020100000_system_messages.sql:7-18](../../../supabase/migrations/20261020100000_system_messages.sql#L7-L18)).
- **수정:** 새 방 오버로드는 `create_room`/`invite_to_room`을 호출하지 말고, 유효한 사람 프로필을 검증한 뒤 `chat_rooms(created_by = 첫 사람)`와 참여자를 직접 삽입하는 SQL-Editor 전용 경로로 명시하라. `auth.uid()`에 의존하는 헬퍼와 안전한 헬퍼를 테스트로 구분하고, 새 함수에는 public/anon/authenticated 실행 권한을 모두 회수한 뒤 service-role도 부여하지 마라.

## [major] 관리자 사용자 목록·관리 액션에 봇이 섞인다

- **설계 절:** §1, §2.1, §3
- **근거:** 관리자 목록은 모든 `profiles`와 `auth.users`를 조인하고 총계도 모두 센다([20261013061851_admin.sql:13-41](../../../supabase/migrations/20261013061851_admin.sql#L13-L41)). 따라서 무이메일 봇이 일반 사용자로 표시되고, ban/force-logout 대상도 된다([20261013061851_admin.sql:70-103](../../../supabase/migrations/20261013061851_admin.sql#L70-L103)).
- **수정:** 영속적 `is_bot` 표식을 목록에서 기본 제외하거나 별도 서비스 계정 탭/명확한 라벨로 분리하고, ban·logout 등 사람 전용 관리 액션은 봇을 거절하라. 이는 위 친구 경로와 같은 표식을 재사용해야 한다.

## [minor] 직접 `auth.users` INSERT의 운영 계약과 충돌 처리 정의가 빠져 있다

- **설계 절:** §2.1, §3
- **근거:** `auth.users` INSERT는 `private.handle_new_user`를 동기 실행해 `profiles`를 만든다([20261013060943_foundation.sql:97-126](../../../supabase/migrations/20261013060943_foundation.sql#L97-L126)). 이 트리거는 `bot_<uuid 앞 8자리>` username을 그대로 삽입하며 충돌을 복구하지 않는다([20261013060943_foundation.sql:100-119](../../../supabase/migrations/20261013060943_foundation.sql#L100-L119)). 또한 Auth 내부 테이블 직접 쓰기는 SQL Editor의 고권한 운영 절차에 묶이므로 Edge Function/클라이언트에서 재사용해서는 안 된다.
- **수정:** 생성은 트랜잭션 하나에서만 수행하고 username unique 충돌 시 새 UUID/이름으로 재시도하거나 충돌 없는 전체 UUID 기반 이름을 사용하라. 지원하는 SQL Editor 운영 경로로 한정하고, `auth.users` 생성 실패·프로필 트리거 실패·중간 실패가 모두 롤백되는 pgTAP을 추가하라.

## [minor] 링크 위 긴 누르기 요구는 현재 훅과 모순된다

- **설계 절:** §6.2
- **근거:** `MessageBubble`은 말풍선 컨테이너에 긴 누르기 핸들러를 펼친다([MessageBubble.tsx:61-69](../../../client/src/components/chat/MessageBubble.tsx#L61-L69)). 현재 `ignoresLongPress`는 `input`, `textarea`, `dialog`만 제외하므로 `<a>`는 500ms 후 메뉴가 열리고 이어지는 click이 차단된다([useLongPress.ts:8-9,22-31,46-50](../../../client/src/hooks/useLongPress.ts#L8-L9)). 이는 §6.2가 요구한 “링크 위 긴 누르기에는 메뉴, 링크 미열기”에는 맞지만, 링크의 기본 길게 누르기 동작(주소 복사 등)을 보존할지 명시하지 않아 접근성/UX가 불명확하다.
- **수정:** 의도대로 메뉴 우선이면 `<a>`를 명시적으로 포함한 회귀 테스트(긴 누르기 메뉴 1회, navigation 0회)를 추가하라. 링크 고유 동작을 보존할 의도라면 `a`를 제외 대상으로 추가하고, 말풍선 빈 영역에서만 메뉴를 열도록 §6.2를 변경하라.

## 확인된 호환 사항

- 봇 메시지는 `kind = 'user'`로 저장되므로 사람 수신자의 미읽음 계산에 포함된다([20261020100000_system_messages.sql:140-145](../../../supabase/migrations/20261020100000_system_messages.sql#L140-L145)). 또한 푸시는 sender와 다른 참여자에게만 보내며 system 메시지는 제외한다([20261020100000_system_messages.sql:160-181](../../../supabase/migrations/20261020100000_system_messages.sql#L160-L181)); §4의 기대와 맞는다.
- §3이 봇 `auth.users`/profile을 삭제하지 않아 과거 메시지의 sender FK가 null로 바뀌는 문제는 피한다. 실제 `messages.sender_id`는 user 삭제 시 `set null`이다([20261013061219_rooms.sql:23-32](../../../supabase/migrations/20261013061219_rooms.sql#L23-L32)).
