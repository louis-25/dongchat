import { useCallback, useEffect, useMemo, useState } from "react";
import { useChat } from "@/components/chat-provider";
import useAuth from "@/hooks/useAuth";
import useToast from "@/hooks/useToast";
import type { ChatMessage, IncomingMessage } from "../types";
import { fetchOlderMessages, normalizeMessage } from "./useMessagePagination";

type ReadState = Record<number, number>; // userId -> lastReadMessageId

/**
 * 채팅 메시지 실시간 상태 관리.
 * Design Ref: §5.3 — 읽음(FR-02/03)/수정(FR-04)/삭제(FR-05)/답장(FR-07)/무한스크롤(FR-08)
 */
export const useChatMessages = (
  selectedRoomId: number | null,
  participantIds: number[] = []
) => {
  const { socket } = useChat();
  const { user } = useAuth();
  const { error } = useToast();

  const [messagesByRoom, setMessagesByRoom] = useState<
    Record<number, ChatMessage[]>
  >({});
  // 방별 참여자 읽음 상태 (read_update로 갱신 → unreadCount 재계산)
  const [readStateByRoom, setReadStateByRoom] = useState<
    Record<number, ReadState>
  >({});
  const [hasMore, setHasMore] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);

  // Plan SC: 안 읽은 인원 수 = 발신자 제외 참여자 중 미열람 수 (Design Ref: §3.3)
  const computeUnread = useCallback(
    (msg: ChatMessage, readState: ReadState): number =>
      participantIds.filter(
        (uid) =>
          uid !== msg.senderId &&
          (readState[uid] === undefined || readState[uid] < msg.id)
      ).length,
    [participantIds]
  );

  const recomputeRoom = useCallback(
    (msgs: ChatMessage[], readState: ReadState): ChatMessage[] =>
      participantIds.length > 0
        ? msgs.map((m) => ({ ...m, unreadCount: computeUnread(m, readState) }))
        : msgs,
    [participantIds, computeUnread]
  );

  // 방 입장: 읽음 신호 전송
  useEffect(() => {
    if (!socket || !user?.id || !selectedRoomId) return;
    socket.emit("join_room", { roomId: selectedRoomId });
    setHasMore(true);
  }, [socket, user?.id, selectedRoomId]);

  // 소켓 이벤트 핸들링
  useEffect(() => {
    if (!socket) return;

    const upsert = (roomKey: number, incoming: ChatMessage) => {
      setMessagesByRoom((prev) => {
        const list = prev[roomKey] || [];
        if (list.some((m) => m.id === incoming.id)) return prev;
        return { ...prev, [roomKey]: [...list, incoming] };
      });
    };

    const handleMessage = (payload: IncomingMessage) => {
      if (payload.roomId === undefined || payload.roomId === null) return;
      const roomKey = Number(payload.roomId);
      upsert(roomKey, normalizeMessage(payload));
      // 현재 보고 있는 방의 새 메시지는 즉시 읽음 처리 (FR-02)
      if (roomKey === selectedRoomId && user?.id) {
        socket.emit("message_read", { roomId: roomKey });
      }
    };

    const handleInitial = (payload: {
      roomId: number;
      messages: IncomingMessage[];
    }) => {
      if (payload?.roomId === undefined || payload?.roomId === null) return;
      const roomKey = Number(payload.roomId);
      const formatted = (payload.messages || []).map(normalizeMessage);
      setMessagesByRoom((prev) => ({ ...prev, [roomKey]: formatted }));
    };

    const handleEdited = (payload: {
      id: number;
      roomId: number;
      content: string;
      editedAt: string;
    }) => {
      setMessagesByRoom((prev) => {
        const list = prev[payload.roomId];
        if (!list) return prev;
        return {
          ...prev,
          [payload.roomId]: list.map((m) =>
            m.id === payload.id
              ? { ...m, message: payload.content, editedAt: payload.editedAt }
              : m
          ),
        };
      });
    };

    const handleDeleted = (payload: { id: number; roomId: number }) => {
      setMessagesByRoom((prev) => {
        const list = prev[payload.roomId];
        if (!list) return prev;
        return {
          ...prev,
          [payload.roomId]: list.map((m) =>
            m.id === payload.id
              ? { ...m, message: "", deletedAt: new Date().toISOString() }
              : m
          ),
        };
      });
    };

    const handleReadUpdate = (payload: {
      roomId: number;
      userId: number;
      lastReadMessageId: number;
    }) => {
      setReadStateByRoom((prev) => {
        const roomState = { ...(prev[payload.roomId] || {}) };
        roomState[payload.userId] = payload.lastReadMessageId;
        return { ...prev, [payload.roomId]: roomState };
      });
    };

    const handleError = (payload: { code?: string; message?: string }) => {
      error(payload?.message || "요청을 처리할 수 없습니다.");
    };

    socket.on("message", handleMessage);
    socket.on("initial_messages", handleInitial);
    socket.on("message_edited", handleEdited);
    socket.on("message_deleted", handleDeleted);
    socket.on("read_update", handleReadUpdate);
    socket.on("message_error", handleError);

    return () => {
      socket.off("message", handleMessage);
      socket.off("initial_messages", handleInitial);
      socket.off("message_edited", handleEdited);
      socket.off("message_deleted", handleDeleted);
      socket.off("read_update", handleReadUpdate);
      socket.off("message_error", handleError);
    };
  }, [socket, selectedRoomId, user?.id, error]);

  const sendMessage = useCallback(
    (message: string, replyToId?: number) => {
      if (!selectedRoomId) {
        error("채팅방을 먼저 선택하세요.");
        return;
      }
      if (!socket || !user?.username) {
        error("메시지를 보낼 수 없습니다. 연결 상태를 확인하세요.");
        return;
      }
      if (!message.trim()) return;
      socket.emit("message", {
        roomId: selectedRoomId,
        content: message.trim(),
        ...(replyToId ? { replyToId } : {}),
      });
    },
    [selectedRoomId, socket, user?.username, error]
  );

  const editMessage = useCallback(
    (messageId: number, content: string) => {
      if (!socket || !content.trim()) return;
      socket.emit("message_edit", { messageId, content: content.trim() });
    },
    [socket]
  );

  const deleteMessage = useCallback(
    (messageId: number) => {
      if (!socket) return;
      socket.emit("message_delete", { messageId });
    },
    [socket]
  );

  // 과거 메시지 로드 (위로 스크롤, FR-08)
  const loadOlder = useCallback(async () => {
    if (!selectedRoomId || loadingOlder || !hasMore) return;
    const current = messagesByRoom[selectedRoomId] || [];
    const oldestId = current.length > 0 ? current[0].id : undefined;
    setLoadingOlder(true);
    try {
      const older = await fetchOlderMessages(selectedRoomId, oldestId, 30);
      if (older.length < 30) setHasMore(false);
      if (older.length > 0) {
        setMessagesByRoom((prev) => {
          const list = prev[selectedRoomId] || [];
          const existing = new Set(list.map((m) => m.id));
          const merged = [
            ...older.filter((m) => !existing.has(m.id)),
            ...list,
          ];
          return { ...prev, [selectedRoomId]: merged };
        });
      }
    } catch {
      error("이전 메시지를 불러오지 못했습니다.");
    } finally {
      setLoadingOlder(false);
    }
  }, [selectedRoomId, loadingOlder, hasMore, messagesByRoom, error]);

  const currentMessages = useMemo(() => {
    if (selectedRoomId === null) return [];
    const msgs = messagesByRoom[selectedRoomId] || [];
    const readState = readStateByRoom[selectedRoomId] || {};
    return recomputeRoom(msgs, readState);
  }, [selectedRoomId, messagesByRoom, readStateByRoom, recomputeRoom]);

  return {
    currentMessages,
    sendMessage,
    editMessage,
    deleteMessage,
    loadOlder,
    hasMore,
    loadingOlder,
    // ponytail: 사용자 id가 uuid(string)로 바뀌었다. 채팅은 4단계에서 재작성하므로 그때까지 본인 메시지 판별 비활성.
    currentUserId: null as number | null,
  };
};
