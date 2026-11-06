import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/safe-next";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";

// Supabase 세션 쿠키 갱신 + 비로그인 사용자를 /login 으로 보내는 낙관적 체크
export async function proxy(request: NextRequest) {
  // MCP 엔드포인트와 OAuth 메타데이터는 쿠키 로그인이 아니라 Bearer 토큰으로 자체 인증한다
  const path = request.nextUrl.pathname;
  if (path === "/mcp" || path.startsWith("/.well-known/")) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v));
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const isLogin = request.nextUrl.pathname.startsWith("/login");

  if (!data?.claims && !isLogin) {
    // 로그인 후 원래 가려던 곳(예: OAuth 동의 화면)으로 돌아오도록 기억한다
    const here = request.nextUrl.pathname + request.nextUrl.search;
    const url = new URL("/login", request.url);
    if (here !== "/") url.searchParams.set("next", here);
    return NextResponse.redirect(url);
  }
  if (data?.claims && isLogin) {
    return NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url));
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
