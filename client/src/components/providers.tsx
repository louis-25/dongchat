"use client";

import { useEffect } from "react";
import { ThemeProvider, useTheme } from "next-themes";
import { ReactQueryProvider } from "@/components/react-query-provider";
import { usePalette } from "@/hooks/usePalette";
import { Toaster } from "./ui/sonner";

// 상태 표시줄 색(<meta name="theme-color">)을 현재 테마 배경으로 맞춘다.
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  const { palette } = usePalette();
  useEffect(() => {
    const color = getComputedStyle(document.documentElement).getPropertyValue("--background").trim();
    if (color) document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute("content", color));
  }, [resolvedTheme, palette]);
  return null;
}

// iOS 사파리는 touchstart 리스너가 없으면 :active(누르는 순간 스타일)를 적용하지 않는다.
function ActiveStateOnIOS() {
  useEffect(() => {
    const noop = () => {};
    document.addEventListener("touchstart", noop, { passive: true });
    return () => document.removeEventListener("touchstart", noop);
  }, []);
  return null;
}

// 앱 전역 Provider. 인증 세션은 Supabase 쿠키 + useAuth(React Query)로 관리한다.
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ThemeColorSync />
      <ActiveStateOnIOS />
      <ReactQueryProvider>
        {/* 상단 바(56px + 노치) 아래에 띄워 ‹·＋·☰ 버튼을 가리지 않게 한다 */}
        <Toaster
          position="top-center"
          offset={{ top: "calc(64px + env(safe-area-inset-top))" }}
          mobileOffset={{ top: "calc(64px + env(safe-area-inset-top))" }}
        />
        {children}
      </ReactQueryProvider>
    </ThemeProvider>
  );
}
