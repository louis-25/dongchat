"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ScreenHeader } from "@/components/chat/ScreenHeader";
import { MessageList } from "@/components/chat/MessageList";
import { Composer } from "@/components/chat/Composer";
import { MessageActionsSheet } from "@/components/chat/MessageActionsSheet";
import { ProfileSheet } from "@/components/chat/ProfileSheet";
import { Button } from "@/components/ui/button";
import { RoomMenuSheet } from "@/components/chat/RoomMenuSheet";
import { InviteMembersSheet } from "@/components/chat/InviteMembersSheet";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useRecentReactions } from "@/hooks/useRecentReactions";
import { quickReactions } from "@/lib/reactions";
import { useRooms } from "@/hooks/useRooms";
import { useRoomActions } from "@/hooks/useRoomActions";
import { ROOM_SUMMARIES_QUERY_KEY, useRoomSummaries } from "@/hooks/useRoomSummaries";
import { getErrorMessage } from "@/lib/error-handler";
import { setRoomMuted } from "@/services/rooms";
import type { MessageView } from "@/lib/chat-state";
import { consumeInAppNav } from "@/lib/nav";
import { roomTitle, type DomainError } from "@/types/domain";

// ➕를 눌렀을 때만 불러온다(frimousse)
const EmojiPickerSheet = dynamic(() => import("@/components/chat/EmojiPickerSheet"), { ssr: false });

export default function RoomPage() {
  const params = useParams<{ id: string }>();
  const roomId = Number(params.id);
  const router = useRouter();
  const { user } = useAuth();
  const { data: rooms, isLoading } = useRooms();
  const room = rooms?.find((r) => r.id === roomId) ?? null;
  const { setViewingRoom } = useChat();
  const { leave, kick, openDirect, invite, isInviting, isPending } = useRoomActions();
  const { messages, sendMessage, sendImages, react, editMessage, deleteMessage, loadOlder, hasMore, loadingOlder, participants } =
    useChatMessages(room);
  const [recentReactions, rememberReaction] = useRecentReactions();
  // 반응을 달 때(취소 제외) 최근 이모지로 기억한다
  const reactTo = (id: number, reaction: string | null) => {
    if (reaction) rememberReaction(reaction);
    void react(id, reaction);
  };

  const [replyTarget, setReplyTarget] = useState<MessageView | null>(null);
  const [editTarget, setEditTarget] = useState<MessageView | null>(null);
  const [actionTarget, setActionTarget] = useState<MessageView | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<MessageView | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { data: summaries } = useRoomSummaries();
  const muted = summaries?.find((s) => s.id === roomId)?.muted ?? false;
  const toggleMute = useMutation({
    mutationFn: (next: boolean) => setRoomMuted(roomId, next),
    onSuccess: async (_, next) => {
      await queryClient.invalidateQueries({ queryKey: ROOM_SUMMARIES_QUERY_KEY });
      toast.success(next ? "이 방 알림을 껐어요." : "이 방 알림을 켰어요.");
    },
    onError: (e) => toast.error(getErrorMessage(e as unknown as DomainError)),
  });
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

  // 나간 사람은 참여자 목록에 없어 열리지 않는다
  const profile = participants.find((p) => p.user.id === profileId)?.user ?? null;
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
        onOpenActions={setActionTarget}
        onOpenProfile={setProfileId}
        me={user.id}
        onReact={reactTo}
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
        onSendImages={(files) => {
          void sendImages(files, replyTarget?.id);
          setReplyTarget(null);
        }}
        onSendSticker={(id) => {
          void sendMessage("", replyTarget?.id, id);
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
        me={user.id}
        onReact={(v, reaction) => reactTo(v.id, reaction)}
        quickReactions={quickReactions(recentReactions)}
        onMoreReactions={setPickerTarget}
        onDelete={(v) => confirm("메시지를 삭제할까요?") && void deleteMessage(v.id, v.imagePath)}
      />
      <ProfileSheet profile={profile} onClose={() => setProfileId(null)}>
        {profile && room.isGroup && (
          <Button className="h-12 w-full text-base" loading={isPending} onClick={() => {
              setProfileId(null); // 같은 화면이 새 방으로 바뀌어도 시트가 남지 않게
              openDirect(profile.username);
            }}>
            1:1 채팅
          </Button>
        )}
      </ProfileSheet>
      {pickerTarget && (
        <EmojiPickerSheet
          open
          onClose={() => setPickerTarget(null)}
          onSelect={(emoji) => reactTo(pickerTarget.id, emoji)}
        />
      )}
      <InviteMembersSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        memberIds={participants.map((p) => p.user.id)}
        onInvite={(usernames) => invite(room.id, usernames)}
        pending={isInviting}
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
        muted={muted}
        muting={toggleMute.isPending}
        onToggleMute={() => toggleMute.mutate(!muted)}
        onInvite={() => {
          setMenuOpen(false);
          setInviteOpen(true);
        }}
      />
    </>
  );
}
