import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/types/domain";
import { toDomainError } from "./errors";

// 친구 초대 링크 경계. NestJS 복귀 시 이 파일 내부만 교체한다.
export async function getMyInviteCode(): Promise<string> {
  const { data, error } = await createClient().rpc("get_my_invite_code");
  if (error) throw toDomainError(error);
  return data;
}

export async function resetMyInviteCode(): Promise<string> {
  const { data, error } = await createClient().rpc("reset_my_invite_code");
  if (error) throw toDomainError(error);
  return data;
}

// 초대자(이름·사진). 없거나 무효한 코드면 null. id는 노출하지 않으므로 빈 문자열.
export async function previewInvite(code: string): Promise<Profile | null> {
  const { data, error } = await createClient().rpc("preview_invite", { p_code: code });
  if (error) throw toDomainError(error);
  const row = data[0];
  return row ? { id: "", username: row.username, nickname: row.nickname, avatarUrl: row.avatar_url, statusMessage: null } : null;
}

export async function acceptInvite(code: string): Promise<{ username: string; already: boolean }> {
  const { data, error } = await createClient().rpc("accept_invite", { p_code: code });
  if (error) throw toDomainError(error);
  return { username: data[0].username, already: data[0].already };
}
