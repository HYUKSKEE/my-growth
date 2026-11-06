import { InfoTip } from "@/components/ui";

type Props = {
  label: string;
  value: number | null;
  delta: number | null;
  unit?: string;
  digits?: number;
  /** 값이 낮을수록 좋은 지표(안정시 심박 등) */
  lowerIsBetter?: boolean;
  hint?: string;
  /** ⓘ 툴팁에 보여줄 지표 설명 */
  info?: string;
};

export function StatTile({ label, value, delta, unit = "", digits = 0, lowerIsBetter, hint, info }: Props) {
  const threshold = 10 ** -digits / 2;
  const flat = delta == null || Math.abs(delta) < threshold;
  const improved = !flat && (lowerIsBetter ? delta! < 0 : delta! > 0);

  return (
    <div className="card p-4">
      <div className="flex items-center gap-1.5 text-xs text-secondary">{label}{info && <InfoTip text={info} />}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {value == null ? "—" : value.toFixed(digits)}
        {value != null && <span className="ml-0.5 text-sm font-normal text-muted">{unit}</span>}
      </div>
      <div className="mt-1 text-xs tabular-nums">
        {delta == null ? (
          <span className="text-muted" title="비교할 기간의 데이터가 부족합니다">비교 데이터 없음</span>
        ) : flat ? (
          <span className="text-muted">→ 변화 없음</span>
        ) : (
          <span className={improved ? "text-good" : "text-critical"}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(digits)}
            {unit} · {improved ? "개선" : "하락"}
          </span>
        )}
      </div>
      {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
