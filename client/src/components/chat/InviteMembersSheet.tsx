"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { FriendPicker } from "@/components/chat/FriendPicker";
import { useFriendsList } from "@/hooks/useFriends";

type Props = {
  open: boolean;
  onClose: () => void;
  memberIds: string[]; // 이미 방에 있는 사람은 목록에서 뺀다
  onInvite: (usernames: string[]) => void;
  pending: boolean;
};

export function InviteMembersSheet({ open, onClose, memberIds, onInvite, pending }: Props) {
  const { data: friends = [] } = useFriendsList();
  const [picked, setPicked] = useState<string[]>([]);
  const candidates = friends.filter((f) => !memberIds.includes(f.user.id));
  const toggle = (u: string) => setPicked((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]));
  const close = () => {
    setPicked([]);
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title="친구 초대">
      <FriendPicker friends={candidates} picked={picked} onToggle={toggle} empty="초대할 수 있는 친구가 없어요." />
      <Button
        className="mt-4 h-12 w-full text-base"
        disabled={picked.length === 0}
        loading={pending}
        onClick={() => {
          onInvite(picked);
          close();
        }}
      >
        {picked.length === 0 ? "초대할 친구를 골라 주세요" : `초대하기 (${picked.length}명)`}
      </Button>
    </Sheet>
  );
}
