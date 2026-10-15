"use client";

import { useState } from "react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const USERNAME = /^[a-zA-Z0-9_]{3,20}$/;

export function AddFriendSheet({ open, onClose, onSubmit, pending }: { open: boolean; onClose: () => void; onSubmit: (username: string) => void; pending: boolean }) {
  const [value, setValue] = useState("");
  const valid = USERNAME.test(value.trim());
  const close = () => {
    setValue("");
    onClose();
  };
  return (
    <Sheet open={open} onClose={close} title="친구 추가">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!valid) return;
          onSubmit(value.trim());
          close();
        }}
      >
        <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="친구 아이디" autoCapitalize="none" autoCorrect="off" aria-label="친구 아이디" />
        <p className="mt-2 text-xs text-muted-foreground">영문·숫자·밑줄 3~20자. 상대가 수락하면 친구가 돼요.</p>
        <Button type="submit" className="mt-4 h-12 w-full text-base" disabled={!valid || pending}>요청 보내기</Button>
      </form>
    </Sheet>
  );
}
