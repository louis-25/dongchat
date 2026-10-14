"use client";

import { useInAppNotification } from "@/hooks/useInAppNotification";

// 채팅 페이지 전용: 지금 보고 있지 않은 방의 새 메시지 토스트. Realtime 구독은 (protected) 레이아웃의 ChatProvider.
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  useInAppNotification();
  return <>{children}</>;
}
