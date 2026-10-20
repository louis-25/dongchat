"use client";

import { Sheet } from "@/components/ui/sheet";
import type { MessageView } from "@/lib/chat-state";
import { cn } from "@/lib/utils";
import { Plus } from "lucide-react";

type Props = {
  target: MessageView | null;
  onClose: () => void;
  onReply: (v: MessageView) => void;
  onCopy: (v: MessageView) => void;
  onEdit: (v: MessageView) => void;
  onDelete: (v: MessageView) => void;
  me: string;
  onReact: (v: MessageView, reaction: string | null) => void;
  onMoreReactions: (v: MessageView) => void;
  quickReactions: string[]; // 최근 쓴 것 먼저
};

// 길게 누른 메시지의 메뉴. 남의 메시지는 답장·복사만.
export function MessageActionsSheet({ target, onClose, onReply, onCopy, onEdit, onDelete, me, onReact, onMoreReactions, quickReactions }: Props) {
  const run = (fn: (v: MessageView) => void) => () => {
    if (target) fn(target);
    onClose();
  };
  const item = "flex h-12 w-full items-center px-1 text-left text-base pressable-row";
  return (
    <Sheet open={target !== null} onClose={onClose} title="메시지">
      {target && (
        <>
          <div className="mb-3 flex justify-between" role="group" aria-label="반응">
            {quickReactions.map((emoji) => {
              const mine = target.reactions.some((x) => x.userId === me && x.reaction === emoji);
              return (
                <button
                  key={emoji}
                  type="button"
                  aria-pressed={mine}
                  onClick={() => {
                    onReact(target, mine ? null : emoji);
                    onClose();
                  }}
                  className={cn("pressable flex size-11 items-center justify-center rounded-full text-2xl", mine ? "bg-primary/15 ring-2 ring-primary" : "bg-muted")}
                >
                  {emoji}
                </button>
              );
            })}
            <button
              type="button"
              aria-label="다른 이모지"
              onClick={() => {
                onMoreReactions(target);
                onClose();
              }}
              className="pressable flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
            >
              <Plus className="size-5" />
            </button>
          </div>
          <p className="mb-2 line-clamp-3 rounded-xl bg-muted px-3 py-2 text-sm">{target.content}</p>
          <div className="divide-y">
            <button type="button" className={item} onClick={run(onReply)}>답장</button>
            {!target.sticker && !target.imagePath && <button type="button" className={item} onClick={run(onCopy)}>복사</button>}
            {target.isMine && !target.sticker && !target.imagePath && <button type="button" className={item} onClick={run(onEdit)}>수정</button>}
            {target.isMine && <button type="button" className={`${item} text-destructive`} onClick={run(onDelete)}>삭제</button>}
          </div>
        </>
      )}
    </Sheet>
  );
}
