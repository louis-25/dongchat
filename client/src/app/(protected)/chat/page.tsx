"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useChat } from "@/components/chat-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import useAuth from "@/hooks/useAuth";
import { getAccessToken } from "@/lib/api-client";
import { BASE_URL } from "@/config";

type IncomingMessage = {
  roomId?: number;
  sender: string;
  message?: string;
  content?: string;
  createdAt?: string;
};

type FriendRequest = {
  id: number;
  requester?: { id: number; username: string };
  receiver?: { id: number; username: string };
  status: string;
};

type FriendEntry = { id: number; friend: { id: number; username: string } };

type ChatRoom = {
  id: number;
  name: string | null;
  isGroup: boolean;
  participants?: { user: { id: number; username: string } }[];
};

export default function ChatPage() {
  const { socket } = useChat();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"friends" | "chat">("chat");
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [pending, setPending] = useState<FriendRequest[]>([]);
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [messagesByRoom, setMessagesByRoom] = useState<
    Record<number, { sender: string; message: string; createdAt?: string }[]>
  >({});
  const [input, setInput] = useState("");
  const [friendInput, setFriendInput] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomParticipants, setRoomParticipants] = useState("");
  const [isGroup, setIsGroup] = useState(false);

  const token = useMemo(() => getAccessToken(), []);
  const authHeader: HeadersInit = useMemo(() => {
    return token
      ? ({ Authorization: `Bearer ${token}` } as Record<string, string>)
      : ({} as Record<string, string>);
  }, [token]);

  const loadFriends = useCallback(async () => {
    try {
      const res = await fetch(`${BASE_URL}/friends`, { headers: authHeader });
      if (res.ok) {
        const data = await res.json();
        setFriends(data || []);
      }
      const pendingRes = await fetch(`${BASE_URL}/friends/pending`, {
        headers: authHeader,
      });
      if (pendingRes.ok) {
        const data = await pendingRes.json();
        setPending(data || []);
      }
    } catch (e) {
      console.error(e);
    }
  }, [authHeader]);

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

  useEffect(() => {
    (async () => {
      await loadFriends();
      await loadRooms();
    })();
  }, [loadFriends, loadRooms]);

  useEffect(() => {
    if (!socket || !user?.id || !selectedRoomId) return;

    socket.emit("join_room", { roomId: selectedRoomId, userId: user.id });
  }, [socket, user?.id, selectedRoomId]);

  useEffect(() => {
    if (!socket) return;

    socket.on("message", (payload: IncomingMessage) => {
      if (payload.roomId === undefined || payload.roomId === null) return;
      const roomKey = Number(payload.roomId);
      setMessagesByRoom((prev) => {
        const prevList = prev[roomKey] || [];
        return {
          ...prev,
          [roomKey]: [
            ...prevList,
            {
              sender: payload.sender,
              message: payload.content ?? payload.message ?? "",
              createdAt: payload.createdAt,
            },
          ],
        };
      });
    });

    socket.on(
      "initial_messages",
      (payload: { roomId: number; messages: IncomingMessage[] }) => {
        if (payload?.roomId === undefined || payload?.roomId === null) return;
        const roomKey = Number(payload.roomId);
        const formatted = (payload.messages || []).map((m) => ({
          sender: m.sender,
          message: m.content ?? m.message ?? "",
          createdAt: m.createdAt,
        }));
        setMessagesByRoom((prev) => ({ ...prev, [roomKey]: formatted }));
      }
    );

    return () => {
      socket.off("message");
      socket.off("initial_messages");
    };
  }, [socket]);

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

  const handleAddFriend = async () => {
    if (!friendInput.trim()) return;
    try {
      const res = await fetch(`${BASE_URL}/friends/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({ username: friendInput.trim() }),
      });
      if (res.ok) {
        setFriendInput("");
        loadFriends();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const respondFriend = async (id: number, action: "accept" | "block") => {
    try {
      const res = await fetch(`${BASE_URL}/friends/${id}/${action}`, {
        method: "PATCH",
        headers: { ...authHeader },
      });
      if (res.ok) {
        loadFriends();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleCreateRoom = async () => {
    const participants = roomParticipants
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    try {
      const res = await fetch(`${BASE_URL}/chat/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          name: roomName || undefined,
          isGroup,
          participantUsernames: participants,
        }),
      });
      if (res.ok) {
        setRoomName("");
        setRoomParticipants("");
        const data = await res.json();
        await loadRooms();
        setSelectedRoomId(data?.id ?? null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  if (!user) {
    return null; // 또는 로딩 스피너
  }

  const currentMessages =
    selectedRoomId !== null ? messagesByRoom[selectedRoomId] || [] : [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4">
      <div className="flex gap-2">
        <Button
          variant={activeTab === "chat" ? "default" : "outline"}
          onClick={() => setActiveTab("chat")}
        >
          채팅
        </Button>
        <Button
          variant={activeTab === "friends" ? "default" : "outline"}
          onClick={() => setActiveTab("friends")}
        >
          친구
        </Button>
      </div>

      {activeTab === "friends" && (
        <Card>
          <CardHeader>
            <CardTitle>친구 관리</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="추가할 사용자 아이디"
                value={friendInput}
                onChange={(e) => setFriendInput(e.target.value)}
              />
              <Button onClick={handleAddFriend}>친구 추가</Button>
            </div>
            <div>
              <h3 className="font-semibold mb-2">받은 요청</h3>
              <div className="space-y-2">
                {pending.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded border px-3 py-2"
                  >
                    <span>
                      {p.requester?.username} → {p.receiver?.username}
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => respondFriend(p.id, "accept")}
                      >
                        수락
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => respondFriend(p.id, "block")}
                      >
                        차단
                      </Button>
                    </div>
                  </div>
                ))}
                {pending.length === 0 && (
                  <div className="text-sm text-gray-500">
                    대기 중인 요청이 없습니다.
                  </div>
                )}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2">친구 목록</h3>
              <div className="space-y-2">
                {friends.map((f) => (
                  <div key={f.id} className="rounded border px-3 py-2">
                    {f.friend.username}
                  </div>
                ))}
                {friends.length === 0 && (
                  <div className="text-sm text-gray-500">친구가 없습니다.</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === "chat" && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="md:col-span-1">
            <CardHeader>
              <CardTitle>채팅방</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-2">
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
                <Button onClick={handleCreateRoom}>방 만들기</Button>
              </div>
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
                      msg.sender === user.username ? "items-end" : "items-start"
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
                        msg.sender === user.username
                          ? "bg-blue-500 text-white"
                          : "bg-gray-200 text-black"
                      }`}
                    >
                      {msg.message}
                    </div>
                  </div>
                ))}
                {selectedRoomId && currentMessages.length === 0 && (
                  <div className="text-sm text-gray-500">
                    메시지가 없습니다.
                  </div>
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
      )}
    </div>
  );
}
