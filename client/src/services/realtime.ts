import { createClient } from "@/lib/supabase/client";
import { createTopicGate } from "@/lib/topic-gate";
import type { RoomEvent, UserEvent } from "@/types/domain";
import { fromMessagePayload, type MessagePayload } from "./mappers";

type ProfilePayload = {
  userId: string;
  username: string;
  nickname: string | null;
  avatarUrl: string | null;
  statusMessage: string | null;
};
const toProfile = (p: ProfilePayload) => ({
  id: p.userId,
  username: p.username,
  nickname: p.nickname,
  avatarUrl: p.avatarUrl,
  statusMessage: p.statusMessage,
});

// Realtime 경계. 이벤트 이름·payload는 스펙 §8.1 계약(NestJS 복귀 시 socket.io에서 동일하게 유지).
// 참여 방 수만큼 채널을 연다. 수백 개 규모면 user 채널 단일 구독으로 전환(§8.4).
const ROOM_EVENTS = ["message", "message_edited", "message_deleted", "read_update", "member_removed"] as const;
const USER_EVENTS = ["member_added", "member_removed", "force_logout", "profile_updated"] as const;

// 같은 토픽 재구독은 이전 removeChannel이 끝난 뒤에(realtime-js가 해제 중인 채널을 돌려주는 문제)
const gate = createTopicGate();

function listen(
  topic: string,
  events: readonly string[],
  onBroadcast: (event: string, payload: Record<string, unknown>) => void,
  onSubscribed?: () => void,
  onJoinError?: () => void,
): () => void {
  const supabase = createClient();
  return gate(topic, () => {
    const channel = supabase.channel(topic, { config: { private: true } });
    for (const event of events) {
      channel.on("broadcast", { event }, ({ payload }) => onBroadcast(event, payload as Record<string, unknown>));
    }
    // SUBSCRIBED는 최초 구독과 재연결(phoenix rejoin이 join 콜백을 재사용)마다 온다 → 호출자가 스냅샷을 다시 받는다(§8.3).
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") onSubscribed?.();
      // 가입 거부(정지·강제 로그아웃으로 수신 권한 상실)나 시간 초과. realtime-js가 알아서 재시도한다.
      else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") onJoinError?.();
    });
    return () => supabase.removeChannel(channel);
  });
}

export function subscribeRoom(roomId: number, onEvent: (e: RoomEvent) => void): () => void {
  return listen(
    `room:${roomId}`,
    ROOM_EVENTS,
    (event, payload) =>
      onEvent(
        event === "message"
          ? { type: "message", roomId, message: fromMessagePayload(payload as unknown as MessagePayload) }
          : ({ type: event, ...payload } as RoomEvent),
      ),
    () => onEvent({ type: "subscribed", roomId }),
  );
}

// onResync: 구독 성공(최초·재연결)과 가입 거부 때 모두 호출. 구독 전에 놓친 통지(강제 로그아웃·방 초대)를
// 상태 재확인으로 메운다. 세션이 이미 무효화됐다면 가입 자체가 거부되므로 실패도 재확인 신호다.
export function subscribeUser(userId: string, onEvent: (e: UserEvent) => void, onResync?: () => void): () => void {
  return listen(
    `user:${userId}`,
    USER_EVENTS,
    (event, payload) =>
      onEvent(
        event === "profile_updated"
          ? { type: event, profile: toProfile(payload as unknown as ProfilePayload) }
          : ({ type: event, ...payload } as UserEvent),
      ),
    onResync,
    onResync,
  );
}
