import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { paletteBootScript, paletteCss, THEME_TOKENS } from "@/lib/theme";

export const metadata: Metadata = {
  title: "dongchat",
  description: "친구들과 가볍게 대화해요",
  appleWebApp: { capable: true, title: "dongchat", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-180.png" },
};

// interactiveWidget: 안드로이드 크롬에서 키보드가 올라오면 레이아웃 높이(100dvh)가 줄어든다.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 앱처럼 쓰도록 손가락 확대·입력창 자동 확대를 막는다(입력 글자는 16px 이상 유지)
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: THEME_TOKENS.mint.light.background,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <style dangerouslySetInnerHTML={{ __html: paletteCss() }} />
        <script dangerouslySetInnerHTML={{ __html: paletteBootScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
