// 메시지 반응. 이모지 문자를 그대로 저장한다(DB check: 짧고 공백·글자·숫자 없음).
// 길게 누른 메뉴에 바로 보이는 것. 나머지는 ➕(frimousse 선택기)로.
export const QUICK_REACTIONS = ["❤️", "👍", "😂", "😮", "😢"] as const;

export type Reaction = { userId: string; reaction: string };

// 말풍선 아래 표시용: 많이 달린 순(같으면 먼저 달린 순), 내가 단 반응인지
export const summarizeReactions = (reactions: Reaction[], me: string) => {
  const groups = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of reactions) {
    const g = groups.get(r.reaction) ?? { emoji: r.reaction, count: 0, mine: false };
    g.count += 1;
    g.mine ||= r.userId === me;
    groups.set(r.reaction, g);
  }
  return [...groups.values()].sort((a, b) => b.count - a.count); // 안정 정렬 → 동률은 먼저 달린 순
};

// 한 사람당 하나: 같은 사용자 것은 바꾸고, null이면 뺀다
export const withReaction = (reactions: Reaction[], userId: string, reaction: string | null): Reaction[] => [
  ...reactions.filter((r) => r.userId !== userId),
  ...(reaction ? [{ userId, reaction }] : []),
];
