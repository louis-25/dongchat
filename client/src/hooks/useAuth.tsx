import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAtom } from "jotai";
import { userAtom } from "@/store/auth";
import { setAccessToken } from "@/lib/api-client";

const useAuth = () => {
    const router = useRouter();
    const [user, setUser] = useAtom(userAtom);

    // 인증 상태 확인 및 리다이렉트 처리
    useEffect(() => {
        const refreshToken = localStorage.getItem("refreshToken");
        const storedUser = localStorage.getItem("user");

        if (!refreshToken || !storedUser) {
            router.push('/auth/signin');
            return;
        }

        try {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            // refreshToken이 있으면 API 호출 시 자동으로 갱신됨
        } catch (e) {
            console.error("Failed to parse user from localStorage", e);
            router.push('/auth/signin');
        }
    }, [router, setUser]);

    return { user };
};

export default useAuth;