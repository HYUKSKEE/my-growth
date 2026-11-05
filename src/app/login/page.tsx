"use client";

import { useActionState } from "react";
import { signIn } from "./actions";

export default function LoginPage() {
  const [error, action, pending] = useActionState(signIn, null);

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <form action={action} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">Garmin Growth</h1>
          <p className="text-sm text-muted">Supabase 계정으로 로그인하세요.</p>
        </div>
        <label className="block space-y-1 text-sm">
          <span className="text-secondary">이메일</span>
          <input name="email" type="email" required autoComplete="email" className="input" />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-secondary">비밀번호</span>
          <input name="password" type="password" required autoComplete="current-password" className="input" />
        </label>
        {error && <p className="text-sm text-critical">{error}</p>}
        <button disabled={pending} className="btn w-full">
          {pending ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
