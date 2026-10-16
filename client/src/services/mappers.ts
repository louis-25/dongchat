import type {
  ChatMessage,
  DomainError,
  Friend,
  FriendRequest,
  MessagePage,
  Participant,
  Profile,
  Room,
  RoomSummary,
} from "../types/domain";

const PROFILE_COLUMNS = "id, username, nickname, avatar_url, status_message";

export const FRIEND_SELECT = `id, created_at, requester:profiles!friends_requester_id_fkey(${PROFILE_COLUMNS}), receiver:profiles!friends_receiver_id_fkey(${PROFILE_COLUMNS})`;

export const PARTICIPANT_SELECT = `user_id, joined_at, last_read_message_id, profile:profiles(${PROFILE_COLUMNS})`;

// me: "내가 참여한 방" 필터 전용(.eq("me.user_id", 나)). RLS는 관리자에게 모든 방을 보여 주므로 필수.
// participants: 방의 전체 참여자.
export const ROOM_SELECT = `id, name, is_group, created_by, me:chat_room_participants!inner(user_id), participants:chat_room_participants(${PARTICIPANT_SELECT})`;

export const MESSAGE_COLUMNS = "id, room_id, sender_id, content, sticker, reply_to_id, edited_at, deleted_at, created_at";
// reply:reply_to_id(...) = 답장 대상(다대일). messages!fk 힌트는 자기참조에서 일대다로 해석되므로 쓰지 않는다.
export const MESSAGE_SELECT = `${MESSAGE_COLUMNS}, sender:profiles!messages_sender_id_fkey(${PROFILE_COLUMNS}), reply:reply_to_id(${MESSAGE_COLUMNS})`;

// PostgREST 응답 row → 도메인 타입. 이 파일은 상대 경로·type-only import만 쓴다(Node 단위 테스트·통합 스크립트가 직접 import).
export type ProfileRow = {
  id: string;
  username: string;
  nickname: string | null;
  avatar_url: string | null;
  status_message: string | null;
};
export type FriendRow = { id: number; created_at: string; requester: ProfileRow; receiver: ProfileRow };
export type ParticipantRow = {
  user_id: string;
  joined_at: string;
  last_read_message_id: number | null;
  profile: ProfileRow;
};
export type RoomRow = {
  id: number;
  name: string | null;
  is_group: boolean;
  created_by: string | null;
  participants: ParticipantRow[];
};
export type MessageCoreRow = {
  id: number;
  room_id: number;
  sender_id: string | null;
  content: string;
  sticker: string | null;
  reply_to_id: number | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
};
export type MessageRow = MessageCoreRow & { sender: ProfileRow | null; reply: MessageCoreRow | null };
// Realtime message 이벤트 payload(스펙 §8.1)
export type MessagePayload = {
  id: number;
  roomId: number;
  senderId: string | null;
  content: string;
  sticker?: string | null; // 배포 전 DB는 없음
  replyToId: number | null;
  createdAt: string;
};

export const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  username: r.username,
  nickname: r.nickname,
  avatarUrl: r.avatar_url,
  statusMessage: r.status_message,
});

export const toFriend = (r: FriendRow, me: string): Friend => ({
  id: r.id,
  user: toProfile(r.requester.id === me ? r.receiver : r.requester),
});

export const toFriendRequest = (r: FriendRow): FriendRequest => ({
  id: r.id,
  requester: toProfile(r.requester),
  createdAt: r.created_at,
});

export const toParticipant = (p: ParticipantRow): Participant => ({
  user: toProfile(p.profile),
  joinedAt: p.joined_at,
  lastReadMessageId: p.last_read_message_id,
});

export const toRoom = (r: RoomRow): Room => ({
  id: r.id,
  name: r.name,
  isGroup: r.is_group,
  ownerId: r.created_by,
  participants: r.participants
    .map(toParticipant)
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.user.id.localeCompare(b.user.id)),
});

export const toChatMessage = (r: MessageCoreRow): ChatMessage => ({
  id: r.id,
  roomId: r.room_id,
  senderId: r.sender_id,
  content: r.content,
  sticker: r.sticker,
  replyToId: r.reply_to_id,
  editedAt: r.edited_at,
  deletedAt: r.deleted_at,
  createdAt: r.created_at,
});

const uniqueById = <T extends { id: string | number }>(list: T[]): T[] => [
  ...new Map(list.map((x) => [x.id, x])).values(),
];

// 최신순(desc)으로 조회한 행 → 오름차순 메시지 + 발신자 프로필 + 답장 대상(각각 id로 중복 제거)
export const toMessagePage = (rows: MessageRow[]): MessagePage => ({
  messages: rows.map(toChatMessage).sort((a, b) => a.id - b.id),
  profiles: uniqueById(rows.flatMap((r) => (r.sender ? [toProfile(r.sender)] : []))),
  replyTargets: uniqueById(rows.flatMap((r) => (r.reply ? [toChatMessage(r.reply)] : []))),
});

// 새 메시지 이벤트에는 수정·삭제 정보가 없다(INSERT 시점).
export const fromMessagePayload = (p: MessagePayload): ChatMessage => ({
  id: p.id,
  roomId: p.roomId,
  senderId: p.senderId,
  content: p.content,
  sticker: p.sticker ?? null,
  replyToId: p.replyToId,
  editedAt: null,
  deletedAt: null,
  createdAt: p.createdAt,
});

const MAX_MESSAGE_LENGTH = 2000;

// 전송 전 검증. Postgres char_length와 같게 코드 포인트로 센다(이모지 1자).
export const normalizeMessageContent = (content: string): string => {
  const text = content.trim();
  const length = [...text].length;
  if (length < 1 || length > MAX_MESSAGE_LENGTH) {
    throw { code: "VALIDATION_FAILED", message: "메시지는 1~2000자여야 합니다." } satisfies DomainError;
  }
  return text;
};

export type RoomSummaryRow = {
  room_id: number;
  name: string | null;
  is_group: boolean;
  created_at: string;
  member_count: number;
  last_message_id: number | null;
  last_message_content: string | null;
  last_message_deleted: boolean;
  last_message_sender_id: string | null;
  last_message_at: string | null;
  unread_count: number;
  last_message_sticker: string | null;
  muted: boolean;
};

export const toRoomSummary = (r: RoomSummaryRow): RoomSummary => ({
  id: r.room_id,
  name: r.name,
  isGroup: r.is_group,
  createdAt: r.created_at,
  memberCount: r.member_count,
  lastMessage:
    r.last_message_id === null || r.last_message_at === null
      ? null
      : {
          id: r.last_message_id,
          content: r.last_message_content ?? "",
          sticker: r.last_message_sticker ?? null,
          deleted: r.last_message_deleted,
          senderId: r.last_message_sender_id,
          at: r.last_message_at,
        },
  unreadCount: r.unread_count,
  muted: r.muted ?? false,
});
