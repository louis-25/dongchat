"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import useAuth from "@/hooks/useAuth";
import CreateRoomModal from "./CreateRoomModal";
import { RoomList } from "./components/RoomList";
import { RoomHeader } from "./components/RoomHeader";
import { MessageList } from "./components/MessageList";
import { MessageInput } from "./components/MessageInput";
import { useChatRooms } from "./hooks/useChatRooms";
import { useChatMessages } from "./hooks/useChatMessages";
import type { ChatMessage, CreateRoomPayload } from "./types";

// 4단계에서 메시지 계층을 Supabase로 교체하며 참여자 uuid 기반 읽음 계산으로 바꾼다. 그 전까지 빈 배열.
// 모듈 상수여야 한다: 렌더마다 새 배열이면 useChatMessages의 의존성이 매번 바뀐다.
const NO_PARTICIPANTS: number[] = [];

const ChatRoomsTab = () => {
  const { user } = useAuth();
  const { rooms, selectedRoom, selectedRoomId, setSelectedRoomId, createRoom, leaveRoom, kickMember, isMutating } =
    useChatRooms();

  const {
    currentMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    loadOlder,
    hasMore,
    loadingOlder,
    currentUserId,
  } = useChatMessages(selectedRoomId, NO_PARTICIPANTS);

  const [showModal, setShowModal] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ChatMessage | null>(null);

  const handleSend = (message: string) => {
    sendMessage(message, replyTarget?.id);
    setReplyTarget(null);
  };

  const handleCreateRoom = async (payload: CreateRoomPayload) => {
    if (await createRoom(payload)) setShowModal(false);
  };

  return (
    <>
      <CreateRoomModal open={showModal} onClose={() => setShowModal(false)} onSubmit={handleCreateRoom} />
      <div className="grid gap-4 md:grid-cols-3">
        <RoomList
          rooms={rooms}
          currentUserId={user?.id ?? ""}
          selectedRoomId={selectedRoomId}
          onSelectRoom={setSelectedRoomId}
          onCreateRoom={() => setShowModal(true)}
        />
        <Card className="md:col-span-2 h-[80vh] flex flex-col">
          {selectedRoom && user && (
            <RoomHeader
              room={selectedRoom}
              currentUserId={user.id}
              disabled={isMutating}
              onLeave={() => leaveRoom(selectedRoom.id)}
              onKick={(userId) => kickMember(selectedRoom.id, userId)}
            />
          )}
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
