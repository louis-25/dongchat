"use client";

import { useState } from "react";
import { Pencil, Trash2, Reply, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ChatMessage } from "../types";

type MessageItemProps = {
  message: ChatMessage;
  isMine: boolean;
  onReply: (message: ChatMessage) => void;
  onEdit: (messageId: number, content: string) => void;
  onDelete: (messageId: number) => void;
};

// Design Ref: §5.1 — 단일 메시지 + 읽음수/수정/삭제/답장 표시
export const MessageItem = ({
  message,
  isMine,
  onReply,
  onEdit,
  onDelete,
}: MessageItemProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.message);

  const isDeleted = message.deletedAt !== null;
  const time = message.createdAt
    ? new Date(message.createdAt).toLocaleTimeString()
    : "";

  const submitEdit = () => {
    if (draft.trim() && draft.trim() !== message.message) {
      onEdit(message.id, draft.trim());
    }
    setEditing(false);
  };

  return (
    <div className={`group flex flex-col ${isMine ? "items-end" : "items-start"}`}>
      <span className="text-xs text-gray-500">
        {message.sender}
        {time ? ` • ${time}` : ""}
        {message.editedAt && !isDeleted ? " • 수정됨" : ""}
      </span>

      {/* 답장 미리보기 (FR-07) */}
      {message.replyTo && !isDeleted && (
        <div className="mb-1 max-w-[80%] border-l-2 border-gray-300 pl-2 text-xs text-gray-500">
          <span className="font-medium">{message.replyTo.sender}</span>{" "}
          {message.replyTo.message || "(삭제된 메시지)"}
        </div>
      )}

      <div className="flex items-end gap-1">
        {/* 본인 메시지 액션: 좌측 (FR-04/05) */}
        {isMine && !isDeleted && !editing && (
          <div className="hidden items-center gap-1 group-hover:flex">
            <button
              type="button"
              aria-label="수정"
              className="text-gray-400 hover:text-gray-600"
              onClick={() => {
                setDraft(message.message);
                setEditing(true);
              }}
            >
              <Pencil size={14} />
            </button>
            <button
              type="button"
              aria-label="삭제"
              className="text-gray-400 hover:text-red-500"
              onClick={() => onDelete(message.id)}
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}

        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  submitEdit();
                }
                if (e.key === "Escape") setEditing(false);
              }}
              autoFocus
              className="h-8 w-48"
            />
            <Button type="button" size="sm" onClick={submitEdit} aria-label="저장">
              <Check size={14} />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(false)}
              aria-label="취소"
            >
              <X size={14} />
            </Button>
          </div>
        ) : (
          <div
            className={`max-w-full rounded-lg p-2 ${
              isDeleted
                ? "bg-gray-100 italic text-gray-400"
                : isMine
                  ? "bg-blue-500 text-white"
                  : "bg-gray-200 text-black"
            }`}
          >
            {isDeleted ? "삭제된 메시지입니다" : message.message}
          </div>
        )}

        {/* 답장 버튼: 타인 메시지 우측 (FR-07) */}
        {!isMine && !isDeleted && (
          <button
            type="button"
            aria-label="답장"
            className="hidden text-gray-400 hover:text-gray-600 group-hover:block"
            onClick={() => onReply(message)}
          >
            <Reply size={14} />
          </button>
        )}
      </div>

      {/* 안 읽은 인원 수 (FR-03): 본인 메시지 + unread > 0 */}
      {isMine && !isDeleted && message.unreadCount > 0 && (
        <span className="mt-0.5 text-xs font-medium text-yellow-600">
          {message.unreadCount}
        </span>
      )}
    </div>
  );
};
