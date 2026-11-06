import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { TOOLS, callTool } from "@/lib/mcp/tools";

/**
 * 원격 MCP 서버 (Streamable HTTP, 상태 없음). claude.ai 커스텀 커넥터가 접속한다.
 * 인증: Supabase Auth 가 발급한 OAuth 액세스 토큰(Bearer). 이 토큰으로 DB 를 호출하므로
 * 기존 RLS 가 그대로 적용된다(본인 + 수락된 친구 데이터만 읽힘).
 */

const SUPPORTED = ["2025-06-18", "2025-03-26", "2024-11-05"];
const INSTRUCTIONS =
  "개인 가민 성장 지표 앱의 데이터를 읽는 도구입니다. 훈련 추천 질문에는 먼저 get_overview 로 최근 피로(ATL)·컨디션(TSB)·HRV·수면 추세를 확인하고, 수치를 근거로 강도와 종류를 제안하세요. 의학적 진단은 하지 말고, 컨디션이 나쁘면 휴식을 우선 권하세요. 조회는 읽기 전용이며 본인과 수락된 친구의 데이터만 가능합니다.";

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

async function unauthorized(message: string) {
  return new Response(JSON.stringify({ error: "unauthorized", error_description: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      "WWW-Authenticate": `Bearer resource_metadata="${await origin()}/.well-known/oauth-protected-resource"`,
    },
  });
}

const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

export async function POST(request: Request) {
  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return unauthorized("로그인이 필요합니다.");

  const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: user, error: authError } = await sb.auth.getUser(token);
  if (authError || !user.user) return unauthorized("토큰이 유효하지 않거나 만료되었습니다.");
  const ctx = { sb, me: user.user.id };

  let body: Rpc | Rpc[];
  try {
    body = await request.json();
  } catch {
    return Response.json(fail(null, -32700, "Parse error"), { status: 400 });
  }

  async function handle(msg: Rpc) {
    const { id, method, params } = msg;
    // 알림(id 없음)은 응답하지 않는다
    if (id === undefined || id === null) return null;
    switch (method) {
      case "initialize": {
        const asked = String(params?.protocolVersion ?? "");
        return ok(id, {
          protocolVersion: SUPPORTED.includes(asked) ? asked : SUPPORTED[0],
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "garmin-growth", version: "1.0.0" },
          instructions: INSTRUCTIONS,
        });
      }
      case "ping":
        return ok(id, {});
      case "tools/list":
        return ok(id, { tools: TOOLS });
      case "tools/call": {
        const name = String(params?.name ?? "");
        if (!TOOLS.some((t) => t.name === name)) return fail(id, -32602, `Unknown tool: ${name}`);
        const r = await callTool(ctx, name, (params?.arguments as Record<string, unknown>) ?? {});
        return ok(id, { content: [{ type: "text", text: r.text }], isError: r.isError });
      }
      default:
        return fail(id, -32601, `Method not found: ${method}`);
    }
  }

  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map(handle))).filter(Boolean);
    return out.length ? Response.json(out) : new Response(null, { status: 202 });
  }
  const out = await handle(body);
  return out ? Response.json(out) : new Response(null, { status: 202 });
}

// 서버 → 클라이언트 SSE 스트림은 제공하지 않는다
export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
