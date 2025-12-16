"use client";

import { ChatProvider } from "@/components/chat-provider";
import { useInAppNotification } from "@/hooks/useInAppNotification";

/**
 * 채팅 페이지 전용 레이아웃입니다.
 * ChatProvider를 여기에 배치하여 채팅 페이지에서만 소켓 연결이 이루어지도록 합니다.
 */
function ChatLayoutContent({ children }: { children: React.ReactNode }) {
  useInAppNotification();
  return <>{children}</>;
}

export default function ChatLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ChatProvider>
      <ChatLayoutContent>{children}</ChatLayoutContent>
    </ChatProvider>
  );
}
