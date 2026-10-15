"use client";

import { useMutation } from "@tanstack/react-query";
import { Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/error-handler";
import { inviteUrl, shareOrCopy } from "@/lib/share";
import { getMyInviteCode } from "@/services/invites";
import type { DomainError } from "@/types/domain";

// 친구 초대: 폰은 공유 창, PC는 링크 복사. variant="icon"은 상단 바용.
export function InviteButton({ variant = "full" }: { variant?: "full" | "icon" }) {
  const invite = useMutation({
    mutationFn: async () => {
      const code = await getMyInviteCode();
      const url = inviteUrl(window.location.origin, code);
      return { url, result: await shareOrCopy({
        title: "dongchat 친구 초대",
        text: "dongchat에서 같이 대화해요! 링크를 누르면 바로 친구가 돼요.",
        url,
      }) };
    },
    onSuccess: ({ url, result }) => {
      if (result === "copied") toast.success("초대 링크를 복사했어요. 친구에게 보내 주세요.");
      // 공유·복사 모두 불가: 링크를 직접 보여 줘서 길게 눌러 복사하게 한다
      if (result === "unavailable") toast.info(url, { description: "링크를 길게 눌러 복사해 친구에게 보내 주세요.", duration: 20_000 });
    },
    onError: (e) => toast.error(getErrorMessage(e as unknown as DomainError)),
  });
  if (variant === "icon")
    return (
      <button type="button" onClick={() => invite.mutate()} disabled={invite.isPending} aria-label="친구 초대" className="flex size-10 items-center justify-center rounded-full hover:bg-muted">
        <Share2 className="size-5" />
      </button>
    );
  return (
    <Button className="h-11 w-full" onClick={() => invite.mutate()} disabled={invite.isPending}>
      <Share2 className="size-4" /> 친구 초대 링크 보내기
    </Button>
  );
}
