import { useCallback, useEffect, useMemo, useState } from "react";
import { useChat } from "@/components/chat-provider";
import { chunkFiles } from "@/lib/album";
import useAuth from "@/hooks/useAuth";
import useToast from "@/hooks/useToast";
import { getErrorMessage } from "@/lib/error-handler";
import {
  applyDeleted,
  applyEdited,
  applyReaction,
  bumpRead,
  mergeMessages,
  mergeSnapshot,
  seedReadState,
  withoutRemoved,
  withProfile,
  readmit,
  toViews,
  type ReadState,
} from "@/lib/chat-state";
import { deleteMessage, editMessage, fetchMessages, markRead, sendImages as uploadImages, sendMessage, sendSticker, setReaction } from "@/services/messages";
import { listParticipants } from "@/services/rooms";
import {
  MESSAGE_PAGE_SIZE,
  type ChatMessage,
  type DomainError,
  type MessagePage,
  type Participant,
  type Profile,
  type Room,
} from "@/types/domain";

type RoomState = {
  messages: ChatMessage[];
  replyTargets: ChatMessage[];
  profiles: Record<string, Profile>;
  participants: Participant[] | null; // 스냅샷 시점 참여자(안 읽은 수의 기준). null = 스냅샷 전
  removed: string[]; // 이 방에서 나간 사용자(늦게 온 스냅샷이 되살리지 않도록)
  readState: ReadState; // 스냅샷 전에 온 read_update도 버리지 않고 모은다
  hasMore: boolean;
};
const EMPTY: RoomState = {
  messages: [],
  replyTargets: [],
  profiles: {},
  participants: null,
  removed: [],
  readState: {},
  hasMore: false,
};

const withProfiles = (prev: Record<string, Profile>, list: Profile[]) =>
  list.reduce((acc, p) => ({ ...acc, [p.id]: p }), prev);

const message = (e: unknown) => getErrorMessage(e as DomainError);

// 현재 방의 메시지·읽음 상태. 방별로 보관해 방을 오가도 다시 받기 전까지 이전 내용을 보여 준다.
export const useChatMessages = (room: Room | null) => {
  const { user } = useAuth();
  const { onRoomEvent, isViewing } = useChat();
  const { error } = useToast();
  const roomId = room?.id ?? null;

  // 읽음 처리는 그 방이 지금 열려 있고 탭이 보일 때만(§8.3). 늦게 도착한 이전 방의 응답·강퇴 직후는 건너뛴다.
  // 실패(권한 상실 등)는 방 목록 갱신이 처리하므로 무시한다.
  const markReadIfOpen = useCallback(
    (id: number) => {
      if (isViewing(id) && document.visibilityState === "visible") markRead(id).catch(() => undefined);
    },
    [isViewing],
  );
  const [byRoom, setByRoom] = useState<Record<number, RoomState>>({});
  const [loadingOlder, setLoadingOlder] = useState(false);

  const update = useCallback(
    (id: number, fn: (s: RoomState) => RoomState) => setByRoom((prev) => ({ ...prev, [id]: fn(prev[id] ?? EMPTY) })),
    [],
  );

  // 스냅샷: 최신 30개 + 참여자 읽음 위치를 받아 병합한다. 방 입장과 채널 (재)구독마다 호출.
  const sync = useCallback(
    async (id: number) => {
      try {
        const [page, participants] = await Promise.all([fetchMessages(id), listParticipants(id)]);
        update(id, (s) => {
          const { messages, replaced } = mergeSnapshot(s.messages, page.messages);
          return {
            messages,
            replyTargets: mergeMessages(s.replyTargets, page.replyTargets),
            profiles: withProfiles(s.profiles, [...page.profiles, ...participants.map((p) => p.user)]),
            participants: withoutRemoved(participants, s.removed),
            removed: s.removed,
            readState: seedReadState(participants, s.readState),
            // 첫 스냅샷(그 전에 Realtime 메시지가 먼저 왔어도)이나 교체면 페이지 크기로 판단
            hasMore: s.participants === null || replaced ? page.messages.length === MESSAGE_PAGE_SIZE : s.hasMore,
          };
        });
        markReadIfOpen(id);
      } catch (e) {
        error(`메시지를 불러오지 못했습니다: ${message(e)}`);
      }
    },
    [update, error, markReadIfOpen],
  );

  // 입장 시 스냅샷(채널이 이미 SUBSCRIBED여도 받도록). setState는 응답 후 비동기로 일어난다.
  useEffect(() => {
    if (roomId !== null) void sync(roomId);
  }, [roomId, sync]);

  // 이 방의 Realtime 이벤트
  useEffect(() => {
    if (roomId === null) return;
    return onRoomEvent((e) => {
      if (e.roomId !== roomId) return;
      switch (e.type) {
        case "subscribed":
          void sync(roomId);
          break;
        case "message":
          update(roomId, (s) => ({ ...s, messages: mergeMessages(s.messages, [e.message]) }));
          if (e.message.senderId !== user?.id) markReadIfOpen(roomId);
          break;
        case "message_edited":
          update(roomId, (s) => ({
            ...s,
            messages: applyEdited(s.messages, e),
            replyTargets: applyEdited(s.replyTargets, e),
          }));
          break;
        case "message_deleted": {
          const at = new Date().toISOString();
          update(roomId, (s) => ({
            ...s,
            messages: applyDeleted(s.messages, e, at),
            replyTargets: applyDeleted(s.replyTargets, e, at),
          }));
          break;
        }
        case "read_update":
          update(roomId, (s) => ({ ...s, readState: bumpRead(s.readState, e.userId, e.lastReadMessageId) }));
          break;
        case "profile_updated":
          update(roomId, (s) => ({
            ...s,
            profiles: s.profiles[e.profile.id] ? { ...s.profiles, [e.profile.id]: e.profile } : s.profiles,
            participants: s.participants && withProfile(s.participants, e.profile),
          }));
          break;
        case "reaction_updated":
          update(roomId, (s) => ({ ...s, messages: applyReaction(s.messages, e) }));
          break;
        case "member_added":
          // 다시 초대된 사람도 다음 스냅샷에서 참여자로 돌아오게 하고, 참여자·읽음 위치를 다시 받는다
          update(roomId, (s) => ({ ...s, removed: readmit(s.removed, e.userId) }));
          void sync(roomId);
          break;
        case "member_removed":
          // 나간 사람은 안 읽은 수 기준에서 바로 뺀다(목록 refetch를 기다리지 않음)
          update(roomId, (s) => ({
            ...s,
            removed: [...s.removed, e.userId],
            participants: s.participants && withoutRemoved(s.participants, [e.userId]),
          }));
          break;
      }
    });
  }, [roomId, onRoomEvent, sync, update, user?.id, markReadIfOpen]);

  // 다른 탭·창에서 돌아오면 읽음 처리
  useEffect(() => {
    if (roomId === null) return;
    const onVisible = () => markReadIfOpen(roomId);
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [roomId, markReadIfOpen]);

  const send = useCallback(
    async (content: string, replyToId?: number, sticker?: string) => {
      if (roomId === null) return;
      try {
        const sent = sticker ? await sendSticker(roomId, sticker, replyToId) : await sendMessage(roomId, content, replyToId);
        update(roomId, (s) => ({ ...s, messages: mergeMessages(s.messages, [sent]) })); // 에코보다 먼저 표시
      } catch (e) {
        error(`전송 실패: ${message(e)}`);
      }
    },
    [roomId, update, error],
  );

  // 여러 장이면 고른 순서대로 한 장씩
  const sendImages = useCallback(
    async (files: File[], replyToId?: number) => {
      if (roomId === null) return;
      for (const group of chunkFiles(files)) {
        try {
          const sent = await uploadImages(roomId, group, replyToId);
          update(roomId, (s) => ({ ...s, messages: mergeMessages(s.messages, [sent]) }));
        } catch (e) {
          error(`사진 전송 실패: ${message(e)}`);
        }
      }
    },
    [roomId, update, error],
  );

  const react = useCallback(
    async (messageId: number, reaction: string | null) => {
      try {
        await setReaction(messageId, reaction); // 반영은 reaction_updated 이벤트로
      } catch (e) {
        error(`반응 실패: ${message(e)}`);
      }
    },
    [error],
  );

  const edit = useCallback(
    async (id: number, content: string) => {
      try {
        await editMessage(id, content); // 반영은 message_edited 이벤트로
      } catch (e) {
        error(`수정 실패: ${message(e)}`);
      }
    },
    [error],
  );

  const remove = useCallback(
    async (id: number, imagePaths: string[] = []) => {
      try {
        await deleteMessage(id, imagePaths); // 반영은 message_deleted 이벤트로
      } catch (e) {
        error(`삭제 실패: ${message(e)}`);
      }
    },
    [error],
  );

  const current = roomId === null ? EMPTY : (byRoom[roomId] ?? EMPTY);

  const loadOlder = useCallback(async () => {
    const oldest = current.messages[0]?.id;
    if (roomId === null || loadingOlder || !current.hasMore || oldest === undefined) return;
    setLoadingOlder(true);
    try {
      const page = await fetchMessages(roomId, oldest);
      update(roomId, (s) => ({
        ...s,
        messages: mergeMessages(s.messages, page.messages),
        replyTargets: mergeMessages(s.replyTargets, page.replyTargets),
        profiles: withProfiles(s.profiles, page.profiles),
        hasMore: page.messages.length === MESSAGE_PAGE_SIZE,
      }));
    } catch (e) {
      error(`이전 메시지를 불러오지 못했습니다: ${message(e)}`);
    } finally {
      setLoadingOlder(false);
    }
  }, [roomId, loadingOlder, current, update, error]);

  // 검색 결과로 이동: 그 메시지가 목록에 올 때까지 이전 페이지를 받는다(최대 20페이지 = 600개). 찾으면 true.
  const loadUntil = useCallback(
    async (targetId: number): Promise<boolean> => {
      if (roomId === null) return false;
      let oldest = current.messages[0]?.id;
      if (oldest !== undefined && oldest <= targetId) return true;
      let more = current.hasMore;
      const pages: MessagePage[] = [];
      try {
        for (let i = 0; i < 20 && more && oldest !== undefined && oldest > targetId; i++) {
          const page = await fetchMessages(roomId, oldest);
          pages.push(page);
          oldest = page.messages[0]?.id;
          more = page.messages.length === MESSAGE_PAGE_SIZE;
        }
      } catch (e) {
        error(`이전 메시지를 불러오지 못했습니다: ${message(e)}`);
      }
      if (pages.length > 0) {
        update(roomId, (s) => ({
          ...s,
          messages: mergeMessages(s.messages, pages.flatMap((p) => p.messages)),
          replyTargets: mergeMessages(s.replyTargets, pages.flatMap((p) => p.replyTargets)),
          profiles: withProfiles(s.profiles, pages.flatMap((p) => p.profiles)),
          hasMore: more,
        }));
      }
      return oldest !== undefined && oldest <= targetId;
    },
    [roomId, current, update, error],
  );

  const messages = useMemo(
    () =>
      user && room
        ? toViews(current.messages, {
            me: user.id,
            participants: current.participants ?? room.participants,
            profiles: current.profiles,
            replyTargets: current.replyTargets,
            readState: current.participants ? current.readState : null, // 스냅샷 전 숫자 숨김
          })
        : [],
    [current, room, user],
  );

  return {
    messages,
    sendMessage: send,
    sendImages,
    react,
    editMessage: edit,
    deleteMessage: remove,
    loadOlder,
    loadUntil,
    hasMore: current.hasMore,
    loadingOlder,
    // 화면의 멤버 목록용(스냅샷 이후엔 실시간 퇴장 반영)
    participants: current.participants ?? room?.participants ?? [],
  };
};
