import { createClient } from "@/lib/supabase/client";
import type { AuthUser, DomainError } from "@/types/domain";
import { toDomainError } from "./errors";

// 인증 경계. UI는 이 함수들만 사용한다. NestJS 복귀 시 이 파일 내부만 교체한다.
export type AuthChangeEvent = "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED";

export async function signUp(input: {
  email: string;
  password: string;
  username: string;
}): Promise<{ needsEmailConfirmation: boolean }> {
  const supabase = createClient();
  const { data: available, error: checkError } = await supabase.rpc("is_username_available", {
    p_username: input.username,
  });
  if (checkError) throw toDomainError(checkError);
  if (!available) {
    throw { code: "AUTH_DUPLICATE_USER", message: "이미 사용 중인 아이디입니다." } satisfies DomainError;
  }
  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: { data: { username: input.username } },
  });
  if (error) throw toDomainError(error);
  // 이메일 확인이 켜진 환경에서는 세션 없이 사용자만 생성된다.
  return { needsEmailConfirmation: !data.session };
}

export async function signIn(input: { email: string; password: string }): Promise<void> {
  const { error } = await createClient().auth.signInWithPassword(input);
  if (error) throw toDomainError(error);
}

export async function signInWithKakao(): Promise<void> {
  const { error } = await createClient().auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw toDomainError(error);
}

export async function signOut(): Promise<void> {
  await createClient().auth.signOut();
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase.rpc("get_me");
  if (error) throw toDomainError(error);
  // get_me jsonb 계약: { id, username, nickname, avatarUrl, isAdmin }
  return data as unknown as AuthUser;
}

export function onAuthChange(callback: (event: AuthChangeEvent) => void): () => void {
  const { data } = createClient().auth.onAuthStateChange((event) => {
    if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
      callback(event);
    }
  });
  return () => data.subscription.unsubscribe();
}
