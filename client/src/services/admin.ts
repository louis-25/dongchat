import { createClient } from "@/lib/supabase/client";
import type { AdminRoom, AdminUser, Page, SortOrder, UserSort } from "@/types/domain";
import { toDomainError } from "./errors";

// 관리자 경계. 권한 판정은 DB(ADMIN_FORBIDDEN). NestJS 복귀 시 이 파일 내부만 교체한다.
export async function listUsers(q: { page: number; limit: number; sort: UserSort; order: SortOrder }): Promise<Page<AdminUser>> {
  const { data, error } = await createClient().rpc("admin_list_users", {
    p_page: q.page,
    p_limit: q.limit,
    p_sort: q.sort,
    p_order: q.order,
  });
  if (error) throw toDomainError(error);
  // jsonb 키가 도메인 타입과 같다(계약은 verify-admin.mjs가 검증).
  return data as unknown as Page<AdminUser>;
}

export async function banUser(userId: string, until: Date, reason?: string): Promise<void> {
  const { error } = await createClient().rpc("admin_ban", {
    p_user_id: userId,
    p_until: until.toISOString(),
    p_reason: reason,
  });
  if (error) throw toDomainError(error);
}

export async function unbanUser(userId: string): Promise<void> {
  const { error } = await createClient().rpc("admin_unban", { p_user_id: userId });
  if (error) throw toDomainError(error);
}

// 그 시각 이전에 만든 대상의 모든 세션을 끊는다(다시 로그인은 가능).
export async function forceLogout(userId: string): Promise<void> {
  const { error } = await createClient().rpc("admin_force_logout", { p_user_id: userId });
  if (error) throw toDomainError(error);
}

export async function listAllRooms(q: { page: number; limit: number }): Promise<Page<AdminRoom>> {
  const { data, error } = await createClient().rpc("admin_list_rooms", { p_page: q.page, p_limit: q.limit });
  if (error) throw toDomainError(error);
  return data as unknown as Page<AdminRoom>;
}
