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
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword(input);
  if (error) throw toDomainError(error);
  // 정지·강제 로그아웃은 Auth가 아닌 DB(is_active_session)에서 판정하므로 로그인 직후 확인한다.
  const { error: meError } = await supabase.rpc("get_me");
  if (meError) {
    await signOut();
    throw toDomainError(meError);
  }
}

export async function signInWithKakao(): Promise<void> {
  const { error } = await createClient().auth.signInWithOAuth({
    provider: "kakao",
    options: { redirectTo: `${window.location.origin}/auth/callback` },
  });
  if (error) throw toDomainError(error);
}

// 기본은 이 기기만 로그아웃. auth-js 기본값(global)은 다른 기기의 정상 세션까지 끊는다.
export async function signOut(scope: "local" | "global" = "local"): Promise<void> {
  await createClient().auth.signOut({ scope });
}

// 로컬 세션의 사용자 id(네트워크 요청 없음). 쿼리 필터용이며 권한 판단은 RLS·RPC가 한다.
export async function getCurrentUserId(): Promise<string> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) throw { code: "AUTH_UNAUTHORIZED", message: "인증이 필요합니다." } satisfies DomainError;
  return session.user.id;
}

// 현재 세션 id(JWT session_id). 다른 기기 세션 삭제 통지(force_logout.sessionId)와 비교하는 용도라 서명 검증은 하지 않는다.
export async function getCurrentSessionId(): Promise<string | null> {
  const {
    data: { session },
  } = await createClient().auth.getSession();
  if (!session) return null;
  const payload = session.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
  return (JSON.parse(atob(payload)) as { session_id?: string }).session_id ?? null;
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
