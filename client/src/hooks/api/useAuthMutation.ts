import { useAuthControllerLogin, useAuthControllerRegister } from "@/services/auth/auth";

export const useLogin = () => {
    return useAuthControllerLogin();
};

export const useJoin = () => {
    return useAuthControllerRegister();
};
