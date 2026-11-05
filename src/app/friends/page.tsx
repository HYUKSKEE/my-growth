import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { AddFriendForm } from "./AddFriendForm";
import { ConnectGarmin } from "./ConnectGarmin";
import { acceptFriend, disconnectGarmin, removeFriendship, updateName } from "./actions";

export default function Page() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-2xl px-4 py-6 text-sm text-muted">불러오는 중…</main>}>
      <Friends />
    </Suspense>
  );
}

type Profile = { user_id: string; display_name: string; invite_code: string };
type Friendship = { id: number; requester_id: string; addressee_id: string; status: "pending" | "accepted" };

async function Friends() {
  const sb = await createClient();
  const { data: claims } = await sb.auth.getClaims();
  const me = String(claims?.claims.sub ?? "");

  const [{ data: profiles }, { data: fs }, { data: status }] = await Promise.all([
    sb.from("profiles").select("user_id,display_name,invite_code"),
    sb.from("friendships").select("id,requester_id,addressee_id,status").order("created_at"),
    sb.from("my_sync_status").select("user_id,last_run_at,last_synced_date,connected").eq("user_id", me).maybeSingle(),
  ]);
  const byId = new Map((profiles as Profile[] | null ?? []).map((p) => [p.user_id, p]));
  const mine = byId.get(me);
  const rows = (fs as Friendship[] | null ?? []).map((f) => ({
    f, other: byId.get(f.requester_id === me ? f.addressee_id : f.requester_id),
  }));
  const friends = rows.filter((r) => r.f.status === "accepted");
  const incoming = rows.filter((r) => r.f.status === "pending" && r.f.addressee_id === me);
  const outgoing = rows.filter((r) => r.f.status === "pending" && r.f.requester_id === me);

  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">친구</h1>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-secondary hover:underline">← 대시보드</Link>
          <form action={signOut}><button className="text-secondary hover:underline">로그아웃</button></form>
        </div>
      </header>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">내 초대 코드</h2>
        <p className="text-sm text-secondary">친구가 이 코드를 입력하면 신청이 옵니다. 수락하면 서로의 대시보드를 볼 수 있어요.</p>
        <div className="rounded-md bg-background px-3 py-2 font-mono text-lg tracking-widest">{mine?.invite_code ?? "—"}</div>
        <form action={updateName} className="flex gap-2">
          <input name="name" defaultValue={mine?.display_name} maxLength={30} required className="input flex-1" aria-label="표시 이름" />
          <button className="btn">이름 변경</button>
        </form>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">친구 추가</h2>
        <AddFriendForm />
      </section>

      {incoming.length > 0 && (
        <section className="card space-y-2 p-4">
          <h2 className="text-sm font-semibold">받은 신청</h2>
          {incoming.map(({ f, other }) => (
            <div key={f.id} className="flex items-center justify-between text-sm">
              <span>{other?.display_name ?? "알 수 없음"}</span>
              <div className="flex gap-2">
                <form action={acceptFriend}><input type="hidden" name="id" value={f.id} /><button className="btn">수락</button></form>
                <form action={removeFriendship}><input type="hidden" name="id" value={f.id} /><button className="text-secondary hover:underline">거절</button></form>
              </div>
            </div>
          ))}
        </section>
      )}

      <section className="card space-y-2 p-4">
        <h2 className="text-sm font-semibold">친구 목록 ({friends.length})</h2>
        {friends.length === 0 && <p className="text-sm text-muted">아직 친구가 없습니다.</p>}
        {friends.map(({ f, other }) => (
          <div key={f.id} className="flex items-center justify-between text-sm">
            <Link href={`/?user=${other?.user_id}`} className="hover:underline">{other?.display_name ?? "알 수 없음"}</Link>
            <form action={removeFriendship}><input type="hidden" name="id" value={f.id} /><button className="text-secondary hover:underline">친구 끊기</button></form>
          </div>
        ))}
        {outgoing.length > 0 && (
          <>
            <h3 className="pt-2 text-xs text-muted">보낸 신청 (수락 대기)</h3>
            {outgoing.map(({ f, other }) => (
              <div key={f.id} className="flex items-center justify-between text-sm text-secondary">
                <span>{other?.display_name ?? "알 수 없음"}</span>
                <form action={removeFriendship}><input type="hidden" name="id" value={f.id} /><button className="hover:underline">취소</button></form>
              </div>
            ))}
          </>
        )}
      </section>

      <section className="card space-y-3 p-4 text-sm">
        <h2 className="font-semibold">내 가민 연결 {status?.connected ? "✅" : ""}</h2>
        {status?.connected ? (
          <>
            <p className="text-secondary">
              {status.last_synced_date
                ? "연결됨. 매일 자동으로 동기화됩니다."
                : "연결됨. 첫 동기화를 기다리는 중입니다 (보통 1시간 이내)."}
            </p>
            <form action={disconnectGarmin}>
              <button className="text-xs text-secondary hover:underline">연결 해제 (토큰 삭제)</button>
            </form>
          </>
        ) : (
          <ConnectGarmin />
        )}
      </section>
    </main>
  );
}
