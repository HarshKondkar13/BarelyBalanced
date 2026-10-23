"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, Field, Input, Notice, Progress, Select } from "@/components/ui";
import { toast } from "@/components/toast";
import { saveOnboardingAction, type OnboardingInput } from "@/app/(app)/_actions/onboarding";
import { estimateCapacity, effectiveRisk, SKIP_IMPACT, toleranceFromQuiz, type Level } from "@/lib/finance/profile";
import { tryParseRupees } from "@/lib/money";
import { cn } from "@/lib/cn";

const STEPS = ["About you", "Income", "Commitments", "Safety net", "Risk", "First account", "First goal"] as const;
const QUIZ = [
  { q: "If an investment fell 15% in a month, you would most likely…", a: ["Sell to avoid further losses", "Wait and watch", "Consider adding more"] },
  { q: "Which matters more to you?", a: ["Never seeing a loss", "A balance of growth and stability", "Maximum long-term growth"] },
  { q: "How familiar are you with market ups and downs?", a: ["Not at all", "Somewhat", "Very, I've lived through falls"] },
];

export function OnboardingWizard({ name }: { name: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const [v, setV] = useState({
    displayName: name,
    monthlyIncome: "",
    incomeStability: "" as "" | "stable" | "variable" | "irregular" | "none",
    monthlyEssentials: "",
    monthlyDebtPayments: "",
    emergencySavings: "",
    liquidityNeeds: "",
    liquidityAmount: "",
    liquidityWithinMonths: "",
    quiz: [-1, -1, -1],
    capacityOverride: "" as "" | Level,
    experience: "" as "" | "none" | "some" | "experienced",
    accountName: "Salary account",
    accountType: "bank" as "bank" | "cash" | "wallet" | "credit_card",
    accountBalance: "",
    addAccount: true,
    goalName: "Emergency fund",
    goalKind: "emergency" as "emergency" | "purchase" | "education" | "travel" | "retirement" | "other",
    goalTarget: "",
    goalDate: "",
    addGoal: true,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof v, val: unknown) => setV((x) => ({ ...x, [k]: val }));
  const skip = (...fields: string[]) => {
    setSkipped((s) => new Set([...s, ...fields]));
    setStep((s) => s + 1);
  };

  const tolerance = v.quiz.every((x) => x >= 0) ? toleranceFromQuiz(v.quiz) : null;
  const capacity = useMemo(
    () =>
      estimateCapacity({
        incomeStability: v.incomeStability || null,
        monthlyEssentials: tryParseRupees(v.monthlyEssentials),
        emergencySavings: tryParseRupees(v.emergencySavings),
        monthlyIncome: tryParseRupees(v.monthlyIncome),
        monthlyDebtPayments: tryParseRupees(v.monthlyDebtPayments || "0"),
        shortestGoalMonths: v.liquidityWithinMonths ? Number(v.liquidityWithinMonths) : null,
      }),
    [v],
  );
  const capacityLevel = (v.capacityOverride || capacity.level) as Level | null;
  const eff = effectiveRisk(tolerance, capacityLevel);
  const essentials = tryParseRupees(v.monthlyEssentials);

  function finish() {
    setError(null);
    const payload: OnboardingInput = {
      displayName: v.displayName,
      monthlyIncome: v.monthlyIncome || null,
      incomeStability: v.incomeStability || null,
      monthlyEssentials: v.monthlyEssentials || null,
      monthlyDebtPayments: v.monthlyDebtPayments || null,
      emergencySavings: v.emergencySavings || null,
      liquidityNeeds: v.liquidityNeeds || null,
      liquidityAmount: v.liquidityAmount || null,
      liquidityWithinMonths: v.liquidityWithinMonths ? Number(v.liquidityWithinMonths) : null,
      riskTolerance: tolerance,
      riskCapacity: capacityLevel,
      investmentExperience: v.experience || null,
      skipped: [...skipped],
      account: v.addAccount && v.accountName ? { name: v.accountName, type: v.accountType, openingBalance: v.accountBalance || "0" } : null,
      goal: v.addGoal && v.goalName && v.goalTarget ? { name: v.goalName, kind: v.goalKind, targetAmount: v.goalTarget, targetDate: v.goalDate || null } : null,
    };
    start(async () => {
      const r = await saveOnboardingAction(payload);
      if (!r.ok) return setError(r.error);
      toast(r);
      router.push("/today");
    });
  }

  const nav = (skipFields?: string[]) => (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {step > 0 ? <Button variant="ghost" onClick={() => setStep(step - 1)}>Back</Button> : null}
      <div className="flex-1" />
      {skipFields ? <Button variant="secondary" onClick={() => skip(...skipFields)}>Skip</Button> : null}
      {step < STEPS.length - 1 ? <Button onClick={() => setStep(step + 1)}>Continue</Button> : <Button onClick={finish} disabled={pending}>{pending ? "Saving…" : "Finish setup"}</Button>}
    </div>
  );

  return (
    <Card className="mx-auto max-w-lg">
      <p className="text-xs font-medium text-muted">Step {step + 1} of {STEPS.length}: {STEPS[step]}</p>
      <Progress value={(step + 1) / STEPS.length} label="Setup progress" className="mb-5 mt-2" />
      {error ? <Notice tone="danger" className="mb-4">{error}</Notice> : null}

      {step === 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Let&apos;s set up your plan</h2>
          <p className="text-sm text-muted">A few questions help the app tailor budgets, reserves and the weekly plan. Every question can be skipped; we&apos;ll tell you what skipping limits. Answers stay in your account and are never shared.</p>
          <Field label="What should we call you?" htmlFor="dn"><Input id="dn" value={v.displayName} onChange={(e) => set("displayName", e.target.value)} /></Field>
          {nav()}
        </div>
      )}
      {step === 1 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Income</h2>
          <Field label="Typical monthly take-home income (₹)" htmlFor="mi" hint="After tax and deductions. A stipend or family support counts."><Input id="mi" inputMode="decimal" className="num" value={v.monthlyIncome} onChange={(e) => set("monthlyIncome", e.target.value)} /></Field>
          <Field label="How predictable is it?" htmlFor="st">
            <Select id="st" value={v.incomeStability} onChange={(e) => set("incomeStability", e.target.value)}>
              <option value="">Choose…</option>
              <option value="stable">Stable (fixed salary or stipend)</option>
              <option value="variable">Variable (base plus incentives)</option>
              <option value="irregular">Irregular (freelance, project-based)</option>
              <option value="none">No regular income right now</option>
            </Select>
          </Field>
          <Notice tone="neutral">If you skip: {SKIP_IMPACT.monthlyIncome}</Notice>
          {nav(["monthlyIncome", "incomeStability"])}
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Essential commitments</h2>
          <Field label="Essential monthly expenses (₹)" htmlFor="me" hint="Rent, groceries, utilities, transport, insurance: what you'd pay even in a lean month."><Input id="me" inputMode="decimal" className="num" value={v.monthlyEssentials} onChange={(e) => set("monthlyEssentials", e.target.value)} /></Field>
          <Field label="Monthly loan / EMI payments (₹)" htmlFor="md" hint="Education loan, personal loan, card EMIs. Enter 0 if none."><Input id="md" inputMode="decimal" className="num" value={v.monthlyDebtPayments} onChange={(e) => set("monthlyDebtPayments", e.target.value)} /></Field>
          <Notice tone="neutral">If you skip: {SKIP_IMPACT.monthlyEssentials}</Notice>
          {nav(["monthlyEssentials", "monthlyDebtPayments"])}
        </div>
      )}
      {step === 3 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Safety net and upcoming needs</h2>
          <Field label="Emergency savings you could access within a week (₹)" htmlFor="es"><Input id="es" inputMode="decimal" className="num" value={v.emergencySavings} onChange={(e) => set("emergencySavings", e.target.value)} /></Field>
          {essentials && tryParseRupees(v.emergencySavings) !== null ? <p className="text-sm text-muted">That covers about <strong>{((tryParseRupees(v.emergencySavings) ?? 0) / essentials).toFixed(1)} months</strong> of essentials. A common guideline is 3–6 months.</p> : null}
          <Field label="Any large expense coming up? (optional)" htmlFor="ln"><Input id="ln" value={v.liquidityNeeds} onChange={(e) => set("liquidityNeeds", e.target.value)} placeholder="e.g. Laptop, exam fees, wedding, relocation" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Roughly how much (₹)" htmlFor="la"><Input id="la" inputMode="decimal" className="num" value={v.liquidityAmount} onChange={(e) => set("liquidityAmount", e.target.value)} /></Field>
            <Field label="Within how many months" htmlFor="lm"><Input id="lm" type="number" min={1} max={120} value={v.liquidityWithinMonths} onChange={(e) => set("liquidityWithinMonths", e.target.value)} /></Field>
          </div>
          <Notice tone="neutral">If you skip: {SKIP_IMPACT.emergencySavings}</Notice>
          {nav(["emergencySavings", "liquidity"])}
        </div>
      )}
      {step === 4 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Risk: feelings and finances</h2>
          <p className="text-sm text-muted">Two different things. <strong>Tolerance</strong> is how comfortable you are with ups and downs. <strong>Capacity</strong> is how much loss your finances can absorb without derailing goals. The plan uses whichever is lower.</p>
          {QUIZ.map((item, qi) => (
            <fieldset key={qi}>
              <legend className="mb-1.5 text-sm font-medium">{item.q}</legend>
              <div className="space-y-1.5">
                {item.a.map((ans, ai) => (
                  <label key={ai} className={cn("flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3 text-sm", v.quiz[qi] === ai ? "border-primary bg-primary-soft" : "border-border")}>
                    <input type="radio" name={`q${qi}`} className="accent-[var(--primary)]" checked={v.quiz[qi] === ai} onChange={() => set("quiz", v.quiz.map((x, j) => (j === qi ? ai : x)))} />
                    {ans}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            <p><strong>Tolerance:</strong> {tolerance ?? "answer all three"}</p>
            <p className="mt-1"><strong>Capacity (estimated from your answers):</strong> {capacity.level ?? "not enough information"}</p>
            {capacity.reasons.length ? <ul className="mt-1 list-disc pl-5 text-muted">{capacity.reasons.map((r) => <li key={r}>{r}</li>)}</ul> : null}
            {capacity.missing.length ? <p className="mt-1 text-muted">Missing: {capacity.missing.join(", ")}.</p> : null}
            <label className="mt-2 block text-xs font-medium">Adjust capacity if you know better
              <Select value={v.capacityOverride} onChange={(e) => set("capacityOverride", e.target.value)} className="mt-1">
                <option value="">Use the estimate</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </label>
            {eff.level ? <p className="mt-2">The plan will use <strong>{eff.level}</strong>{eff.limitedBy && eff.limitedBy !== "both" ? `, limited by ${eff.limitedBy}` : ""}.</p> : null}
          </div>
          <Field label="Investing experience" htmlFor="ex">
            <Select id="ex" value={v.experience} onChange={(e) => set("experience", e.target.value)}>
              <option value="">Prefer not to say</option>
              <option value="none">None yet</option>
              <option value="some">Some (SIPs, FDs, a few stocks)</option>
              <option value="experienced">Experienced</option>
            </Select>
          </Field>
          <Notice tone="neutral">If you skip: {SKIP_IMPACT.riskTolerance}</Notice>
          {nav(["riskTolerance", "riskCapacity"])}
        </div>
      )}
      {step === 5 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">Your main account</h2>
          <p className="text-sm text-muted">Manual tracking only. We never ask for bank logins. The balance you enter is a starting point, not income.</p>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={v.addAccount} onChange={(e) => set("addAccount", e.target.checked)} className="size-5 accent-[var(--primary)]" /> Add an account now</label>
          {v.addAccount ? (
            <>
              <Field label="Name" htmlFor="an"><Input id="an" value={v.accountName} onChange={(e) => set("accountName", e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type" htmlFor="at">
                  <Select id="at" value={v.accountType} onChange={(e) => set("accountType", e.target.value)}>
                    <option value="bank">Bank</option><option value="cash">Cash</option><option value="wallet">Wallet</option><option value="credit_card">Credit card</option>
                  </Select>
                </Field>
                <Field label={v.accountType === "credit_card" ? "Amount owed today (₹)" : "Balance today (₹)"} htmlFor="ab"><Input id="ab" inputMode="decimal" className="num" value={v.accountBalance} onChange={(e) => set("accountBalance", e.target.value)} /></Field>
              </div>
            </>
          ) : null}
          {nav()}
        </div>
      )}
      {step === 6 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold">A first goal</h2>
          <p className="text-sm text-muted">An emergency fund is a sensible first goal for most people. You can add more later.</p>
          <label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={v.addGoal} onChange={(e) => set("addGoal", e.target.checked)} className="size-5 accent-[var(--primary)]" /> Add a goal now</label>
          {v.addGoal ? (
            <>
              <Field label="Goal" htmlFor="gn"><Input id="gn" value={v.goalName} onChange={(e) => set("goalName", e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Type" htmlFor="gk">
                  <Select id="gk" value={v.goalKind} onChange={(e) => set("goalKind", e.target.value)}>
                    <option value="emergency">Emergency fund</option><option value="purchase">Purchase</option><option value="education">Education</option><option value="travel">Travel</option><option value="retirement">Retirement</option><option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Target (₹)" htmlFor="gt" hint={v.goalKind === "emergency" && essentials ? `6 months of essentials ≈ ₹${Math.round((essentials * 6) / 100).toLocaleString("en-IN")}` : undefined}><Input id="gt" inputMode="decimal" className="num" value={v.goalTarget} onChange={(e) => set("goalTarget", e.target.value)} /></Field>
              </div>
              <Field label="Target date (optional)" htmlFor="gd"><Input id="gd" type="date" value={v.goalDate} onChange={(e) => set("goalDate", e.target.value)} /></Field>
            </>
          ) : null}
          {skipped.size ? <Notice tone="info" title="You skipped some questions">{[...skipped].map((s) => SKIP_IMPACT[s]).filter(Boolean).map((t) => <p key={t}>{t}</p>)}<p className="mt-1">You can answer them anytime in Plan → Profile.</p></Notice> : null}
          {nav()}
        </div>
      )}
    </Card>
  );
}
