"use client";

import { usePathname } from "next/navigation";
import { BottomTabs } from "@/components/chat/BottomTabs";
import { useInAppNotification } from "@/hooks/useInAppNotification";
import { useLabFlag } from "@/hooks/useLabFlag";
import { usePushNotification } from "@/hooks/usePushNotification";
import { useRoomSummariesSync } from "@/hooks/useRoomSummaries";

// 폰 한 화면: 위 화면 내용(각 페이지가 자기 상단 바), 아래 하단 탭(방 안에서는 숨김). PC는 가운데 한 열.
export default function ChatLayout({ children }: { children: React.ReactNode }) {
  useInAppNotification();
  useRoomSummariesSync();
  usePushNotification({ autoRegister: true }); // 이미 허용한 브라우저는 로그인 때마다 자동 등록
  const inRoom = /^\/chat\/rooms\/\d+/.test(usePathname());
  const [chiikawa] = useLabFlag("chiikawa");
  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col bg-background md:border-x">
      <div className="relative flex min-h-0 flex-1 flex-col">
        {/* 실험실: 하단 탭 바로 위 뒷배경(내용 뒤, 터치는 통과). 방 안은 하단 탭이 없어 제외 */}
        {chiikawa && !inRoom && (
          // eslint-disable-next-line @next/next/no-img-element -- 장식용 정적 이미지
          <img
            src="/lab/chiikawa.webp"
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 mx-auto w-4/5 max-w-xs select-none opacity-40 dark:opacity-20"
          />
        )}
        <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
      </div>
      {!inRoom && <BottomTabs />}
    </div>
  );
}
