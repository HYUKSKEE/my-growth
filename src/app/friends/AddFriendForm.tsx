"use client";

import { useActionState } from "react";
import { addFriend } from "./actions";

export function AddFriendForm() {
  const [msg, action, pending] = useActionState(addFriend, null);
  return (
    <form action={action} className="space-y-2">
      <div className="flex gap-2">
        <input name="code" required placeholder="친구의 초대 코드" maxLength={16}
          className="input flex-1 font-mono uppercase" autoComplete="off" />
        <button disabled={pending} className="btn">{pending ? "…" : "친구 신청"}</button>
      </div>
      {msg && <p className="text-sm text-secondary">{msg}</p>}
    </form>
  );
}
