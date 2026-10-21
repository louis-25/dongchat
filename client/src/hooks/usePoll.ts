"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useChat } from "@/components/chat-provider";
import { getErrorMessage } from "@/lib/error-handler";
import { withMyVote } from "@/lib/polls";
import { addPollOption, closePoll, getPoll, votePoll } from "@/services/polls";
import type { DomainError, Poll } from "@/types/domain";

const pollKey = (pollId: number) => ["poll", pollId] as const;
const fail = (e: unknown) => toast.error(getErrorMessage(e as unknown as DomainError));

// 투표 카드 하나. 이 투표의 poll_updated와 재구독(놓친 이벤트) 때 다시 받는다.
export const usePoll = (roomId: number, pollId: number) => {
  const queryClient = useQueryClient();
  const { onRoomEvent } = useChat();
  const query = useQuery({ queryKey: pollKey(pollId), queryFn: () => getPoll(pollId) });

  useEffect(
    () =>
      onRoomEvent((e) => {
        if (e.roomId !== roomId) return;
        if ((e.type === "poll_updated" && e.pollId === pollId) || e.type === "subscribed") {
          void queryClient.invalidateQueries({ queryKey: pollKey(pollId) });
        }
      }),
    [roomId, pollId, onRoomEvent, queryClient],
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: pollKey(pollId) });

  // 누르자마자 표시하고, 실패하면 되돌린다
  const vote = useMutation({
    mutationFn: (next: number[]) => votePoll(pollId, next),
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: pollKey(pollId) });
      const prev = queryClient.getQueryData<Poll>(pollKey(pollId));
      if (prev) queryClient.setQueryData<Poll>(pollKey(pollId), withMyVote(prev, next));
      return { prev };
    },
    onError: (e, _next, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(pollKey(pollId), ctx.prev);
      fail(e);
    },
    onSettled: refresh,
  });
  const add = useMutation({ mutationFn: (label: string) => addPollOption(pollId, label), onSuccess: refresh, onError: fail });
  const close = useMutation({ mutationFn: () => closePoll(pollId), onSuccess: refresh, onError: fail });

  return {
    poll: query.data ?? null,
    isError: query.isError,
    vote: vote.mutate,
    addOption: add.mutateAsync,
    adding: add.isPending,
    close: () => close.mutate(),
    closing: close.isPending,
  };
};
