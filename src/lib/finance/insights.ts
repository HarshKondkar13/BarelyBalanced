/**
 * Deterministic insight engine. Every insight answers:
 *   What happened? Why does it matter? What can I do next?
 * Figures come only from ledger calculations. An AI layer may later rephrase the
 * explanation, but never the numbers (see lib/ai/contracts.ts).
 */
import { addDays, diffDays, formatShortDate, startOfWeek, type LocalDate } from "@/lib/dates";
import { formatINR, formatPercent, type Paise } from "@/lib/money";
import { monthlyEquivalent, projectCash, type RecurringLike } from "./forecast";
import { summarizePeriod, type LedgerCategory, type LedgerTxn } from "./ledger";

export type InsightAction =
  | { type: "link"; label: string; href: string }
  | {
      type: "schedule_task";
      label: string;
      task: { title: string; kind: "task" | "money_review" | "budget_setup" | "bill" | "plan_review"; durationMin: number; planDate: LocalDate; startTime?: string; linkRef?: string };
    };

export type Insight = {
  key: string;
  kind:
    | "budget_pace"
    | "budget_over"
    | "category_spike"
    | "unusual_txn"
    | "cash_shortfall"
    | "subscription_burden"
    | "subscription_review"
    | "savings_rate"
    | "uncategorised"
    | "emergency_coverage"
    | "no_budget"
    | "under_budget";
  severity: "attention" | "info" | "positive";
  title: string;
  what: string;
  why: string;
  next: string;
  evidence: Array<{ label: string; value: string }>;
  actions: InsightAction[];
  /** Higher = shown first. */
  score: number;
};

export type InsightSnapshot = {
  today: LocalDate;
  weekStartsOn: number;
  month: string;
  monthStart: LocalDate;
  monthEnd: LocalDate;
  txns: LedgerTxn[]; // at least the last ~100 days
  txnMeta: Map<string, { description: string }>;
  categories: LedgerCategory[];
  budgets: Array<{ categoryId: string; amount: Paise }>;
  recurring: (RecurringLike & { lastReviewedAt?: Date | null; isSubscription?: boolean })[];
  liquidCash: Paise;
  monthlyIncomeEstimate: Paise | null;
  monthlyEssentialsEstimate: Paise | null;
  emergencyFundBalance: Paise | null;
};

const nextSunday = (today: LocalDate) => {
  const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
  return addDays(today, dow === 0 ? 0 : 7 - dow);
};

export function generateInsights(s: InsightSnapshot): Insight[] {
  const out: Insight[] = [];
  const catName = (id: string) => s.categories.find((c) => c.id === id)?.name ?? "Uncategorised";
  const daysInMonth = Number(s.monthEnd.slice(8));
  const dayOfMonth = Number(s.today.slice(8));
  const elapsed = dayOfMonth / daysInMonth;
  const month = summarizePeriod(s.txns, s.monthStart, s.today, s.categories);
  const weekStart = startOfWeek(s.today, s.weekStartsOn);
  const week = summarizePeriod(s.txns, weekStart, s.today, s.categories);
  const sunday = nextSunday(s.today);

  /* 1. Budgets: weekly overrun and monthly pace */
  for (const b of s.budgets) {
    const spentMonth = Math.max(0, month.byCategory.get(b.categoryId) ?? 0);
    const spentWeek = Math.max(0, week.byCategory.get(b.categoryId) ?? 0);
    const weeklyShare = Math.round((b.amount * 7) / daysInMonth);
    const name = catName(b.categoryId);
    if (spentMonth > b.amount) {
      out.push({
        key: `budget_over:${b.categoryId}:${s.month}`,
        kind: "budget_over",
        severity: "attention",
        title: `${name} is over budget`,
        what: `You have spent ${formatINR(spentMonth, { whole: true })} on ${name.toLowerCase()} this month against a budget of ${formatINR(b.amount, { whole: true })}.`,
        why: `Overspending in one category usually comes out of savings or another category later in the month.`,
        next: `Decide whether the budget was unrealistic or the spending was a one-off, then set a realistic figure. A short review on Sunday keeps it from repeating next month.`,
        evidence: [
          { label: "Spent", value: formatINR(spentMonth, { whole: true }) },
          { label: "Budget", value: formatINR(b.amount, { whole: true }) },
          { label: "Over by", value: formatINR(spentMonth - b.amount, { whole: true }) },
        ],
        actions: [
          { type: "link", label: "Adjust budget", href: `/money/budgets` },
          { type: "schedule_task", label: "Schedule a 5-minute review on Sunday", task: { title: `Review ${name.toLowerCase()} spending`, kind: "money_review", durationMin: 5, planDate: sunday, linkRef: `budget:${b.categoryId}:${s.month}` } },
        ],
        score: 90,
      });
    } else if (weeklyShare > 0 && spentWeek > weeklyShare * 1.25 && spentWeek - weeklyShare > 50000) {
      out.push({
        key: `budget_week:${b.categoryId}:${weekStart}`,
        kind: "budget_pace",
        severity: "attention",
        title: `You exceeded your ${name.toLowerCase()} budget this week`,
        what: `This week you spent ${formatINR(spentWeek, { whole: true })} on ${name.toLowerCase()}. A weekly share of your monthly budget is about ${formatINR(weeklyShare, { whole: true })}.`,
        why: `At this pace you would use ${formatINR(b.amount - spentMonth, { whole: true })} of remaining budget sooner than the month ends.`,
        next: `Set a realistic budget for next week, schedule a five-minute review on Sunday, and earn progress for completing it.`,
        evidence: [
          { label: "This week", value: formatINR(spentWeek, { whole: true }) },
          { label: "Weekly share", value: formatINR(weeklyShare, { whole: true }) },
          { label: "Left this month", value: formatINR(b.amount - spentMonth, { whole: true }) },
        ],
        actions: [
          { type: "schedule_task", label: "Schedule a 5-minute Sunday review", task: { title: `Set next week's ${name.toLowerCase()} budget`, kind: "money_review", durationMin: 5, planDate: sunday, startTime: "18:00", linkRef: `budget_week:${b.categoryId}:${weekStart}` } },
          { type: "link", label: "See transactions", href: `/money/transactions?category=${b.categoryId}` },
        ],
        score: 85,
      });
    } else if (b.amount > 0 && spentMonth / b.amount > elapsed + 0.2 && spentMonth / b.amount >= 0.6) {
      out.push({
        key: `budget_pace:${b.categoryId}:${s.month}`,
        kind: "budget_pace",
        severity: "info",
        title: `${name} is running ahead of the month`,
        what: `You have used ${formatPercent(spentMonth / b.amount)} of your ${name.toLowerCase()} budget and ${formatPercent(elapsed)} of the month has passed.`,
        why: `Spending ahead of the calendar leaves less room for the rest of the month.`,
        next: `Keep the remaining ${formatINR(b.amount - spentMonth, { whole: true })} in mind for the next ${daysInMonth - dayOfMonth} days, roughly ${formatINR(Math.round((b.amount - spentMonth) / Math.max(1, daysInMonth - dayOfMonth)), { whole: true })} a day.`,
        evidence: [
          { label: "Used", value: formatPercent(spentMonth / b.amount) },
          { label: "Month elapsed", value: formatPercent(elapsed) },
        ],
        actions: [{ type: "link", label: "View budgets", href: "/money/budgets" }],
        score: 55,
      });
    }
  }

  /* 2. Category spike vs own history (last 8 full weeks) */
  const histWeeks = 8;
  for (const c of s.categories.filter((c) => c.kind === "expense")) {
    const thisWeek = Math.max(0, week.byCategory.get(c.id) ?? 0);
    if (thisWeek < 100000) continue; // ignore < ₹1,000
    let total = 0;
    let weeksWithData = 0;
    for (let i = 1; i <= histWeeks; i++) {
      const ws = addDays(weekStart, -7 * i);
      const sm = summarizePeriod(s.txns, ws, addDays(ws, 6));
      if (sm.txnCount > 0) weeksWithData++;
      total += Math.max(0, sm.byCategory.get(c.id) ?? 0);
    }
    if (weeksWithData < 4) continue;
    const avg = Math.round(total / histWeeks);
    if (avg > 0 && thisWeek > avg * 1.8 && !out.some((o) => o.key.includes(c.id))) {
      const biggest = s.txns
        .filter((t) => t.date >= weekStart && t.date <= s.today && t.type === "expense" && t.splits.some((sp) => sp.categoryId === c.id))
        .sort((a, b) => b.amount - a.amount)[0];
      out.push({
        key: `spike:${c.id}:${weekStart}`,
        kind: "category_spike",
        severity: "info",
        title: `${c.name} is higher than usual this week`,
        what: `${formatINR(thisWeek, { whole: true })} so far this week, compared with your 8-week average of ${formatINR(avg, { whole: true })}.`,
        why: biggest ? `The largest item was "${s.txnMeta.get(biggest.id)?.description ?? "a transaction"}" for ${formatINR(biggest.amount, { whole: true })} on ${formatShortDate(biggest.date)}. One-offs are normal; a pattern is worth a decision.` : `A sustained rise would change your monthly plan.`,
        next: `If this was planned, dismiss this. If not, check what drove it and decide whether it should repeat.`,
        evidence: [
          { label: "This week", value: formatINR(thisWeek, { whole: true }) },
          { label: "8-week average", value: formatINR(avg, { whole: true }) },
        ],
        actions: [{ type: "link", label: "See transactions", href: `/money/transactions?category=${c.id}` }],
        score: 60,
      });
    }
  }

  /* 3. Unusual single transaction: > 3x the category's median and > ₹2,000 in last 7 days */
  const recent = s.txns.filter((t) => t.type === "expense" && diffDays(s.today, t.date) <= 7 && diffDays(s.today, t.date) >= 0);
  for (const t of recent) {
    const cat = t.splits[0]?.categoryId;
    if (!cat || t.amount < 200000) continue;
    const history = s.txns
      .filter((x) => x.type === "expense" && x.id !== t.id && x.splits.some((sp) => sp.categoryId === cat) && diffDays(s.today, x.date) <= 120)
      .map((x) => x.amount)
      .sort((a, b) => a - b);
    if (history.length < 5) continue;
    const median = history[Math.floor(history.length / 2)];
    if (t.amount > median * 3) {
      out.push({
        key: `unusual:${t.id}`,
        kind: "unusual_txn",
        severity: "info",
        title: `A larger-than-usual ${catName(cat).toLowerCase()} payment`,
        what: `"${s.txnMeta.get(t.id)?.description ?? "Transaction"}" for ${formatINR(t.amount, { whole: true })} on ${formatShortDate(t.date)}. Your typical ${catName(cat).toLowerCase()} payment is about ${formatINR(median, { whole: true })}.`,
        why: `Large one-off payments are easy to forget when you review the month, and occasionally they are errors or duplicate charges.`,
        next: `Confirm you recognise it. If it was expected, dismiss this note.`,
        evidence: [
          { label: "Amount", value: formatINR(t.amount, { whole: true }) },
          { label: "Typical", value: formatINR(median, { whole: true }) },
        ],
        actions: [{ type: "link", label: "Open transaction", href: `/money/transactions/${t.id}` }],
        score: 50,
      });
    }
  }

  /* 4. Cash shortfall from known commitments (next 30 days) */
  const proj = projectCash(s.liquidCash, s.recurring, s.today, 30, 0);
  if (proj.shortfall) {
    out.push({
      key: `shortfall:${proj.shortfall.date}:${proj.shortfall.trigger.itemId}`,
      kind: "cash_shortfall",
      severity: "attention",
      title: `Cash may run short around ${formatShortDate(proj.shortfall.date)}`,
      what: `Based only on your known bills and income, your liquid balance would dip to ${formatINR(proj.shortfall.balance, { whole: true })} when "${proj.shortfall.trigger.name}" is due.`,
      why: `A shortfall can mean late fees, credit-card interest or dipping into savings. Everyday spending is not included, so the real gap could be larger.`,
      next: `Move money from savings in advance, reschedule a payment, or reduce discretionary spending before that date.`,
      evidence: [
        { label: "Liquid cash today", value: formatINR(s.liquidCash, { whole: true }) },
        { label: "Lowest projected", value: formatINR(proj.lowestPoint.balance, { whole: true }) },
      ],
      actions: [
        { type: "schedule_task", label: "Plan for it tomorrow", task: { title: `Plan cash for ${proj.shortfall.trigger.name}`, kind: "money_review", durationMin: 10, planDate: addDays(s.today, 1), linkRef: `shortfall:${proj.shortfall.date}` } },
        { type: "link", label: "See bills", href: "/money/bills" },
      ],
      score: 95,
    });
  }

  /* 5. Subscriptions */
  const subs = s.recurring.filter((r) => r.active && r.kind === "subscription");
  if (subs.length > 0) {
    const monthly = subs.reduce((a, r) => a + monthlyEquivalent(r), 0);
    const share = s.monthlyIncomeEstimate ? monthly / s.monthlyIncomeEstimate : null;
    const stale = subs.filter((r) => !r.lastReviewedAt || diffDays(s.today, r.lastReviewedAt.toISOString().slice(0, 10)) > 90);
    if (stale.length > 0) {
      const top = [...stale].sort((a, b) => monthlyEquivalent(b) - monthlyEquivalent(a))[0];
      out.push({
        key: `sub_review:${top.id}:${s.month}`,
        kind: "subscription_review",
        severity: "info",
        title: `Subscriptions cost ${formatINR(monthly, { whole: true })} a month`,
        what: `You have ${subs.length} active subscriptions${share !== null ? `, about ${formatPercent(share, 1)} of your monthly income` : ""}. ${stale.length} have not been reviewed in 90 days.`,
        why: `Subscriptions renew silently. Ones you rarely use are among the easiest savings to find.`,
        next: `Review "${top.name}" (${formatINR(monthlyEquivalent(top), { whole: true })}/month equivalent): keep, downgrade or cancel.`,
        evidence: [
          { label: "Monthly total", value: formatINR(monthly, { whole: true }) },
          { label: "Yearly total", value: formatINR(monthly * 12, { whole: true }) },
        ],
        actions: [
          { type: "link", label: "Review subscriptions", href: "/money/bills" },
          { type: "schedule_task", label: "Schedule a 10-minute review", task: { title: "Review subscriptions", kind: "money_review", durationMin: 10, planDate: sunday, linkRef: `subs:${s.month}` } },
        ],
        score: 40,
      });
    }
  }

  /* 6. Savings rate vs previous 3 months (only once the month is mostly done or income received) */
  if (month.income > 0) {
    const prev: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const mStart = `${addMonthsKey(s.month, -i)}-01`;
      const mEnd = addDays(`${addMonthsKey(s.month, -i + 1)}-01`, -1);
      const sm = summarizePeriod(s.txns, mStart, mEnd);
      if (sm.savingsRate !== null) prev.push(sm.savingsRate);
    }
    if (prev.length >= 2 && month.savingsRate !== null && elapsed > 0.5) {
      const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
      const delta = month.savingsRate - avg;
      if (Math.abs(delta) >= 0.08) {
        out.push({
          key: `savings_rate:${s.month}:${delta > 0 ? "up" : "down"}`,
          kind: "savings_rate",
          severity: delta > 0 ? "positive" : "info",
          title: delta > 0 ? `You are saving more than usual this month` : `You are saving less than usual this month`,
          what: `Savings rate so far: ${formatPercent(month.savingsRate)} versus your recent average of ${formatPercent(avg)}.`,
          why: `Savings rate = (income − spending) ÷ income. Money moved to savings or investments counts as saved, not spent.`,
          next: delta > 0 ? `Decide where the extra goes before it gets spent: an emergency fund or a goal.` : `Check which categories grew. Spending in the "Spending by category" view shows the change.`,
          evidence: [
            { label: "This month", value: formatPercent(month.savingsRate) },
            { label: "Recent average", value: formatPercent(avg) },
          ],
          actions: [{ type: "link", label: delta > 0 ? "View goals" : "View spending", href: delta > 0 ? "/plan" : "/money" }],
          score: delta > 0 ? 35 : 45,
        });
      }
    }
  }

  /* 7. Uncategorised */
  const uncategorised = s.txns.filter((t) => t.date >= addDays(s.today, -30) && t.type === "expense" && t.splits.some((sp) => sp.categoryId === null)).length;
  if (uncategorised > 0) {
    out.push({
      key: `uncategorised:${weekStart}`,
      kind: "uncategorised",
      severity: "info",
      title: `${uncategorised} transaction${uncategorised === 1 ? "" : "s"} need a category`,
      what: `${uncategorised} expense${uncategorised === 1 ? "" : "s"} from the last 30 days have no category.`,
      why: `Uncategorised spending is invisible to budgets and trends, so insights are less accurate.`,
      next: `Categorising takes about a minute and completes this week's quest.`,
      evidence: [{ label: "Uncategorised", value: String(uncategorised) }],
      actions: [{ type: "link", label: "Categorise now", href: "/money/transactions?uncategorised=1" }],
      score: 30,
    });
  }

  /* 8. Emergency fund coverage */
  if (s.monthlyEssentialsEstimate && s.monthlyEssentialsEstimate > 0 && s.emergencyFundBalance !== null) {
    const months = s.emergencyFundBalance / s.monthlyEssentialsEstimate;
    if (months < 3) {
      out.push({
        key: `emergency:${s.month}`,
        kind: "emergency_coverage",
        severity: "info",
        title: `Emergency fund covers ${months.toFixed(1)} months of essentials`,
        what: `Your emergency savings of ${formatINR(s.emergencyFundBalance, { whole: true })} would cover about ${months.toFixed(1)} months of essential expenses (${formatINR(s.monthlyEssentialsEstimate, { whole: true })}/month).`,
        why: `A common guideline is 3–6 months of essentials, so a job change or medical cost does not force you into debt or to sell investments at a bad time. The right number depends on how stable your income is.`,
        next: `Building reserves first is a valid plan. The weekly review can suggest a contribution that fits your surplus.`,
        evidence: [
          { label: "Coverage", value: `${months.toFixed(1)} months` },
          { label: "3-month level", value: formatINR(s.monthlyEssentialsEstimate * 3, { whole: true }) },
        ],
        actions: [{ type: "link", label: "Open plan", href: "/plan" }],
        score: 42,
      });
    }
  }

  /* 9. No budget this month */
  if (s.budgets.length === 0) {
    out.push({
      key: `no_budget:${s.month}`,
      kind: "no_budget",
      severity: "info",
      title: `No budget set for this month`,
      what: `There are no category budgets for this month yet.`,
      why: `Budgets turn tracking into decisions. Without one, the app can only describe spending, not tell you when it is off track.`,
      next: `Start with two or three categories you want to control, such as dining and shopping. Last month's spending is a reasonable starting point.`,
      evidence: [],
      actions: [
        { type: "link", label: "Set budgets", href: "/money/budgets" },
        { type: "schedule_task", label: "Do it tonight (10 min)", task: { title: "Set this month's budget", kind: "budget_setup", durationMin: 10, planDate: s.today, startTime: "20:30", linkRef: `budget_setup:${s.month}` } },
      ],
      score: 70,
    });
  }

  /* 10. Positive reinforcement when everything budgeted is on track late in the month */
  if (s.budgets.length > 0 && elapsed > 0.7 && !out.some((o) => o.kind === "budget_over" || o.kind === "budget_pace")) {
    out.push({
      key: `under_budget:${s.month}`,
      kind: "under_budget",
      severity: "positive",
      title: `All budgets on track`,
      what: `With ${daysInMonth - dayOfMonth} days left, every budgeted category is within its limit.`,
      why: `Consistent months like this make your plan predictable.`,
      next: `No action needed. Consider whether any budget is now too generous.`,
      evidence: [],
      actions: [],
      score: 20,
    });
  }

  return out.sort((a, b) => b.score - a.score);
}

function addMonthsKey(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + n;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}
