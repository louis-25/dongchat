import Link from "next/link";
import FriendsTab from "@/app/(protected)/chat/[menu]/_components/Friends";
import ChatRoomsTab from "@/app/(protected)/chat/[menu]/_components/ChatRooms";
import { Button } from "@/components/ui/button";

interface PageProps {
  params: Promise<{ menu: string }>;
}

export default async function ChatMenuPage({ params }: PageProps) {
  const { menu } = await params;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <div className="flex gap-2">
        <Button variant={menu === "friends" ? "default" : "outline"} asChild>
          <Link href="/chat/friends">친구</Link>
        </Button>
        <Button variant={menu === "rooms" ? "default" : "outline"} asChild>
          <Link href="/chat/rooms">채팅</Link>
        </Button>
      </div>

      {menu === "friends" && <FriendsTab />}
      {menu === "rooms" && <ChatRoomsTab />}
    </div>
  );
}
