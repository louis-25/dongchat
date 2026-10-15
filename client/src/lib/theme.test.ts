import { test } from "node:test";
import assert from "node:assert/strict";
import { PALETTES, THEME_TOKENS, contrastRatio, isPalette, paletteBootScript, paletteCss } from "./theme.ts";

test("모든 팔레트·밝기에서 글자 대비 4.5:1 이상", () => {
  for (const p of PALETTES) {
    for (const mode of ["light", "dark"] as const) {
      const t = THEME_TOKENS[p][mode];
      const pairs: [string, string, string][] = [
        ["본문", t.foreground, t.background],
        ["보조 글자", t.mutedForeground, t.background],
        ["버튼", t.primaryForeground, t.primary],
        ["내 말풍선", t.bubbleMeForeground, t.bubbleMe],
        ["상대 말풍선", t.foreground, t.bubbleThem],
      ];
      for (const [label, fg, bg] of pairs) {
        assert.ok(contrastRatio(fg, bg) >= 4.5, `${p}/${mode} ${label} ${fg} on ${bg} = ${contrastRatio(fg, bg).toFixed(2)}`);
      }
    }
  }
});

test("대비 계산 기준값", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff")), 21);
});

test("CSS: 기본 팔레트는 :root, 나머지는 data-palette, 다크는 .dark", () => {
  const css = paletteCss();
  assert.match(css, /:root\{--background:#fbfaf7;/);
  assert.match(css, /:root\.dark\{--background:#121816;/);
  assert.match(css, /:root\[data-palette="blue"\]\{/);
  assert.match(css, /:root\[data-palette="dusk"\]\.dark\{/);
  assert.match(css, /--bubble-me:/);
});

test("저장값 검증과 부트 스크립트", () => {
  assert.equal(isPalette("blue"), true);
  assert.equal(isPalette("pink"), false);
  assert.equal(isPalette(null), false);
  assert.match(paletteBootScript, /localStorage\.getItem\("dongchat\.palette"\)/);
  assert.match(paletteBootScript, /\["blue","dusk"\]/); // 기본(mint)은 속성 없이
});
