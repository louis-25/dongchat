"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FriendPicker } from "@/components/chat/FriendPicker";
import { useFriendsList } from "@/hooks/useFriends";

type Props = {
  open: boolean;
  onClose: () => void;
  onCreate: (input: { name?: string; usernames: string[] }) => void;
  pending: boolean;
};

export function CreateGroupSheet({ open, onClose, onCreate, pending }: Props) {
  const { data: friends = [] } = useFriendsList();
  const [picked, setPicked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const toggle = (u: string) => setPicked((p) => (p.includes(u) ? p.filter((x) => x !== u) : [...p, u]));
  const close = () => {
    setPicked([]);
    setName("");
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title="그룹 채팅 만들기">
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="방 이름(선택)" maxLength={50} className="mb-3" />
      <FriendPicker friends={friends} picked={picked} onToggle={toggle} empty="먼저 친구를 추가해 주세요." />
      <Button
        className="mt-4 h-12 w-full text-base"
        disabled={picked.length === 0}
        loading={pending}
        onClick={() => onCreate({ name: name.trim() || undefined, usernames: picked })}
      >
        {picked.length === 0 ? "함께할 친구를 골라 주세요" : `만들기 (${picked.length + 1}명)`}
      </Button>
    </Sheet>
  );
}
