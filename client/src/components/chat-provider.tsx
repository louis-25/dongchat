"use client";

import { BASE_URL } from "@/config";
import React, { createContext, useContext, useEffect } from "react";
import { io, Socket } from "socket.io-client";

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
    });
    return newSocket;
  }, []);

  useEffect(() => {
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  return (
    <ChatContext.Provider value={{ socket }}>{children}</ChatContext.Provider>
  );
};
