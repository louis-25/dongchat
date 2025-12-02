import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
    return [
      {
        source: '/api/messages/:path*',
        destination: `${apiUrl}/api/messages/:path*`, // 환경변수 기반 프록시
      },
    ];
  },
};

export default nextConfig;
