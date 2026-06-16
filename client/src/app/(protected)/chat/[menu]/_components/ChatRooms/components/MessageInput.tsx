"use client";

import { useForm, FormProvider } from "react-hook-form";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "../types";

type MessageInputProps = {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  // Design Ref: §5.1 — 답장 대상 컨텍스트 바 (FR-07)
  replyTarget?: ChatMessage | null;
  onCancelReply?: () => void;
};

export const MessageInput = ({
  onSendMessage,
  disabled = false,
  replyTarget = null,
  onCancelReply,
}: MessageInputProps) => {
  const methods = useForm<{ message: string }>({
    defaultValues: { message: "" },
  });
  const { handleSubmit, reset, register } = methods;

  const onSubmit = (data: { message: string }) => {
    if (!data.message.trim()) return;
    onSendMessage(data.message.trim());
    reset();
  };

  return (
    <FormProvider {...methods}>
      {replyTarget && (
        <div className="mb-2 flex items-center justify-between rounded-md border-l-2 border-blue-400 bg-gray-50 px-2 py-1 text-xs text-gray-600">
          <span className="truncate">
            <span className="font-medium">{replyTarget.sender}</span>님에게 답장:{" "}
            {replyTarget.message || "(삭제된 메시지)"}
          </span>
          <button
            type="button"
            aria-label="답장 취소"
            className="ml-2 text-gray-400 hover:text-gray-600"
            onClick={onCancelReply}
          >
            <X size={14} />
          </button>
        </div>
      )}
      <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
        <Input
          type="text"
          {...register("message")}
          placeholder="메시지를 입력하세요..."
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(onSubmit)();
            }
          }}
        />
        <Button type="submit" disabled={disabled}>
          전송
        </Button>
      </form>
    </FormProvider>
  );
};
