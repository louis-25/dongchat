import { createClient } from "@/lib/supabase/client";
import type { NewPoll, Poll } from "@/types/domain";
import { toDomainError } from "./errors";

// 투표 경계. 읽기·쓰기 모두 RPC(테이블 직접 접근 없음 — 익명 투표의 투표자를 숨기기 위해).
export async function createPoll(roomId: number, p: NewPoll): Promise<number> {
  const { data, error } = await createClient().rpc("create_poll", {
    p_room_id: roomId,
    p_question: p.question,
    p_options: p.options,
    p_multiple: p.multiple,
    p_anonymous: p.anonymous,
    p_allow_add: p.allowAdd,
    p_closes_at: p.closesAt,
  });
  if (error) throw toDomainError(error);
  return data;
}

// get_poll jsonb 키가 Poll과 같다(camelCase)
export async function getPoll(pollId: number): Promise<Poll> {
  const { data, error } = await createClient().rpc("get_poll", { p_poll_id: pollId });
  if (error) throw toDomainError(error);
  return data as unknown as Poll;
}

export async function votePoll(pollId: number, optionIds: number[]): Promise<void> {
  const { error } = await createClient().rpc("vote_poll", { p_poll_id: pollId, p_option_ids: optionIds });
  if (error) throw toDomainError(error);
}

export async function addPollOption(pollId: number, label: string): Promise<number> {
  const { data, error } = await createClient().rpc("add_poll_option", { p_poll_id: pollId, p_label: label });
  if (error) throw toDomainError(error);
  return data;
}

export async function closePoll(pollId: number): Promise<void> {
  const { error } = await createClient().rpc("close_poll", { p_poll_id: pollId });
  if (error) throw toDomainError(error);
}
