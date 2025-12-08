import { useRouter as useNextNavigator, usePathname } from "next/navigation";

const useRouter = () => {
    const router = useNextNavigator();
    const pathname = usePathname();
    return {
        router,
        pathname,
        goHome: () => router.push("/"),
        goLogin: () => router.push("/login"),
        goJoin: () => router.push("/join"),
        goChat: () => router.push("/chat"),
    };
}

export default useRouter;