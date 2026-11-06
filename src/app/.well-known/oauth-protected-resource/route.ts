import { headers } from "next/headers";
import { SUPABASE_URL } from "@/lib/supabase/env";

// RFC 9728: MCP 서버(/mcp)가 어떤 인증 서버를 쓰는지 알려 준다.
export async function GET() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return Response.json(
    {
      resource: `${proto}://${host}/mcp`,
      authorization_servers: [`${SUPABASE_URL}/auth/v1`],
      bearer_methods_supported: ["header"],
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
