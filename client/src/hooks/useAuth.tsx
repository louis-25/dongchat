"use client";

import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getCurrentUser, onAuthChange, signOut } from "@/services/auth";
import type { DomainError } from "@/types/domain";

export const AUTH_QUERY_KEY = ["auth", "me"] as const;

// 현재 사용자. 세션 변화는 onAuthChange로 반영하고, 정지·강제 로그아웃이면 로그인 화면으로 보낸다.
// ponytail: 호출하는 컴포넌트마다 구독이 생긴다(현재 3곳). 늘어나면 Provider로 올릴 것.
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
        if (event === "SIGNED_OUT") queryClient.setQueryData(AUTH_QUERY_KEY, null);
        else void queryClient.invalidateQueries({ queryKey: AUTH_QUERY_KEY });
      }),
    [queryClient],
  );

  useEffect(() => {
    if ((error as DomainError | null)?.code !== "AUTH_SESSION_REVOKED") return;
    void signOut().then(() => router.push("/login"));
  }, [error, router]);

  return { user, isLoading };
};

export default useAuth;
