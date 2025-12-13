"use client";

import { CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type MessageListProps = {
  messages: { sender: string; message: string; createdAt?: string }[];
  currentUsername?: string;
  selectedRoomId: number | null;
};

export const MessageList = ({
  messages,
  currentUsername,
  selectedRoomId,
}: MessageListProps) => {
  return (
    <>
      <CardHeader>
        <CardTitle>채팅</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto mb-4 space-y-2 p-2 border rounded-md bg-white">
          {messages.map((msg, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${
                msg.sender === currentUsername ? "items-end" : "items-start"
              }`}
            >
              <span className="text-xs text-gray-500">
                {msg.sender}
                {msg.createdAt
                  ? ` • ${new Date(msg.createdAt).toLocaleTimeString()}`
                  : ""}
              </span>
              <div
                className={`p-2 rounded-lg max-w-[80%] ${
                  msg.sender === currentUsername
                    ? "bg-blue-500 text-white"
                    : "bg-gray-200 text-black"
                }`}
              >
                {msg.message}
              </div>
            </div>
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

