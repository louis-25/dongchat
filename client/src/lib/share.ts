export type ShareNav = {
  share?: (data: { title: string; text: string; url: string }) => Promise<void>;
  clipboard?: { writeText: (s: string) => Promise<void> };
};

export const inviteUrl = (origin: string, code: string): string => `${origin}/invite/${code}`;

// 폰은 공유 창, 없으면(주로 PC) 클립보드. 사용자가 공유 창을 닫으면(AbortError) 아무것도 하지 않는다.
// 클립보드도 없거나 거부되면 unavailable — 화면이 링크를 직접 보여 준다.
export const shareOrCopy = async (
  data: { title: string; text: string; url: string },
  nav: ShareNav = globalThis.navigator,
): Promise<"shared" | "copied" | "cancelled" | "unavailable"> => {
  if (nav.share) {
    try {
      await nav.share(data);
      return "shared";
    } catch (e) {
      if ((e as { name?: string }).name === "AbortError") return "cancelled";
    }
  }
  if (!nav.clipboard) return "unavailable";
  try {
    await nav.clipboard.writeText(data.url);
    return "copied";
  } catch {
    return "unavailable";
  }
};
