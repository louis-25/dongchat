import { toJpeg } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";
import { getCurrentUserId } from "./auth";
import { toDomainError } from "./errors";
import { normalizeNickname, normalizeStatusMessage } from "./profile-rules";

// 내 프로필 경계. profiles 본인 update(nickname) 권한은 DB에 이미 있다(선행 스펙 §3).
export async function updateNickname(input: string): Promise<void> {
  const nickname = normalizeNickname(input);
  const me = await getCurrentUserId();
  const { error } = await createClient().from("profiles").update({ nickname }).eq("id", me);
  if (error) throw toDomainError(error);
}

export async function updateStatusMessage(input: string): Promise<void> {
  const status_message = normalizeStatusMessage(input);
  const me = await getCurrentUserId();
  const { error } = await createClient().from("profiles").update({ status_message }).eq("id", me);
  if (error) throw toDomainError(error);
}

// 512px JPEG로 줄여 `<uid>/avatar`에 덮어쓴다. ?v=로 브라우저·CDN 캐시를 깬다.
export async function updateAvatar(file: File): Promise<void> {
  const me = await getCurrentUserId();
  const supabase = createClient();
  const path = `${me}/avatar`;
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, await toJpeg(file, { maxSide: 512, square: true }), { upsert: true, contentType: "image/jpeg" });
  if (upErr) throw toDomainError(upErr);
  const url = `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", me);
  if (error) throw toDomainError(error);
}
