"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // refreshToken만 localStorage에서 확인
    const refreshToken = localStorage.getItem("refreshToken");
    // 나머지는 sessionStorage에서 확인
    const accessToken = sessionStorage.getItem("accessToken");
    const user = sessionStorage.getItem("user");

    if (refreshToken && accessToken && user) {
      router.push("/chat");
    } else {
      router.push("/login");
    }
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p>Loading...</p>
    </div>
  );
}
