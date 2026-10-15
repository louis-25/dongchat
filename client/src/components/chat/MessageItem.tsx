"use client";

import { useState } from "react";
import { Pencil, Trash2, Reply, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { MessageView } from "@/lib/chat-state";

type MessageItemProps = {
  message: MessageView;
  readOnly?: boolean;
  onReply: (message: MessageView) => void;
  onEdit: (messageId: number, content: string) => void;
  onDelete: (messageId: number) => void;
};

// 단일 메시지 + 안 읽은 인원 수/수정/삭제/답장
export const MessageItem = ({ message, readOnly = false, onReply, onEdit, onDelete }: MessageItemProps) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);

  // 관리자 열람은 읽기 전용: 수정·삭제·답장·안 읽은 수를 숨긴다.
  const isMine = message.isMine && !readOnly;
  const isDeleted = message.deletedAt !== null;
  const time = new Date(message.createdAt).toLocaleTimeString();

  const submitEdit = () => {
    if (draft.trim() && draft.trim() !== message.content) {
      onEdit(message.id, draft.trim());
    }
    setEditing(false);
  };

  return (
    <div className={`group flex flex-col ${isMine ? "items-end" : "items-start"}`}>
      <span className="text-xs text-gray-500">
        {message.senderName}
        {` • ${time}`}
        {message.editedAt && !isDeleted ? " • 수정됨" : ""}
      </span>

      {message.replyTo && !isDeleted && (
        <div className="mb-1 max-w-[80%] border-l-2 border-gray-300 pl-2 text-xs text-gray-500">
          <span className="font-medium">{message.replyTo.senderName}</span>{" "}
          {message.replyTo.deleted ? "(삭제된 메시지)" : message.replyTo.content}
        </div>
      )}

      <div className="flex items-end gap-1">
        {isMine && !isDeleted && !editing && (
          <div className="hidden items-center gap-1 group-hover:flex">
            <button
              type="button"
              aria-label="수정"
              className="text-gray-400 hover:text-gray-600"
              onClick={() => {
                setDraft(message.content);
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
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)} aria-label="취소">
              <X size={14} />
            </Button>
          </div>
        ) : (
          <div
            className={`max-w-full rounded-lg p-2 ${
              isDeleted ? "bg-gray-100 italic text-gray-400" : isMine ? "bg-blue-500 text-white" : "bg-gray-200 text-black"
            }`}
          >
            {isDeleted ? "삭제된 메시지입니다" : message.content}
          </div>
        )}

        {!readOnly && !isMine && !isDeleted && (
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

      {/* 안 읽은 인원 수: 본인 메시지, 스냅샷 이후 값이 있을 때만 */}
      {isMine && !isDeleted && message.unreadCount !== null && message.unreadCount > 0 && (
        <span className="mt-0.5 text-xs font-medium text-yellow-600">{message.unreadCount}</span>
      )}
    </div>
  );
};
