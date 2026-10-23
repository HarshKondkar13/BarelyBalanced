"use client";

import { useState } from "react";
import { Card, CardHeader, Field, Input, Notice, Select } from "@/components/ui";
import { ScenarioChart } from "@/components/charts";
import { DEFAULT_RETURNS, runAllScenarios, validateMix, type Mix, type ReturnAssumptions } from "@/lib/finance/scenarios";
import { illustrativeMix } from "@/lib/finance/allocation";
import type { Level } from "@/lib/finance/profile";
import { formatINR, tryParseRupees } from "@/lib/money";

const pct = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n / 100 : NaN;
};
const CLASSES = ["equity", "debt", "gold", "cash"] as const;

export function ScenarioLab({ defaultMonthly, defaultInitial, risk }: { defaultMonthly: number; defaultInitial: number; risk: Level | null }) {
  const [initial, setInitial] = useState(String(Math.round(defaultInitial / 100)));
  const [monthly, setMonthly] = useState(String(Math.round(defaultMonthly / 100)));
  const [years, setYears] = useState("10");
  const [riskSel, setRiskSel] = useState<Level | "">(risk ?? "");
  const preset = illustrativeMix(Number(years) || 1, (riskSel || null) as Level | null);
  const [mixOverride, setMixOverride] = useState<Record<string, string> | null>(null);
  const [fee, setFee] = useState("0.5");
  const [inflation, setInflation] = useState("5");
  const [tax, setTax] = useState("12.5");
  const [stepUp, setStepUp] = useState("0");
  const [returns, setReturns] = useState<Record<string, Record<string, string>>>(
    Object.fromEntries(Object.entries(DEFAULT_RETURNS).map(([k, m]) => [k, Object.fromEntries(Object.entries(m).map(([c, v]) => [c, String(+(v * 100).toFixed(2))]))])),
  );

  const mix: Mix = mixOverride
    ? { equity: pct(mixOverride.equity), debt: pct(mixOverride.debt), gold: pct(mixOverride.gold), cash: pct(mixOverride.cash) }
    : preset.mix;
  const mixOk = validateMix(mix);
  const parsedReturns = Object.fromEntries(Object.entries(returns).map(([k, m]) => [k, Object.fromEntries(Object.entries(m).map(([c, v]) => [c, pct(v)]))])) as ReturnAssumptions;
  const inputsOk = mixOk && [fee, inflation, tax, stepUp].every((x) => Number.isFinite(Number(x))) && Number(years) > 0 && Number(years) <= 40;

  // Cheap to compute (a few thousand iterations), so it simply runs on every render.
  const results = !inputsOk
    ? null
    : runAllScenarios({
      initial: tryParseRupees(initial || "0") ?? 0,
      monthly: tryParseRupees(monthly || "0") ?? 0,
      years: Number(years),
      mix,
      returns: parsedReturns,
      annualFee: pct(fee),
      inflation: pct(inflation),
      taxOnGains: pct(tax),
      annualStepUp: pct(stepUp),
    });

  const chart = results ? results[1].yearly.map((y, i) => ({ label: `Yr ${y.year}`, pessimistic: results[0].yearly[i].value, base: y.value, optimistic: results[2].yearly[i].value, contributed: y.contributed })) : [];

  return (
    <div className="space-y-4">
      <Notice tone="attention" title="Illustrations, not predictions">Each line applies a fixed, assumed annual return. Real returns vary year to year, can be negative for long stretches, and are not guaranteed. Edit any assumption below.</Notice>
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <Card>
          <CardHeader title="Inputs" />
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Field label="Starting amount (₹)" htmlFor="si"><Input id="si" inputMode="decimal" className="num" value={initial} onChange={(e) => setInitial(e.target.value)} /></Field>
              <Field label="Monthly (₹)" htmlFor="sm"><Input id="sm" inputMode="decimal" className="num" value={monthly} onChange={(e) => setMonthly(e.target.value)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Years" htmlFor="sy"><Input id="sy" type="number" min={1} max={40} value={years} onChange={(e) => setYears(e.target.value)} /></Field>
              <Field label="Risk level" htmlFor="sr">
                <Select id="sr" value={riskSel} onChange={(e) => { setRiskSel(e.target.value as Level); setMixOverride(null); }}>
                  <option value="">Unknown (conservative)</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
                </Select>
              </Field>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Asset-class mix (%)</legend>
              <div className="grid grid-cols-4 gap-1.5">
                {CLASSES.map((c) => (
                  <label key={c} className="text-xs capitalize">{c}
                    <Input inputMode="decimal" className="num mt-1 px-2 text-center" value={mixOverride ? mixOverride[c] : String(Math.round(preset.mix[c] * 100))} onChange={(e) => setMixOverride({ ...(mixOverride ?? Object.fromEntries(CLASSES.map((k) => [k, String(Math.round(preset.mix[k] * 100))]))), [c]: e.target.value })} />
                  </label>
                ))}
              </div>
              {!mixOk ? <p className="mt-1 text-xs font-medium text-danger" role="alert">The mix must add up to 100%.</p> : <p className="mt-1 text-xs text-muted">{mixOverride ? <button type="button" className="font-semibold text-primary" onClick={() => setMixOverride(null)}>Reset to illustration</button> : preset.note}</p>}
            </fieldset>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Annual fees (%)" htmlFor="sf" hint="Expense ratio"><Input id="sf" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
              <Field label="Inflation (%)" htmlFor="sinf" hint="For today's-rupee value"><Input id="sinf" inputMode="decimal" value={inflation} onChange={(e) => setInflation(e.target.value)} /></Field>
              <Field label="Tax on gains (%)" htmlFor="st" hint="Flat, at the end"><Input id="st" inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} /></Field>
              <Field label="Yearly step-up (%)" htmlFor="ss"><Input id="ss" inputMode="decimal" value={stepUp} onChange={(e) => setStepUp(e.target.value)} /></Field>
            </div>
            <details>
              <summary className="min-h-9 text-sm font-semibold text-primary">Return assumptions per asset class</summary>
              <table className="mt-2 w-full text-xs">
                <thead><tr><th className="text-left font-medium text-muted">%/yr</th>{CLASSES.map((c) => <th key={c} className="font-medium capitalize text-muted">{c}</th>)}</tr></thead>
                <tbody>
                  {(["pessimistic", "base", "optimistic"] as const).map((s) => (
                    <tr key={s}>
                      <td className="py-1 capitalize">{s}</td>
                      {CLASSES.map((c) => (
                        <td key={c} className="p-0.5"><Input aria-label={`${s} ${c} return`} inputMode="decimal" className="num min-h-9 px-1 text-center text-xs" value={returns[s][c]} onChange={(e) => setReturns({ ...returns, [s]: { ...returns[s], [c]: e.target.value } })} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </div>
        </Card>
        <Card>
          <CardHeader title="Three illustrative paths" subtitle={`${years} years · nominal values before tax`} />
          {results ? (
            <>
              <ScenarioChart data={chart} />
              <div className="mt-4 overflow-x-auto" tabIndex={0} role="region" aria-label="Scenario results table">
                <table className="num w-full min-w-[480px] text-left text-sm">
                  <thead className="text-xs text-muted"><tr><th className="py-1 font-medium">Scenario</th><th className="font-medium">Assumed return</th><th className="font-medium">Final value</th><th className="font-medium">Fees paid</th><th className="font-medium">Tax (illustr.)</th><th className="font-medium">After tax, today&apos;s ₹</th></tr></thead>
                  <tbody>
                    {results.map((r) => (
                      <tr key={r.name} className="border-t border-border">
                        <td className="py-2 capitalize">{r.name}</td>
                        <td>{(r.annualReturnBeforeFees * 100).toFixed(1)}%</td>
                        <td>{formatINR(r.finalNominal, { whole: true })}</td>
                        <td>{formatINR(r.feesPaid, { whole: true })}</td>
                        <td>{formatINR(r.taxOnGains, { whole: true })}</td>
                        <td className="font-semibold">{formatINR(r.finalAfterTaxReal, { whole: true })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 text-sm text-muted">
                You would put in {formatINR(results[1].contributed, { whole: true })}. In the base illustration that grows to {formatINR(results[1].finalNominal, { whole: true })}; in the pessimistic one, {formatINR(results[0].finalNominal, { whole: true })}. After {inflation}% inflation, the base case is worth about {formatINR(results[1].finalAfterTaxReal, { whole: true })} in today&apos;s money after the illustrative tax.
              </p>
            </>
          ) : <p className="text-sm text-danger">Fix the highlighted inputs to see results.</p>}
          <details className="mt-3 text-xs text-muted">
            <summary className="min-h-9 text-sm font-semibold text-primary">Assumptions and sources</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Default return rates are round illustrative figures set by this app, not forecasts and not derived from current market data. Change them to test your own views.</li>
              <li>Fees are applied monthly as an annual percentage of the balance, similar to how a mutual fund&apos;s expense ratio works.</li>
              <li>Tax is a single flat rate on total gains at the end. Real Indian tax treatment depends on asset type, holding period, exemptions and the law in force when you sell; the 12.5% default is a placeholder. Verify current rules on the Income Tax Department website (incometax.gov.in) or with a tax professional.</li>
              <li>Inflation converts the final figure into today&apos;s rupees using a constant rate.</li>
              <li>Volatility and sequence of returns are not modelled: real paths go up and down.</li>
            </ul>
          </details>
        </Card>
      </div>
    </div>
  );
}
