import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "./auth";
import { toDomainError } from "./errors";
import { normalizeNickname } from "./profile-rules";

// 내 프로필 경계. profiles 본인 update(nickname) 권한은 DB에 이미 있다(선행 스펙 §3).
export async function updateNickname(input: string): Promise<void> {
  const nickname = normalizeNickname(input);
  const me = await getCurrentUserId();
  const { error } = await createClient().from("profiles").update({ nickname }).eq("id", me);
  if (error) throw toDomainError(error);
}
