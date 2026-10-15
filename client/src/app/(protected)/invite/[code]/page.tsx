"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { FRIENDS_QUERY_KEY } from "@/hooks/useFriends";
import { useRoomActions } from "@/hooks/useRoomActions";
import { getErrorMessage } from "@/lib/error-handler";
import { acceptInvite, previewInvite } from "@/services/invites";
import { displayName, type DomainError } from "@/types/domain";

export default function InvitePage() {
  const { code } = useParams<{ code: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { openDirect } = useRoomActions();
  const { data: inviter, isLoading, isError } = useQuery({ queryKey: ["invite", code], queryFn: () => previewInvite(code), retry: false });
  const accept = useMutation({
    mutationFn: () => acceptInvite(code),
    onSuccess: async ({ username, already }) => {
      await queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_KEY });
      toast.success(already ? "이미 친구예요." : "친구가 됐어요!");
      openDirect(username);
    },
    onError: (e) => {
      const err = e as unknown as DomainError;
      toast.error(getErrorMessage(err));
      if (err.code === "FRIEND_SELF_REQUEST") router.replace("/chat/friends");
    },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      {isLoading && <p className="text-muted-foreground">초대를 확인하는 중…</p>}
      {!isLoading && (isError || !inviter) && (
        <>
          <p className="font-semibold">만료되었거나 잘못된 초대 링크예요</p>
          <p className="text-sm text-muted-foreground">친구에게 새 링크를 받아 주세요.</p>
          <Button asChild variant="outline"><Link href="/chat/rooms">채팅으로</Link></Button>
        </>
      )}
      {inviter && (
        <>
          <UserAvatar name={displayName(inviter)} src={inviter.avatarUrl} className="size-20 rounded-[24px] text-2xl" />
          <div>
            <p className="text-lg font-bold">{displayName(inviter)}</p>
            <p className="text-sm text-muted-foreground">@{inviter.username}님이 친구로 초대했어요</p>
          </div>
          <Button className="h-12 w-full text-base" disabled={accept.isPending} onClick={() => accept.mutate()}>친구 되기</Button>
          <Link href="/chat/rooms" className="text-sm text-muted-foreground">나중에</Link>
        </>
      )}
    </main>
  );
}
