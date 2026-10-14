"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getErrorMessage } from "@/lib/error-handler";
import { getCurrentUser, onAuthChange, signOut } from "@/services/auth";
import type { DomainError } from "@/types/domain";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

// 현재 사용자. 세션 변화는 onAuthChange로 반영하고, 정지·강제 로그아웃이면 로그인 화면으로 보낸다.
// ponytail: 호출하는 컴포넌트마다 구독이 생긴다(현재 4곳). 토스트는 id로 중복 제거. 늘어나면 Provider로 올릴 것.
const useAuth = () => {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: user = null, isLoading, error } = useQuery({
    queryKey: AUTH_QUERY_KEY,
    queryFn: getCurrentUser,
    staleTime: 60_000,
    retry: false,
  });

  useEffect(
    () =>
      onAuthChange((event) => {
        if (event === "SIGNED_OUT") {
          // 다른 탭 로그아웃·토큰 갱신 실패(세션 삭제·정지) 포함. useAuth는 보호 경로에서만 쓰인다.
          // 이전 사용자의 친구·방 등 캐시를 모두 버린다(같은 탭에서 다른 사용자가 로그인할 수 있음).
          queryClient.clear();
          queryClient.setQueryData(AUTH_QUERY_KEY, null);
          router.replace("/login");
        } else {
          void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
        }
      }),
    [queryClient, router],
  );

  // 세션 없음 확정(로그아웃 후 뒤로가기 등 proxy를 거치지 않는 클라이언트 이동). 에러는 아래에서 처리.
  useEffect(() => {
    if (!isLoading && !error && user === null) router.replace("/login");
  }, [isLoading, error, user, router]);

  useEffect(() => {
    if ((error as DomainError | null)?.code !== "AUTH_SESSION_REVOKED") return;
    toast.error(getErrorMessage(error as unknown as DomainError), { id: "auth-session-revoked" });
    // 이 기기만 로그아웃 → SIGNED_OUT 이벤트가 로그인 화면으로 보낸다.
    void signOut();
  }, [error]);

  return { user, isLoading };
};

export default useAuth;
