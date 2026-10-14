"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import type { MessageView } from "@/lib/chat-state";
import CreateRoomModal from "./CreateRoomModal";
import { RoomList } from "./components/RoomList";
import { RoomHeader } from "./components/RoomHeader";
import { MessageList } from "./components/MessageList";
import { MessageInput } from "./components/MessageInput";
import { useChatRooms } from "./hooks/useChatRooms";
import { useChatMessages } from "./hooks/useChatMessages";
import type { CreateRoomPayload } from "./types";

const ChatRoomsTab = () => {
  const { user } = useAuth();
  const { setViewingRoom } = useChat();
  const { rooms, selectedRoom, selectedRoomId, setSelectedRoomId, createRoom, leaveRoom, kickMember, isMutating } =
    useChatRooms();
  const { messages, sendMessage, editMessage, deleteMessage, loadOlder, hasMore, loadingOlder } =
    useChatMessages(selectedRoom);

  const [showModal, setShowModal] = useState(false);
  const [replyTarget, setReplyTarget] = useState<MessageView | null>(null);

  // 인앱 알림이 "지금 보고 있는 방"을 알 수 있도록(탭을 떠나면 해제)
  useEffect(() => {
    setViewingRoom(selectedRoomId);
    return () => setViewingRoom(null);
  }, [selectedRoomId, setViewingRoom]);

  const handleSelectRoom = (roomId: number) => {
    setSelectedRoomId(roomId);
    setReplyTarget(null);
  };

  const handleSend = (content: string) => {
    void sendMessage(content, replyTarget?.id);
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
          onSelectRoom={handleSelectRoom}
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
            key={selectedRoomId ?? "none"}
            messages={messages}
            hasRoom={selectedRoom !== null}
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
              disabled={!selectedRoom}
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
