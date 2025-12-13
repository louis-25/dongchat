"use client";

import { useForm, FormProvider } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import { Button } from "@/components/ui/button";
import FormInput from "@/components/common/RHF/FormInput";
import { addFriendSchema, type AddFriendFormValues } from "../schemas";

type AddFriendFormProps = {
  onSubmit: (username: string) => void;
  disabled?: boolean;
};

export const AddFriendForm = ({
  onSubmit,
  disabled = false,
}: AddFriendFormProps) => {
  const methods = useForm<AddFriendFormValues>({
    resolver: yupResolver(addFriendSchema),
    defaultValues: {
      username: "",
    },
  });
  const { handleSubmit, reset } = methods;

  const onFormSubmit = (data: AddFriendFormValues) => {
    onSubmit(data.username.trim());
    reset();
  };

  return (
    <FormProvider {...methods}>
      <form
        onSubmit={handleSubmit(onFormSubmit)}
        className="flex items-center gap-2"
      >
        <div className="flex-1">
          <FormInput
            name="username"
            placeholder="추가할 사용자 아이디"
            disabled={disabled}
          />
        </div>
        <Button type="submit" disabled={disabled}>
          {disabled ? "요청 중..." : "친구 추가"}
        </Button>
      </form>
    </FormProvider>
  );
};

