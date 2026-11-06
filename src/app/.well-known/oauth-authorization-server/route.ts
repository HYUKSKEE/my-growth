import { NextResponse } from "next/server";
import { SUPABASE_URL } from "@/lib/supabase/env";

// 구버전 MCP 클라이언트(2025-03-26 스펙)는 MCP 서버 도메인에서 인증 서버 메타데이터를 찾는다.
export function GET() {
  return NextResponse.redirect(`${SUPABASE_URL}/.well-known/oauth-authorization-server/auth/v1`, 307);
}
