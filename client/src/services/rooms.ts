import { createClient } from "@/lib/supabase/client";
import type { Participant, Room } from "@/types/domain";
import { getCurrentUserId } from "./auth";
import { toDomainError } from "./errors";
import { PARTICIPANT_SELECT, ROOM_SELECT, toParticipant, toRoom, type ParticipantRow, type RoomRow } from "./mappers";

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

export async function leaveRoom(roomId: number): Promise<void> {
  const { error } = await createClient().rpc("leave_room", { p_room_id: roomId });
  if (error) throw toDomainError(error);
}

// 그룹방 방장 또는 관리자만. 1:1 방·본인은 DB가 거부(ROOM_KICK_FORBIDDEN).
export async function kickMember(roomId: number, userId: string): Promise<void> {
  const { error } = await createClient().rpc("kick_member", { p_room_id: roomId, p_user_id: userId });
  if (error) throw toDomainError(error);
}
