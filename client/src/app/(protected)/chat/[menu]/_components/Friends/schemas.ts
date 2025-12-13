import * as yup from "yup";

export const addFriendSchema = yup.object().shape({
  username: yup
    .string()
    .required("아이디를 입력해주세요.")
    .trim()
    .min(1, "아이디를 입력해주세요."),
});

export type AddFriendFormValues = yup.InferType<typeof addFriendSchema>;

