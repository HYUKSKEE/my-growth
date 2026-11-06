import { Suspense } from "react";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { DashboardView, RANGES, type RangeKey } from "@/components/DashboardView";
import { Skeleton } from "@/components/ui";
import { ACT_COLS, DAILY_COLS, fetchAll, listPeople, todayInTz } from "@/lib/garmin-data";
import { type ActivityRow, type DailyRow, addDays } from "@/lib/metrics";

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

function DashboardSkeleton() {
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6" aria-busy aria-label="불러오는 중">
      <Skeleton className="h-9 w-56" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-64 rounded-xl" />)}
      </div>
    </main>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  await connection(); // new Date() 사용 전에 요청 시점 렌더로 전환
  const sp = await searchParams;
  const raw = String(sp.range ?? "180");
  const rangeKey: RangeKey = raw in RANGES ? (raw as RangeKey) : "180";

  const today = todayInTz();
  // 이동평균·CTL 워밍업·이전 기간 비교용 여유분 120일
  const fetchFrom = addDays(today, -RANGES[rangeKey] + 1 - 120);

  const sb = await createClient();
  const { data: claims } = await sb.auth.getClaims();
  const me = String(claims?.claims.sub ?? "");

  const people = await listPeople(sb, me);

  const wanted = typeof sp.user === "string" ? sp.user : me;
  const viewingId = people.some((p) => p.id === wanted) ? wanted : me;

  const [daily, acts, { data: sync }] = await Promise.all([
    fetchAll<DailyRow>(sb, "daily_metrics", DAILY_COLS, "date", fetchFrom, viewingId),
    fetchAll<ActivityRow>(sb, "activities", ACT_COLS, "start_date_local", fetchFrom, viewingId),
    sb.from("my_sync_status").select("last_run_at,last_error").eq("user_id", viewingId).maybeSingle(),
  ]);

  return (
    <DashboardView
      daily={daily} acts={acts} today={today} rangeKey={rangeKey}
      email={String(claims?.claims.email ?? "")} sync={sync}
      people={people} viewingId={viewingId} isSelf={viewingId === me}
    />
  );
}
