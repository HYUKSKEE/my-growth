import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const form = await request.formData();
  const authorizationId = String(form.get("authorization_id") ?? "");
  if (!authorizationId) return NextResponse.json({ error: "Missing authorization_id" }, { status: 400 });

  const sb = await createClient();
  const { data: claims } = await sb.auth.getClaims();
  if (!claims?.claims) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const approve = form.get("decision") === "approve";
  const { data, error } = approve
    ? await sb.auth.oauth.approveAuthorization(authorizationId)
    : await sb.auth.oauth.denyAuthorization(authorizationId);
  if (error || !data) return NextResponse.json({ error: error?.message ?? "처리하지 못했습니다." }, { status: 400 });

  // POST → GET 으로 바꿔서 클라이언트 콜백으로 보낸다
  return NextResponse.redirect(data.redirect_url, 303);
}
