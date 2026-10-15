"use client";

import { useRef, useState } from "react";
import { CornerUpLeft, Pencil, SendHorizontal, X } from "lucide-react";
import type { MessageView } from "@/lib/chat-state";
import { shouldSend } from "@/lib/composer-keys";

type Props = {
  disabled?: boolean;
  replyTarget: MessageView | null;
  editTarget: MessageView | null;
  onCancel: () => void;
  onSend: (content: string) => void;
  onEdit: (id: number, content: string) => void;
};

const MAX_HEIGHT_PX = 128; // 약 5줄

// 수정 대상이 바뀌면 부모가 key로 다시 마운트해 기존 내용으로 시작한다.
export function Composer({ disabled = false, replyTarget, editTarget, onCancel, onSend, onEdit }: Props) {
  const [text, setText] = useState(editTarget?.content ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  };

  const submit = () => {
    const content = text.trim();
    if (!content || disabled) return;
    if (editTarget) onEdit(editTarget.id, content);
    else onSend(content);
    setText("");
    requestAnimationFrame(resize);
    ref.current?.focus();
  };

  const bar = editTarget
    ? { Icon: Pencil, label: "메시지 수정 중", detail: "" }
    : replyTarget
      ? { Icon: CornerUpLeft, label: `${replyTarget.senderName}에게 답장`, detail: replyTarget.content || "삭제된 메시지" }
      : null;

  return (
    <div className="shrink-0 border-t bg-background pb-[env(safe-area-inset-bottom)]">
      {bar && (
        <div className="flex items-center gap-2 bg-muted px-4 py-2 text-xs">
          <bar.Icon className="size-3.5 shrink-0 text-primary" />
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold">{bar.label}</span>
            {bar.detail && <span className="text-muted-foreground">: {bar.detail}</span>}
          </span>
          <button type="button" onClick={onCancel} aria-label={editTarget ? "수정 취소" : "답장 취소"} className="pressable rounded-full p-1 active:bg-background">
            <X className="size-4" />
          </button>
        </div>
      )}
      <form
        className="flex items-end gap-2 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={ref}
          rows={1}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            resize();
          }}
          onKeyDown={(e) => {
            const coarse = window.matchMedia("(pointer: coarse)").matches;
            if (shouldSend({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing }, coarse)) {
              e.preventDefault();
              submit();
            }
          }}
          placeholder="메시지 입력"
          aria-label="메시지 입력"
          enterKeyHint="send"
          className="max-h-32 min-h-10 flex-1 resize-none rounded-[20px] bg-muted px-4 py-2 text-[15px] leading-6 outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="submit"
          disabled={disabled || text.trim() === ""}
          aria-label={editTarget ? "수정 저장" : "보내기"}
          className="pressable flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground disabled:opacity-40"
        >
          <SendHorizontal className="size-5" />
        </button>
      </form>
    </div>
  );
}
