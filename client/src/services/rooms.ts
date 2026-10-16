import { createClient } from "@/lib/supabase/client";
import type { Participant, Room, RoomSummary } from "@/types/domain";
import { getCurrentUserId } from "./auth";
import { toDomainError } from "./errors";
import {
  PARTICIPANT_SELECT,
  ROOM_SELECT,
  toParticipant,
  toRoom,
  toRoomSummary,
  type ParticipantRow,
  type RoomRow,
} from "./mappers";

// 채팅방 경계. NestJS 복귀 시 이 파일 내부만 교체한다.
// 내가 참여한 방(최신 생성 순). 관리자 열람용 전체 방 목록은 services/admin(5단계).
export async function listRooms(): Promise<Room[]> {
  const me = await getCurrentUserId();
  const { data, error } = await createClient()
    .from("chat_rooms")
    .select(ROOM_SELECT)
    .eq("me.user_id", me)
    .order("id", { ascending: false });
  if (error) throw toDomainError(error);
  // ponytail: 동적 SELECT 문자열이라 행 타입 추론이 안 된다. 계약은 verify-social.mjs가 검증.
  return (data as unknown as RoomRow[]).map(toRoom);
}

// 채팅 스냅샷용 최신 참여자(읽음 위치 포함). 정렬은 화면이 room.participants를 쓰므로 하지 않는다.
export async function listParticipants(roomId: number): Promise<Participant[]> {
  const { data, error } = await createClient()
    .from("chat_room_participants")
    .select(PARTICIPANT_SELECT)
    .eq("room_id", roomId);
  if (error) throw toDomainError(error);
  return (data as unknown as ParticipantRow[]).map(toParticipant);
}

export async function createRoom(input: { name?: string; isGroup: boolean; usernames: string[] }): Promise<number> {
  const { data, error } = await createClient().rpc("create_room", {
    p_name: input.name ?? "",
    p_is_group: input.isGroup,
    p_usernames: input.usernames,
  });
  if (error) throw toDomainError(error);
  return data;
}

// 단체방에 친구 초대(멤버 누구나, 이미 있는 사람은 DB가 건너뜀)
export async function inviteToRoom(roomId: number, usernames: string[]): Promise<void> {
  const { error } = await createClient().rpc("invite_to_room", { p_room_id: roomId, p_usernames: usernames });
  if (error) throw toDomainError(error);
}

export async function leaveRoom(roomId: number): Promise<void> {
  const { error } = await createClient().rpc("leave_room", { p_room_id: roomId });
  if (error) throw toDomainError(error);
}

// 그룹방 방장 또는 관리자만. 1:1 방·본인은 DB가 거부(ROOM_KICK_FORBIDDEN).
export async function kickMember(roomId: number, userId: string): Promise<void> {
  const { error } = await createClient().rpc("kick_member", { p_room_id: roomId, p_user_id: userId });
  if (error) throw toDomainError(error);
}

// 채팅 목록 요약(최근 활동 순). 안 읽은 수는 서버 기준(남이 보낸·삭제 안 된·내 읽음 위치 이후).
export async function listMyRooms(): Promise<RoomSummary[]> {
  const { data, error } = await createClient().rpc("list_my_rooms");
  if (error) throw toDomainError(error);
  return data.map(toRoomSummary);
}

// 친구와의 1:1 방(있으면 그 방, 없으면 생성)
export async function setRoomMuted(roomId: number, muted: boolean): Promise<void> {
  const { error } = await createClient().rpc("set_room_muted", { p_room_id: roomId, p_muted: muted });
  if (error) throw toDomainError(error);
}

export async function openDirectRoom(username: string): Promise<number> {
  const { data, error } = await createClient().rpc("open_direct_room", { p_username: username });
  if (error) throw toDomainError(error);
  return data;
}
