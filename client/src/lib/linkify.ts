// 말풍선 본문의 http(s) 주소를 누를 수 있게 나눈다(웹훅 스펙 §6). 다른 스킴(javascript: 등)은 글자 그대로.
export type LinkPart = { text: string; href?: string };

const URL_RE = /https?:\/\/[^\s<>"]+/g;
const TRAILING = ".,!?;:'\")]";

// 끝 문장부호는 문장의 일부로 본다. 닫는 괄호는 주소 안의 여는 괄호와 짝이 맞으면 남긴다(…/Foo_(bar)).
function trimUrl(url: string): string {
  let end = url.length;
  while (end > 0 && TRAILING.includes(url[end - 1])) {
    const head = url.slice(0, end);
    if (url[end - 1] === ")" && head.split("(").length >= head.split(")").length) break;
    end--;
  }
  return url.slice(0, end);
}

export function splitLinks(text: string): LinkPart[] {
  const parts: LinkPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    const href = trimUrl(m[0]);
    if (href.endsWith("://")) continue; // "https://." 처럼 주소가 비면 글자 그대로
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    parts.push({ text: href, href });
    last = m.index + href.length;
  }
  if (last < text.length || parts.length === 0) parts.push({ text: text.slice(last) });
  return parts;
}
