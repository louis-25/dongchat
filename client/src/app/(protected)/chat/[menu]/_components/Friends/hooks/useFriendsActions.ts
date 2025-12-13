import { useState } from "react";
import useToast from "@/hooks/useToast";
import {
  useSendFriendReq,
  useAcceptFriendReq,
  useBlockFriendReq,
} from "@/hooks/api/useFriends";
import { getErrorMessage } from "@/lib/error-handler";
import type { ErrorType } from "@/lib/api-client";

export const useFriendsActions = () => {
  const { success, error } = useToast();
  const [isResponding, setIsResponding] = useState(false);

  const { mutate: requestMutation, isPending: requestMutationPending } =
    useSendFriendReq();
  const acceptMutation = useAcceptFriendReq();
  const blockMutation = useBlockFriendReq();

  const sendFriendRequest = (username: string, onSuccess?: () => void) => {
    requestMutation(
      {
        data: { username: username.trim() },
      },
      {
        onSuccess: () => {
          success("친구 요청을 보냈습니다.");
          onSuccess?.();
        },
        onError: (e: ErrorType<void>) => {
          const message = getErrorMessage(e);
          error(`친구 요청 실패: ${message}`);
        },
      }
    );
  };

  const respondFriendRequest = async (
    id: number,
    action: "accept" | "block",
    onSuccess?: () => void
  ) => {
    const targetMutation = action === "accept" ? acceptMutation : blockMutation;
    setIsResponding(true);
    try {
      await targetMutation.mutateAsync(
        { id: String(id) },
        {
          onSuccess: () => {
            success(
              action === "accept"
                ? "친구 요청을 수락했습니다."
                : "요청을 차단했습니다."
            );
            onSuccess?.();
          },
          onError: (e: ErrorType<void>) => {
            const message = getErrorMessage(e);
            error(`요청 처리 실패: ${message}`);
          },
        }
      );
    } catch (e) {
      console.error(e);
      error("요청 처리 중 오류가 발생했습니다.");
    } finally {
      setIsResponding(false);
    }
  };

  return {
    sendFriendRequest,
    respondFriendRequest,
    isRequestPending: requestMutationPending,
    isResponding,
  };
};
