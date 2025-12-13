"use client";

import { useForm, FormProvider } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type MessageInputProps = {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
};

export const MessageInput = ({
  onSendMessage,
  disabled = false,
}: MessageInputProps) => {
  const methods = useForm<{ message: string }>({
    defaultValues: { message: "" },
  });
  const {
    handleSubmit,
    reset,
    register,
  } = methods;

  const onSubmit = (data: { message: string }) => {
    if (!data.message.trim()) return;
    onSendMessage(data.message.trim());
    reset();
  };

  return (
    <FormProvider {...methods}>
      <form onSubmit={handleSubmit(onSubmit)} className="flex gap-2">
        <Input
          type="text"
          {...register("message")}
          placeholder="메시지를 입력하세요..."
          disabled={disabled}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(onSubmit)();
            }
          }}
        />
        <Button type="submit" disabled={disabled}>
          전송
        </Button>
      </form>
    </FormProvider>
  );
};

