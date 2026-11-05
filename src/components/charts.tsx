"use client";

import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer,
  Scatter, Tooltip, XAxis, YAxis, type TooltipContentProps,
} from "recharts";

const axis = { stroke: "var(--text-muted)", fontSize: 11, tickLine: false, axisLine: false } as const;
const grid = <CartesianGrid stroke="var(--grid)" vertical={false} />;
const shortDate = (d: string) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
const SmallDot = (r: number) => function Dot(p: unknown) {
  const { cx, cy, fill } = p as { cx?: number; cy?: number; fill?: string };
  return cx == null || cy == null ? <g /> : <circle cx={cx} cy={cy} r={r} fill={fill} />;
};
const cursor = { stroke: "var(--text-muted)", strokeWidth: 1, strokeDasharray: "3 3" };

type Row = Record<string, unknown>;
type Fmt = (v: number) => string;

function Tip({ active, payload, label, rows }: TooltipContentProps<number, string> & {
  rows: { key: string; label: string; color: string; fmt: Fmt }[];
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0].payload as Row;
  return (
    <div className="card px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 text-muted">{String(datum.name ?? label ?? "")}</div>
      {rows.map((r) => {
        const v = datum[r.key];
        if (v == null) return null;
        return (
          <div key={r.key} className="flex items-center gap-2">
            <span className="inline-block size-2 rounded-full" style={{ background: r.color }} />
            <span className="text-secondary">{r.label}</span>
            <span className="ml-auto font-medium tabular-nums">{r.fmt(Number(v))}</span>
          </div>
        );
      })}
      <div className="mt-1 text-muted">{String(datum.date ?? datum.week ?? "")}</div>
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string; dashed?: boolean; dot?: boolean }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-4 text-xs text-secondary">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          {i.dot ? (
            <span className="inline-block size-2 rounded-full" style={{ background: i.color }} />
          ) : (
            <span className="inline-block h-0.5 w-4" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** 일별 값(점) + 이동평균(선) — 단일 지표 추세 */
export function TrendChart({
  data, unit, digits = 0, avgLabel = "7일 평균", domainPad = 2,
}: {
  data: { date: string; value: number | null; avg: number | null }[];
  unit: string; digits?: number; avgLabel?: string; domainPad?: number;
}) {
  const fmt: Fmt = (v) => `${v.toFixed(digits)}${unit}`;
  return (
    <>
      <Legend items={[{ label: "일별", color: "var(--series-1-soft)", dot: true }, { label: avgLabel, color: "var(--series-1)" }]} />
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          {grid}
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axis} />
          <YAxis domain={[(m: number) => Math.floor(m - domainPad), (m: number) => Math.ceil(m + domainPad)]} {...axis} width={44} />
          <Tooltip cursor={cursor} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} rows={[
            { key: "value", label: "일별", color: "var(--series-1-soft)", fmt },
            { key: "avg", label: avgLabel, color: "var(--series-1)", fmt },
          ]} />} />
          <Scatter dataKey="value" fill="var(--series-1-soft)" shape={SmallDot(2)} isAnimationActive={false} />
          <Line dataKey="avg" stroke="var(--series-1)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

export function WeeklyVolumeChart({ data }: { data: { week: string; km: number; hours: number; runs: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
        {grid}
        <XAxis dataKey="week" tickFormatter={shortDate} minTickGap={24} {...axis} />
        <YAxis {...axis} width={44} />
        <Tooltip cursor={{ fill: "var(--grid)" }} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} rows={[
          { key: "km", label: "거리", color: "var(--series-1)", fmt: (v) => `${v.toFixed(1)} km` },
          { key: "hours", label: "시간", color: "var(--series-1)", fmt: (v) => `${v.toFixed(1)} h` },
          { key: "runs", label: "횟수", color: "var(--series-1)", fmt: (v) => `${v}회` },
        ]} />} />
        <Bar dataKey="km" fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function EfficiencyChart({ data }: { data: { date: string; value: number; avg: number | null; name: string | null; paceSec: number }[] }) {
  const fmt: Fmt = (v) => `${v.toFixed(2)} m/beat`;
  return (
    <>
      <Legend items={[{ label: "각 러닝", color: "var(--series-1-soft)", dot: true }, { label: "28일 평균", color: "var(--series-1)" }]} />
      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          {grid}
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axis} />
          <YAxis domain={["dataMin - 0.05", "dataMax + 0.05"]} tickFormatter={(v: number) => v.toFixed(2)} {...axis} width={44} />
          <Tooltip cursor={cursor} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} rows={[
            { key: "value", label: "효율", color: "var(--series-1-soft)", fmt },
            { key: "avg", label: "28일 평균", color: "var(--series-1)", fmt },
            { key: "paceSec", label: "페이스", color: "transparent", fmt: (s) => `${Math.floor(s / 60)}'${String(Math.round(s % 60)).padStart(2, "0")}"` },
          ]} />} />
          <Scatter dataKey="value" fill="var(--series-1-soft)" shape={SmallDot(3)} isAnimationActive={false} />
          <Line dataKey="avg" stroke="var(--series-1)" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}

export function FitnessChart({ data }: { data: { date: string; ctl: number; atl: number; tsb: number }[] }) {
  return (
    <>
      <Legend items={[{ label: "체력 (CTL·42일)", color: "var(--series-1)" }, { label: "피로 (ATL·7일)", color: "var(--series-2)" }]} />
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={data} margin={{ top: 4, right: 40, bottom: 0, left: -12 }}>
          {grid}
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={32} {...axis} />
          <YAxis {...axis} width={44} />
          <Tooltip cursor={cursor} content={(p) => <Tip {...(p as TooltipContentProps<number, string>)} rows={[
            { key: "ctl", label: "체력", color: "var(--series-1)", fmt: (v) => v.toFixed(1) },
            { key: "atl", label: "피로", color: "var(--series-2)", fmt: (v) => v.toFixed(1) },
            { key: "tsb", label: "컨디션(TSB)", color: "transparent", fmt: (v) => (v > 0 ? "+" : "") + v.toFixed(1) },
          ]} />} />
          <Line dataKey="ctl" stroke="var(--series-1)" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="atl" stroke="var(--series-2)" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </>
  );
}
