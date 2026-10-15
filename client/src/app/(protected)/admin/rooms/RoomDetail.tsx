"use client";

import { useEffect, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import useToast from "@/hooks/useToast";
import { getErrorMessage } from "@/lib/error-handler";
import { kickMember } from "@/services/rooms";
import { displayName, type AdminRoom, type Room } from "@/types/domain";
import { MessageList } from "@/components/chat/MessageList";
import { useChatMessages } from "@/hooks/useChatMessages";

export const ADMIN_ROOMS_QUERY_KEY = ["admin", "rooms"] as const;
const noop = () => {};

// 관리자 방 열람: 멤버(그룹방 강퇴) + 메시지 읽기 전용 실시간. setViewingRoom을 호출하지 않으므로 mark_read 없음(§8.3).
export const RoomDetail = ({ room }: { room: AdminRoom }) => {
  const { user } = useAuth();
  const { watchRoom, onRoomEvent } = useChat();
  const { success, error } = useToast();
  const queryClient = useQueryClient();

  // 참여하지 않은 방도 Realtime으로 받는다
  useEffect(() => watchRoom(room.id), [room.id, watchRoom]);

  // 다른 사람의 퇴장·강퇴로 멤버 수가 바뀌거나 방이 삭제되면 목록을 갱신한다(삭제되면 선택이 풀린다).
  useEffect(
    () =>
      onRoomEvent((e) => {
        if (e.roomId === room.id && e.type === "member_removed") {
          void queryClient.invalidateQueries({ queryKey: ADMIN_ROOMS_QUERY_KEY });
        }
      }),
    [room.id, onRoomEvent, queryClient],
  );

  const chatRoom = useMemo<Room>(
    () => ({ id: room.id, name: room.name, isGroup: room.isGroup, ownerId: room.createdBy, participants: [] }),
    [room.id, room.name, room.isGroup, room.createdBy],
  );
  const { messages, loadOlder, hasMore, loadingOlder, participants } = useChatMessages(chatRoom);

  const kick = useMutation({
    mutationFn: (userId: string) => kickMember(room.id, userId),
    onSuccess: () => {
      success("멤버를 강퇴했습니다.");
      void queryClient.invalidateQueries({ queryKey: ADMIN_ROOMS_QUERY_KEY });
    },
    onError: (e) => error(`강퇴 실패: ${getErrorMessage(e)}`),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <div className="font-semibold">
          {room.name ?? `${room.isGroup ? "그룹방" : "1:1 방"} #${room.id}`}
          <span className="ml-2 text-xs font-normal text-gray-500">읽기 전용</span>
        </div>
        <ul className="mt-2 flex flex-wrap gap-2">
          {participants.map(({ user: member }) => (
            <li key={member.id} className="flex items-center gap-1 rounded border px-2 py-1 text-sm">
              {displayName(member)}
              {member.id === room.createdBy && <span className="text-xs text-blue-600">방장</span>}
              {room.isGroup && member.id !== user?.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 px-1 text-red-600"
                  disabled={kick.isPending}
                  onClick={() => {
                    if (confirm(`${displayName(member)}님을 강퇴할까요?`)) kick.mutate(member.id);
                  }}
                >
                  강퇴
                </Button>
              )}
            </li>
          ))}
          {participants.length === 0 && <li className="text-sm text-gray-500">멤버를 불러오는 중…</li>}
        </ul>
      </div>
      <MessageList
        key={room.id}
        messages={messages}
        hasRoom
        readOnly
        onReply={noop}
        onEdit={noop}
        onDelete={noop}
        onLoadOlder={loadOlder}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
      />
    </div>
  );
};
