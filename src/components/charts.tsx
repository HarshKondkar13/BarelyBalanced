"use client";

import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatINR, formatINRCompact } from "@/lib/money";

const axisTick = { fill: "var(--text-subtle)", fontSize: 12 };

function MoneyTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ name: string; value: number; color: string }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-text">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="num flex items-center gap-2 text-muted">
          <span className="inline-block size-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <span className="font-semibold text-text">{formatINR(p.value, { whole: true })}</span>
        </p>
      ))}
    </div>
  );
}

/** Income vs spending by month: two series, one axis, legend + tooltip. */
export function IncomeSpendingChart({ data }: { data: Array<{ label: string; income: number; spending: number }> }) {
  return (
    <div className="h-56 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, left: -8, bottom: 0 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} tick={axisTick} />
          <YAxis tickFormatter={(v: number) => formatINRCompact(v)} tickLine={false} axisLine={false} tick={axisTick} width={56} />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: "var(--surface-2)" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }} />
          <Bar dataKey="income" name="Income" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={22} />
          <Bar dataKey="spending" name="Spending" fill="var(--chart-2)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Projected liquid cash from known commitments (single series, zero line marked). */
export function CashProjectionChart({ data }: { data: Array<{ label: string; balance: number }> }) {
  return (
    <div className="h-44 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} tick={axisTick} minTickGap={24} />
          <YAxis tickFormatter={(v: number) => formatINRCompact(v)} tickLine={false} axisLine={false} tick={axisTick} width={56} />
          <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="4 4" />
          <Tooltip content={<MoneyTooltip />} />
          <Line type="stepAfter" dataKey="balance" name="Projected cash" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Scenario fan: three illustrative paths on one axis. */
export function ScenarioChart({ data }: { data: Array<{ label: string; pessimistic: number; base: number; optimistic: number; contributed: number }> }) {
  return (
    <div className="h-60 w-full" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--border-strong)" }} tick={axisTick} minTickGap={20} />
          <YAxis tickFormatter={(v: number) => formatINRCompact(v)} tickLine={false} axisLine={false} tick={axisTick} width={60} />
          <Tooltip content={<MoneyTooltip />} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, color: "var(--text-muted)" }} />
          <Line type="monotone" dataKey="optimistic" name="Optimistic" stroke="var(--chart-3)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="base" name="Base" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="pessimistic" name="Pessimistic" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="contributed" name="Amount you put in" stroke="var(--text-subtle)" strokeWidth={2} strokeDasharray="4 4" dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
