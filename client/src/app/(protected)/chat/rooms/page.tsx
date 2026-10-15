"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/chat/ScreenHeader";
import { RoomRow } from "@/components/chat/RoomRow";
import { CreateGroupSheet } from "@/components/chat/CreateGroupSheet";
import useAuth from "@/hooks/useAuth";
import { useRooms } from "@/hooks/useRooms";
import { useRoomActions } from "@/hooks/useRoomActions";
import { useRoomSummaries } from "@/hooks/useRoomSummaries";
import { roomIdFromSearch, roomPath } from "@/lib/push-url";

export default function RoomsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { data: summaries, isLoading, isError, refetch } = useRoomSummaries();
  const { data: rooms = [] } = useRooms();
  const { create, isPending } = useRoomActions();
  const [creating, setCreating] = useState(false);

  // 예전 알림 주소(/chat/rooms?room=<id>)는 새 주소로
  useEffect(() => {
    const id = roomIdFromSearch(window.location.search);
    if (id !== null) router.replace(roomPath(id));
  }, [router]);

  return (
    <>
      <ScreenHeader
        title="채팅"
        actions={
          <button type="button" onClick={() => setCreating(true)} aria-label="그룹 채팅 만들기" className="flex size-10 items-center justify-center rounded-full hover:bg-muted">
            <Plus className="size-6" />
          </button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading && <p className="p-6 text-center text-sm text-muted-foreground">불러오는 중…</p>}
        {isError && (
          <div className="flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">채팅 목록을 불러오지 못했어요.</p>
            <Button variant="outline" onClick={() => void refetch()}>다시 시도</Button>
          </div>
        )}
        {summaries && summaries.length === 0 && (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="font-medium">아직 대화가 없어요</p>
            <p className="text-sm text-muted-foreground">친구를 눌러 바로 대화를 시작할 수 있어요.</p>
            <Button asChild><Link href="/chat/friends">친구 목록 보기</Link></Button>
          </div>
        )}
        {summaries && summaries.length > 0 && user && (
          <ul className="py-1">
            {summaries.map((s) => (
              <RoomRow key={s.id} summary={s} room={rooms.find((r) => r.id === s.id)} me={user.id} />
            ))}
          </ul>
        )}
      </div>
      <CreateGroupSheet
        open={creating}
        onClose={() => setCreating(false)}
        pending={isPending}
        onCreate={({ name, usernames }) => {
          setCreating(false);
          create({ name, isGroup: true, usernames });
        }}
      />
    </>
  );
}
