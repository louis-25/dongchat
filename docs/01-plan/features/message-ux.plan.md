---
template: plan
version: 1.3
feature: message-ux
date: 2026-06-16
author: louis-25
project: dongchat
status: Draft
---

# message-ux Planning Document

> **Summary**: 카카오톡 수준의 메시지 단위 상호작용(읽음 표시·삭제/수정·답장·무한 스크롤)을 dongchat 채팅에 도입한다.
>
> **Project**: dongchat
> **Version**: client 0.1.0 / server 0.0.1
> **Author**: louis-25
> **Date**: 2026-06-16
> **Status**: Draft

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | dongchat은 텍스트 송수신만 지원해 읽음 여부 확인, 메시지 회수/수정, 답장, 과거 대화 탐색이 불가능하다. 카카오톡의 핵심 경험인 "메시지 단위 상호작용"이 통째로 빠져 있다. |
| **Solution** | `Message` 엔티티에 soft delete·edit·replyTo를 추가하고, 참여자별 `lastReadMessageId`로 읽음을 추적한다. 소켓 이벤트(read/edit/delete)와 cursor 기반 페이지네이션 REST를 신설한다. |
| **Function/UX Effect** | 안 읽은 인원 수가 메시지마다 표시되고, 본인 메시지를 수정/삭제할 수 있으며, 특정 메시지에 답장하고, 위로 스크롤하면 과거 대화가 끊김 없이 로드된다. |
| **Core Value** | "실제로 쓸 수 있는 채팅" — 읽음과 회수가 되는 신뢰감 + 끊기지 않는 대화 흐름. |

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

### 1.1 Purpose

채팅 메시지에 읽음 표시, 삭제/수정, 답장, 무한 스크롤 페이지네이션을 도입하여
dongchat의 채팅 경험을 카카오톡 수준의 기본기로 끌어올린다.

### 1.2 Background

현재 메시지는 `{ sender, content, room, createdAt }` 텍스트 레코드로만 저장되고
(`server/src/chat/message.entity.ts`), 입장 시 최근 50개만 로드된다
(`chat.gateway.ts` `handleJoinRoom`, `take: 50`). 메시지 식별자(id)가 클라이언트로
전달되지 않아 메시지 단위 동작(읽음/수정/삭제/답장)을 구현할 기반이 없다.

### 1.3 Related Documents

- 코드 가이드: [server/AGENTS.md](../../../server/AGENTS.md), [client/AGENTS.md](../../../client/AGENTS.md)
- 후속: `docs/02-design/features/message-ux.design.md` (예정)

---

## 2. Scope

### 2.1 In Scope

- [ ] **읽음 표시**: 참여자별 `lastReadMessageId` 추적 → 메시지별 "안 읽은 인원 수" 계산·표시
- [ ] **메시지 삭제**: 본인 메시지만, soft delete("삭제된 메시지입니다" 표시)
- [ ] **메시지 수정**: 본인 메시지만, `editedAt` 기록 → "수정됨" 배지
- [ ] **답장(reply)**: 특정 메시지 인용 후 전송, 메시지에 원문 미리보기 표시
- [ ] **무한 스크롤 페이지네이션**: cursor 기반 과거 메시지 로딩(기존 50개 고정 대체)
- [ ] 위 동작에 대응하는 신규 소켓 이벤트 및 클라이언트 상태/렌더링 반영

### 2.2 Out of Scope

- 이미지/파일/동영상 전송, 이모지 리액션
- 타이핑 표시("입력 중…"), 온라인/오프라인 상태
- 메시지 전문 검색
- 1:1/그룹 방 구분, 방 나가기/초대 등 방 관리 기능

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | Status |
|----|-------------|----------|--------|
| FR-01 | 메시지 송수신 payload에 메시지 고유 `id`를 포함한다 | High | Pending |
| FR-02 | 참여자가 방을 보면 `lastReadMessageId`가 최신 메시지로 갱신되고 다른 참여자에게 브로드캐스트된다 | High | Pending |
| FR-03 | 각 메시지의 "안 읽은 인원 수"(=발신자 제외 참여자 중 미열람 수)를 표시한다 | High | Pending |
| FR-04 | 본인 메시지를 수정할 수 있고, 수정 시 `editedAt`이 기록되어 "수정됨"으로 표시된다 | High | Pending |
| FR-05 | 본인 메시지를 삭제할 수 있고, soft delete되어 "삭제된 메시지입니다"로 표시된다 | High | Pending |
| FR-06 | 타인 메시지의 수정/삭제 요청은 서버에서 거부된다(소유권 검증) | High | Pending |
| FR-07 | 메시지에 답장하면 원본 메시지 참조(`replyToId`)가 저장되고 미리보기가 표시된다 | Medium | Pending |
| FR-08 | 채팅방 입장 후 위로 스크롤하면 cursor 기준 과거 메시지를 페이지 단위(예: 30개)로 로드한다 | High | Pending |
| FR-09 | 수정/삭제/읽음 변화는 방 참여자에게 실시간 반영된다 | High | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| Performance | 안 읽은 수 계산은 메시지 목록 1회 조회로 O(N) 이내, 추가 N+1 쿼리 없음 | 코드 리뷰 / 쿼리 로그 |
| Security | 수정·삭제·읽음은 소켓 검증 신원(`socket.data.userId`)만 신뢰, 클라이언트 입력 ID 불신 | gateway 코드 리뷰 |
| Compatibility | 기존 텍스트 송수신 흐름 회귀 없음 | 수동 E2E(메시지 송수신) |
| Data Integrity | soft delete 메시지는 row 보존, 읽음 추적은 정합성 유지 | DB 확인 |

---

## 4. Success Criteria

### 4.1 Definition of Done

- [ ] FR-01~FR-09 구현
- [ ] 본인/타인 권한 분기 검증(수정·삭제 거부 케이스 포함)
- [ ] 기존 실시간 송수신 회귀 없음 확인
- [ ] server/client AGENTS.md 규칙(소켓 보안·에러 코드 계약) 준수

### 4.2 Quality Criteria

- [ ] `pnpm lint` (client/server) 통과
- [ ] `pnpm build` 성공
- [ ] 신규 소켓 이벤트/REST가 Swagger 또는 타입에 반영(필요 시 `pnpm generate:api`)

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 소켓 메시지 스키마 변경(id 추가)으로 기존 수신 핸들러 깨짐 | High | Medium | `useChatMessages` 메시지 타입을 id 포함으로 일괄 변경, 하위 호환 매핑 유지 |
| `lastReadMessageId` 갱신 경쟁/누락으로 안읽은 수 오표시 | Medium | Medium | 단조 증가(max)로만 갱신, 입장·신규 수신 시점에 동기화 |
| 무한 스크롤 cursor 페이지네이션과 실시간 신규 메시지 병합 충돌 | Medium | Medium | 과거(cursor) 로드와 실시간 append를 별도 경로로 관리, id 기준 dedupe |
| soft delete/edit 컬럼 추가 시 `synchronize: true`가 운영 스키마 변경 | High | Low | 개발 한정, 운영 전 마이그레이션 검토(서버 AGENTS.md 명시) |

---

## 6. Impact Analysis

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `Message` entity | DB Model | `editedAt`, `deletedAt`(nullable), `replyTo`/`replyToId` self-ref 추가 |
| `ChatRoomParticipant` entity | DB Model | `lastReadMessageId`(nullable) 추가 |
| `ChatGateway` | WebSocket | 메시지 payload에 `id`/`replyTo` 추가, `message_read`/`message_edited`/`message_deleted` 이벤트 신설 |
| `ChatController` / `chat.rooms` | API | cursor 기반 메시지 페이지네이션 엔드포인트 |
| `useChatMessages` | Client hook | 메시지 모델 확장, 신규 이벤트 핸들링, 과거 로드 |
| `MessageList` / `MessageInput` | Client UI | 읽음 수·삭제/수정·답장 UI, 무한 스크롤 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| Message | READ | `chat.gateway.ts` `handleJoinRoom` (initial_messages) | Breaking — payload 형태 변경(id 포함) |
| Message | CREATE | `chat.gateway.ts` `handleMessage` → `message` emit | Breaking — payload 확장 |
| Message | READ | `client useChatMessages` `handleMessage`/`handleInitialMessages` | Breaking — 매핑 갱신 필요 |
| Participant | READ | `chat.gateway.ts` membership 검증 | Needs verification — 엔티티 컬럼 추가 |

### 6.3 Verification

- [ ] 기존 송수신 경로가 id 포함 payload로도 동작하는지 확인
- [ ] 읽음/수정/삭제 이벤트가 권한 검증을 통과/거부하는지 확인
- [ ] 컬럼 추가가 기존 쿼리를 깨지 않는지 확인

---

## 7. Architecture Considerations

### 7.1 Project Level Selection

| Level | Characteristics | Recommended For | Selected |
|-------|-----------------|-----------------|:--------:|
| **Starter** | 단순 구조 | 정적 사이트 | ☐ |
| **Dynamic** | 기능 모듈 + 백엔드 | 풀스택 웹앱 | ☑ |
| **Enterprise** | 엄격한 계층 분리 | 대규모 시스템 | ☐ |

dongchat은 NestJS + Next.js 풀스택(커스텀 서버) → **Dynamic** 수준.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| Backend | NestJS(기존) | NestJS | 기존 도메인 모듈 구조 유지 |
| Realtime | socket.io(기존) | socket.io | 기존 `ChatGateway` 확장 |
| 읽음 모델 | per-message read row / participant lastReadMessageId | **lastReadMessageId** | 그룹 안읽은 수를 O(N) 계산, row 폭증 방지 |
| 삭제 정책 | hard / soft | **soft delete** | "삭제된 메시지" 표시 + 히스토리 보존 |
| 페이지네이션 | offset / cursor | **cursor(messageId)** | 실시간 채팅에 안정적, 중복/누락 방지 |
| Client state | React Query / socket local state(기존) | socket local state + 과거 로드 보강 | 기존 `useChatMessages` 구조 계승 |
| Form/Styling | react-hook-form / Tailwind+shadcn(기존) | 기존 유지 | — |

### 7.3 Clean Architecture Approach

```
Selected Level: Dynamic

server/src/chat/   ← entity·gateway·controller·service 확장
client/src/app/(protected)/chat/[menu]/_components/ChatRooms/
  ├─ hooks/useChatMessages.ts   ← 모델 확장 + 이벤트 + 과거 로드
  └─ components/MessageList.tsx, MessageInput.tsx ← UI
```

---

## 8. Convention Prerequisites

### 8.1 Existing Project Conventions

- [x] `AGENTS.md`(root/client/server) 코딩 규칙 존재
- [x] ESLint 설정(client/server)
- [x] TypeScript 설정
- [ ] 별도 `conventions.md` 없음(불필요)

### 8.2 Conventions to Define/Verify

| Category | Current State | To Define | Priority |
|----------|---------------|-----------|:--------:|
| 소켓 이벤트 네이밍 | 부분(`join_room`, `message`) | `message_read`/`message_edited`/`message_deleted` snake_case 통일 | High |
| 에러 코드 | 존재(filter+code) | 신규 `CHAT_FORBIDDEN`/`MESSAGE_NOT_FOUND` 등 프론트 매핑 동기화 | Medium |
| 메시지 타입 | 클라 `IncomingMessage` | id/replyTo/editedAt/deletedAt 필드 반영 | High |

### 8.3 Environment Variables Needed

추가 환경 변수 없음(기존 `NEXT_PUBLIC_API_URL`, `FRONTEND_URL`, DB·JWT 변수 재사용).

---

## 9. Next Steps

1. [ ] 설계 문서 작성 (`/pdca design message-ux`) — 3가지 아키텍처 옵션 비교
2. [ ] 데이터 모델·소켓 이벤트 계약 확정
3. [ ] 구현 시작 (`/pdca do message-ux`)

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-06-16 | Initial draft | louis-25 |
