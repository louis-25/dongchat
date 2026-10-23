// 웹훅 본문을 메시지 조각으로 나눈다(스펙 §5.1). Deno 전용 API 금지 — 클라이언트 npm test(node)가 함께 돌린다.
// 길이는 코드 포인트 기준(DB char_length와 같게, 이모지를 반으로 자르지 않게).
const len = (s: string) => [...s].length;

export function splitMessage(text: string, max: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const line of text.split(/\r?\n/)) {
    if (len(line) > max) {
      // 혼자 max를 넘는 줄만 글자 수로 자른다. 마지막 조각은 다음 줄과 이어 붙을 수 있다.
      parts.push(current);
      const chars = [...line];
      for (let i = 0; i < chars.length; i += max) parts.push(chars.slice(i, i + max).join(""));
      current = parts.pop()!;
    } else if (current === "" || len(current) + 1 + len(line) <= max) {
      current = current === "" ? line : `${current}\n${line}`;
    } else {
      parts.push(current);
      current = line;
    }
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter((p) => p !== "");
}

export const isTokenShape = (token: string) => /^dch_[0-9a-f]{64}$/.test(token);
