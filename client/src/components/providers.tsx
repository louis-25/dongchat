"use client";

import { ReactQueryProvider } from "@/components/react-query-provider";
import { Toaster } from "./ui/sonner";

// 앱 전역 Provider. 인증 세션은 Supabase 쿠키 + useAuth(React Query)로 관리한다.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ReactQueryProvider>
      <Toaster />
      {children}
    </ReactQueryProvider>
  );
}
