"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BASE_URL } from "@/config";
import { getAccessToken } from "@/lib/api-client";
import useAuth from "@/hooks/useAuth";
import { useChat } from "@/components/chat-provider";

type IncomingMessage = {
  roomId?: number;
  sender: string;
  message?: string;
  content?: string;
  createdAt?: string;
};

type ChatRoom = {
  id: number;
  name: string | null;
  isGroup: boolean;
  participants?: { user: { id: number; username: string } }[];
};

type ModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name?: string;
    participants: string[];
    isGroup: boolean;
  }) => void;
};

const CreateRoomModal = ({ open, onClose, onSubmit }: ModalProps) => {
  const [roomName, setRoomName] = useState("");
  const [roomParticipants, setRoomParticipants] = useState("");
  const [isGroup, setIsGroup] = useState(false);

  const handleClose = () => {
    setRoomName("");
    setRoomParticipants("");
    setIsGroup(false);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-lg">
        <div className="border-b px-4 py-3 text-lg font-semibold">
          채팅방 생성
        </div>
        <div className="space-y-3 p-4">
          <Input
            placeholder="방 이름 (선택)"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
          />
          <Input
            placeholder="참여자 아이디(쉼표 구분)"
            value={roomParticipants}
            onChange={(e) => setRoomParticipants(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={isGroup}
              onChange={(e) => setIsGroup(e.target.checked)}
            />
            그룹방 여부
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>
              취소
            </Button>
            <Button
              onClick={() =>
                onSubmit({
                  name: roomName || undefined,
                  participants: roomParticipants
                    .split(",")
                    .map((p) => p.trim())
                    .filter(Boolean),
                  isGroup,
                })
              }
            >
              만들기
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChatRoomsTab = () => {
  const { user } = useAuth();
  const { socket } = useChat();
  const token = useMemo(() => getAccessToken(), []);
  const authHeader = useMemo(
    () =>
      token
        ? ({ Authorization: `Bearer ${token}` } as Record<string, string>)
        : ({} as Record<string, string>),
    [token]
  );

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [messagesByRoom, setMessagesByRoom] = useState<
    Record<number, { sender: string; message: string; createdAt?: string }[]>
  >({});
  const [input, setInput] = useState("");
  const [showModal, setShowModal] = useState(false);

  const loadRooms = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/chat/rooms`, {
        headers: authHeader,
      });
      if (res.ok) {
        const data = await res.json();
        setRooms(data || []);
        if (!selectedRoomId && data?.length > 0) {
          setSelectedRoomId(data[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [authHeader, selectedRoomId]);

  // useEffect(() => {
  //   (async () => {
  //     await loadRooms();
  //   })();
  // }, [loadRooms]);

  // useEffect(() => {
  //   if (!socket || !user?.id || !selectedRoomId) return;
  //   socket.emit("join_room", { roomId: selectedRoomId, userId: user.id });
  // }, [socket, user?.id, selectedRoomId]);

  // useEffect(() => {
  //   if (!socket) return;

  //   socket.on("message", (payload: IncomingMessage) => {
  //     if (payload.roomId === undefined || payload.roomId === null) return;
  //     const roomKey = Number(payload.roomId);
  //     setMessagesByRoom((prev) => {
  //       const prevList = prev[roomKey] || [];
  //       return {
  //         ...prev,
  //         [roomKey]: [
  //           ...prevList,
  //           {
  //             sender: payload.sender,
  //             message: payload.content ?? payload.message ?? "",
  //             createdAt: payload.createdAt,
  //           },
  //         ],
  //       };
  //     });
  //   });

  //   socket.on(
  //     "initial_messages",
  //     (payload: { roomId: number; messages: IncomingMessage[] }) => {
  //       if (payload?.roomId === undefined || payload?.roomId === null) return;
  //       const roomKey = Number(payload.roomId);
  //       const formatted = (payload.messages || []).map((m) => ({
  //         sender: m.sender,
  //         message: m.content ?? m.message ?? "",
  //         createdAt: m.createdAt,
  //       }));
  //       setMessagesByRoom((prev) => ({ ...prev, [roomKey]: formatted }));
  //     }
  //   );

  //   return () => {
  //     socket.off("message");
  //     socket.off("initial_messages");
  //   };
  // }, [socket]);

  const sendMessage = () => {
    if (socket && input.trim() && user?.username && selectedRoomId) {
      socket.emit("message", {
        sender: user.username,
        message: input,
        roomId: selectedRoomId,
      });
      setInput("");
    }
  };

  const handleCreateRoom = async (payload: {
    name?: string;
    participants: string[];
    isGroup: boolean;
  }) => {
    try {
      const res = await fetch(`${BASE_URL}/chat/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          name: payload.name,
          isGroup: payload.isGroup,
          participantUsernames: payload.participants,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await loadRooms();
        setSelectedRoomId(data?.id ?? null);
        setShowModal(false);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const currentMessages =
    selectedRoomId !== null ? messagesByRoom[selectedRoomId] || [] : [];

  return (
    <>
      <CreateRoomModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleCreateRoom}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>채팅방</CardTitle>
              <Button size="sm" onClick={() => setShowModal(true)}>
                방 생성
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 max-h-[320px] overflow-y-auto border rounded p-2">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`w-full text-left rounded px-2 py-2 border ${
                    selectedRoomId === room.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200"
                  }`}
                >
                  <div className="font-semibold">
                    {room.name ||
                      (room.isGroup
                        ? `그룹방 #${room.id}`
                        : `1:1 방 #${room.id}`)}
                  </div>
                  <div className="text-xs text-gray-600">
                    {room.participants
                      ?.map((p) => p.user?.username)
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                </button>
              ))}
              {rooms.length === 0 && (
                <div className="text-sm text-gray-500">
                  참여 중인 방이 없습니다.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 h-[80vh] flex flex-col">
          <CardHeader>
            <CardTitle>채팅</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto mb-4 space-y-2 p-2 border rounded-md bg-white">
              {currentMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    msg.sender === user?.username ? "items-end" : "items-start"
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
                      msg.sender === user?.username
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-black"
                    }`}
                  >
                    {msg.message}
                  </div>
                </div>
              ))}
              {selectedRoomId && currentMessages.length === 0 && (
                <div className="text-sm text-gray-500">메시지가 없습니다.</div>
              )}
              {!selectedRoomId && (
                <div className="text-sm text-gray-500">
                  채팅방을 선택하세요.
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="메시지를 입력하세요..."
                onKeyDown={(e) => e.key === "Enter" && sendMessage()}
                disabled={!selectedRoomId}
              />
              <Button onClick={sendMessage} disabled={!selectedRoomId}>
                전송
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default ChatRoomsTab;
