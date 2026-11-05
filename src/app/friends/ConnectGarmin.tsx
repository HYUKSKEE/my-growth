"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Step = "form" | "mfa" | "done";

async function call(path: string, body: object): Promise<{ status?: string; error?: string }> {
  const { data } = await createClient().auth.getSession();
  if (!data.session) return { error: "로그인이 필요합니다. 다시 로그인하세요." };
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` },
      body: JSON.stringify(body),
    });
    return await res.json();
  } catch {
    return { error: "서버에 연결하지 못했습니다." };
  }
}

export function ConnectGarmin() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("form");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function run(path: string, body: object, onOk: (s: string) => void) {
    setPending(true);
    setError(null);
    const r = await call(path, body);
    setPending(false);
    if (r.error || !r.status) return setError(r.error ?? "알 수 없는 오류");
    onOk(r.status);
  }

  const finish = () => { setStep("done"); router.refresh(); };

  if (step === "done") {
    return <p className="text-sm text-good-text">연결되었습니다! 첫 동기화가 끝나면(보통 1시간 이내) 데이터가 나타납니다.</p>;
  }

  return step === "form" ? (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const form = e.currentTarget;
      run("/api/garmin/connect", { email: f.get("email"), password: f.get("password") }, (s) => {
        form.reset(); // 비밀번호를 화면에 남기지 않음
        if (s === "mfa") setStep("mfa");
        else finish();
      });
    }}>
      <input name="email" type="email" required placeholder="가민 이메일" autoComplete="off" className="input" />
      <input name="password" type="password" required placeholder="가민 비밀번호" autoComplete="off" className="input" />
      <p className="text-xs text-muted">비밀번호는 서버에 저장되지 않고 로그인에만 한 번 쓰입니다. 이후에는 토큰으로 동기화합니다.</p>
      {error && <p className="text-sm text-critical">{error}</p>}
      <button disabled={pending} className="btn">{pending ? "연결 중…" : "가민 연결"}</button>
    </form>
  ) : (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      run("/api/garmin/mfa", { code: f.get("code") }, finish);
    }}>
      <p className="text-sm text-secondary">가민이 보낸 인증 코드를 입력하세요 (메일/문자/앱).</p>
      <input name="code" required inputMode="numeric" autoComplete="one-time-code" placeholder="MFA 코드" className="input font-mono" />
      {error && <p className="text-sm text-critical">{error}</p>}
      <div className="flex items-center gap-3">
        <button disabled={pending} className="btn">{pending ? "확인 중…" : "확인"}</button>
        <button type="button" onClick={() => { setStep("form"); setError(null); }} className="text-sm text-secondary hover:underline">처음부터</button>
      </div>
    </form>
  );
}
