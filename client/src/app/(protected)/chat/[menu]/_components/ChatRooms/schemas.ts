import * as yup from "yup";

export const createRoomSchema = yup.object().shape({
  name: yup.string().optional().default(""),
  participants: yup
    .array()
    .of(yup.string())
    .min(1, "최소 1명의 참여자를 선택해주세요.")
    .required("참여자를 선택해주세요."),
  isGroup: yup.boolean().default(false),
});

export type CreateRoomFormValues = yup.InferType<typeof createRoomSchema>;

