"use client";

import { usePathname } from "next/navigation";
import { BottomTabs } from "@/components/chat/BottomTabs";
import { useInAppNotification } from "@/hooks/useInAppNotification";
import { useRoomSummariesSync } from "@/hooks/useRoomSummaries";

// 폰 한 화면: 위 화면 내용(각 페이지가 자기 상단 바), 아래 하단 탭(방 안에서는 숨김). PC는 가운데 한 열.
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  useInAppNotification();
  useRoomSummariesSync();
  const inRoom = /^\/chat\/rooms\/\d+/.test(usePathname());
  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-background md:border-x">
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {!inRoom && <BottomTabs />}
    </div>
  );
}
