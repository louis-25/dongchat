"use client";
import { ChatProvider } from "@/components/chat-provider";

// Realtime 허브: 채팅(참여 방)과 관리자 방 열람(watchRoom)이 공유. 강제 로그아웃 통지도 여기서 받는다.
const ProtectedLayout = ({ children }: { children: React.ReactNode }) => <ChatProvider>{children}</ChatProvider>;

export default ProtectedLayout;
