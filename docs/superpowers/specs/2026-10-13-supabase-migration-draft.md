# Supabase 백엔드 이전 — 기획 초안 (리뷰용, 미확정)

> 상태: DRAFT. 브레인스토밍 진행 중(설계 섹션 1/7까지 제시). 외부 리뷰 후 확정 spec으로 승격 예정.
> 브랜치: `feat/supabase-migration` (main = 727a322b 기준)

## 1. 목적과 제약

- **목적:** 배포 비용 최소화. Supabase Free + Vercel Hobby로 월 0원 운영 시작.
- **필수 제약:** 언제든 NestJS 백엔드로 되돌릴 수 있는 구조(백엔드 교체 용이성).
- **유지할 기능(현재와 동일):** 친구 요청/수락/차단, 1:1·그룹 방 생성/목록, 채팅(메시지 전송, 읽음/안읽은 인원 수, 수정, soft delete, 답장, cursor 무한스크롤), 웹 푸시, 관리자 사용자 목록, 카카오 로그인.

## 2. 확정된 결정 (사용자 승인)

| 항목 | 결정 |
|---|---|
| 기존 MySQL 데이터 | 이전 안 함, 새로 시작 |
| 로그인 | 이메일 + 비밀번호 (Supabase Auth 기본) + 카카오 OAuth. `username`은 profiles의 표시명/친구 검색용으로 유지 |
| 개발 환경 | 로컬 Supabase (`supabase start`, Docker). 클라우드는 배포 시 `db push` |
| 데이터 접근 방식 | **A안**: 클라이언트가 `supabase-js`로 직접 접근, 단 `services/` 경계 뒤에 숨김. 권한은 RLS + RPC. BFF(Next Route Handler) 안 둠 |

## 3. 현재 시스템 (변경 전)

- `server/`: NestJS 11 + TypeORM + MySQL, JWT(passport), Socket.io 게이트웨이, web-push. 약 2,400 LOC.
  - 엔티티: User(int id, username, bcrypt password, provider, role enum ADMIN/USER/OBSERVER), ChatRoom(name, isGroup), ChatRoomParticipant(room, user, lastReadMessageId), Message(sender 문자열, senderId, content, replyToId, editedAt, deletedAt), Friend(requester, receiver, status PENDING/ACCEPTED/BLOCKED), PushSubscription(userId, endpoint, p256dh, auth).
  - 소켓 이벤트: `join_room`, `message`, `message_read`, `message_edit`, `message_delete` / 서버→클라: `initial_messages`, `message`, `read_update`, `message_edited`, `message_deleted`, `message_error`.
- `client/`: Next.js 16 + React 19, NextAuth v5 beta(Credentials + Kakao), axios, socket.io-client, React Query, jotai, **Orval 생성 React Query 훅이 `src/services/*`에 위치**.

## 4. 제안 아키텍처 (설계 섹션 1 — 사용자 확인 대기 중)

### 4.1 클라이언트 계층
```
app/, components/          UI. supabase를 모름
  └ hooks/                 React Query 훅
      └ services/          ★ 교체 경계: 순수 async 함수 + subscribe 함수만 노출
          ├ auth.ts        signUp / signIn / signInWithKakao / signOut / getCurrentUser
          ├ rooms.ts       listRooms / createRoom
          ├ messages.ts    fetchMessages(before) / sendMessage / editMessage / deleteMessage / markRead
          ├ friends.ts     listFriends / listPending / request / accept / block
          ├ users.ts       listUsers (admin)
          ├ push.ts        subscribe / unsubscribe
          └ realtime.ts    subscribeRoom(roomId, handlers) → unsubscribe
      └ lib/supabase/      client.ts / server.ts (@supabase/ssr). services/만 import 허용
types/domain.ts            앱 도메인 타입(ChatMessage, Room, Friend, Profile). DB 생성 타입은 services 내부 전용
```
- services는 순수 함수, hooks는 React Query. NestJS 복귀 시 services 내부만 fetch/socket.io로 교체.
- `RoomEvents` 핸들러 이름은 현재 소켓 이벤트 이름 계약을 유지(`message`, `message_edited`, `message_deleted`, `read_update`).
- ESLint `no-restricted-imports`로 services 밖의 `@supabase/*` / `lib/supabase` import 금지.

### 4.2 삭제/추가
- 삭제: `server/`(마지막 단계), next-auth, axios, socket.io-client, orval, `lib/api*`, `lib/models`, `auth.ts`, `api/auth/[...nextauth]`, jotai auth store.
- 추가: `@supabase/supabase-js`, `@supabase/ssr`(버전 고정), 세션 갱신 프록시(Next 16의 `proxy.ts` — 구현 시 문서 확인).
- `supabase/`: `config.toml`, `migrations/`, `tests/`(pgTAP), `functions/send-push/`.

### 4.3 DB 스키마(개요 — 섹션 2에서 상세 예정)
- `profiles`(id uuid → auth.users, username unique, nickname, avatar_url, role), `chat_rooms`, `chat_room_participants`(last_read_message_id), `messages`(sender_id uuid, content, reply_to_id, edited_at, deleted_at), `friends`, `push_subscriptions`.
- 사용자 ID: int → uuid.

### 4.4 권한(개요 — 섹션 3에서 상세 예정)
- `is_room_member(room_id)` 헬퍼 + RLS. 메시지 INSERT는 `with check (sender_id = auth.uid() and is_room_member(room_id))`.
- 수정/삭제/읽음/방 생성은 RPC(`edit_message`, `delete_message`, `mark_read`, `create_room`)로만. 직접 UPDATE는 막음(RLS로는 컬럼 단위 제어 불가).
- 삭제 시 `content = ''`로 실제 마스킹(클라이언트가 테이블을 직접 읽으므로).
- 핵심 규칙은 이름 있는 SQL 함수로 모아 NestJS로 이식 가능하게.

### 4.5 Realtime(개요)
- Supabase 공식 권장인 **Broadcast from Database**: 트리거에서 `realtime.broadcast_changes()`로 private 채널 `room:<id>` 송출, `realtime.messages`에 방 멤버만 수신하는 RLS.
- 읽음 상태는 `chat_room_participants` 변경도 같은 채널로 송출.

### 4.6 푸시(개요)
- `messages` INSERT → Database Webhook → Edge Function `send-push`(service role로 push_subscriptions 조회, web-push 발송).

### 4.7 확인한 Supabase 최신 변경 사항(2026-10 기준 changelog)
- 2026-10-30부터 모든 프로젝트에서 새 public 테이블이 Data API에 **자동 노출되지 않음** → 마이그레이션에 명시적 GRANT 필요.
- 2026-07-14부터 `realtime` 스키마 객체 생성/변경 차단(단, `realtime.messages` RLS 정책은 허용).
- Free 플랜 기본 SMTP 프로젝트는 auth 이메일 템플릿 커스터마이즈 불가(2026-06-03~).

## 5. 작업 분할(하위 프로젝트, 순서대로 각각 spec→plan→구현→검증)

1. **기반**: supabase init, 스키마/RLS/RPC/트리거, pgTAP 테스트 (앱 미변경)
2. **인증**: Supabase Auth(이메일+카카오), 세션 갱신, 로그인·가입 UI, services/auth
3. **친구·방·사용자**: services + hooks + UI 연결
4. **채팅**: messages services, Broadcast Realtime, 읽음/수정/삭제/답장/무한스크롤 (기존 리뷰의 클라이언트 버그 — 초기 unreadCount 오계산, 스크롤 점프 — 여기서 해소)
5. **푸시 + 정리**: Edge Function, server/·미사용 의존성 삭제, AGENTS.md/DEPLOYMENT.md 갱신

## 5.1 리뷰 반영 결정 (Codex·Cursor 리뷰, 2026-10-13)

- **컷오버:** 단계별 배포 안 함. `feat/supabase-migration`에서 1~5단계 완료 후 한 번에 병합. 단계별 검증은 각 단계의 자동 테스트로. NestJS↔Supabase 공존 브리지 만들지 않음.
- **교체 목표 재정의:** "NestJS 복귀 시 **Postgres는 유지**, 클라이언트는 `services/` 내부만 교체". SQL 함수(RPC/헬퍼) 목록 = NestJS 이식 체크리스트. Port/Adapter DI 추상화는 만들지 않음(구현 1개).
- **domain 계약 고정:** `types/domain.ts`에 DTO·에러 코드(`CHAT_FORBIDDEN` 등 기존 코드 유지)·cursor(`before` = message id). services는 PostgREST/RPC 에러를 domain 에러로 매핑.
- **ID:** 사용자 uuid, 메시지·방 등은 `bigint identity`. 읽음/cursor 비교는 message id(단조 증가).
- **role 보호:** role은 클라이언트가 쓸 수 없는 비노출 테이블(`private.user_roles`)에만. `user_metadata`는 권한 판단 금지. `OBSERVER` 제거.
- **SECURITY DEFINER 규칙:** 비노출 `private` 스키마 또는 내부 auth 검증 포함, `set search_path = ''`, `PUBLIC`/`anon` execute 회수.
- **Realtime:** `realtime.messages` 정책은 `realtime.topic()` ↔ 방 멤버십 대조. `ENABLE RLS` 직접 실행 금지. 클라 `private: true` + `setAuth()`. 입장/재연결 시 스냅샷(메시지+참여자 읽음 위치) 조회 → 구독 → `mark_read`. 오래된(더 작은) 읽음 이벤트 무시. UPDATE는 `deleted_at` 변화로 `message_deleted`/`message_edited` 구분. `unreadCount`는 클라 계산 단일 소스. `RoomEvents`에 `onError`.
- **인앱 토스트:** 참여 중인 모든 방 채널 구독(채널은 연결 1개 공유; 클라당 채널 수 상한 주석).
- **발신자 표시명:** 비정규화 안 함. 조회는 profiles 조인, Broadcast 수신분은 참여자 목록에서 해석.
- **누락 기능 포함:** admin 목록 페이지네이션/정렬(limit ≤100), push 구독 upsert + 410/404 정리, 삭제·답장 표시 계약, 친구 양방향 중복 검사·receiver만 수락/차단, 1:1 방 정확히 2명, VAPID/서비스워커 유지, 카카오 username 충돌 규칙.
- **푸시:** webhook 공유 비밀 검증. 멱등성 저장소·데드레터는 YAGNI.
- **Free 한도:** 기본 SMTP는 인증 메일 시간당 2통 → 운영은 커스텀 SMTP 또는 이메일 확인 off. 읽음 이벤트 억제(동일 값 재전송 안 함). pause/한도는 DEPLOYMENT 리스크로 명시.
- **테스트:** pgTAP 1차 최소 세트 — 멤버십, 메시지 INSERT, role 보호, realtime topic 정책.
- **정정:** Data API 자동 노출 중단은 "새 프로젝트 2026-05-30부터, 기존 프로젝트 2026-10-30 강제" → 규칙: 모든 마이그레이션에 최소 GRANT 명시.

## 6. 아직 남은 설계 섹션
2 스키마 상세 · 3 RLS/RPC 상세 · 4 인증 · 5 Realtime · 6 푸시 · 7 테스트 전략
