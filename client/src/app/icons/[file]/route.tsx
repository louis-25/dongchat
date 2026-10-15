import { ImageResponse } from "next/og";
import { THEME_TOKENS } from "@/lib/theme";

// 앱 아이콘. maskable·apple은 OS가 모양을 자르므로 꽉 찬 사각형, 일반 아이콘은 둥근 모서리.
const ICONS: Record<string, { size: number; rounded: boolean }> = {
  "icon-192.png": { size: 192, rounded: true },
  "icon-512.png": { size: 512, rounded: true },
  "maskable-512.png": { size: 512, rounded: false },
  "apple-180.png": { size: 180, rounded: false },
};

export const dynamic = "force-static";
export const dynamicParams = false;
export const generateStaticParams = () => Object.keys(ICONS).map((file) => ({ file }));

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const icon = ICONS[(await params).file];
  if (!icon) return new Response("Not found", { status: 404 });
  const { primary, background } = THEME_TOKENS.mint.light;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: primary,
          color: background,
          fontSize: icon.size * 0.56,
          fontWeight: 800,
          borderRadius: icon.rounded ? icon.size * 0.22 : 0,
        }}
      >
        d
      </div>
    ),
    { width: icon.size, height: icon.size },
  );
}
