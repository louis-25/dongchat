"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { useFriendsList } from "@/hooks/useFriends";
import { cn } from "@/lib/utils";
import { displayName } from "@/types/domain";

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
      {friends.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">먼저 친구를 추가해 주세요.</p>
      ) : (
        <ul className="-mx-4 max-h-[45dvh] overflow-y-auto">
          {friends.map((f) => {
            const on = picked.includes(f.user.username);
            return (
              <li key={f.id}>
                <button type="button" onClick={() => toggle(f.user.username)} aria-pressed={on} className="flex w-full items-center gap-3 px-4 py-2 text-left active:bg-muted">
                  <UserAvatar name={displayName(f.user)} src={f.user.avatarUrl} className="size-10" />
                  <span className="flex-1 truncate">{displayName(f.user)}</span>
                  <span className={cn("flex size-6 items-center justify-center rounded-full border", on && "border-primary bg-primary text-primary-foreground")}>
                    {on && <Check className="size-4" />}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Button
        className="mt-4 h-12 w-full text-base"
        disabled={picked.length === 0 || pending}
        onClick={() => onCreate({ name: name.trim() || undefined, usernames: picked })}
      >
        {picked.length === 0 ? "함께할 친구를 골라 주세요" : `만들기 (${picked.length + 1}명)`}
      </Button>
    </Sheet>
  );
}
