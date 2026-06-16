"use client";

import { BASE_URL } from "@/config";
import { getAccessToken } from "@/lib/api-client";
import React, { createContext, useContext, useEffect } from "react";
import { io, Socket } from "socket.io-client";

// 소켓 연결/재연결 시마다 최신 액세스 토큰을 읽어 전달한다.
const readToken = (): string => {
  const token =
    getAccessToken() ||
    (typeof window !== "undefined"
      ? sessionStorage.getItem("accessToken")
      : null);
  return token ?? "";
};

interface ChatContextType {
  socket: Socket | null;
}

const ChatContext = createContext<ChatContextType>({ socket: null });

export const useChat = () => useContext(ChatContext);

export const ChatProvider = ({ children }: { children: React.ReactNode }) => {
  // Socket 초기화를 useMemo로 처리하여 effect 내부 setState 방지
  const socket = React.useMemo(() => {
    const newSocket = io(`${BASE_URL}`, {
      withCredentials: true,
      autoConnect: true, // 명시적으로 자동 연결 활성화
      // 함수형 auth: 최초 연결 및 재연결(토큰 갱신 후)마다 호출되어 최신 토큰을 전달한다.
      auth: (cb) => cb({ token: readToken() }),
    });
    return newSocket;
  }, []);

  useEffect(() => {
    // 페이지를 완전히 떠날 때만 disconnect
    // beforeunload 이벤트로 브라우저 탭/창이 닫힐 때 disconnect
    const handleBeforeUnload = () => {
      if (socket.connected) {
        socket.disconnect();
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      // cleanup에서는 disconnect하지 않음
      // 이유:
      // 1. socket.disconnect()를 호출하면 자동 재연결이 비활성화됨
      // 2. ChatProvider는 chat/layout.tsx에 있어서 채팅 페이지 간 이동 시에도 유지되어야 함
      // 3. cleanup에서 disconnect하면 채팅 탭 이동 시 소켓이 끊어지고 재연결되지 않음
      // 4. beforeunload에서만 disconnect하여 메모리 누수 방지
    };
  }, [socket]);

  return (
    <ChatContext.Provider value={{ socket }}>{children}</ChatContext.Provider>
  );
};
