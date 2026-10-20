// 앱 도메인 타입. 백엔드(Supabase/NestJS)와 무관한 계약이며 services/가 이 타입으로 변환해 반환한다.
import type { Reaction } from "../lib/reactions.ts";
export type DomainError = { code: string; message: string };

export type AuthUser = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  statusMessage: string | null;
  isAdmin: boolean;
};

export type Profile = {
  id: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  statusMessage: string | null;
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

// 채팅 목록 한 줄(list_my_rooms). 참여자·표시 이름은 Room(listRooms)과 합쳐서 쓴다.
export type RoomSummary = {
  id: number;
  name: string | null;
  isGroup: boolean;
  createdAt: string;
  memberCount: number;
  lastMessage: { id: number; content: string; sticker: string | null; deleted: boolean; senderId: string | null; at: string } | null;
  unreadCount: number;
  muted: boolean; // 내 알림 끄기(푸시·인앱 알림 없음, 안 읽은 수는 그대로)
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
  senderId: string | null; // 탈퇴 사용자·입장퇴장 안내는 null
  kind: "user" | "system"; // system = 단체방 입장·퇴장 안내(content가 안내 문장)
  content: string; // 삭제되면 "", 이모티콘이면 "(이모티콘)"
  sticker: string | null; // 이모티콘 id(lib/stickers.ts)
  imagePath: string | null; // 사진(chat-images 버킷 경로, 화면은 서명 URL)
  reactions: Reaction[];
  replyToId: number | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
};

// messages: id 오름차순. profiles: 발신자(방을 나간 사람 이름 표시용). replyTargets: 페이지 밖 답장 대상.
export type MessagePage = { messages: ChatMessage[]; profiles: Profile[]; replyTargets: ChatMessage[] };

// 방 공지(방마다 글 메시지 하나)
export type RoomNotice = { messageId: number; content: string; senderId: string | null };

// Realtime 이벤트(스펙 §8.1). subscribed는 채널 구독 완료(최초·재연결) — 스냅샷 재조회 신호.
export type RoomEvent =
  | { type: "message"; roomId: number; message: ChatMessage }
  | { type: "message_edited"; roomId: number; id: number; content: string; editedAt: string }
  | { type: "message_deleted"; roomId: number; id: number }
  | { type: "read_update"; roomId: number; userId: string; lastReadMessageId: number }
  | { type: "member_removed"; roomId: number; userId: string }
  | { type: "profile_updated"; roomId: number; profile: Profile }
  | { type: "member_added"; roomId: number; userId: string }
  | { type: "reaction_updated"; roomId: number; messageId: number; userId: string; reaction: string | null }
  | { type: "notice_updated"; roomId: number; messageId: number | null }
  | { type: "subscribed"; roomId: number };

export type UserEvent =
  | { type: "member_added"; roomId: number; userId: string }
  | { type: "member_removed"; roomId: number; userId: string }
  | { type: "force_logout"; reason: string; sessionId?: string }
  | { type: "profile_updated"; profile: Profile };

// ---- 관리자 ----
export type Page<T> = { items: T[]; total: number; page: number; limit: number };

// admin_list_users jsonb 항목
export type AdminUser = {
  id: string;
  username: string;
  nickname: string | null;
  email: string | null;
  createdAt: string;
  isAdmin: boolean;
  bannedUntil: string | null; // 지난 시각이면 정상(해제 전 만료)
};

// admin_list_rooms jsonb 항목
export type AdminRoom = {
  id: number;
  name: string | null;
  isGroup: boolean;
  createdBy: string | null; // 방장
  ownerUsername: string | null;
  memberCount: number;
  createdAt: string;
};

export type UserSort = "created_at" | "username";
export type SortOrder = "asc" | "desc";
export type BanDuration = "1d" | "7d" | "30d" | "permanent";

// 영구 정지는 먼 미래 시각으로 표현한다(DB는 banned_until > now()로만 판정).
export const PERMANENT_BAN = "9999-12-31T00:00:00.000Z";
const BAN_DAYS: Record<Exclude<BanDuration, "permanent">, number> = { "1d": 1, "7d": 7, "30d": 30 };

export const banUntil = (d: BanDuration, now: Date = new Date()): Date =>
  d === "permanent" ? new Date(PERMANENT_BAN) : new Date(now.getTime() + BAN_DAYS[d] * 86_400_000);

export const isBanned = (bannedUntil: string | null, now: Date = new Date()): boolean =>
  bannedUntil !== null && new Date(bannedUntil).getTime() > now.getTime();

export const isPermanentBan = (bannedUntil: string | null): boolean =>
  bannedUntil !== null && new Date(bannedUntil).getUTCFullYear() >= 9999;
