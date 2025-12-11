"use client";

import Link from "next/link";
import ChatRoomsTab from "@/components/chat/ChatRoomsTab";
import useAuth from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function ChatRoomsPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex gap-2">
        <Button variant="outline" asChild>
          <Link href="/chat/friends">친구</Link>
        </Button>
        <Button variant="default">채팅</Button>
      </div>
      <ChatRoomsTab />
    </div>
  );
}
