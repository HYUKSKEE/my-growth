"use client";

import { useActionState, useState } from "react";
import { signIn, signUp } from "./actions";

export default function LoginPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [inError, inAction, inPending] = useActionState(signIn, null);
  const [upError, upAction, upPending] = useActionState(signUp, null);
  const up = mode === "up";
  const error = up ? upError : inError;
  const pending = up ? upPending : inPending;

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <form action={up ? upAction : inAction} className="card w-full max-w-sm space-y-4 p-6">
        <div>
          <h1 className="text-xl font-semibold">Garmin Growth</h1>
          <p className="text-sm text-muted">{up ? "새 계정을 만드세요." : "계정으로 로그인하세요."}</p>
        </div>
        {up && (
          <label className="block space-y-1 text-sm">
            <span className="text-secondary">표시 이름 (친구에게 보임)</span>
            <input name="name" type="text" required maxLength={30} autoComplete="nickname" className="input" />
          </label>
        )}
        <label className="block space-y-1 text-sm">
          <span className="text-secondary">이메일</span>
          <input name="email" type="email" required autoComplete="email" className="input" />
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-secondary">비밀번호{up && " (8자 이상)"}</span>
          <input name="password" type="password" required minLength={up ? 8 : undefined}
            autoComplete={up ? "new-password" : "current-password"} className="input" />
        </label>
        {error && <p className="text-sm text-critical">{error}</p>}
        <button disabled={pending} className="btn w-full">
          {pending ? "처리 중…" : up ? "가입하기" : "로그인"}
        </button>
        <button type="button" onClick={() => setMode(up ? "in" : "up")}
          className="w-full text-center text-sm text-secondary hover:underline">
          {up ? "이미 계정이 있나요? 로그인" : "계정이 없나요? 가입하기"}
        </button>
      </form>
    </main>
  );
}
