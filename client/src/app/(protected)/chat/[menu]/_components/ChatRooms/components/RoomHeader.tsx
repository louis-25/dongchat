"use client";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { displayName, roomTitle, type Room } from "@/types/domain";

type RoomHeaderProps = {
  room: Room;
  currentUserId: string;
  disabled?: boolean;
  onLeave: () => void;
  onKick: (userId: string) => void;
};

export const RoomHeader = ({ room, currentUserId, disabled = false, onLeave, onKick }: RoomHeaderProps) => {
  // 강퇴는 그룹방 방장만(1:1 방·본인 불가 — DB도 같은 규칙으로 거부)
  const canKick = room.isGroup && room.ownerId === currentUserId;

  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <div className="font-semibold">{roomTitle(room, currentUserId)}</div>
      <div className="flex items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="outline">
              멤버 {room.participants.length}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-64 p-2">
            <ul className="space-y-1">
              {room.participants.map(({ user }) => (
                <li key={user.id} className="flex items-center justify-between rounded px-2 py-1 text-sm">
                  <span>
                    {displayName(user)}
                    {room.isGroup && user.id === room.ownerId && (
                      <span className="ml-1 text-xs text-blue-600">방장</span>
                    )}
                    {user.id === currentUserId && <span className="ml-1 text-xs text-gray-500">(나)</span>}
                  </span>
                  {canKick && user.id !== currentUserId && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 text-red-600"
                      disabled={disabled}
                      onClick={() => {
                        if (confirm(`${displayName(user)}님을 강퇴할까요?`)) onKick(user.id);
                      }}
                    >
                      강퇴
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
        <Button
          size="sm"
          variant="ghost"
          className="text-red-600"
          disabled={disabled}
          onClick={() => {
            if (confirm("이 채팅방에서 나갈까요?")) onLeave();
          }}
        >
          나가기
        </Button>
      </div>
    </div>
  );
};
