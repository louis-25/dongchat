"use client";

import { useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import useRouter from "@/hooks/useRouter";
import FriendsTab from "./FriendsTab";
import ChatRoomsTab from "./ChatRoomsTab";

const ChatTab = () => {
  const { pathname, router } = useRouter();

  const activeTab = useMemo(() => {
    if (pathname?.startsWith("/chat/rooms")) return "rooms";
    return "friends";
  }, [pathname]);

  const handleTabChange = (value: string) => {
    if (value === "friends") {
      router.push("/chat/friends");
    } else {
      router.push("/chat/rooms");
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>채팅</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="friends">친구</TabsTrigger>
              <TabsTrigger value="rooms">채팅</TabsTrigger>
            </TabsList>

            <TabsContent value="friends">
              <FriendsTab />
            </TabsContent>

            <TabsContent value="rooms">
              <ChatRoomsTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ChatTab;
