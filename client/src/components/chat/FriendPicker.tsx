"use client";

import { Check } from "lucide-react";
import { UserAvatar } from "@/components/chat/UserAvatar";
import { cn } from "@/lib/utils";
import { displayName, type Friend } from "@/types/domain";

// 친구 여러 명 고르기(그룹 만들기·단체방 초대 공용). 값은 username.
export function FriendPicker({ friends, picked, onToggle, empty }: { friends: Friend[]; picked: string[]; onToggle: (username: string) => void; empty: string }) {
  if (friends.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="-mx-4 max-h-[45dvh] overflow-y-auto">
      {friends.map((f) => {
        const on = picked.includes(f.user.username);
        return (
          <li key={f.id}>
            <button type="button" onClick={() => onToggle(f.user.username)} aria-pressed={on} className="flex w-full items-center gap-3 px-4 py-2 text-left pressable-row">
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
  );
}
