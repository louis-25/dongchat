"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/chat/ScreenHeader";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { MessageActionsSheet } from "@/components/chat/MessageActionsSheet";
import { RoomMenuSheet } from "@/components/chat/RoomMenuSheet";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useRooms } from "@/hooks/useRooms";
import { useRoomActions } from "@/hooks/useRoomActions";
import type { MessageView } from "@/lib/chat-state";
import { consumeInAppNav } from "@/lib/nav";
import { roomTitle } from "@/types/domain";

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = Number(params.id);
  const router = useRouter();
  const { user } = useAuth();
  const { data: rooms, isLoading } = useRooms();
  const room = rooms?.find((r) => r.id === roomId) ?? null;
  const { setViewingRoom } = useChat();
  const { leave, kick, isPending } = useRoomActions();
  const { messages, sendMessage, editMessage, deleteMessage, loadOlder, hasMore, loadingOlder, participants } = useChatMessages(room);

  const [replyTarget, setReplyTarget] = useState<MessageView | null>(null);
  const [editTarget, setEditTarget] = useState<MessageView | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageView | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const cameFromApp = useRef<boolean | null>(null);
  const leaving = useRef(false);

  useEffect(() => {
    cameFromApp.current ??= consumeInAppNav();
  }, []);

  // 잘못된 주소·남의 방·강퇴되어 목록에서 사라진 방 → 목록으로(직접 나간 경우는 useRoomActions가 이동)
  useEffect(() => {
    if (isLoading || !rooms || room || leaving.current) return;
    toast.error("참여 중인 채팅방이 아니에요.", { id: "room-missing" });
    router.replace("/chat/rooms");
  }, [isLoading, rooms, room, router]);

  // 인앱 알림·목록 안 읽은 수가 "지금 보고 있는 방"을 알 수 있도록
  useEffect(() => {
    setViewingRoom(room ? roomId : null);
    return () => setViewingRoom(null);
  }, [room, roomId, setViewingRoom]);

  if (!room || !user) return <ScreenHeader title="" onBack={() => router.replace("/chat/rooms")} />;

  const back = () => (cameFromApp.current ? router.back() : router.replace("/chat/rooms"));
  const clearTargets = () => {
    setReplyTarget(null);
    setEditTarget(null);
  };

  return (
    <>
      <ScreenHeader
        title={roomTitle(room, user.id)}
        subtitle={room.isGroup ? String(participants.length) : undefined}
        onBack={back}
        actions={
          <button type="button" onClick={() => setMenuOpen(true)} aria-label="채팅방 메뉴" className="flex size-10 items-center justify-center rounded-full pressable hover:bg-muted active:bg-muted">
            <Menu className="size-6" />
          </button>
        }
      />
      <MessageList
        key={room.id}
        messages={messages}
        isGroup={room.isGroup}
        onOpenActions={setActionTarget}
        onLoadOlder={loadOlder}
        hasMore={hasMore}
        loadingOlder={loadingOlder}
      />
      <Composer
        key={editTarget ? `edit-${editTarget.id}` : "new"}
        replyTarget={replyTarget}
        editTarget={editTarget}
        onCancel={clearTargets}
        onSend={(content) => {
          void sendMessage(content, replyTarget?.id);
          setReplyTarget(null);
        }}
        onEdit={(id, content) => {
          void editMessage(id, content);
          setEditTarget(null);
        }}
      />
      <MessageActionsSheet
        target={actionTarget}
        onClose={() => setActionTarget(null)}
        onReply={(v) => {
          setEditTarget(null);
          setReplyTarget(v);
        }}
        onCopy={(v) =>
          void navigator.clipboard.writeText(v.content).then(
            () => toast.success("복사했어요."),
            () => toast.error("복사하지 못했어요."),
          )
        }
        onEdit={(v) => {
          setReplyTarget(null);
          setEditTarget(v);
        }}
        onDelete={(v) => confirm("메시지를 삭제할까요?") && void deleteMessage(v.id)}
      />
      <RoomMenuSheet
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        room={room}
        participants={participants}
        me={user.id}
        disabled={isPending}
        onLeave={() => {
          leaving.current = true;
          setMenuOpen(false);
          leave(room.id, { onError: () => (leaving.current = false) });
        }}
        onKick={(userId) => kick(room.id, userId)}
      />
    </>
  );
}
