import { useQuery } from "@tanstack/react-query";
import { getImageUrl } from "@/services/messages";

// 사진 서명 URL(1시간 유효). 만료 전에 새로 받도록 50분 동안만 재사용한다.
export const useImageUrl = (path: string | null) =>
  useQuery({
    queryKey: ["chat-image", path],
    queryFn: () => getImageUrl(path!),
    enabled: path !== null,
    staleTime: 50 * 60_000,
    gcTime: 55 * 60_000,
  });
