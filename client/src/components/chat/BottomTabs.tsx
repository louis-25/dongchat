"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MessageCircle, Settings, Users } from "lucide-react";
import { useRoomSummaries } from "@/hooks/useRoomSummaries";
import { badgeText } from "@/lib/format";
import { totalUnread } from "@/lib/room-list";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/chat/friends", label: "친구", Icon: Users },
  { href: "/chat/rooms", label: "채팅", Icon: MessageCircle },
  { href: "/chat/settings", label: "설정", Icon: Settings },
];

export function BottomTabs() {
  const pathname = usePathname();
  const { data: summaries = [] } = useRoomSummaries();
  const badge = badgeText(totalUnread(summaries));
  return (
    <nav className="flex shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)]" aria-label="주요 메뉴">
      {TABS.map(({ href, label, Icon }) => {
        const active = pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn("relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs", active ? "font-semibold text-primary" : "text-muted-foreground")}
          >
            <Icon className="size-6" strokeWidth={active ? 2.4 : 1.8} />
            {label}
            {href === "/chat/rooms" && badge && (
              <span className="absolute left-1/2 top-1.5 ml-2 min-w-5 rounded-full bg-primary px-1.5 text-center text-[11px] font-bold leading-5 text-primary-foreground">
                {badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
