// 웹 푸시 발송 허용 주소. 구독 endpoint는 사용자가 등록하는 값이라 임의 주소면 서버가 그곳으로 요청한다(SSRF) →
// 알려진 브라우저 푸시 서비스 호스트(https, 기본 포트)만 허용한다. allowAny는 로컬 검증 전용(PUSH_ALLOW_HTTP=true).
const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"];

export const isAllowedEndpoint = (endpoint: string, allowAny = false): boolean => {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (allowAny) return url.protocol === "https:" || url.protocol === "http:";
  if (url.protocol !== "https:" || url.port !== "" || url.username !== "" || url.password !== "") return false;
  const host = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
};
