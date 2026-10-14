// 앱 도메인 타입. 백엔드(Supabase/NestJS)와 무관한 계약이며 services/가 이 타입으로 변환해 반환한다.
export type DomainError = { code: string; message: string };

export type AuthUser = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
};

export type Profile = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
};

// id = friends 행 id, user = 상대방
export type Friend = { id: number; user: Profile };
export type FriendRequest = { id: number; requester: Profile; createdAt: string };
export type FriendAction = "ACCEPT" | "BLOCK";

export type Participant = { user: Profile; joinedAt: string; lastReadMessageId: number | null };
// ownerId = 방장(chat_rooms.created_by). 방장이 나가면 DB가 다음 멤버로 승계한다.
export type Room = {
  id: number;
  name: string | null;
  isGroup: boolean;
  ownerId: string | null;
  participants: Participant[];
};

export const displayName = (p: { username: string; nickname: string | null }): string => p.nickname ?? p.username;

export const roomTitle = (room: Room, me: string): string =>
  room.name ??
  (room.participants
    .filter((p) => p.user.id !== me)
    .map((p) => displayName(p.user))
    .join(", ") ||
    "대화 상대 없음");

// 메시지 조회 한 번의 개수(최신 스냅샷·과거 페이지 공통)
export const MESSAGE_PAGE_SIZE = 30;

export type ChatMessage = {
  id: number;
  roomId: number;
  senderId: string | null; // 탈퇴 사용자는 null
  content: string; // 삭제되면 ""
  replyToId: number | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

// messages: id 오름차순. profiles: 발신자(방을 나간 사람 이름 표시용). replyTargets: 페이지 밖 답장 대상.
export type MessagePage = { messages: ChatMessage[]; profiles: Profile[]; replyTargets: ChatMessage[] };

// Realtime 이벤트(스펙 §8.1). subscribed는 채널 구독 완료(최초·재연결) — 스냅샷 재조회 신호.
export type RoomEvent =
  | { type: "message"; roomId: number; message: ChatMessage }
  | { type: "message_edited"; roomId: number; id: number; content: string; editedAt: string }
  | { type: "message_deleted"; roomId: number; id: number }
  | { type: "read_update"; roomId: number; userId: string; lastReadMessageId: number }
  | { type: "member_removed"; roomId: number; userId: string }
  | { type: "subscribed"; roomId: number };

export type UserEvent =
  | { type: "member_added"; roomId: number; userId: string }
  | { type: "member_removed"; roomId: number; userId: string }
  | { type: "force_logout"; reason: string; sessionId?: string };
