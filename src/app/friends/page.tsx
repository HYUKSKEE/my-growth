import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";
import { ActionForm, InfoTip, PendingLink, Skeleton, SubmitButton } from "@/components/ui";
import { ConnectGarmin } from "./ConnectGarmin";
import { acceptFriend, addFriend, disconnectGarmin, removeFriendship, updateName } from "./actions";

export default function Page() {
  return (
    <Suspense fallback={<FriendsSkeleton />}>
      <Friends />
    </Suspense>
  );
}

function FriendsSkeleton() {
  return (
    <main className="mx-auto w-full max-w-2xl space-y-6 px-4 py-6" aria-busy aria-label="불러오는 중">
      <Skeleton className="h-8 w-24" />
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
    </main>
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
          <PendingLink href="/" className="text-secondary hover:underline">← 대시보드</PendingLink>
          <form action={signOut}><SubmitButton variant="link" pendingLabel="로그아웃 중…">로그아웃</SubmitButton></form>
        </div>
      </header>

      <section className="card space-y-3 p-4">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">내 초대 코드 <InfoTip text="이 코드는 바뀌지 않습니다. 친구에게 알려 주면 친구 신청을 보낼 수 있어요." /></h2>
        <p className="text-sm text-secondary">친구가 이 코드를 입력하면 신청이 옵니다. 수락하면 서로의 대시보드를 볼 수 있어요.</p>
        <div className="rounded-md bg-background px-3 py-2 font-mono text-lg tracking-widest">{mine?.invite_code ?? "—"}</div>
        <ActionForm action={updateName} className="flex flex-wrap gap-2">
          <input name="name" defaultValue={mine?.display_name} maxLength={30} required className="input flex-1" aria-label="표시 이름" />
          <SubmitButton pendingLabel="저장 중…" title="친구에게 보이는 이름을 바꿉니다">이름 변경</SubmitButton>
        </ActionForm>
      </section>

      <section className="card space-y-3 p-4">
        <h2 className="text-sm font-semibold">친구 추가</h2>
        <ActionForm action={addFriend} className="space-y-2">
          <div className="flex gap-2">
            <input name="code" required placeholder="친구의 초대 코드" maxLength={16}
              className="input flex-1 font-mono uppercase" autoComplete="off" aria-label="친구의 초대 코드" />
            <SubmitButton pendingLabel="신청 중…">친구 신청</SubmitButton>
          </div>
        </ActionForm>
      </section>

      {incoming.length > 0 && (
        <section className="card space-y-2 p-4">
          <h2 className="text-sm font-semibold">받은 신청</h2>
          {incoming.map(({ f, other }) => (
            <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{other?.display_name ?? "알 수 없음"}</span>
              <div className="flex gap-2">
                <ActionForm action={acceptFriend} className="flex flex-wrap"><input type="hidden" name="id" value={f.id} /><SubmitButton pendingLabel="수락 중…" title="서로의 대시보드를 볼 수 있게 됩니다">수락</SubmitButton></ActionForm>
                <ActionForm action={removeFriendship} className="flex flex-wrap" confirmMessage="이 신청을 거절할까요?"><input type="hidden" name="id" value={f.id} /><SubmitButton variant="link" pendingLabel="처리 중…">거절</SubmitButton></ActionForm>
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
            <PendingLink href={`/?user=${other?.user_id}`} className="hover:underline" title="이 친구의 대시보드 보기">{other?.display_name ?? "알 수 없음"}</PendingLink>
            <ActionForm action={removeFriendship} className="flex flex-wrap justify-end" confirmMessage={`${other?.display_name ?? "이 친구"}님과 친구를 끊을까요? 서로의 대시보드가 보이지 않게 됩니다.`}>
              <input type="hidden" name="id" value={f.id} /><SubmitButton variant="link" pendingLabel="끊는 중…">친구 끊기</SubmitButton>
            </ActionForm>
          </div>
        ))}
        {outgoing.length > 0 && (
          <>
            <h3 className="pt-2 text-xs text-muted">보낸 신청 (수락 대기)</h3>
            {outgoing.map(({ f, other }) => (
              <div key={f.id} className="flex items-center justify-between text-sm text-secondary">
                <span>{other?.display_name ?? "알 수 없음"}</span>
                <ActionForm action={removeFriendship} className="flex flex-wrap" confirmMessage="보낸 신청을 취소할까요?"><input type="hidden" name="id" value={f.id} /><SubmitButton variant="link" pendingLabel="취소 중…">취소</SubmitButton></ActionForm>
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
            <ActionForm action={disconnectGarmin} className="flex flex-wrap" confirmMessage="가민 연결을 해제할까요? 저장된 토큰이 삭제되고 자동 동기화가 멈춥니다. (이미 받은 데이터는 유지됩니다)">
              <SubmitButton variant="link" className="text-xs" pendingLabel="해제 중…" title="저장된 가민 토큰을 삭제하고 자동 동기화를 멈춥니다">연결 해제 (토큰 삭제)</SubmitButton>
            </ActionForm>
          </>
        ) : (
          <ConnectGarmin />
        )}
      </section>
    </main>
  );
}
