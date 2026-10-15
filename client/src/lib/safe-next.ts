// 로그인 후 돌아갈 경로. 같은 사이트 경로만 허용(오픈 리다이렉트 방지), 로그인·가입·콜백으로는 되돌리지 않는다.
const BLOCKED = ["/login", "/join", "/auth"];

export const safeNext = (raw: string | null | undefined, fallback = "/chat/rooms"): string => {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return fallback;
  const path = raw.split(/[?#]/)[0];
  if (BLOCKED.some((p) => path === p || path.startsWith(`${p}/`))) return fallback;
  return raw;
};
