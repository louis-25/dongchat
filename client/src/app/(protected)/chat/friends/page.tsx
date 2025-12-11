"use client";

import Link from "next/link";
import FriendsTab from "@/components/chat/FriendsTab";
import useAuth from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export default function ChatFriendsPage() {
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex gap-2">
        <Button variant="default">친구</Button>
        <Button variant="outline" asChild>
          <Link href="/chat/rooms">채팅</Link>
        </Button>
      </div>
      <FriendsTab />
    </div>
  );
}
