import type { SupabaseClient } from "@supabase/supabase-js";
import { ACT_COLS, DAILY_COLS, fetchAll, listPeople, todayInTz } from "@/lib/garmin-data";
import {
  type ActivityRow, type DailyRow, addDays, compareWindows, fitnessFatigue, fmtDuration, fmtPace, isRun,
  records, round, runningEfficiency, weeklyRunVolume,
} from "@/lib/metrics";

type Json = Record<string, unknown>;
type Ctx = { sb: SupabaseClient; me: string };

export const TOOLS = [
  {
    name: "list_people",
    description:
      "내 가민 성장 지표 앱에서 조회할 수 있는 사람 목록(나 + 수락된 친구)을 돌려줍니다. 다른 도구의 person 인자에 쓸 이름을 확인할 때 먼저 호출하세요.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "get_overview",
    description:
      "한 사람의 종합 요약: 최근 28일 vs 이전 28일 비교(VO2max, 안정시 심박, 수면 중 HRV, 수면 점수, 러닝 효율, 주간 러닝 거리), 체력(CTL)·피로(ATL)·컨디션(TSB), 최근 7일 상태, 기간 내 기록, 마지막 동기화. '오늘 어떤 훈련을 할까' 같은 질문에는 이 도구를 먼저 호출하세요.",
    inputSchema: {
      type: "object",
      properties: { person: { type: "string", description: "조회할 사람의 이름 또는 id. 생략하면 본인." } },
      additionalProperties: false,
    },
  },
  {
    name: "get_daily_metrics",
    description: "일별 지표(걸음수, 안정시 심박, HRV, VO2max, 수면 점수·시간, 바디배터리) 원본을 최신순으로 돌려줍니다.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string", description: "이름 또는 id. 생략하면 본인." },
        days: { type: "integer", minimum: 1, maximum: 180, description: "최근 며칠 (기본 30)" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_activities",
    description: "최근 운동 기록(종류, 거리, 시간, 페이스, 평균 심박, 고도, 훈련 부하)을 최신순으로 돌려줍니다.",
    inputSchema: {
      type: "object",
      properties: {
        person: { type: "string", description: "이름 또는 id. 생략하면 본인." },
        days: { type: "integer", minimum: 1, maximum: 365, description: "최근 며칠 (기본 30)" },
        limit: { type: "integer", minimum: 1, maximum: 100, description: "최대 개수 (기본 30)" },
      },
      additionalProperties: false,
    },
  },
] as const;

class ToolError extends Error {}

const num = (v: unknown, def: number, min: number, max: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : def;
};

async function resolvePerson(ctx: Ctx, person: unknown) {
  const people = await listPeople(ctx.sb, ctx.me);
  const q = typeof person === "string" ? person.trim() : "";
  if (!q || q === "me" || q === "나" || q === ctx.me) return people[0];
  const hit =
    people.find((p) => p.id === q) ??
    people.find((p) => p.name.toLowerCase() === q.toLowerCase()) ??
    people.find((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  if (!hit) {
    throw new ToolError(
      `'${q}' 님을 찾을 수 없습니다. 조회 가능한 사람: ${people.map((p) => p.name).join(", ")}. (친구 수락이 끝난 사람만 조회됩니다)`,
    );
  }
  return hit;
}

const r1 = (v: number | null) => (v == null ? null : round(v, 1));

function describe(c: { current: number | null; previous: number | null; delta: number | null }, d = 1) {
  return {
    recent_28d_avg: c.current == null ? null : round(c.current, d),
    previous_28d_avg: c.previous == null ? null : round(c.previous, d),
    change: c.delta == null ? null : round(c.delta, d),
  };
}

function activityOut(a: ActivityRow) {
  return {
    date: a.start_date_local,
    type: a.type,
    name: a.name,
    distance_km: a.distance_m ? round(a.distance_m / 1000, 2) : null,
    duration: a.duration_s ? fmtDuration(a.duration_s) : null,
    pace: isRun(a.type) && a.avg_speed_mps ? fmtPace(1000 / a.avg_speed_mps) : null,
    avg_hr: a.avg_hr,
    elevation_gain_m: a.elevation_gain_m == null ? null : Math.round(a.elevation_gain_m),
    training_load: a.training_load == null ? null : Math.round(a.training_load),
  };
}

async function overview(ctx: Ctx, args: Json): Promise<Json> {
  const p = await resolvePerson(ctx, args.person);
  const today = todayInTz();
  const from = addDays(today, -90 + 1);
  const fetchFrom = addDays(from, -120);
  const [daily, acts, { data: sync }] = await Promise.all([
    fetchAll<DailyRow>(ctx.sb, "daily_metrics", DAILY_COLS, "date", fetchFrom, p.id),
    fetchAll<ActivityRow>(ctx.sb, "activities", ACT_COLS, "start_date_local", fetchFrom, p.id),
    ctx.sb.from("my_sync_status").select("last_run_at,last_synced_date,last_error").eq("user_id", p.id).maybeSingle(),
  ]);
  if (daily.length === 0 && acts.length === 0) {
    return { person: p.name, today, note: "아직 동기화된 데이터가 없습니다. 가민 연결 또는 첫 동기화 전일 수 있습니다.", sync };
  }

  const series = (k: keyof DailyRow) => daily.map((d) => ({ date: d.date, value: d[k] as number | null }));
  const weekly = weeklyRunVolume(acts, fetchFrom, today);
  const eff = runningEfficiency(acts, fetchFrom);
  const load = fitnessFatigue(acts, from, today);
  const now = load.at(-1);

  const last7From = addDays(today, -6);
  const d7 = daily.filter((d) => d.date >= last7From);
  const avg = (xs: (number | null)[]) => {
    const v = xs.filter((x): x is number => x != null);
    return v.length ? r1(v.reduce((a, b) => a + b, 0) / v.length) : null;
  };
  const a7 = acts.filter((a) => a.start_date_local >= last7From);
  const recs = records(acts.filter((a) => a.start_date_local >= from));

  return {
    person: p.name,
    today,
    sync: sync && { last_run_at: sync.last_run_at, last_synced_date: sync.last_synced_date, last_error: sync.last_error },
    trends_28d_vs_previous_28d: {
      vo2max_run: describe(compareWindows(series("vo2max_run"), today)),
      resting_hr_bpm: { ...describe(compareWindows(series("resting_hr"), today)), note: "낮아질수록 좋음" },
      hrv_last_night_ms: describe(compareWindows(series("hrv_last_night"), today)),
      sleep_score: describe(compareWindows(series("sleep_score"), today)),
      running_efficiency_m_per_beat: describe(compareWindows(eff, today), 2),
      weekly_run_km: describe(compareWindows(weekly.slice(0, -1).map((w) => ({ date: w.week, value: w.km })), addDays(today, -7))),
    },
    training_load: now && {
      fitness_ctl: r1(now.ctl),
      fatigue_atl: r1(now.atl),
      form_tsb: r1(now.tsb),
      note: "CTL=42일 체력, ATL=7일 피로, TSB=CTL-ATL(음수가 클수록 피로 누적, 양수면 회복됨)",
    },
    last_7_days: {
      avg_resting_hr: avg(d7.map((d) => d.resting_hr)),
      avg_hrv_ms: avg(d7.map((d) => d.hrv_last_night)),
      avg_sleep_score: avg(d7.map((d) => d.sleep_score)),
      avg_sleep_hours: avg(d7.map((d) => (d.sleep_seconds == null ? null : d.sleep_seconds / 3600))),
      latest_daily: daily.at(-1) ?? null,
      activities: a7.length,
      total_distance_km: round(a7.reduce((s, a) => s + (a.distance_m ?? 0), 0) / 1000, 1),
      total_training_load: Math.round(a7.reduce((s, a) => s + (a.training_load ?? 0), 0)),
      sessions: a7.slice(-7).reverse().map(activityOut),
    },
    records_last_90d: {
      longest_run: recs.longest && activityOut(recs.longest),
      fastest_5k_plus_run: recs.fastest5k && activityOut(recs.fastest5k),
      biggest_climb: recs.climb && activityOut(recs.climb),
    },
  };
}

async function dailyMetrics(ctx: Ctx, args: Json): Promise<Json> {
  const p = await resolvePerson(ctx, args.person);
  const days = num(args.days, 30, 1, 180);
  const from = addDays(todayInTz(), -days + 1);
  const rows = await fetchAll<DailyRow>(ctx.sb, "daily_metrics", DAILY_COLS, "date", from, p.id);
  return { person: p.name, from, count: rows.length, rows: rows.reverse() };
}

async function listActivities(ctx: Ctx, args: Json): Promise<Json> {
  const p = await resolvePerson(ctx, args.person);
  const days = num(args.days, 30, 1, 365);
  const limit = num(args.limit, 30, 1, 100);
  const from = addDays(todayInTz(), -days + 1);
  const rows = await fetchAll<ActivityRow>(ctx.sb, "activities", ACT_COLS, "start_date_local", from, p.id);
  return { person: p.name, from, total: rows.length, activities: rows.reverse().slice(0, limit).map(activityOut) };
}

/** 도구 실행. 사용자 오류는 ToolError → isError 결과로, 그 외는 상위에서 처리. */
export async function callTool(ctx: Ctx, name: string, args: Json): Promise<{ text: string; isError: boolean }> {
  try {
    let out: unknown;
    if (name === "list_people") out = { people: (await listPeople(ctx.sb, ctx.me)).map((p, i) => ({ name: p.name, is_me: i === 0 })) };
    else if (name === "get_overview") out = await overview(ctx, args);
    else if (name === "get_daily_metrics") out = await dailyMetrics(ctx, args);
    else if (name === "list_activities") out = await listActivities(ctx, args);
    else return { text: `알 수 없는 도구: ${name}`, isError: true };
    return { text: JSON.stringify(out), isError: false };
  } catch (e) {
    if (e instanceof ToolError) return { text: e.message, isError: true };
    console.error("[mcp] tool failed", name, e);
    return { text: "데이터를 가져오지 못했습니다. 잠시 후 다시 시도하세요.", isError: true };
  }
}
