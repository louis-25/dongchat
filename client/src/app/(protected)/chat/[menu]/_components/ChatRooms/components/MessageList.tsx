"use client";

import { useEffect, useRef } from "react";
import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageItem } from "./MessageItem";
import type { ChatMessage } from "../types";

type MessageListProps = {
  messages: ChatMessage[];
  currentUserId: number | null;
  selectedRoomId: number | null;
  onReply: (message: ChatMessage) => void;
  onEdit: (messageId: number, content: string) => void;
  onDelete: (messageId: number) => void;
  onLoadOlder: () => void;
  hasMore: boolean;
  loadingOlder: boolean;
};

// Design Ref: §5.1 — 메시지 목록 + 무한 스크롤(FR-08) + 항목 상호작용
export const MessageList = ({
  messages,
  currentUserId,
  selectedRoomId,
  onReply,
  onEdit,
  onDelete,
  onLoadOlder,
  hasMore,
  loadingOlder,
}: MessageListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevScrollHeight = useRef(0);
  const prevLen = useRef(0);

  // 상단 근처 도달 시 과거 메시지 로드 (스크롤 위치 보존)
  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el || loadingOlder || !hasMore) return;
    if (el.scrollTop < 40) {
      prevScrollHeight.current = el.scrollHeight;
      onLoadOlder();
    }
  };

  // 메시지 증가 시: 신규 수신은 하단으로, 과거 로드는 위치 보존
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const grew = messages.length - prevLen.current;
    if (grew > 0 && prevScrollHeight.current > 0) {
      // 과거 메시지 prepend → 기존 위치 유지
      el.scrollTop = el.scrollHeight - prevScrollHeight.current;
      prevScrollHeight.current = 0;
    } else {
      // 신규 메시지/초기 로드 → 하단으로
      el.scrollTop = el.scrollHeight;
    }
    prevLen.current = messages.length;
  }, [messages]);

  return (
    <>
      <CardHeader>
        <CardTitle>채팅</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto mb-4 space-y-2 p-2 border rounded-md bg-white"
        >
          {loadingOlder && (
            <div className="text-center text-xs text-gray-400">불러오는 중…</div>
          )}
          {!hasMore && messages.length > 0 && (
            <div className="text-center text-xs text-gray-300">
              대화의 시작입니다.
            </div>
          )}
          {messages.map((msg) => (
            <MessageItem
              key={msg.id}
              message={msg}
              isMine={msg.senderId !== null && msg.senderId === currentUserId}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
            />
          ))}
          {selectedRoomId && messages.length === 0 && (
            <div className="text-sm text-gray-500">메시지가 없습니다.</div>
          )}
          {!selectedRoomId && (
            <div className="text-sm text-gray-500">채팅방을 선택하세요.</div>
          )}
        </div>
      </CardContent>
    </>
  );
};
