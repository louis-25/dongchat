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
