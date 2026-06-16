"use client";

import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import CreateRoomModal from "./CreateRoomModal";
import { RoomList } from "./components/RoomList";
import { MessageList } from "./components/MessageList";
import { MessageInput } from "./components/MessageInput";
import { useChatRooms } from "./hooks/useChatRooms";
import { useChatMessages } from "./hooks/useChatMessages";
import type { ChatMessage } from "./types";

const ChatRoomsTab = () => {
  const { rooms, selectedRoomId, setSelectedRoomId, createRoom } =
    useChatRooms();

  // 선택된 방의 참여자 ID (안 읽은 인원 수 계산용, Design Ref: §3.3)
  const participantIds = useMemo(() => {
    const room = rooms.find((r) => r.id === selectedRoomId);
    return (room?.participants ?? []).map((p) => p.user.id);
  }, [rooms, selectedRoomId]);

  const {
    currentMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    loadOlder,
    hasMore,
    loadingOlder,
    currentUserId,
  } = useChatMessages(selectedRoomId, participantIds);

  const [showModal, setShowModal] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);

  const handleSend = (message: string) => {
    sendMessage(message, replyTarget?.id);
    setReplyTarget(null);
  };

  const handleCreateRoom = async (payload: {
    name?: string;
    participants: string[];
    isGroup: boolean;
  }) => {
    const success = await createRoom(payload);
    if (success) {
      setShowModal(false);
    }
  };

  return (
    <>
      <CreateRoomModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleCreateRoom}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <RoomList
          rooms={rooms}
          selectedRoomId={selectedRoomId}
          onSelectRoom={setSelectedRoomId}
          onCreateRoom={() => setShowModal(true)}
        />
        <Card className="md:col-span-2 h-[80vh] flex flex-col">
          <MessageList
            messages={currentMessages}
            currentUserId={currentUserId}
            selectedRoomId={selectedRoomId}
            onReply={setReplyTarget}
            onEdit={editMessage}
            onDelete={deleteMessage}
            onLoadOlder={loadOlder}
            hasMore={hasMore}
            loadingOlder={loadingOlder}
          />
          <div className="p-4 border-t">
            <MessageInput
              onSendMessage={handleSend}
              disabled={!selectedRoomId}
              replyTarget={replyTarget}
              onCancelReply={() => setReplyTarget(null)}
            />
          </div>
        </Card>
      </div>
    </>
  );
};

export default ChatRoomsTab;
