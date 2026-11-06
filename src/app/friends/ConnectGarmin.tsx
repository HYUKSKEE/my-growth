"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SubmitButton } from "@/components/ui";

type Step = "form" | "mfa" | "done";

async function call(path: string, body: object): Promise<{ status?: string; error?: string; syncing?: boolean }> {
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
  const [syncing, setSyncing] = useState(false);

  async function run(path: string, body: object, onOk: (s: string, syncing: boolean) => void) {
    setPending(true);
    setError(null);
    const r = await call(path, body);
    setPending(false);
    if (r.error || !r.status) return setError(r.error ?? "알 수 없는 오류");
    onOk(r.status, r.syncing === true);
  }

  const finish = (started: boolean) => { setSyncing(started); setStep("done"); router.refresh(); };

  if (step === "done") {
    return <p role="status" className="text-sm text-good">{syncing ? "연결되었습니다! 동기화를 시작했어요. 보통 10분 안에 데이터가 나타납니다." : "연결되었습니다! 첫 동기화가 끝나면(최대 1시간) 데이터가 나타납니다."}</p>;
  }

  return step === "form" ? (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const form = e.currentTarget;
      run("/api/garmin/connect", { email: f.get("email"), password: f.get("password") }, (s, started) => {
        form.reset(); // 비밀번호를 화면에 남기지 않음
        if (s === "mfa") setStep("mfa");
        else finish(started);
      });
    }}>
      <input name="email" type="email" required placeholder="가민 이메일" autoComplete="off" className="input" disabled={pending} aria-label="가민 이메일" />
      <input name="password" type="password" required placeholder="가민 비밀번호" autoComplete="off" className="input" disabled={pending} aria-label="가민 비밀번호" />
      <p className="text-xs text-muted">비밀번호는 서버에 저장되지 않고 로그인에만 한 번 쓰입니다. 이후에는 토큰으로 동기화합니다.</p>
      {pending && <p role="status" className="text-xs text-muted">가민에 로그인하는 중입니다. 최대 30초 정도 걸릴 수 있어요. 창을 닫지 마세요.</p>}
      {error && <p role="alert" className="text-sm text-critical">{error}</p>}
      <SubmitButton pending={pending} pendingLabel="연결 중…" title="가민 계정으로 한 번 로그인해 토큰을 저장합니다">가민 연결</SubmitButton>
    </form>
  ) : (
    <form className="space-y-2" onSubmit={(e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      run("/api/garmin/mfa", { code: f.get("code") }, (_s, started) => finish(started));
    }}>
      <p className="text-sm text-secondary">가민이 보낸 인증 코드를 입력하세요 (메일/문자/앱).</p>
      <input name="code" required inputMode="numeric" autoComplete="one-time-code" placeholder="MFA 코드" className="input font-mono" />
      {error && <p role="alert" className="text-sm text-critical">{error}</p>}
      <div className="flex items-center gap-3">
        <SubmitButton pending={pending} pendingLabel="확인 중…">확인</SubmitButton>
        <button type="button" disabled={pending} onClick={() => { setStep("form"); setError(null); }} className="link-btn">처음부터</button>
      </div>
    </form>
  );
}
