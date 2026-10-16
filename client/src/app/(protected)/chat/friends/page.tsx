"use client";

import { useState } from "react";
import Link from "next/link";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScreenHeader } from "@/components/chat/ScreenHeader";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { AddFriendSheet } from "@/components/chat/AddFriendSheet";
import { InviteButton } from "@/components/chat/InviteButton";
import { ProfileSheet } from "@/components/chat/ProfileSheet";
import useAuth from "@/hooks/useAuth";
import { useFriendsList, usePendingFriends } from "@/hooks/useFriends";
import { useFriendsActions } from "@/hooks/useFriendsActions";
import { useRoomActions } from "@/hooks/useRoomActions";
import { displayName } from "@/types/domain";

export default function FriendsPage() {
  const { user } = useAuth();
  const { data: friends = [], isLoading } = useFriendsList();
  const { data: pending = [] } = usePendingFriends();
  const { sendFriendRequest, respondFriendRequest, isRequestPending, isResponding } = useFriendsActions();
  const { openDirect, isPending: opening } = useRoomActions();
  const [adding, setAdding] = useState(false);
  // 처리 중 표시는 실제로 누른 버튼·줄에만(진행 여부는 mutation, 대상은 마지막으로 누른 것)
  const [lastResponse, setLastResponse] = useState<string | null>(null);
  // 보고 있는 프로필(id만 들고 최신 목록에서 찾는다 → 열려 있는 동안 바뀐 사진·상태 메시지도 반영)
  const [viewing, setViewing] = useState<string | null>(null);
  const viewed = viewing === user?.id ? user : (friends.find((f) => f.user.id === viewing)?.user ?? null);
  const respond = (id: number, action: "ACCEPT" | "BLOCK") => {
    setLastResponse(`${id}:${action}`);
    respondFriendRequest(id, action);
  };
  const section = "px-4 pb-1 pt-4 text-xs font-medium text-muted-foreground";

  return (
    <>
      <ScreenHeader
        title="친구"
        actions={
          <>
            <InviteButton variant="icon" />
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label="친구 추가"
              className="flex size-10 items-center justify-center rounded-full pressable hover:bg-muted active:bg-muted"
            >
              <UserPlus className="size-6" />
            </button>
          </>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {user && (
          <button
            type="button"
            onClick={() => setViewing(user.id)}
            className="pressable mx-4 mt-3 flex w-[calc(100%-2rem)] items-center gap-3 rounded-2xl bg-muted p-3 text-left"
          >
            <UserAvatar name={displayName(user)} src={user.avatarUrl} className="size-12" />
            <div className="min-w-0">
              <div className="truncate font-semibold">{displayName(user)}</div>
              {user.statusMessage && <div className="truncate text-sm text-muted-foreground">{user.statusMessage}</div>}
            </div>
          </button>
        )}
        <div className="mx-4 mt-2">
          <InviteButton />
        </div>

        {pending.length > 0 && (
          <>
            <h2 className={section}>받은 요청 {pending.length}</h2>
            <ul>
              {pending.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                  <UserAvatar name={displayName(p.requester)} src={p.requester.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{displayName(p.requester)}</div>
                  </div>
                  <Button
                    size="sm"
                    disabled={isResponding}
                    loading={isResponding && lastResponse === `${p.id}:ACCEPT`}
                    onClick={() => respond(p.id, "ACCEPT")}
                  >
                    수락
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isResponding}
                    loading={isResponding && lastResponse === `${p.id}:BLOCK`}
                    onClick={() => respond(p.id, "BLOCK")}
                  >
                    차단
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}

        <h2 className={section}>친구 {friends.length}</h2>
        {!isLoading && friends.length === 0 && (
          <p className="px-6 py-8 text-center text-sm text-muted-foreground">
            아직 친구가 없어요. 초대 링크를 보내거나 오른쪽 위 ＋로 아이디를 검색해 보세요.
          </p>
        )}
        <ul>
          {friends.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setViewing(f.user.id)}
                className="flex w-full items-center gap-3 px-4 py-2 text-left pressable-row"
              >
                <UserAvatar name={displayName(f.user)} src={f.user.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{displayName(f.user)}</div>
                  {f.user.statusMessage && <div className="truncate text-xs text-muted-foreground">{f.user.statusMessage}</div>}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <ProfileSheet profile={viewed} onClose={() => setViewing(null)}>
        {viewed && viewed.id === user?.id ? (
          <Button asChild variant="secondary" className="h-12 w-full text-base">
            <Link href="/chat/settings">프로필 편집</Link>
          </Button>
        ) : (
          viewed && (
            <Button className="h-12 w-full text-base" loading={opening} onClick={() => openDirect(viewed.username)}>
              1:1 채팅
            </Button>
          )
        )}
      </ProfileSheet>
      <AddFriendSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSubmit={sendFriendRequest}
        pending={isRequestPending}
      />
    </>
  );
}
