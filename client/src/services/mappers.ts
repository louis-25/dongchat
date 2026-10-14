import type { Friend, FriendRequest, Profile, Room } from "../types/domain";

const PROFILE_COLUMNS = "id, username, nickname, avatar_url";

export const FRIEND_SELECT = `id, created_at, requester:profiles!friends_requester_id_fkey(${PROFILE_COLUMNS}), receiver:profiles!friends_receiver_id_fkey(${PROFILE_COLUMNS})`;

// me: "내가 참여한 방" 필터 전용(.eq("me.user_id", 나)). RLS는 관리자에게 모든 방을 보여 주므로 필수.
// participants: 방의 전체 참여자.
export const ROOM_SELECT = `id, name, is_group, created_by, me:chat_room_participants!inner(user_id), participants:chat_room_participants(user_id, joined_at, last_read_message_id, profile:profiles(${PROFILE_COLUMNS}))`;

// PostgREST 응답 row → 도메인 타입. 이 파일은 상대 경로·type-only import만 쓴다(Node 단위 테스트·통합 스크립트가 직접 import).
export type ProfileRow = { id: string; username: string; nickname: string | null; avatar_url: string | null };
export type FriendRow = { id: number; created_at: string; requester: ProfileRow; receiver: ProfileRow };
export type RoomRow = {
  id: number;
  name: string | null;
  is_group: boolean;
  created_by: string | null;
  participants: { user_id: string; joined_at: string; last_read_message_id: number | null; profile: ProfileRow }[];
};

export const toProfile = (r: ProfileRow): Profile => ({
  id: r.id,
  username: r.username,
  nickname: r.nickname,
  avatarUrl: r.avatar_url,
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

export const toRoom = (r: RoomRow): Room => ({
  id: r.id,
  name: r.name,
  isGroup: r.is_group,
  ownerId: r.created_by,
  participants: r.participants
    .map((p) => ({ user: toProfile(p.profile), joinedAt: p.joined_at, lastReadMessageId: p.last_read_message_id }))
    .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt) || a.user.id.localeCompare(b.user.id)),
});
