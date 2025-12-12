"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import useToast from "@/hooks/useToast";
import {
  useFriendsList,
  usePendingFriends,
  useSendFriendReq,
  useAcceptFriendReq,
  useBlockFriendReq,
} from "@/hooks/api/useFriends";
import { useForm, FormProvider } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import FormInput from "@/components/common/RHF/FormInput";
import { getErrorMessage } from "@/lib/error-handler";
import type { ErrorType } from "@/lib/api-client";

type FriendRequest = {
  id: number;
  requester?: { id: number; username: string };
  receiver?: { id: number; username: string };
  status: string;
};

type FriendEntry = { id: number; friend: { id: number; username: string } };

// 친구 추가 폼 스키마
const addFriendSchema = yup.object().shape({
  username: yup
    .string()
    .required("아이디를 입력해주세요.")
    .trim()
    .min(1, "아이디를 입력해주세요."),
});

type AddFriendFormValues = yup.InferType<typeof addFriendSchema>;

const FriendsTab = () => {
  const { success, error } = useToast();
  const [isResponding, setIsResponding] = useState(false);

  // 친구 목록, 받은 요청 목록을 react-query로 관리 (staleTime 기본값 유지)
  const {
    data: friends = [] as FriendEntry[],
    refetch: refetchFriends,
    isLoading: friendsLoading,
    isRefetching: friendsRefetching,
  } = useFriendsList();
  const {
    data: pending = [] as FriendRequest[],
    refetch: refetchPending,
    isLoading: pendingLoading,
    isRefetching: pendingRefetching,
  } = usePendingFriends();

  // 친구 요청/수락/차단 mutation 훅
  const { mutate: requestMutation, isPending: requestMutationPending } =
    useSendFriendReq();
  const acceptMutation = useAcceptFriendReq();
  const blockMutation = useBlockFriendReq();

  // RHF 폼 설정
  const methods = useForm<AddFriendFormValues>({
    resolver: yupResolver(addFriendSchema),
    defaultValues: {
      username: "",
    },
  });
  const { handleSubmit, reset } = methods;

  // 친구 요청 전송
  const onSubmit = (data: AddFriendFormValues) => {
    requestMutation(
      {
        data: { username: data.username.trim() },
      },
      {
        onSuccess: () => {
          reset();
          refetchFriends();
          refetchPending();
          success("친구 요청을 보냈습니다.");
        },
        onError: (e: ErrorType<void>) => {
          const message = getErrorMessage(e);
          error(`친구 요청 실패: ${message}`);
        },
      }
    );
  };

  // 친구 요청 응답 (수락/차단)
  const respondFriend = async (id: number, action: "accept" | "block") => {
    const targetMutation = action === "accept" ? acceptMutation : blockMutation;
    setIsResponding(true);
    try {
      await targetMutation.mutateAsync(
        { id: String(id) },
        {
          onSuccess: () => {
            refetchFriends();
            refetchPending();
            success(
              action === "accept"
                ? "친구 요청을 수락했습니다."
                : "요청을 차단했습니다."
            );
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>친구 관리</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <FormProvider {...methods}>
          <form
            onSubmit={handleSubmit(onSubmit)}
            className="flex items-center gap-2"
          >
            <div className="flex-1">
              <FormInput
                name="username"
                placeholder="추가할 사용자 아이디"
                disabled={requestMutationPending}
              />
            </div>
            <Button type="submit" disabled={requestMutationPending}>
              {requestMutationPending ? "요청 중..." : "친구 추가"}
            </Button>
          </form>
        </FormProvider>
        <div>
          <h3 className="font-semibold mb-2">
            받은 요청
            <span className="ml-2 text-xs text-gray-500">
              {pendingLoading || pendingRefetching ? "불러오는 중..." : ""}
            </span>
          </h3>
          <div className="space-y-2">
            {pending.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded border px-3 py-2"
              >
                <span>
                  {p.requester?.username} → {p.receiver?.username}
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respondFriend(p.id, "accept")}
                    disabled={isResponding}
                  >
                    수락
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => respondFriend(p.id, "block")}
                    disabled={isResponding}
                  >
                    차단
                  </Button>
                </div>
              </div>
            ))}
            {pending.length === 0 && (
              <div className="text-sm text-gray-500">
                대기 중인 요청이 없습니다.
              </div>
            )}
          </div>
        </div>
        <div>
          <h3 className="font-semibold mb-2">
            친구 목록
            <span className="ml-2 text-xs text-gray-500">
              {friendsLoading || friendsRefetching ? "불러오는 중..." : ""}
            </span>
          </h3>
          <div className="space-y-2">
            {friends.map((f) => (
              <div key={f.id} className="rounded border px-3 py-2">
                {f.friend.username}
              </div>
            ))}
            {friends.length === 0 && (
              <div className="text-sm text-gray-500">친구가 없습니다.</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default FriendsTab;
