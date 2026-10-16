"use client";

import { Sheet } from "@/components/ui/sheet";
import type { MessageView } from "@/lib/chat-state";

type Props = {
  target: MessageView | null;
  onClose: () => void;
  onReply: (v: MessageView) => void;
  onCopy: (v: MessageView) => void;
  onEdit: (v: MessageView) => void;
  onDelete: (v: MessageView) => void;
};

// 길게 누른 메시지의 메뉴. 남의 메시지는 답장·복사만.
export function MessageActionsSheet({ target, onClose, onReply, onCopy, onEdit, onDelete }: Props) {
  const run = (fn: (v: MessageView) => void) => () => {
    if (target) fn(target);
    onClose();
  };
  const item = "flex h-12 w-full items-center px-1 text-left text-base pressable-row";
  return (
    <Sheet open={target !== null} onClose={onClose} title="메시지">
      {target && (
        <>
          <p className="mb-2 line-clamp-3 rounded-xl bg-muted px-3 py-2 text-sm">{target.content}</p>
          <div className="divide-y">
            <button type="button" className={item} onClick={run(onReply)}>답장</button>
            {!target.sticker && <button type="button" className={item} onClick={run(onCopy)}>복사</button>}
            {target.isMine && !target.sticker && <button type="button" className={item} onClick={run(onEdit)}>수정</button>}
            {target.isMine && <button type="button" className={`${item} text-destructive`} onClick={run(onDelete)}>삭제</button>}
          </div>
        </>
      )}
    </Sheet>
  );
}
