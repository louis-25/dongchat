// 검색 결과에서 검색어 부분을 나눈다(대소문자 무시, 정규식 아님 → 특수문자 그대로).
export const highlightParts = (text: string, query: string): { text: string; hit: boolean }[] => {
  const q = query.trim().toLowerCase();
  if (!q) return [{ text, hit: false }];
  const lower = text.toLowerCase(); // ponytail: 소문자화로 길이가 바뀌는 특수 문자(İ 등)는 위치가 어긋날 수 있다
  const parts: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (let i = lower.indexOf(q); i !== -1; i = lower.indexOf(q, at)) {
    if (i > at) parts.push({ text: text.slice(at, i), hit: false });
    parts.push({ text: text.slice(i, i + q.length), hit: true });
    at = i + q.length;
  }
  if (at < text.length) parts.push({ text: text.slice(at), hit: false });
  return parts;
};
