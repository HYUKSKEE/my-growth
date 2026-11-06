import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubmitButton } from "@/components/ui";

// Supabase Auth(OAuth 서버)가 인증 요청을 검증한 뒤 사용자를 이 화면으로 보낸다.
export default function Page({ searchParams }: PageProps<"/oauth/consent">) {
  return (
    <Suspense fallback={<main className="flex flex-1 items-center justify-center px-4 text-sm text-muted">불러오는 중…</main>}>
      <Consent searchParams={searchParams} />
    </Suspense>
  );
}

function Message({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <div role="alert" className="card w-full max-w-sm space-y-2 p-6 text-sm">
        <h1 className="text-lg font-semibold">{title}</h1>
        <p className="text-secondary">{children}</p>
      </div>
    </main>
  );
}

async function Consent({ searchParams }: { searchParams: PageProps<"/oauth/consent">["searchParams"] }) {
  const sp = await searchParams;
  const authorizationId = typeof sp.authorization_id === "string" ? sp.authorization_id : "";
  if (!authorizationId) return <Message title="잘못된 요청입니다">연결 요청 정보가 없습니다. 앱에서 연결을 다시 시도하세요.</Message>;

  const sb = await createClient();
  const { data: claims } = await sb.auth.getClaims();
  if (!claims?.claims) redirect(`/login?next=${encodeURIComponent(`/oauth/consent?authorization_id=${authorizationId}`)}`);

  const { data, error } = await sb.auth.oauth.getAuthorizationDetails(authorizationId);
  if (error || !data) return <Message title="연결 요청을 확인하지 못했습니다">요청이 만료되었거나 이미 처리되었습니다. 앱에서 연결을 다시 시도하세요.</Message>;
  // 이미 동의한 앱이면 화면 없이 바로 돌려보낸다
  if (!("authorization_id" in data)) redirect(data.redirect_url);

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <form action="/oauth/decision" method="POST" className="card w-full max-w-sm space-y-4 p-6">
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <div>
          <h1 className="text-xl font-semibold">{data.client.name} 연결</h1>
          <p className="text-sm text-muted">{String(claims.claims.email ?? "")} 계정으로 연결합니다.</p>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-sm text-secondary">
          <li>내 가민 성장 지표(운동·수면·HRV 등)를 <b>읽기 전용</b>으로 조회</li>
          <li>수락된 친구의 지표도 조회 (친구 대시보드에서 볼 수 있는 범위와 같습니다)</li>
        </ul>
        <p className="text-xs text-muted">가민 비밀번호와 토큰은 공유되지 않으며, 데이터를 수정할 수 없습니다. 연결은 언제든 해제할 수 있습니다.</p>
        <div className="flex items-center gap-3">
          <SubmitButton name="decision" value="approve" pendingLabel="연결 중…">허용</SubmitButton>
          <SubmitButton variant="link" name="decision" value="deny">거부</SubmitButton>
        </div>
      </form>
    </main>
  );
}
