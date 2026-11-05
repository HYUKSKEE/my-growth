type Props = {
  label: string;
  value: number | null;
  delta: number | null;
  unit?: string;
  digits?: number;
  /** 값이 낮을수록 좋은 지표(안정시 심박 등) */
  lowerIsBetter?: boolean;
  hint?: string;
};

export function StatTile({ label, value, delta, unit = "", digits = 0, lowerIsBetter, hint }: Props) {
  const threshold = 10 ** -digits / 2;
  const flat = delta == null || Math.abs(delta) < threshold;
  const improved = !flat && (lowerIsBetter ? delta! < 0 : delta! > 0);

  return (
    <div className="card p-4">
      <div className="text-xs text-secondary">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">
        {value == null ? "—" : value.toFixed(digits)}
        {value != null && <span className="ml-0.5 text-sm font-normal text-muted">{unit}</span>}
      </div>
      <div className="mt-1 text-xs tabular-nums">
        {delta == null ? (
          <span className="text-muted">비교 데이터 없음</span>
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
