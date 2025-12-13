"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import CreateRoomModal from "./CreateRoomModal";
import { RoomList } from "./components/RoomList";
import { MessageList } from "./components/MessageList";
import { MessageInput } from "./components/MessageInput";
import { useChatRooms } from "./hooks/useChatRooms";
import { useChatMessages } from "./hooks/useChatMessages";
import useAuth from "@/hooks/useAuth";

const ChatRoomsTab = () => {
  const { user } = useAuth();
  const { rooms, selectedRoomId, setSelectedRoomId, createRoom } =
    useChatRooms();
  const { currentMessages, sendMessage } = useChatMessages(selectedRoomId);
  const [showModal, setShowModal] = useState(false);

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
            currentUsername={user?.username as string | undefined}
            selectedRoomId={selectedRoomId}
          />
          <div className="p-4 border-t">
            <MessageInput
              onSendMessage={sendMessage}
              disabled={!selectedRoomId}
            />
          </div>
        </Card>
      </div>
    </>
  );
};

export default ChatRoomsTab;
