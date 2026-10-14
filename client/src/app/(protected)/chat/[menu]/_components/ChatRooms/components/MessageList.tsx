"use client";

import { useLayoutEffect, useRef } from "react";
import { CardContent } from "@/components/ui/card";
import { scrollAction, type MessageView } from "@/lib/chat-state";
import { MessageItem } from "./MessageItem";

type MessageListProps = {
  messages: MessageView[];
  hasRoom: boolean;
  onReply: (message: MessageView) => void;
  onEdit: (messageId: number, content: string) => void;
  onDelete: (messageId: number) => void;
  onLoadOlder: () => void;
  hasMore: boolean;
  loadingOlder: boolean;
};

const NEAR_BOTTOM_PX = 80;
const LOAD_OLDER_PX = 40;

// 방이 바뀌면 부모가 key로 다시 마운트한다(스크롤 기준 초기화).
export const MessageList = ({
  messages,
  hasRoom,
  onReply,
  onEdit,
  onDelete,
  onLoadOlder,
  hasMore,
  loadingOlder,
}: MessageListProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  // 직전 렌더의 목록 끝 id·스크롤 높이·맨 아래 근처 여부
  const last = useRef({ firstId: null as number | null, lastId: null as number | null, height: 0, nearBottom: true });

  const isNearBottom = (el: HTMLDivElement) => el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    last.current.nearBottom = isNearBottom(el);
    if (el.scrollTop < LOAD_OLDER_PX && hasMore && !loadingOlder) onLoadOlder();
  };

  // 그리기 전에 위치를 맞춰 깜빡임·점프를 없앤다.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const next = { firstId: messages[0]?.id ?? null, lastId: messages[messages.length - 1]?.id ?? null };
    const action = scrollAction(last.current, next, {
      mineAppended: messages[messages.length - 1]?.isMine ?? false,
      nearBottom: last.current.nearBottom,
    });
    if (action === "bottom") el.scrollTop = el.scrollHeight;
    else if (action === "keep-offset") el.scrollTop += el.scrollHeight - last.current.height;
    last.current = { ...next, height: el.scrollHeight, nearBottom: isNearBottom(el) };
  }, [messages]);

  return (
    <CardContent className="flex-1 flex flex-col overflow-hidden pt-4">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto mb-4 space-y-2 p-2 border rounded-md bg-white"
      >
        {loadingOlder && <div className="text-center text-xs text-gray-400">불러오는 중…</div>}
        {!hasMore && messages.length > 0 && <div className="text-center text-xs text-gray-300">대화의 시작입니다.</div>}
        {messages.map((msg) => (
          <MessageItem key={msg.id} message={msg} onReply={onReply} onEdit={onEdit} onDelete={onDelete} />
        ))}
        {hasRoom && messages.length === 0 && <div className="text-sm text-gray-500">메시지가 없습니다.</div>}
        {!hasRoom && <div className="text-sm text-gray-500">채팅방을 선택하세요.</div>}
      </div>
    </CardContent>
  );
};
