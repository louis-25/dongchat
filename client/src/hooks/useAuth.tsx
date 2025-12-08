
import { useEffect } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/store/auth";
import useRouter from "./useRouter";


const useAuth = () => {
    const { router, goLogin, goJoin, goChat } = useRouter();
    const [user, setUser] = useAtom(userAtom);

    // 인증 상태 확인 및 리다이렉트 처리
    useEffect(() => {
        const refreshToken = localStorage.getItem("refreshToken");
        const storedUser = localStorage.getItem("user");

        if (!refreshToken || !storedUser) {
            goLogin();
            return;
        }

        try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            // refreshToken이 있으면 API 호출 시 자동으로 갱신됨
        } catch (e) {
            console.error("Failed to parse user from localStorage", e);
            goLogin();
        }
    }, [router, setUser]);

    return { user };
};

export default useAuth;