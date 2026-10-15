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

// 512px JPEG로 줄여 `<uid>/avatar`에 덮어쓴다. ?v=로 브라우저·CDN 캐시를 깬다.
export async function updateAvatar(file: File): Promise<void> {
  const me = await getCurrentUserId();
  const supabase = createClient();
  const path = `${me}/avatar`;
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, await toSquareJpeg(file, 512), { upsert: true, contentType: "image/jpeg" });
  if (upErr) throw toDomainError(upErr);
  const url = `${supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl}?v=${Date.now()}`;
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", me);
  if (error) throw toDomainError(error);
}

// 가운데를 정사각형으로 잘라 size×size로 줄인다.
async function toSquareJpeg(file: File, size: number): Promise<Blob> {
  const img = await createImageBitmap(file);
  const side = Math.min(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  canvas.getContext("2d")!.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
  img.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("이미지를 변환하지 못했어요."))), "image/jpeg", 0.85),
  );
}
