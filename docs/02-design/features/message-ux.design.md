---
template: design
version: 1.3
feature: message-ux
date: 2026-06-16
author: louis-25
project: dongchat
status: Draft
---

# message-ux Design Document

> **Summary**: Message 엔티티 확장 + participant.lastReadMessageId 기반으로 읽음·삭제/수정·답장·무한스크롤을 구현하고, 핵심 로직을 ChatMessageService로 추출한다. (Option C: 실용 균형)
>
> **Project**: dongchat
> **Version**: client 0.1.0 / server 0.0.1
> **Author**: louis-25
> **Date**: 2026-06-16
> **Status**: Draft
> **Planning Doc**: [message-ux.plan.md](../../01-plan/features/message-ux.plan.md)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 메시지 단위 상호작용 부재로 카카오톡 대비 기본 채팅 신뢰도가 낮다. |
| **WHO** | dongchat 채팅방 참여자(1:1·그룹), 특히 그룹 대화 사용자. |
| **RISK** | 기존 소켓 메시지 흐름(`useChatMessages` ↔ `chat.gateway`) 변경으로 실시간 송수신 회귀 발생 가능. |
| **SUCCESS** | 읽음 인원 수 정확, 본인 메시지만 수정/삭제, 답장 인용 표시, 과거 메시지 무한 로딩 무중단. |
| **SCOPE** | Phase 1 데이터모델 → Phase 2 백엔드(소켓+REST) → Phase 3 프론트(상태+UI). |

---

## 1. Overview

### 1.1 Design Goals

- 메시지에 안정적 식별자(`id`)와 상태(편집/삭제/답장)를 부여하고 실시간 동기화한다.
- 그룹 "안 읽은 인원 수"를 추가 row 폭증 없이 O(N)으로 계산한다.
- 비대한 `ChatGateway`의 영속·읽음 로직을 `ChatMessageService`로 추출해 얇고 테스트 가능한 게이트웨이를 유지한다.
- 기존 실시간 송수신 경로를 깨지 않고 점진적으로 확장한다.

### 1.2 Design Principles

- **검증된 신원만 신뢰**: 모든 mutation은 `socket.data.userId` 기준(클라이언트 입력 ID 불신).
- **얇은 게이트웨이**: gateway는 I/O·브로드캐스트, 비즈니스 로직은 Service.
- **단조 증가 읽음**: `lastReadMessageId`는 max로만 갱신.
- **하위 호환**: payload는 기존 필드 유지하면서 신규 필드를 추가(누락 시 graceful).

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| Criteria | Option A: Minimal | Option B: Clean | Option C: Pragmatic |
|----------|:-:|:-:|:-:|
| **Approach** | Gateway 인라인 | Service+ReadReceipt 엔티티 | Service 추출 + 컬럼 확장 |
| **읽음 모델** | lastReadMessageId | per-message ReadReceipt | lastReadMessageId |
| **New Files** | ~1 | ~8 | ~3 |
| **Modified Files** | ~6 | ~10 | ~7 |
| **Complexity** | Low | High | Medium |
| **Maintainability** | Medium | High | High |
| **Effort** | Low | High | Medium |
| **Risk** | Medium (coupled) | Medium (over-eng) | Low (balanced) |
| **Recommendation** | 핫픽스 | 장기 대규모 | **기본 선택** |

**Selected**: **Option C** — **Rationale**: 추가 엔티티 없이 그룹 읽음을 효율 계산하고, gateway 비대화를 막으면서도 현 규모에 과설계하지 않음. 기존 도메인 모듈 구조와 정합.

### 2.1 Component Diagram

```
┌────────────────────┐   socket.io    ┌─────────────────────┐   TypeORM   ┌──────────┐
│ Client             │◀──────────────▶│ ChatGateway (thin)  │            │  MySQL   │
│  useChatMessages   │   message/      │   ├ extractToken    │            │ message  │
│  useMessagePaging  │   message_read/ │   └ delegates →     │───────────▶│ participant
│  MessageList/Input │   *_edited/     │ ChatMessageService  │            └──────────┘
└────────────────────┘   *_deleted     │  (persist/read/edit)│
        │ REST (cursor)                 └─────────────────────┘
        └──────────────────────────────▶ ChatController.getMessages
```

### 2.2 Data Flow

```
[읽음]   방 조회 → emit message_read{roomId} → Service.markRead(max id) → broadcast read_update
[전송]   emit message{content,roomId,replyToId?} → Service.create → broadcast message{id,...} + push
[수정]   emit message_edit{messageId,content} → Service.edit(소유권 검증) → broadcast message_edited
[삭제]   emit message_delete{messageId} → Service.softDelete(소유권 검증) → broadcast message_deleted
[과거]   GET /chat?roomId&before=<cursorId>&limit=30 → DESC → 클라 prepend
```

### 2.3 Dependencies

| Component | Depends On | Purpose |
|-----------|-----------|---------|
| ChatGateway | ChatMessageService | 영속·읽음·수정·삭제 위임 |
| ChatMessageService | Message/ChatRoom/Participant Repo, PushService | DB 접근, 푸시 |
| ChatController | ChatMessageService | cursor 페이지네이션 조회 |
| useChatMessages | useChat(socket), useAuth | 실시간 상태 |
| useMessagePagination | api-client(get) | 과거 메시지 cursor 로드 |

---

## 3. Data Model

### 3.1 Entity Definition

```typescript
// Message (확장) — server/src/chat/message.entity.ts
@Entity()
export class Message {
  @PrimaryGeneratedColumn() id: number;
  @Column() sender: string;            // 표시명(기존)
  @Column() senderId: number;          // 신규: 소유권 검증 기준 (FR-06)
  @Column('text') content: string;
  @ManyToOne(() => ChatRoom, r => r.messages, { nullable: true }) room: ChatRoom | null;

  @ManyToOne(() => Message, { nullable: true })  // 신규: 답장 (FR-07)
  replyTo: Message | null;
  @Column({ nullable: true }) replyToId: number | null;

  @Column({ type: 'datetime', nullable: true }) editedAt: Date | null;   // 신규 (FR-04)
  @Column({ type: 'datetime', nullable: true }) deletedAt: Date | null;  // 신규 soft delete (FR-05)

  @CreateDateColumn() createdAt: Date;
}

// ChatRoomParticipant (확장) — chat-room-participant.entity.ts
@Entity() @Unique(['room', 'user'])
export class ChatRoomParticipant {
  @PrimaryGeneratedColumn() id: number;
  @ManyToOne(() => ChatRoom, r => r.participants, { eager: true }) room: ChatRoom;
  @ManyToOne(() => User, { eager: true }) user: User;
  @Column({ type: 'int', nullable: true }) lastReadMessageId: number | null; // 신규 (FR-02)
  @CreateDateColumn() createdAt: Date;
}
```

### 3.2 Entity Relationships

```
[ChatRoom] 1 ── N [Message] N ── 1 [Message] (replyTo, self-ref)
     │
     └── 1 ── N [ChatRoomParticipant] ── lastReadMessageId ┄┄▶ [Message.id]
```

### 3.3 안 읽은 인원 수 계산 (핵심 알고리즘)

```
unreadCount(message) = COUNT(participant
    WHERE participant.user.id != message.senderId
      AND (participant.lastReadMessageId IS NULL
           OR participant.lastReadMessageId < message.id))
```
- 방 메시지 목록 조회 시 참여자 목록을 1회 로드 → 메모리에서 메시지별 계산(N+1 회피, NFR Performance).
- soft delete된 메시지(`deletedAt != null`)는 unread 계산에서 제외.

---

## 4. API Specification

### 4.1 Socket Events (신규/변경)

| 방향 | Event | Payload | 검증/동작 |
|------|-------|---------|-----------|
| C→S | `message` (변경) | `{ roomId, content, replyToId? }` | senderId/sender는 `socket.data`에서. 참여자 검증 후 저장, `message` 브로드캐스트(+push) |
| S→C | `message` (변경) | `{ id, roomId, sender, senderId, message, replyTo?, createdAt }` | id·replyTo 포함 |
| S→C | `initial_messages` (변경) | `{ roomId, messages: MessageView[] }` | MessageView에 id/flags/unreadCount 포함 |
| C→S | `message_read` (신규) | `{ roomId }` | `lastReadMessageId = max(roomId 최신 id)` (단조), `read_update` 브로드캐스트 |
| S→C | `read_update` (신규) | `{ roomId, userId, lastReadMessageId }` | 클라가 unreadCount 재계산 |
| C→S | `message_edit` (신규) | `{ messageId, content }` | 소유권(senderId==userId)·미삭제 검증, `editedAt` 기록 |
| S→C | `message_edited` (신규) | `{ id, roomId, content, editedAt }` | — |
| C→S | `message_delete` (신규) | `{ messageId }` | 소유권 검증, soft delete |
| S→C | `message_deleted` (신규) | `{ id, roomId }` | 클라가 "삭제된 메시지" 표시 |
| S→C | `message_error` (신규) | `{ code, message }` | `CHAT_FORBIDDEN`/`MESSAGE_NOT_FOUND` |

`MessageView` = `{ id, sender, senderId, message, replyTo: {id,sender,message}|null, editedAt, deletedAt, unreadCount, createdAt }`

### 4.2 REST Endpoint (cursor 페이지네이션)

#### `GET /chat`  (기존 확장)

| Query | Type | Description |
|-------|------|-------------|
| roomId | number | 필수 사용 권장(멤버 검증) |
| before | number? | 이 messageId 미만의 과거 메시지 (cursor) |
| limit | number? | 기본 30 |

**Response (200):** `MessageView[]` (createdAt DESC, 클라이언트가 reverse하여 prepend)

- 기존 `page/limit` offset 방식은 `before` cursor 방식으로 대체(하위 호환 위해 page 무시·deprecate).
- 권한 없는 roomId → `403 CHAT_FORBIDDEN` (기존 `ForbiddenException` 패턴 유지).

---

## 5. UI/UX Design

### 5.1 Screen Layout (MessageList 항목)

```
┌───────────────────────────────────────────────┐
│  ┌ 답장 미리보기(replyTo): "원문 일부…"          │  ← FR-07
│  sender • 12:30                    [3]          │  ← [3] 안읽은 수 (FR-03)
│  ┌─────────────────────────────┐  (수정됨)      │  ← editedAt (FR-04)
│  │ 메시지 내용                  │                │
│  └─────────────────────────────┘  ⋯ (본인만)    │  ← 수정/삭제 메뉴
│  ───────────────────────────────                │
│  "삭제된 메시지입니다"  (deletedAt 시)           │  ← FR-05
└───────────────────────────────────────────────┘
   ▲ 위로 스크롤 시 과거 메시지 자동 로드 (FR-08)
```

### 5.2 User Flow

```
방 선택 → initial_messages 로드 + message_read emit
  → 메시지 hover ⋯ → 수정/삭제(본인) / 답장(전체)
  → 위로 스크롤 → before=가장오래된id 로드 → prepend
```

### 5.3 Component List

| Component | Location | Responsibility |
|-----------|----------|----------------|
| MessageList | `.../ChatRooms/components/MessageList.tsx` | 메시지 렌더(읽음수/수정/삭제/답장 표시), 무한스크롤 트리거 |
| MessageItem (신규) | `.../components/MessageItem.tsx` | 단일 메시지 + ⋯ 메뉴/답장 미리보기 |
| MessageInput | `.../components/MessageInput.tsx` | 입력 + 답장/수정 컨텍스트 바 |
| useChatMessages | `.../hooks/useChatMessages.ts` | 소켓 이벤트 상태 관리 |
| useMessagePagination (신규) | `.../hooks/useMessagePagination.ts` | cursor 과거 로드 |

### 5.4 Page UI Checklist

#### 채팅방 (ChatRooms)
- [ ] List: 메시지 항목에 `id` 기반 key (인덱스 key 제거)
- [ ] Badge: 안 읽은 인원 수(`unreadCount > 0`일 때만, 발신자 측에 표시)
- [ ] Badge: "수정됨"(`editedAt != null`)
- [ ] Text: "삭제된 메시지입니다"(`deletedAt != null`, 내용 숨김)
- [ ] Menu: 본인 메시지 ⋯ → 수정/삭제 (타인 메시지엔 미표시)
- [ ] Preview: 답장 시 원본 sender + 내용 일부 인용
- [ ] Bar: 입력창 위 답장/수정 대상 표시 + 취소 버튼
- [ ] Scroll: 상단 도달 시 과거 메시지 로드(로딩 인디케이터), 스크롤 위치 보존

---

## 6. Error Handling

### 6.1 Error Code Definition

| Code | 상황 | 처리 |
|------|------|------|
| `CHAT_FORBIDDEN` (403) | 비참여자 방 조회/타인 메시지 수정·삭제 | 소켓 `message_error` emit / REST 403 |
| `MESSAGE_NOT_FOUND` (404) | 없는/이미 삭제된 메시지 수정·삭제 | `message_error` emit |
| `VALIDATION_FAILED` (400) | 빈 content 등 | 클라 차단 + 서버 무시 |

> 신규 코드는 client [error-handler.ts](../../../client/src/lib/error-handler.ts) 매핑에 추가(서버 AGENTS.md 에러 계약).

### 6.2 Error Response Format

소켓: `message_error` `{ code, message }` / REST: 기존 `HttpExceptionFilter` `{ status, code, message }` 유지.

---

## 7. Security Considerations

- [x] 발신자/수정·삭제 주체는 `socket.data.userId`만 사용 — 클라이언트 입력 `senderId` 불신
- [x] 수정/삭제 전 `message.senderId === userId` 소유권 검증 (FR-06)
- [x] 방 참여자 검증 후에만 전송/조회 (기존 패턴 유지)
- [x] content 길이/공백 검증
- [ ] (차기) 메시지 전송 rate limiting 검토

---

## 8. Test Plan

### 8.1 Test Scope

| Type | Target | Tool | Phase |
|------|--------|------|-------|
| L1: API | `GET /chat` cursor·권한 | curl/supertest | Do |
| L2: Socket | read/edit/delete/reply 이벤트 | socket.io-client 테스트 | Do |
| L3: E2E | 송신→읽음→수정→삭제→과거로드 | 수동/Playwright | Do/Check |

### 8.2 L1 API Scenarios

| # | Endpoint | 테스트 | 기대 |
|---|----------|--------|------|
| 1 | GET /chat?roomId=N | 멤버 조회 | 200, MessageView[] DESC |
| 2 | GET /chat?roomId=N&before=M | cursor 과거 | 200, 모든 id < M |
| 3 | GET /chat?roomId=X(비멤버) | 권한 차단 | 403 `CHAT_FORBIDDEN` |
| 4 | GET /chat (no auth) | 가드 | 401 |

### 8.3 L2 Socket Scenarios

| # | Event | 동작 | 기대 |
|---|-------|------|------|
| 1 | message(replyToId) | 전송 | 수신 payload에 id·replyTo 포함 |
| 2 | message_read | 방 열람 | read_update 브로드캐스트, unreadCount 감소 |
| 3 | message_edit (본인) | 수정 | message_edited, editedAt 설정 |
| 4 | message_edit (타인) | 거부 | message_error CHAT_FORBIDDEN |
| 5 | message_delete (본인) | 삭제 | message_deleted, deletedAt 설정 |

### 8.4 L3 E2E

| # | 시나리오 | 성공 기준 |
|---|----------|-----------|
| 1 | A·B 그룹방: A 전송 → B 미열람 시 [1] → B 열람 시 [0] | 읽음 수 정확 |
| 2 | A 수정/삭제 → B 화면 실시간 반영 | "수정됨"/"삭제된 메시지" |
| 3 | 과거 100개 방에서 위로 스크롤 | 30개씩 끊김없이 로드, 위치 보존 |

### 8.5 Seed Data

| Entity | Min | 필드 |
|--------|:--:|------|
| User | 2 | username/password |
| ChatRoom(group) | 1 | participants 2명 |
| Message | 60+ | 페이지네이션 검증용 |

---

## 9. Clean Architecture

### 9.4 This Feature's Layer Assignment

| Component | Layer | Location |
|-----------|-------|----------|
| MessageList/Item/Input | Presentation | `client .../components/` |
| useChatMessages, useMessagePagination | Application | `client .../hooks/` |
| IncomingMessage/MessageView 타입 | Domain | `client .../types.ts` |
| api-client(get) | Infrastructure | `client/src/lib/api-client.ts` |
| ChatMessageService | Application(server) | `server/src/chat/chat-message.service.ts` |
| Message/Participant entity | Domain(server) | `server/src/chat/*.entity.ts` |
| ChatGateway/Controller | Presentation(server) | `server/src/chat/` |

---

## 10. Coding Convention Reference

- 소켓 이벤트: snake_case (`message_read`, `message_edited`, `message_deleted`, `read_update`).
- 신규 에러코드 추가 시 client `error-handler.ts` 동기화.
- 컴포넌트 PascalCase, 훅 camelCase, `@/` alias (client/server AGENTS.md 준수).

---

## 11. Implementation Guide

### 11.1 File Structure

```
server/src/chat/
  message.entity.ts              (수정: senderId/replyTo/editedAt/deletedAt)
  chat-room-participant.entity.ts(수정: lastReadMessageId)
  chat-message.service.ts        (신규: 영속/읽음/수정/삭제 + unread 계산)
  chat.gateway.ts                (수정: 신규 이벤트 위임)
  chat.controller.ts             (수정: cursor 페이지네이션)
  chat.module.ts                 (수정: provider 등록)
  dto/chat-query.dto.ts          (수정: before/limit)

client/.../ChatRooms/
  types.ts                       (수정: MessageView/IncomingMessage 확장)
  hooks/useChatMessages.ts       (수정: 신규 이벤트 핸들링)
  hooks/useMessagePagination.ts  (신규)
  components/MessageList.tsx      (수정)
  components/MessageItem.tsx      (신규)
  components/MessageInput.tsx     (수정)
```

### 11.2 Implementation Order

1. [ ] 데이터 모델 확장 (entity 컬럼) + 마이그레이션/synchronize 확인
2. [ ] ChatMessageService 추출 (기존 gateway 로직 이전 + unread 계산)
3. [ ] 소켓 신규 이벤트 (read/edit/delete/reply) + 소유권 검증
4. [ ] cursor REST 페이지네이션
5. [ ] 클라 타입 확장 + useChatMessages 이벤트 핸들링
6. [ ] useMessagePagination + MessageList/Item/Input UI
7. [ ] 에러코드 매핑 + 회귀 확인(기존 송수신)

### 11.3 Session Guide

#### Module Map

| Module | Scope Key | Description | Est. Turns |
|--------|-----------|-------------|:----------:|
| 백엔드 데이터모델 | `backend-model` | Message/Participant 컬럼 추가, module 등록 | 8-12 |
| 백엔드 서비스·소켓·REST | `backend-logic` | ChatMessageService + 신규 이벤트 + cursor 조회 + 소유권/읽음 | 25-35 |
| 프론트 상태·UI | `frontend` | 타입·훅·MessageList/Item/Input·무한스크롤 | 30-40 |

#### Recommended Session Plan

| Session | Phase | Scope | Turns |
|---------|-------|-------|:-----:|
| 1 | Plan + Design | 전체 | ✅ 완료 |
| 2 | Do | `--scope backend-model,backend-logic` | 35-45 |
| 3 | Do | `--scope frontend` | 30-40 |
| 4 | Check + Report | 전체 | 30-40 |

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-16 | Initial draft (Option C 선택) | louis-25 |
