"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BASE_URL } from "@/config";
import { getAccessToken } from "@/lib/api-client";
import useAuth from "@/hooks/useAuth";
import { useChat } from "@/components/chat-provider";
import useToast from "@/hooks/useToast";
import { useForm, FormProvider, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";
import FormInput from "@/components/common/RHF/FormInput";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useFriendsList } from "@/hooks/api/useFriends";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { CheckIcon, ChevronsUpDownIcon, X } from "lucide-react";
import { cn } from "@/lib/utils";

type IncomingMessage = {
  roomId?: number;
  sender: string;
  message?: string;
  content?: string;
  createdAt?: string;
};

type ChatRoom = {
  id: number;
  name: string | null;
  isGroup: boolean;
  participants?: { user: { id: number; username: string } }[];
};

// 채팅방 생성 폼 스키마
const createRoomSchema = yup.object().shape({
  name: yup.string().optional().default(""),
  participants: yup
    .array()
    .of(yup.string())
    .min(1, "최소 1명의 참여자를 선택해주세요.")
    .required("참여자를 선택해주세요."),
  isGroup: yup.boolean().default(false),
});

type CreateRoomFormValues = yup.InferType<typeof createRoomSchema>;

type ModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: {
    name?: string;
    participants: string[];
    isGroup: boolean;
  }) => void;
};

type FriendEntry = { id: number; friend: { id: number; username: string } };

const CreateRoomModal = ({ open, onClose, onSubmit }: ModalProps) => {
  const { data: friends = [] as FriendEntry[], isLoading: friendsLoading } =
    useFriendsList();
  const [comboboxOpen, setComboboxOpen] = useState(false);

  const methods = useForm<CreateRoomFormValues>({
    resolver: yupResolver(createRoomSchema),
    defaultValues: {
      name: "",
      participants: [],
      isGroup: false,
    },
  });
  const { handleSubmit, reset, control, watch, setValue } = methods;

  const selectedParticipants: string[] =
    watch("participants")?.filter((p): p is string => typeof p === "string") ||
    [];

  const handleClose = () => {
    reset();
    setComboboxOpen(false);
    onClose();
  };

  const onFormSubmit = (data: CreateRoomFormValues) => {
    onSubmit({
      name: data.name?.trim() || undefined,
      participants: (data.participants || []).filter(
        (p): p is string => typeof p === "string"
      ),
      isGroup: data.isGroup,
    });
    reset();
    setComboboxOpen(false);
  };

  const toggleParticipant = (username: string) => {
    const current = selectedParticipants || [];
    if (current.includes(username)) {
      setValue(
        "participants",
        current.filter((p) => p !== username),
        { shouldValidate: true }
      );
    } else {
      setValue("participants", [...current, username], {
        shouldValidate: true,
      });
    }
  };

  const removeParticipant = (username: string) => {
    const current = selectedParticipants || [];
    setValue(
      "participants",
      current.filter((p) => p !== username),
      { shouldValidate: true }
    );
  };

  const friendOptions = friends.map((f) => ({
    value: f.friend.username,
    label: f.friend.username,
  }));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-lg">
        <div className="border-b px-4 py-3 text-lg font-semibold">
          채팅방 생성
        </div>
        <FormProvider {...methods}>
          <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-3 p-4">
            <FormInput name="name" placeholder="방 이름 (선택)" />
            <div className="space-y-2">
              <Label>참여자 선택</Label>
              <Controller
                name="participants"
                control={control}
                render={({ fieldState }) => (
                  <div className="space-y-2">
                    <Popover open={comboboxOpen} onOpenChange={setComboboxOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={comboboxOpen}
                          className="w-full justify-between"
                        >
                          친구 선택...
                          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0">
                        <Command>
                          <CommandInput
                            placeholder="친구 검색..."
                            disabled={friendsLoading}
                          />
                          <CommandList>
                            <CommandEmpty>
                              {friendsLoading
                                ? "불러오는 중..."
                                : "친구를 찾을 수 없습니다."}
                            </CommandEmpty>
                            <CommandGroup>
                              {friendOptions.map((friend) => (
                                <CommandItem
                                  key={friend.value}
                                  value={friend.value}
                                  onSelect={() => {
                                    toggleParticipant(friend.value);
                                  }}
                                >
                                  <CheckIcon
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      selectedParticipants.includes(
                                        friend.value
                                      )
                                        ? "opacity-100"
                                        : "opacity-0"
                                    )}
                                  />
                                  {friend.label}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                    {selectedParticipants.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {selectedParticipants.map((username) => (
                          <div
                            key={username}
                            className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded-md text-sm"
                          >
                            <span>{username}</span>
                            <button
                              type="button"
                              onClick={() => removeParticipant(username)}
                              className="hover:bg-blue-200 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    {fieldState.invalid && (
                      <p className="text-sm text-red-500">
                        {fieldState.error?.message}
                      </p>
                    )}
                  </div>
                )}
              />
            </div>
            <div className="flex items-center gap-2">
              <Controller
                name="isGroup"
                control={control}
                render={({ field }) => (
                  <>
                    <Checkbox
                      id="isGroup"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                    <Label
                      htmlFor="isGroup"
                      className="text-sm text-gray-700 cursor-pointer"
                    >
                      그룹방 여부
                    </Label>
                  </>
                )}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={handleClose}>
                취소
              </Button>
              <Button type="submit">만들기</Button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
};

const ChatRoomsTab = () => {
  const { user } = useAuth();
  const { socket } = useChat();
  const token = useMemo(() => getAccessToken(), []);
  const authHeader = useMemo(
    () =>
      token
        ? ({ Authorization: `Bearer ${token}` } as Record<string, string>)
        : ({} as Record<string, string>),
    [token]
  );

  const { success, error } = useToast();

  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);
  const [messagesByRoom, setMessagesByRoom] = useState<
    Record<number, { sender: string; message: string; createdAt?: string }[]>
  >({});
  const [showModal, setShowModal] = useState(false);

  // 메시지 입력 폼
  const messageMethods = useForm<{ message: string }>({
    defaultValues: { message: "" },
  });
  const {
    handleSubmit: handleMessageSubmit,
    reset: resetMessage,
    register: registerMessage,
  } = messageMethods;

  const loadRooms = useCallback(async () => {
    if (!token) {
      error("인증 정보가 없습니다. 다시 로그인 해주세요.");
      return;
    }
    try {
      const res = await fetch(`${BASE_URL}/chat/rooms`, {
        headers: authHeader,
      });
      if (res.ok) {
        const data = await res.json();
        setRooms(data || []);
        if (!selectedRoomId && data?.length > 0) {
          setSelectedRoomId(data[0].id);
        }
      } else {
        error("채팅방 목록을 불러오지 못했습니다.");
      }
    } catch (e) {
      console.error(e);
      error("채팅방 데이터를 불러오는 중 오류가 발생했습니다.");
    }
  }, [authHeader, error, selectedRoomId, token]);

  useEffect(() => {
    (async () => {
      await loadRooms();
    })();
  }, [loadRooms]);

  useEffect(() => {
    if (!socket || !user?.id || !selectedRoomId) return;
    // 현재 선택된 방에 합류
    socket.emit("join_room", { roomId: selectedRoomId, userId: user.id });
  }, [socket, user?.id, selectedRoomId]);

  useEffect(() => {
    if (!socket) return;

    // 실시간 메시지 수신 핸들러
    socket.on("message", (payload: IncomingMessage) => {
      if (payload.roomId === undefined || payload.roomId === null) return;
      const roomKey = Number(payload.roomId);
      setMessagesByRoom((prev) => {
        const prevList = prev[roomKey] || [];
        return {
          ...prev,
          [roomKey]: [
            ...prevList,
            {
              sender: payload.sender,
              message: payload.content ?? payload.message ?? "",
              createdAt: payload.createdAt,
            },
          ],
        };
      });
    });

    // 방 입장 시 기존 메시지 초기 로드
    socket.on(
      "initial_messages",
      (payload: { roomId: number; messages: IncomingMessage[] }) => {
        if (payload?.roomId === undefined || payload?.roomId === null) return;
        const roomKey = Number(payload.roomId);
        const formatted = (payload.messages || []).map((m) => ({
          sender: m.sender,
          message: m.content ?? m.message ?? "",
          createdAt: m.createdAt,
        }));
        setMessagesByRoom((prev) => ({ ...prev, [roomKey]: formatted }));
      }
    );

    return () => {
      socket.off("message");
      socket.off("initial_messages");
    };
  }, [socket]);

  const sendMessage = (data: { message: string }) => {
    if (!selectedRoomId) {
      error("채팅방을 먼저 선택하세요.");
      return;
    }
    if (!socket || !user?.username) {
      error("메시지를 보낼 수 없습니다. 연결 상태를 확인하세요.");
      return;
    }
    if (!data.message.trim()) return;

    socket.emit("message", {
      sender: user.username,
      message: data.message.trim(),
      roomId: selectedRoomId,
    });
    resetMessage();
  };

  const handleCreateRoom = async (payload: {
    name?: string;
    participants: string[];
    isGroup: boolean;
  }) => {
    try {
      const res = await fetch(`${BASE_URL}/chat/rooms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader },
        body: JSON.stringify({
          name: payload.name,
          isGroup: payload.isGroup,
          participantUsernames: payload.participants,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        await loadRooms();
        setSelectedRoomId(data?.id ?? null);
        setShowModal(false);
        success("채팅방을 생성했습니다.");
      } else {
        const errorData = await res.json().catch(() => null);
        error(errorData?.message || "채팅방 생성에 실패했습니다.");
      }
    } catch (e) {
      console.error(e);
      const errorMessage =
        e instanceof Error ? e.message : "채팅방 생성 중 오류가 발생했습니다.";
      error(errorMessage);
    }
  };

  const currentMessages =
    selectedRoomId !== null ? messagesByRoom[selectedRoomId] || [] : [];

  return (
    <>
      <CreateRoomModal
        open={showModal}
        onClose={() => setShowModal(false)}
        onSubmit={handleCreateRoom}
      />
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-1">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>채팅방</CardTitle>
              <Button size="sm" onClick={() => setShowModal(true)}>
                방 생성
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 max-h-[320px] overflow-y-auto border rounded p-2">
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setSelectedRoomId(room.id)}
                  className={`w-full text-left rounded px-2 py-2 border ${
                    selectedRoomId === room.id
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200"
                  }`}
                >
                  <div className="font-semibold">
                    {room.name ||
                      (room.isGroup
                        ? `그룹방 #${room.id}`
                        : `1:1 방 #${room.id}`)}
                  </div>
                  <div className="text-xs text-gray-600">
                    {room.participants
                      ?.map((p) => p.user?.username)
                      .filter(Boolean)
                      .join(", ")}
                  </div>
                </button>
              ))}
              {rooms.length === 0 && (
                <div className="text-sm text-gray-500">
                  참여 중인 방이 없습니다.
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="md:col-span-2 h-[80vh] flex flex-col">
          <CardHeader>
            <CardTitle>채팅</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col overflow-hidden">
            <div className="flex-1 overflow-y-auto mb-4 space-y-2 p-2 border rounded-md bg-white">
              {currentMessages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    msg.sender === user?.username ? "items-end" : "items-start"
                  }`}
                >
                  <span className="text-xs text-gray-500">
                    {msg.sender}
                    {msg.createdAt
                      ? ` • ${new Date(msg.createdAt).toLocaleTimeString()}`
                      : ""}
                  </span>
                  <div
                    className={`p-2 rounded-lg max-w-[80%] ${
                      msg.sender === user?.username
                        ? "bg-blue-500 text-white"
                        : "bg-gray-200 text-black"
                    }`}
                  >
                    {msg.message}
                  </div>
                </div>
              ))}
              {selectedRoomId && currentMessages.length === 0 && (
                <div className="text-sm text-gray-500">메시지가 없습니다.</div>
              )}
              {!selectedRoomId && (
                <div className="text-sm text-gray-500">
                  채팅방을 선택하세요.
                </div>
              )}
            </div>
            <FormProvider {...messageMethods}>
              <form
                onSubmit={handleMessageSubmit(sendMessage)}
                className="flex gap-2"
              >
                <Input
                  type="text"
                  {...registerMessage("message")}
                  placeholder="메시지를 입력하세요..."
                  disabled={!selectedRoomId}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleMessageSubmit(sendMessage)();
                    }
                  }}
                />
                <Button type="submit" disabled={!selectedRoomId}>
                  전송
                </Button>
              </form>
            </FormProvider>
          </CardContent>
        </Card>
      </div>
    </>
  );
};

export default ChatRoomsTab;
