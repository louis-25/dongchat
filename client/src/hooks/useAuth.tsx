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
          queryClient.setQueryData(AUTH_QUERY_KEY, null);
          router.replace("/login");
        } else {
          void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
        }
      }),
    [queryClient, router],
  );

  useEffect(() => {
    if ((error as DomainError | null)?.code !== "AUTH_SESSION_REVOKED") return;
    toast.error(getErrorMessage(error as unknown as DomainError), { id: "auth-session-revoked" });
    // 이 기기만 로그아웃 → SIGNED_OUT 이벤트가 로그인 화면으로 보낸다.
    void signOut();
  }, [error]);

  return { user, isLoading };
};

export default useAuth;
