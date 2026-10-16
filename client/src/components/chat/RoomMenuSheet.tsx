"use client";

import { Sheet } from "@/components/ui/sheet";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { displayName, type Participant, type Room } from "@/types/domain";

type Props = {
  open: boolean;
  onClose: () => void;
  room: Room;
  participants: Participant[];
  me: string;
  disabled: boolean;
  onLeave: () => void;
  onKick: (userId: string) => void;
  muted: boolean;
  muting: boolean;
  onToggleMute: () => void;
};

// 멤버 목록·내보내기(그룹방 방장만, DB도 같은 규칙)·나가기
export function RoomMenuSheet({ open, onClose, room, participants, me, disabled, onLeave, onKick, muted, muting, onToggleMute }: Props) {
  const canKick = room.isGroup && room.ownerId === me;
  return (
    <Sheet open={open} onClose={onClose} title={`대화 상대 ${participants.length}`}>
      <ul className="-mx-4 max-h-[50dvh] overflow-y-auto">
        {participants.map(({ user }) => (
          <li key={user.id} className="flex items-center gap-3 px-4 py-2">
            <UserAvatar name={displayName(user)} src={user.avatarUrl} className="size-10" />
            <span className="min-w-0 flex-1 truncate">
              {displayName(user)}
              {user.id === me && <span className="ml-1 text-xs text-muted-foreground">(나)</span>}
              {room.isGroup && user.id === room.ownerId && <span className="ml-1 text-xs text-primary">방장</span>}
            </span>
            {canKick && user.id !== me && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={disabled}
                onClick={() => confirm(`${displayName(user)}님을 내보낼까요?`) && onKick(user.id)}
              >
                내보내기
              </Button>
            )}
          </li>
        ))}
      </ul>
      <Button variant="outline" className="mt-4 h-12 w-full text-base" loading={muting} onClick={onToggleMute}>
        {muted ? <Bell className="size-5" /> : <BellOff className="size-5" />}
        {muted ? "알림 켜기" : "알림 끄기"}
      </Button>
      <Button
        variant="outline"
        className="mt-2 h-12 w-full text-base text-destructive"
        disabled={disabled}
        onClick={() => confirm("이 채팅방에서 나갈까요?") && onLeave()}
      >
        채팅방 나가기
      </Button>
    </Sheet>
  );
}
