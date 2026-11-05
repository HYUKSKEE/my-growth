// 성장 지표 계산 (순수 함수 — 서버 컴포넌트에서 사용)

export type DailyRow = {
  date: string;
  steps: number | null;
  resting_hr: number | null;
  hrv_last_night: number | null;
  vo2max_run: number | null;
  sleep_score: number | null;
  sleep_seconds: number | null;
  body_battery_max: number | null;
};

export type ActivityRow = {
  activity_id: number;
  start_date_local: string;
  type: string;
  name: string | null;
  duration_s: number | null;
  distance_m: number | null;
  avg_hr: number | null;
  avg_speed_mps: number | null;
  elevation_gain_m: number | null;
  training_load: number | null;
};

export type Point = { date: string; value: number | null; avg: number | null };

const DAY = 86_400_000;
export const toDate = (s: string) => new Date(s + "T00:00:00Z");
export const fmtDate = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (s: string, n: number) => fmtDate(new Date(toDate(s).getTime() + n * DAY));
export const isRun = (type: string) => type.includes("run");

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** 날짜별 값 → 연속된 날짜 시리즈 + N일 이동평균(빈 날 무시) */
export function dailyTrend(
  rows: { date: string; value: number | null }[],
  from: string,
  to: string,
  window = 7,
): Point[] {
  const map = new Map(rows.filter((r) => r.value != null).map((r) => [r.date, Number(r.value)]));
  const out: Point[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const win: number[] = [];
    for (let i = 0; i < window; i++) {
      const v = map.get(addDays(d, -i));
      if (v != null) win.push(v);
    }
    out.push({ date: d, value: map.get(d) ?? null, avg: win.length >= Math.ceil(window / 3) ? mean(win) : null });
  }
  return out;
}

/** 최근 N일 평균 vs 그 이전 N일 평균 */
export function compareWindows(rows: { date: string; value: number | null }[], today: string, days = 28) {
  const curFrom = addDays(today, -days + 1);
  const prevFrom = addDays(curFrom, -days);
  const cur: number[] = [];
  const prev: number[] = [];
  for (const r of rows) {
    if (r.value == null) continue;
    if (r.date >= curFrom && r.date <= today) cur.push(Number(r.value));
    else if (r.date >= prevFrom && r.date < curFrom) prev.push(Number(r.value));
  }
  const current = mean(cur);
  const previous = mean(prev);
  return { current, previous, delta: current != null && previous != null ? current - previous : null };
}

/** 월요일 기준 주차 시작일 */
export function weekStart(s: string) {
  const d = toDate(s);
  const dow = (d.getUTCDay() + 6) % 7;
  return fmtDate(new Date(d.getTime() - dow * DAY));
}

export type WeekPoint = { week: string; km: number; hours: number; runs: number };

export function weeklyRunVolume(acts: ActivityRow[], from: string, to: string): WeekPoint[] {
  const weeks = new Map<string, WeekPoint>();
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) weeks.set(w, { week: w, km: 0, hours: 0, runs: 0 });
  for (const a of acts) {
    if (!isRun(a.type)) continue;
    const wp = weeks.get(weekStart(a.start_date_local));
    if (!wp) continue;
    wp.km += (a.distance_m ?? 0) / 1000;
    wp.hours += (a.duration_s ?? 0) / 3600;
    wp.runs += 1;
  }
  return [...weeks.values()].map((w) => ({ ...w, km: round(w.km, 1), hours: round(w.hours, 2) }));
}

/**
 * 러닝 효율 = 심박 1회당 이동 거리(m/beat) = 속도(m/min) ÷ 평균 심박.
 * 같은 심박으로 더 멀리 가면 유산소 능력이 좋아진 것.
 */
export type EfficiencyPoint = { date: string; value: number; avg: number | null; name: string | null; paceSec: number };

export function runningEfficiency(acts: ActivityRow[], from: string): EfficiencyPoint[] {
  const runs = acts
    .filter((a) => isRun(a.type) && a.avg_hr && a.avg_speed_mps && (a.duration_s ?? 0) >= 15 * 60)
    .sort((a, b) => a.start_date_local.localeCompare(b.start_date_local))
    .map((a) => ({
      date: a.start_date_local,
      value: (a.avg_speed_mps! * 60) / a.avg_hr!,
      name: a.name,
      paceSec: 1000 / a.avg_speed_mps!,
    }));
  // 최근 28일 이동평균
  return runs
    .map((r) => {
      const lo = addDays(r.date, -27);
      const win = runs.filter((x) => x.date >= lo && x.date <= r.date).map((x) => x.value);
      return { ...r, value: round(r.value, 3), avg: win.length >= 2 ? round(mean(win)!, 3) : null };
    })
    .filter((r) => r.date >= from);
}

/**
 * 체력(CTL, 42일 지수평균) / 피로(ATL, 7일) / 컨디션(TSB = CTL - ATL).
 * 가민 activityTrainingLoad 를 일일 부하로 사용. 없으면 시간×심박 기반 근사치.
 */
export type LoadPoint = { date: string; ctl: number; atl: number; tsb: number; load: number };

export function fitnessFatigue(acts: ActivityRow[], from: string, to: string): LoadPoint[] {
  const daily = new Map<string, number>();
  let start = from;
  for (const a of acts) {
    const load =
      a.training_load ?? (a.duration_s && a.avg_hr ? (a.duration_s / 60) * (a.avg_hr / 100) : 0);
    daily.set(a.start_date_local, (daily.get(a.start_date_local) ?? 0) + load);
    if (a.start_date_local < start) start = a.start_date_local;
  }
  let ctl = 0;
  let atl = 0;
  const out: LoadPoint[] = [];
  for (let d = start; d <= to; d = addDays(d, 1)) {
    const load = daily.get(d) ?? 0;
    ctl += (load - ctl) / 42;
    atl += (load - atl) / 7;
    if (d >= from) out.push({ date: d, ctl: round(ctl, 1), atl: round(atl, 1), tsb: round(ctl - atl, 1), load: round(load, 0) });
  }
  return out;
}

export function records(acts: ActivityRow[]) {
  const runs = acts.filter((a) => isRun(a.type));
  const longest = maxBy(runs, (a) => a.distance_m ?? 0);
  const fastest5k = maxBy(
    runs.filter((a) => (a.distance_m ?? 0) >= 5000 && a.avg_speed_mps),
    (a) => a.avg_speed_mps!,
  );
  const climb = maxBy(acts, (a) => a.elevation_gain_m ?? 0);
  return { longest, fastest5k, climb };
}

function maxBy<T>(xs: T[], f: (x: T) => number): T | null {
  let best: T | null = null;
  for (const x of xs) if (best === null || f(x) > f(best)) best = x;
  return best && f(best) > 0 ? best : null;
}

export const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

export function fmtPace(secPerKm: number) {
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return `${m}'${String(s).padStart(2, "0")}"/km`;
}

export function fmtDuration(sec: number) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}시간 ${m}분` : `${m}분`;
}
