import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { DashboardView, RANGES, type RangeKey } from "@/components/DashboardView";
import { type ActivityRow, type DailyRow, addDays } from "@/lib/metrics";

const DAILY_COLS = "date,steps,resting_hr,hrv_last_night,vo2max_run,sleep_score,sleep_seconds,body_battery_max";
const ACT_COLS =
  "activity_id,start_date_local,type,name,duration_s,distance_m,avg_hr,avg_speed_mps,elevation_gain_m,training_load";

/** PostgREST 기본 1000행 제한을 넘기기 위한 페이지네이션 */
async function fetchAll<T>(sb: SupabaseClient, table: string, cols: string, dateCol: string, from: string): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    const { data, error } = await sb.from(table).select(cols).gte(dateCol, from).order(dateCol).range(i, i + 999);
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
    <Suspense fallback={<main className="mx-auto w-full max-w-6xl px-4 py-6 text-sm text-muted">불러오는 중…</main>}>
      <Dashboard searchParams={searchParams} />
    </Suspense>
  );
}

async function Dashboard({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const raw = String((await searchParams).range ?? "180");
  const rangeKey: RangeKey = raw in RANGES ? (raw as RangeKey) : "180";

  const today = todayInTz();
  // 이동평균·CTL 워밍업·이전 기간 비교용 여유분 120일
  const fetchFrom = addDays(today, -RANGES[rangeKey] + 1 - 120);

  const sb = await createClient();
  const [{ data: claims }, daily, acts, { data: sync }] = await Promise.all([
    sb.auth.getClaims(),
    fetchAll<DailyRow>(sb, "daily_metrics", DAILY_COLS, "date", fetchFrom),
    fetchAll<ActivityRow>(sb, "activities", ACT_COLS, "start_date_local", fetchFrom),
    sb.from("my_sync_status").select("last_run_at,last_error").maybeSingle(),
  ]);

  return (
    <DashboardView
      daily={daily} acts={acts} today={today} rangeKey={rangeKey}
      email={String(claims?.claims.email ?? "")} sync={sync}
    />
  );
}
