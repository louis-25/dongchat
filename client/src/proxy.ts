import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // _next 정적 파일, 이미지·스크립트·매니페스트 등 public 정적 파일 제외 (sw.js 포함)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|js|json|webmanifest)$).*)",
  ],
};
