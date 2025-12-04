import { BASE_URL } from "@/config";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {

    return [
      {
        source: '/api/messages/:path*',
        destination: `${BASE_URL}/api/messages/:path*`, // 환경변수 기반 프록시
      },
    ];
  },
};

export default nextConfig;
