"use client";

import { useState } from "react";
import { ChevronDown, Megaphone } from "lucide-react";
import { useNoticeHidden } from "@/hooks/useRoomNotice";
import { cn } from "@/lib/utils";
import type { RoomNotice as Notice } from "@/types/domain";

// 방 상단 공지 띠. 누르면 펼침, 펼친 상태에서 '메시지로 이동'·'접기'(이 기기에서 이 공지 숨김).
export function RoomNotice({ roomId, notice, onJump }: { roomId: number; notice: Notice | null; onJump: (id: number) => void }) {
  const [open, setOpen] = useState(false);
  const [hidden, hide] = useNoticeHidden(roomId, notice?.messageId ?? null);
  if (!notice || hidden) return null;
  return (
    <div className="border-b bg-card px-3 py-2">
      <button type="button" className="pressable-row flex w-full items-start gap-2 text-left" onClick={() => setOpen(!open)} aria-expanded={open}>
        <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <span className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words text-sm", !open && "line-clamp-1")}>{notice.content}</span>
        <ChevronDown className={cn("mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div className="mt-2 flex justify-end gap-4 text-xs">
          <button type="button" className="pressable text-muted-foreground" onClick={hide}>
            접기
          </button>
          <button
            type="button"
            className="pressable font-semibold text-primary"
            onClick={() => {
              setOpen(false);
              onJump(notice.messageId);
            }}
          >
            메시지로 이동
          </button>
        </div>
      )}
    </div>
  );
}
