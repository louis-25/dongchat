import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";

const PUBLIC_PATHS = ["/login", "/join", "/auth"];
const AUTH_ENTRY_PATHS = ["/", "/login", "/join"];
const HOME = "/chat/friends";

const isPublic = (pathname: string) =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers?: Record<string, string>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          // 세션 쿠키 응답이 CDN에 캐시되지 않도록 Cache-Control 등을 적용
          Object.entries(headers ?? {}).forEach(([key, value]) => supabaseResponse.headers.set(key, value));
        },
      },
    },
  );

  // createServerClient와 getClaims 사이에 다른 코드를 두지 않는다(무작위 로그아웃 방지).
  const { data } = await supabase.auth.getClaims();
  const isAuthed = Boolean(data?.claims);
  const { pathname } = request.nextUrl;

  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone();
    url.pathname = target;
    url.search = "";
    const response = NextResponse.redirect(url);
    // 갱신된 세션 쿠키·캐시 헤더를 리다이렉트 응답에도 옮긴다.
    supabaseResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
    for (const header of ["cache-control", "expires", "pragma"]) {
      const value = supabaseResponse.headers.get(header);
      if (value) response.headers.set(header, value);
    }
    return response;
  };

  if (!isAuthed && !isPublic(pathname)) return redirectTo("/login");
  if (isAuthed && AUTH_ENTRY_PATHS.includes(pathname)) return redirectTo(HOME);

  return supabaseResponse;
}
