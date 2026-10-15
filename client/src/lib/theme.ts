// 색 테마 단일 출처. layout이 paletteCss()를 <style>로 내보내고, 테스트가 대비를 검증한다.
// 스펙 §3.1 값에서 대비 미달 4개를 조정: mint/light muted, blue/light primary·bubble-me·muted, dusk/light primary·muted.
export const PALETTES = ["mint", "blue", "dusk"] as const;
export type Palette = (typeof PALETTES)[number];
export const DEFAULT_PALETTE: Palette = "mint";
export const PALETTE_STORAGE_KEY = "dongchat.palette";
export const PALETTE_LABELS: Record<Palette, string> = { mint: "민트", blue: "파랑", dusk: "노을" };

export type ThemeTokens = {
  background: string;
  foreground: string;
  card: string;
  primary: string;
  primaryForeground: string;
  bubbleMe: string;
  bubbleMeForeground: string;
  bubbleThem: string;
  mutedForeground: string;
  border: string;
  destructive: string;
};

export const THEME_TOKENS: Record<Palette, { light: ThemeTokens; dark: ThemeTokens }> = {
  mint: {
    light: { background: "#fbfaf7", foreground: "#1d2a26", card: "#ffffff", primary: "#0f7a63", primaryForeground: "#ffffff", bubbleMe: "#cfeee2", bubbleMeForeground: "#0d3b30", bubbleThem: "#efece5", mutedForeground: "#66736e", border: "#ebe8e1", destructive: "#c2410c" },
    dark: { background: "#121816", foreground: "#e6efeb", card: "#1a221f", primary: "#4cc9a4", primaryForeground: "#0b1512", bubbleMe: "#1f5c4b", bubbleMeForeground: "#e6fff6", bubbleThem: "#1f2a26", mutedForeground: "#86958f", border: "#223029", destructive: "#f87171" },
  },
  blue: {
    light: { background: "#ffffff", foreground: "#14181f", card: "#ffffff", primary: "#2a62f0", primaryForeground: "#ffffff", bubbleMe: "#2a62f0", bubbleMeForeground: "#ffffff", bubbleThem: "#f1f3f7", mutedForeground: "#6b7383", border: "#eef0f4", destructive: "#c2410c" },
    dark: { background: "#10131a", foreground: "#e8ecf4", card: "#171b24", primary: "#6b95ff", primaryForeground: "#0b1020", bubbleMe: "#2f5bd6", bubbleMeForeground: "#ffffff", bubbleThem: "#1c212c", mutedForeground: "#8a93a3", border: "#232936", destructive: "#f87171" },
  },
  dusk: {
    light: { background: "#fff8f4", foreground: "#2a1d18", card: "#ffffff", primary: "#c2452b", primaryForeground: "#ffffff", bubbleMe: "#ffd9cc", bubbleMeForeground: "#4a1d10", bubbleThem: "#f3ebe6", mutedForeground: "#7a6a63", border: "#efe3dc", destructive: "#b91c1c" },
    dark: { background: "#171a26", foreground: "#eef0f7", card: "#1e2231", primary: "#ff7a59", primaryForeground: "#1b1410", bubbleMe: "#ff7a59", bubbleMeForeground: "#1b1410", bubbleThem: "#262a3a", mutedForeground: "#8d93a8", border: "#262a3a", destructive: "#f87171" },
  },
};

export const isPalette = (v: unknown): v is Palette => typeof v === "string" && (PALETTES as readonly string[]).includes(v);

// shadcn 변수 이름 그대로 + 채팅 전용(bubble-*)
const vars = (t: ThemeTokens): string =>
  [
    ["background", t.background], ["foreground", t.foreground],
    ["card", t.card], ["card-foreground", t.foreground],
    ["popover", t.card], ["popover-foreground", t.foreground],
    ["primary", t.primary], ["primary-foreground", t.primaryForeground],
    ["secondary", t.bubbleThem], ["secondary-foreground", t.foreground],
    ["muted", t.bubbleThem], ["muted-foreground", t.mutedForeground],
    ["accent", t.bubbleThem], ["accent-foreground", t.foreground],
    ["destructive", t.destructive],
    ["border", t.border], ["input", t.border], ["ring", t.primary],
    ["bubble-me", t.bubbleMe], ["bubble-me-foreground", t.bubbleMeForeground], ["bubble-them", t.bubbleThem],
  ]
    .map(([k, v]) => `--${k}:${v};`)
    .join("");

// 기본 팔레트는 속성 없이(:root). 다른 팔레트의 라이트 블록이 기본 다크 뒤에 오고 .dark 블록(특이도 높음)이 그 뒤를 덮는다.
export const paletteCss = (): string =>
  PALETTES.flatMap((p) => {
    const base = p === DEFAULT_PALETTE ? ":root" : `:root[data-palette="${p}"]`;
    return [`${base}{${vars(THEME_TOKENS[p].light)}}`, `${base}.dark{${vars(THEME_TOKENS[p].dark)}}`];
  }).join("\n");

// 첫 페인트 전에 data-palette를 맞춘다(깜빡임 방지). 잘못된 저장값·저장소 접근 실패는 기본 팔레트.
export const paletteBootScript = `try{var p=localStorage.getItem(${JSON.stringify(PALETTE_STORAGE_KEY)});if(${JSON.stringify(
  PALETTES.filter((p) => p !== DEFAULT_PALETTE),
)}.indexOf(p)>=0)document.documentElement.dataset.palette=p}catch(e){}`;

// WCAG 2 상대 휘도 대비
const luminance = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
