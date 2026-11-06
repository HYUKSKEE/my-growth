import { signOut } from "@/app/login/actions";
import { StatTile } from "@/components/StatTile";
import { InfoTip, PendingLink, SubmitButton } from "@/components/ui";
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
  people: { id: string; name: string }[];
  viewingId: string;
  isSelf: boolean;
};

export function DashboardView({ daily, acts, today, rangeKey, email, sync, people, viewingId, isSelf }: DashboardProps) {
  const viewing = people.find((p) => p.id === viewingId);
  const q = (range: string) => `/?range=${range}${isSelf ? "" : `&user=${viewingId}`}`;
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
          <h1 className="text-2xl font-semibold">{isSelf ? "나의 성장 지표" : `${viewing?.name}님의 성장 지표`}</h1>
          <p className="text-sm text-muted">
            {isSelf ? email : "친구 대시보드 (읽기 전용)"} · 마지막 동기화{" "}
            {sync?.last_run_at ? new Date(sync.last_run_at).toLocaleString("ko-KR") : "없음"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <nav className="card flex p-1 text-sm" aria-label="기간">
            {(Object.keys(RANGES) as RangeKey[]).map((k) => (
              <PendingLink key={k} href={q(k)} aria-current={k === rangeKey ? "page" : undefined}
                title={`최근 ${k === "365" ? "1년" : `${Number(k) / 30}개월`} 보기`}
                className={`rounded-md px-3 py-1 ${k === rangeKey ? "bg-background font-medium" : "text-secondary hover:text-primary"}`}>
                {k === "365" ? "1년" : `${Number(k) / 30}개월`}
              </PendingLink>
            ))}
          </nav>
          <PendingLink href="/friends" className="text-sm text-secondary hover:underline" title="친구 추가 · 가민 연결">친구</PendingLink>
          <form action={signOut}><SubmitButton variant="link" pendingLabel="로그아웃 중…">로그아웃</SubmitButton></form>
        </div>
      </header>

      {sync?.last_error && (
        <section role="alert" className="card space-y-1 border-critical p-4 text-sm">
          <h2 className="font-semibold text-critical">동기화에 실패했습니다</h2>
          <p className="break-words text-secondary">{sync.last_error}</p>
          {isSelf ? (
            <p className="text-muted">
              로그인 정보가 바뀌었다면 <PendingLink href="/friends" className="underline">친구 페이지</PendingLink>에서 가민을 다시 연결하세요. 그 밖의 경우 다음 동기화 때 자동으로 다시 시도합니다.
            </p>
          ) : (
            <p className="text-muted">친구의 가민 연결에 문제가 있어 최신 데이터가 아닐 수 있습니다.</p>
          )}
        </section>
      )}

      {people.length > 1 && (
        <nav className="flex flex-wrap gap-2 text-sm" aria-label="사용자">
          {people.map((p) => (
            <PendingLink key={p.id} href={`/?range=${rangeKey}${p.id === people[0].id ? "" : `&user=${p.id}`}`}
              aria-current={p.id === viewingId ? "page" : undefined}
              title={p.id === people[0].id ? "내 대시보드" : `${p.name}님의 대시보드 (읽기 전용)`}
              className={`card rounded-full px-3 py-1 ${p.id === viewingId ? "font-medium" : "text-secondary hover:text-primary"}`}>
              {p.id === people[0].id ? "나" : p.name}
            </PendingLink>
          ))}
        </nav>
      )}

      {empty ? (
        <section className="card space-y-2 p-6 text-sm">
          <h2 className="text-base font-semibold">아직 데이터가 없습니다</h2>
          {isSelf ? (
            <>
              <p className="text-secondary">가민 계정을 연결하면 데이터가 자동으로 채워집니다.</p>
              <PendingLink href="/friends" className="btn inline-block">가민 연결하기</PendingLink>
            </>
          ) : (
            <p className="text-secondary">이 친구는 아직 가민을 연결하지 않았거나 첫 동기화 전입니다.</p>
          )}
        </section>
      ) : (
        <>
          <section>
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium text-secondary">최근 28일 vs 이전 28일 <InfoTip text="최근 28일 평균과 그 직전 28일 평균을 비교합니다. 화살표 옆 수치가 변화량입니다." /></h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              <StatTile label="VO2 Max (러닝)" info="1분당 몸이 쓸 수 있는 최대 산소량. 높을수록 유산소 능력이 좋습니다." value={kpi.vo2.current} delta={kpi.vo2.delta} digits={1} />
              <StatTile label="안정시 심박" info="쉬고 있을 때의 심박수. 낮아질수록 심폐 기능이 좋아진 것입니다." value={kpi.rhr.current} delta={kpi.rhr.delta} unit="bpm" lowerIsBetter />
              <StatTile label="수면 중 HRV" info="심박 간격의 변동성. 높을수록 회복이 잘 된 상태입니다." value={kpi.hrv.current} delta={kpi.hrv.delta} unit="ms" />
              <StatTile label="러닝 효율" info="같은 심박으로 얼마나 멀리 달렸는지(m/박동). 클수록 효율적입니다." value={kpi.eff.current} delta={kpi.eff.delta} unit=" m/b" digits={2} hint="심박 1회당 이동거리" />
              <StatTile label="주간 러닝 거리" info="완료된 주 기준 최근 4주 평균과 그 이전 4주 평균의 비교입니다." value={kpi.km.current} delta={kpi.km.delta} unit="km" digits={1} />
              <StatTile label="수면 점수" info="가민이 수면 시간·단계·방해 요소로 계산한 0~100점 점수입니다." value={kpi.sleep.current} delta={kpi.sleep.delta} />
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
