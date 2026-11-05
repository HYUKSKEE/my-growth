import Link from "next/link";
import { signOut } from "@/app/login/actions";
import { StatTile } from "@/components/StatTile";
import { EfficiencyChart, FitnessChart, TrendChart, WeeklyVolumeChart } from "@/components/charts";
import {
  type ActivityRow, type DailyRow, addDays, compareWindows, dailyTrend, fitnessFatigue, fmtDuration,
  fmtPace, isRun, records, runningEfficiency, weeklyRunVolume,
} from "@/lib/metrics";

export const RANGES = { "90": 90, "180": 180, "365": 365 } as const;
export type RangeKey = keyof typeof RANGES;

export type DashboardProps = {
  daily: DailyRow[];
  acts: ActivityRow[];
  today: string;
  rangeKey: RangeKey;
  email: string;
  sync: { last_run_at: string | null; last_error: string | null } | null;
};

export function DashboardView({ daily, acts, today, rangeKey, email, sync }: DashboardProps) {
  const from = addDays(today, -RANGES[rangeKey] + 1);
  const fetchFrom = addDays(from, -120);
  const series = (k: keyof DailyRow) => daily.map((d) => ({ date: d.date, value: d[k] as number | null }));
  const eff = runningEfficiency(acts, fetchFrom);
  const weekly = weeklyRunVolume(acts, fetchFrom, today);

  const kpi = {
    vo2: compareWindows(series("vo2max_run"), today),
    rhr: compareWindows(series("resting_hr"), today),
    hrv: compareWindows(series("hrv_last_night"), today),
    sleep: compareWindows(series("sleep_score"), today),
    eff: compareWindows(eff, today),
    // 주간 거리: 최근 4주 vs 이전 4주 (완료된 주 기준)
    km: compareWindows(weekly.slice(0, -1).map((w) => ({ date: w.week, value: w.km })), addDays(today, -7)),
  };

  const recs = records(acts.filter((a) => a.start_date_local >= from));
  const recent = [...acts].reverse().slice(0, 10);
  const empty = daily.length === 0 && acts.length === 0;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">나의 성장 지표</h1>
          <p className="text-sm text-muted">
            {email} · 마지막 동기화{" "}
            {sync?.last_run_at ? new Date(sync.last_run_at).toLocaleString("ko-KR") : "없음"}
            {sync?.last_error && <span className="text-critical"> · 오류: {sync.last_error}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <nav className="card flex p-1 text-sm" aria-label="기간">
            {(Object.keys(RANGES) as RangeKey[]).map((k) => (
              <Link key={k} href={`/?range=${k}`}
                className={`rounded-md px-3 py-1 ${k === rangeKey ? "bg-background font-medium" : "text-secondary"}`}>
                {k === "365" ? "1년" : `${Number(k) / 30}개월`}
              </Link>
            ))}
          </nav>
          <form action={signOut}><button className="text-sm text-secondary hover:underline">로그아웃</button></form>
        </div>
      </header>

      {empty ? (
        <section className="card space-y-2 p-6 text-sm">
          <h2 className="text-base font-semibold">아직 데이터가 없습니다</h2>
          <p className="text-secondary">동기화 스크립트를 실행해 가민 데이터를 가져오세요:</p>
          <pre className="rounded-md bg-background p-3 font-mono text-xs">cd sync && python sync.py login && python sync.py</pre>
        </section>
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-sm font-medium text-secondary">최근 28일 vs 이전 28일</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <StatTile label="VO2 Max (러닝)" value={kpi.vo2.current} delta={kpi.vo2.delta} digits={1} />
              <StatTile label="안정시 심박" value={kpi.rhr.current} delta={kpi.rhr.delta} unit="bpm" lowerIsBetter />
              <StatTile label="수면 중 HRV" value={kpi.hrv.current} delta={kpi.hrv.delta} unit="ms" />
              <StatTile label="러닝 효율" value={kpi.eff.current} delta={kpi.eff.delta} unit=" m/b" digits={2} hint="심박 1회당 이동거리" />
              <StatTile label="주간 러닝 거리" value={kpi.km.current} delta={kpi.km.delta} unit="km" digits={1} />
              <StatTile label="수면 점수" value={kpi.sleep.current} delta={kpi.sleep.delta} />
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <Panel title="체력 · 피로" note="훈련 부하로 계산한 체력(42일)과 피로(7일). 체력선이 우상향하면 성장 중입니다.">
              <FitnessChart data={fitnessFatigue(acts, from, today)} />
            </Panel>
            <Panel title="러닝 효율" note="같은 심박으로 더 멀리 달릴수록(값이 클수록) 유산소 능력이 좋아진 것. 15분 이상 러닝만.">
              <EfficiencyChart data={eff.filter((e) => e.date >= from)} />
            </Panel>
            <Panel title="VO2 Max (러닝)">
              <TrendChart data={dailyTrend(series("vo2max_run"), from, today, 14)} unit="" digits={1} avgLabel="14일 평균" domainPad={1} />
            </Panel>
            <Panel title="주간 러닝 거리 (km)" note="월요일 시작 주 기준">
              <WeeklyVolumeChart data={weekly.filter((w) => w.week >= addDays(from, -6))} />
            </Panel>
            <Panel title="안정시 심박" note="낮아질수록 심폐 기능 향상">
              <TrendChart data={dailyTrend(series("resting_hr"), from, today)} unit=" bpm" />
            </Panel>
            <Panel title="수면 중 HRV" note="높을수록 회복 상태가 좋음">
              <TrendChart data={dailyTrend(series("hrv_last_night"), from, today)} unit=" ms" domainPad={5} />
            </Panel>
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <Record title="최장 거리 러닝" a={recs.longest} main={(a) => `${((a.distance_m ?? 0) / 1000).toFixed(2)} km`} />
            <Record title="최고 평균 페이스 (5km+)" a={recs.fastest5k} main={(a) => fmtPace(1000 / a.avg_speed_mps!)} />
            <Record title="최대 상승 고도" a={recs.climb} main={(a) => `${Math.round(a.elevation_gain_m ?? 0)} m`} />
          </section>

          <section className="card overflow-x-auto p-4">
            <h2 className="mb-3 text-sm font-semibold">최근 운동</h2>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr><th className="py-1">날짜</th><th>이름</th><th>거리</th><th>시간</th><th>페이스</th><th>평균 심박</th><th>부하</th></tr>
              </thead>
              <tbody className="tabular-nums">
                {recent.map((a) => (
                  <tr key={a.activity_id} className="border-t border-border">
                    <td className="py-1.5 text-secondary">{a.start_date_local}</td>
                    <td>{a.name ?? a.type}</td>
                    <td>{a.distance_m ? `${(a.distance_m / 1000).toFixed(2)} km` : "—"}</td>
                    <td>{a.duration_s ? fmtDuration(a.duration_s) : "—"}</td>
                    <td>{isRun(a.type) && a.avg_speed_mps ? fmtPace(1000 / a.avg_speed_mps) : "—"}</td>
                    <td>{a.avg_hr ?? "—"}</td>
                    <td>{a.training_load != null ? Math.round(a.training_load) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {note && <p className="mb-2 text-xs text-muted">{note}</p>}
      {children}
    </div>
  );
}

function Record({ title, a, main }: { title: string; a: ActivityRow | null; main: (a: ActivityRow) => string }) {
  return (
    <div className="card p-4">
      <div className="text-xs text-secondary">{title} · 선택 기간</div>
      {a ? (
        <>
          <div className="mt-1 text-xl font-semibold tabular-nums">{main(a)}</div>
          <div className="text-xs text-muted">{a.start_date_local} · {a.name ?? a.type}</div>
        </>
      ) : (
        <div className="mt-1 text-muted">—</div>
      )}
    </div>
  );
}
