"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { displayName, roomTitle, type Room } from "@/types/domain";

type RoomListProps = {
  rooms: Room[];
  currentUserId: string;
  selectedRoomId: number | null;
  onSelectRoom: (roomId: number) => void;
  onCreateRoom: () => void;
};

export const RoomList = ({ rooms, currentUserId, selectedRoomId, onSelectRoom, onCreateRoom }: RoomListProps) => {
  return (
    <Card className="md:col-span-1">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>채팅방</CardTitle>
          <Button size="sm" onClick={onCreateRoom}>
            방 생성
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 max-h-[320px] overflow-y-auto border rounded p-2">
          {rooms.map((room) => (
            <button
              key={room.id}
              onClick={() => onSelectRoom(room.id)}
              className={`w-full text-left rounded px-2 py-2 border ${
                selectedRoomId === room.id ? "border-blue-500 bg-blue-50" : "border-gray-200"
              }`}
            >
              <div className="font-semibold">
                {roomTitle(room, currentUserId)}
                {room.isGroup && <span className="ml-1 text-xs font-normal text-gray-500">그룹</span>}
              </div>
              <div className="text-xs text-gray-600">{room.participants.map((p) => displayName(p.user)).join(", ")}</div>
            </button>
          ))}
          {rooms.length === 0 && <div className="text-sm text-gray-500">참여 중인 방이 없습니다.</div>}
        </div>
      </CardContent>
    </Card>
  );
};
