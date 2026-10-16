"use client";

import { UserAvatar } from "@/components/chat/UserAvatar";
import { useLongPress } from "@/hooks/useLongPress";
import type { MessageView } from "@/lib/chat-state";
import { formatClock } from "@/lib/format";
import { stickerLabel, stickerSrc } from "@/lib/stickers";
import { cn } from "@/lib/utils";

type Props = {
  view: MessageView;
  first: boolean;
  last: boolean;
  readOnly: boolean;
  onOpenActions: (view: MessageView) => void;
  onJumpTo: (id: number) => void;
  onOpenProfile?: (userId: string) => void;
};

export function MessageBubble({ view, first, last, readOnly, onOpenActions, onJumpTo, onOpenProfile }: Props) {
  const deleted = view.deletedAt !== null;
  const press = useLongPress(() => onOpenActions(view));
  const interactive = !readOnly && !deleted;
  const mine = view.isMine;
  const sticker = !deleted && view.sticker !== null;
  const showSender = !mine && first;

  const meta = last && (
    <div className={cn("flex shrink-0 flex-col justify-end pb-0.5 text-[11px] leading-tight", mine ? "items-end" : "items-start")}>
      {mine && !deleted && view.unreadCount !== null && view.unreadCount > 0 && (
        <span className="font-semibold text-primary tabular-nums">{view.unreadCount}</span>
      )}
      <time className="text-muted-foreground tabular-nums">{formatClock(view.createdAt)}</time>
    </div>
  );

  return (
    <div id={`msg-${view.id}`} className={cn("flex gap-2", mine ? "justify-end" : "justify-start", first ? "mt-2" : "mt-0.5")}>
      {!mine && (
        <div className="w-9 shrink-0">
          {showSender &&
            (onOpenProfile && view.senderId ? (
              <button type="button" className="pressable" onClick={() => onOpenProfile(view.senderId!)} aria-label={`${view.senderName} 프로필`}>
                <UserAvatar name={view.senderName} src={view.senderAvatar} className="size-9 rounded-[10px]" />
              </button>
            ) : (
              <UserAvatar name={view.senderName} src={view.senderAvatar} className="size-9 rounded-[10px]" />
            ))}
        </div>
      )}
      <div className={cn("flex min-w-0 max-w-[78%] flex-col", mine ? "items-end" : "items-start")}>
        {showSender && <div className="mb-1 text-xs text-muted-foreground">{view.senderName}</div>}
        <div className={cn("flex items-end gap-1.5", mine && "flex-row-reverse")}>
          <div
            {...(interactive ? press : {})}
            className={cn(
              "min-w-0 select-none whitespace-pre-wrap break-words px-3 py-2 text-[15px] leading-snug [-webkit-touch-callout:none]",
              mine ? "rounded-[18px_6px_18px_18px] bg-bubble-me text-bubble-me-foreground" : "rounded-[6px_18px_18px_18px] bg-bubble-them text-foreground",
              deleted && "bg-transparent italic text-muted-foreground ring-1 ring-border",
              sticker && "bg-transparent p-0",
            )}
          >
            {view.replyTo && !deleted && (
              <button
                type="button"
                onClick={() => onJumpTo(view.replyTo!.id)}
                className="mb-1 block max-w-full truncate border-l-2 border-current pl-2 text-left text-xs opacity-70"
              >
                {view.replyTo.senderName && `${view.replyTo.senderName}: `}
                {view.replyTo.deleted ? "삭제된 메시지" : view.replyTo.content}
              </button>
            )}
            {deleted ? (
              "삭제된 메시지입니다"
            ) : sticker ? (
              // eslint-disable-next-line @next/next/no-img-element -- 작은 정적 SVG
              <img src={stickerSrc(view.sticker!)} alt={stickerLabel(view.sticker!)} className="size-32" draggable={false} />
            ) : (
              view.content
            )}
            {view.editedAt && !deleted && <span className="ml-1 text-[11px] opacity-60">수정됨</span>}
          </div>
          {meta}
        </div>
      </div>
    </div>
  );
}
