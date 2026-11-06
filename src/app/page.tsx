import { Suspense } from "react";
import { connection } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DashboardView, RANGES, type RangeKey } from "@/components/DashboardView";
import { Skeleton } from "@/components/ui";
import { type ActivityRow, type DailyRow, addDays } from "@/lib/metrics";

const DAILY_COLS = "date,steps,resting_hr,hrv_last_night,vo2max_run,sleep_score,sleep_seconds,body_battery_max";
const ACT_COLS =
  "activity_id,start_date_local,type,name,duration_s,distance_m,avg_hr,avg_speed_mps,elevation_gain_m,training_load";

/** PostgREST 기본 1000행 제한을 넘기기 위한 페이지네이션 */
async function fetchAll<T>(
  sb: SupabaseClient, table: string, cols: string, dateCol: string, from: string, userId: string,
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(table).select(cols).eq("user_id", userId).gte(dateCol, from).order(dateCol).range(i, i + 999);
    if (error) throw error;
    out.push(...(data as T[]));
    if (!data || data.length < 1000) return out;
  }
}

function todayInTz() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: process.env.APP_TIMEZONE ?? "Asia/Seoul" }).format(new Date());
}

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

  // 나 + 수락된 친구 (RLS 가 접근 권한을 최종 강제하지만, 선택 목록은 여기서 만든다)
  const [{ data: profiles }, { data: fs }] = await Promise.all([
    sb.from("profiles").select("user_id,display_name"),
    sb.from("friendships").select("requester_id,addressee_id").eq("status", "accepted"),
  ]);
  const names = new Map((profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]));
  const friendIds = (fs ?? []).map((f) => (f.requester_id === me ? f.addressee_id : f.requester_id) as string);
  const people = [me, ...friendIds].map((id) => ({ id, name: names.get(id) ?? "알 수 없음" }));

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
