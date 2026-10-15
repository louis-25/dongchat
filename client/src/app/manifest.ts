import type { MetadataRoute } from "next";
import { THEME_TOKENS } from "@/lib/theme";

export default function manifest(): MetadataRoute.Manifest {
  const bg = THEME_TOKENS.mint.light.background;
  return {
    name: "dongchat",
    short_name: "dongchat",
    description: "친구들과 가볍게 대화해요",
    lang: "ko",
    start_url: "/chat/rooms",
    scope: "/",
    display: "standalone",
    background_color: bg,
    theme_color: bg,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
