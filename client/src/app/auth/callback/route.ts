import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const HOME = "/chat/friends";

// 카카오 OAuth(PKCE) 콜백: code를 세션 쿠키로 교환한다.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? HOME;
  // 외부 URL로의 오픈 리다이렉트 방지
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : HOME;

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${safeNext}`);
  }
  return NextResponse.redirect(`${origin}/login?error=oauth`);
}
