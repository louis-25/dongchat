"use client";

import { useSearchParams } from "next/navigation";
import { safeNext } from "@/lib/safe-next";

// 로그인·가입 화면의 ?next=(검증됨). 없으면 채팅 목록. useSearchParams라 Suspense 안에서만 쓴다.
export const useNextParam = (): string => safeNext(useSearchParams().get("next"));
