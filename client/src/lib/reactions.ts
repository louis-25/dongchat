// 메시지 반응. 코드는 DB check(message_reactions_kind)와 같다.
export const REACTIONS = [
  { code: "heart", emoji: "❤️" },
  { code: "like", emoji: "👍" },
  { code: "lol", emoji: "😂" },
  { code: "wow", emoji: "😮" },
  { code: "sad", emoji: "😢" },
] as const;

export type ReactionCode = (typeof REACTIONS)[number]["code"];
export type Reaction = { userId: string; reaction: ReactionCode };

// 말풍선 아래 표시용: 정해진 순서로 개수와 내가 단 반응인지
export const summarizeReactions = (reactions: Reaction[], me: string) =>
  REACTIONS.map((r) => ({
    ...r,
    count: reactions.filter((x) => x.reaction === r.code).length,
    mine: reactions.some((x) => x.reaction === r.code && x.userId === me),
  })).filter((r) => r.count > 0);

// 한 사람당 하나: 같은 사용자 것은 바꾸고, null이면 뺀다
export const withReaction = (reactions: Reaction[], userId: string, reaction: ReactionCode | null): Reaction[] => [
  ...reactions.filter((r) => r.userId !== userId),
  ...(reaction ? [{ userId, reaction }] : []),
];
