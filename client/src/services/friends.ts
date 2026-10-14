import { createClient } from "@/lib/supabase/client";
import type { Friend, FriendAction, FriendRequest } from "@/types/domain";
import { getCurrentUserId } from "./auth";
import { toDomainError } from "./errors";
import { FRIEND_SELECT, toFriend, toFriendRequest, type FriendRow } from "./mappers";

// 친구 경계. NestJS 복귀 시 이 파일 내부만 교체한다.
export async function listFriends(): Promise<Friend[]> {
  const me = await getCurrentUserId();
  const { data, error } = await createClient().from("friends").select(FRIEND_SELECT).eq("status", "ACCEPTED").order("id");
  if (error) throw toDomainError(error);
  // ponytail: 동적 SELECT 문자열이라 supabase-js 행 타입 추론이 안 된다. 계약은 verify-social.mjs가 검증.
  return (data as unknown as FriendRow[]).map((r) => toFriend(r, me));
}

// 내가 받은 대기 중 요청
export async function listPending(): Promise<FriendRequest[]> {
  const me = await getCurrentUserId();
  const { data, error } = await createClient()
    .from("friends")
    .select(FRIEND_SELECT)
    .eq("status", "PENDING")
    .eq("receiver_id", me)
    .order("id");
  if (error) throw toDomainError(error);
  return (data as unknown as FriendRow[]).map(toFriendRequest);
}

export async function sendRequest(username: string): Promise<void> {
  const { error } = await createClient().rpc("send_friend_request", { p_username: username });
  if (error) throw toDomainError(error);
}

export async function respond(id: number, action: FriendAction): Promise<void> {
  const { error } = await createClient().rpc("respond_friend_request", { p_id: id, p_action: action });
  if (error) throw toDomainError(error);
}
