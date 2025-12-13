"use client";

import { useEffect, useState } from "react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { useForm, FormProvider, Controller } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
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
import { createRoomSchema, type CreateRoomFormValues } from "./schemas";
import type { CreateRoomModalProps, FriendEntry } from "./types";

const CreateRoomModal = ({ open, onClose, onSubmit }: CreateRoomModalProps) => {
  const { data: friends = [] as FriendEntry[], isLoading: friendsLoading } =
    useFriendsList();
  const [comboboxOpen, setComboboxOpen] = useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const [popoverWidth, setPopoverWidth] = useState<number | undefined>(
    undefined
  );

  // Popover가 열릴 때 trigger 너비 측정
  useEffect(() => {
    if (comboboxOpen && triggerRef.current) {
      setPopoverWidth(triggerRef.current.offsetWidth);
    }
  }, [comboboxOpen]);

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

  const handleFriendSelect = (friendValue: string) => {
    toggleParticipant(friendValue);
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
                          ref={triggerRef}
                          variant="outline"
                          role="combobox"
                          aria-expanded={comboboxOpen}
                          className="w-full justify-between"
                        >
                          친구 선택...
                          <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="p-0"
                        align="start"
                        style={{
                          width: popoverWidth ? `${popoverWidth}px` : undefined,
                        }}
                      >
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
                              {friendOptions?.map((friend) => {
                                const isSelected =
                                  selectedParticipants.includes(friend.value);
                                return (
                                  <CommandItem
                                    key={friend.value}
                                    value={friend.value}
                                    disabled={false}
                                    onSelect={() => {
                                      handleFriendSelect(friend.value);
                                    }}
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleFriendSelect(friend.value);
                                    }}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      handleFriendSelect(friend.value);
                                    }}
                                    className="cursor-pointer"
                                  >
                                    <CheckIcon
                                      className={cn(
                                        "mr-2 h-4 w-4 shrink-0",
                                        isSelected ? "opacity-100" : "opacity-0"
                                      )}
                                    />
                                    {friend.label}
                                  </CommandItem>
                                );
                              })}
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

export default CreateRoomModal;
