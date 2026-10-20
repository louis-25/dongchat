// 사진 여러 장 메시지(최대 10장) 규칙.
export const ALBUM_MAX = 10;

// 말풍선 배치: 줄마다 칸 수. 3칸씩, 끝에 1장이 남으면 마지막 4장을 2+2로.
export const albumRows = (n: number): number[] => {
  if (n <= 3) return [n];
  if (n === 4) return [2, 2];
  const rows = Array<number>(Math.floor(n / 3)).fill(3);
  const rest = n % 3;
  if (rest === 2) rows.push(2);
  if (rest === 1) rows.splice(-1, 1, 2, 2);
  return rows;
};

export const chunkFiles = <T>(list: T[], size: number = ALBUM_MAX): T[][] =>
  Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));

// 방 목록·푸시·답장 미리보기에 쓰는 content
export const imageLabel = (n: number): string => (n > 1 ? `(사진 ${n}장)` : "(사진)");
