import "server-only";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import {
  budgets,
  categories,
  dailyReviews,
  finAccounts,
  financialProfile,
  goalContributions,
  goals,
  habitLogs,
  habits,
  holdings,
  preferences,
  recurringItems,
  tasks,
  transactionSplits,
  transactions,
  xpEvents,
} from "@/db/schema";
import { addDays, addMonths, dayOfWeek, monthKey, startOfWeek, todayLocal } from "@/lib/dates";

/** Small deterministic PRNG so demo data is stable for a given day. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const R = (rupees: number) => Math.round(rupees * 100);

/**
 * Seeds a demo account for a young professional in Bengaluru (all amounts illustrative).
 * Every row belongs to the demo user only; the user row is flagged isDemo.
 */
export async function seedDemoData(db: DB, userId: string, tz = "Asia/Kolkata") {
  const today = todayLocal(tz);
  const rand = mulberry32(Number(today.replaceAll("-", "")));
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
  const between = (a: number, b: number) => Math.round(a + rand() * (b - a));

  const cats = await db.select().from(categories).where(eq(categories.userId, userId));
  const cat = (name: string) => cats.find((c) => c.name === name)!.id;

  const start = addMonths(today, -3).slice(0, 8) + "01";

  await db.update(preferences).set({ displayName: "Demo explorer", onboardingCompletedAt: new Date() }).where(eq(preferences.userId, userId));

  const [bank, card, cash, mf] = await db
    .insert(finAccounts)
    .values([
      { userId, name: "Salary account (UPI linked)", type: "bank", institution: "Sample Bank", openingBalance: R(64_500), openingDate: start },
      { userId, name: "Rewards credit card", type: "credit_card", institution: "Sample Bank", openingBalance: R(8_240), openingDate: start, creditLimit: R(1_50_000) },
      { userId, name: "Cash", type: "cash", openingBalance: R(2_000), openingDate: start },
      { userId, name: "Mutual fund folio (cash flows)", type: "investment", openingBalance: 0, openingDate: start, includeInNetWorth: false },
    ])
    .returning({ id: finAccounts.id });

  type T = { type: "income" | "expense" | "transfer" | "refund"; date: string; amount: number; accountId: string; toAccountId?: string; description: string; merchant?: string; categoryId?: string | null; paymentMethod?: string; tags?: string[] };
  const txns: T[] = [];

  for (let d = start; d <= today; d = addDays(d, 1)) {
    const dom = Number(d.slice(8));
    const dow = dayOfWeek(d);
    if (dom === 1) {
      txns.push({ type: "income", date: d, amount: R(92_000), accountId: bank.id, description: "Salary credit", categoryId: cat("Salary & stipend"), paymentMethod: "neft" });
      txns.push({ type: "expense", date: d, amount: R(24_000), accountId: bank.id, description: "Rent to landlord", categoryId: cat("Rent & housing"), paymentMethod: "upi", merchant: "Landlord" });
    }
    if (dom === 5) txns.push({ type: "transfer", date: d, amount: R(10_000), accountId: bank.id, toAccountId: mf.id, description: "SIP: Index fund (monthly)" });
    if (dom === 7) txns.push({ type: "expense", date: d, amount: R(between(1_400, 2_100)), accountId: bank.id, description: "Electricity bill (BESCOM)", categoryId: cat("Utilities & phone"), paymentMethod: "upi" });
    if (dom === 9) txns.push({ type: "expense", date: d, amount: R(799), accountId: card.id, description: "Broadband plan", categoryId: cat("Utilities & phone"), paymentMethod: "card" });
    if (dom === 12) txns.push({ type: "expense", date: d, amount: R(649), accountId: card.id, description: "Netflix", categoryId: cat("Subscriptions"), paymentMethod: "card" });
    if (dom === 14) txns.push({ type: "expense", date: d, amount: R(119), accountId: card.id, description: "Spotify", categoryId: cat("Subscriptions"), paymentMethod: "card" });
    if (dom === 3) txns.push({ type: "expense", date: d, amount: R(1_500), accountId: bank.id, description: "Gym membership", categoryId: cat("Health"), paymentMethod: "upi" });
    if (dom === 20) txns.push({ type: "expense", date: d, amount: R(399), accountId: bank.id, description: "Mobile recharge", categoryId: cat("Utilities & phone"), paymentMethod: "upi" });
    if (dom === 18) {
      // Card bill paid in full: a transfer, so purchases are not double-counted.
      txns.push({ type: "transfer", date: d, amount: R(between(9_000, 14_000)), accountId: bank.id, toAccountId: card.id, description: "Credit card bill payment" });
    }
    if (dom === 25) txns.push({ type: "transfer", date: d, amount: R(5_000), accountId: bank.id, toAccountId: cash.id, description: "ATM withdrawal" });

    // Groceries twice a week
    if (dow === 3 || dow === 6) {
      txns.push({ type: "expense", date: d, amount: R(between(650, 2_300)), accountId: pick([bank.id, card.id]), description: pick(["BigBasket order", "Local kirana store", "Zepto groceries", "Weekly vegetables"]), categoryId: cat("Groceries"), paymentMethod: "upi" });
    }
    // Daily small UPI spends
    if (rand() < 0.75) txns.push({ type: "expense", date: d, amount: R(between(20, 120)), accountId: bank.id, description: pick(["Chai & snacks", "Tea stall", "Coffee", "Bakery"]), categoryId: cat("Dining & delivery"), paymentMethod: "upi" });
    if (rand() < 0.55) txns.push({ type: "expense", date: d, amount: R(between(60, 380)), accountId: bank.id, description: pick(["Auto ride", "Metro card recharge", "Cab to office", "Bike taxi"]), categoryId: cat("Transport"), paymentMethod: "upi" });
    // Food delivery, heavier on weekends
    if (rand() < (dow === 5 || dow === 6 || dow === 0 ? 0.6 : 0.22)) {
      txns.push({ type: "expense", date: d, amount: R(between(240, 780)), accountId: pick([bank.id, card.id]), description: pick(["Swiggy order", "Zomato order", "Dinner with friends"]), categoryId: cat("Dining & delivery"), paymentMethod: pick(["upi", "card"]) });
    }
    if (rand() < 0.08) txns.push({ type: "expense", date: d, amount: R(between(600, 3_200)), accountId: card.id, description: pick(["Myntra order", "Amazon order", "Decathlon"]), categoryId: cat("Shopping"), paymentMethod: "card" });
    if (rand() < 0.05) txns.push({ type: "expense", date: d, amount: R(between(300, 900)), accountId: card.id, description: pick(["Movie tickets", "Concert entry", "Bowling"]), categoryId: cat("Entertainment"), paymentMethod: "card" });
  }

  // A dining overspend this week drives the "you exceeded your dining budget" example.
  const wk = startOfWeek(today, 1);
  txns.push({ type: "expense", date: wk <= today ? wk : today, amount: R(2_850), accountId: card.id, description: "Team dinner (my share)", categoryId: cat("Dining & delivery"), paymentMethod: "card" });
  txns.push({ type: "expense", date: addDays(wk, 1) <= today ? addDays(wk, 1) : today, amount: R(1_640), accountId: card.id, description: "Birthday dinner", categoryId: cat("Dining & delivery"), paymentMethod: "card" });
  // A refund and an uncategorised item for realism.
  const shoeDate = addDays(today, -12);
  txns.push({ type: "expense", date: shoeDate, amount: R(3_499), accountId: card.id, description: "Running shoes", categoryId: cat("Shopping"), paymentMethod: "card" });
  txns.push({ type: "refund", date: addDays(today, -6), amount: R(3_499), accountId: card.id, description: "Refund: running shoes (returned)", categoryId: cat("Shopping"), paymentMethod: "card" });
  txns.push({ type: "expense", date: addDays(today, -2), amount: R(1_180), accountId: bank.id, description: "UPI payment to 98xxxxxx21", categoryId: null, paymentMethod: "upi" });

  for (const t of txns) {
    const [row] = await db
      .insert(transactions)
      .values({ userId, type: t.type, date: t.date, amount: t.amount, accountId: t.accountId, toAccountId: t.toAccountId ?? null, description: t.description, merchant: t.merchant ?? null, paymentMethod: t.paymentMethod ?? null, tags: t.tags ?? ["sample"] })
      .returning({ id: transactions.id });
    if (t.type !== "transfer") {
      await db.insert(transactionSplits).values({ transactionId: row.id, userId, categoryId: t.categoryId ?? null, amount: t.amount });
    }
  }

  const month = monthKey(today);
  await db.insert(budgets).values([
    { userId, categoryId: cat("Dining & delivery"), month, amount: R(12_000) },
    { userId, categoryId: cat("Groceries"), month, amount: R(11_000) },
    { userId, categoryId: cat("Shopping"), month, amount: R(6_000) },
    { userId, categoryId: cat("Transport"), month, amount: R(6_000) },
    { userId, categoryId: cat("Entertainment"), month, amount: R(2_500) },
  ]);

  const nextDom = (dom: number) => {
    const thisMonth = `${today.slice(0, 8)}${String(dom).padStart(2, "0")}`;
    return thisMonth >= today ? thisMonth : addMonths(thisMonth, 1);
  };
  const reviewedLongAgo = new Date(Date.now() - 200 * 86400000);
  await db.insert(recurringItems).values([
    { userId, name: "Salary", direction: "inflow", kind: "income", amount: R(92_000), frequency: "monthly", nextDueDate: nextDom(1), accountId: bank.id, categoryId: cat("Salary & stipend"), essential: false },
    { userId, name: "Rent", direction: "outflow", kind: "bill", amount: R(24_000), frequency: "monthly", nextDueDate: nextDom(1), accountId: bank.id, categoryId: cat("Rent & housing") },
    { userId, name: "Index fund SIP", direction: "outflow", kind: "investment", amount: R(10_000), frequency: "monthly", nextDueDate: nextDom(5), accountId: bank.id, essential: false },
    { userId, name: "Electricity", direction: "outflow", kind: "bill", amount: R(1_800), frequency: "monthly", nextDueDate: nextDom(7), accountId: bank.id, categoryId: cat("Utilities & phone") },
    { userId, name: "Broadband", direction: "outflow", kind: "bill", amount: R(799), frequency: "monthly", nextDueDate: nextDom(9), accountId: card.id, categoryId: cat("Utilities & phone") },
    { userId, name: "Netflix", direction: "outflow", kind: "subscription", amount: R(649), frequency: "monthly", nextDueDate: nextDom(12), accountId: card.id, categoryId: cat("Subscriptions"), essential: false, lastReviewedAt: reviewedLongAgo },
    { userId, name: "Spotify", direction: "outflow", kind: "subscription", amount: R(119), frequency: "monthly", nextDueDate: nextDom(14), accountId: card.id, categoryId: cat("Subscriptions"), essential: false },
    { userId, name: "Amazon Prime (annual)", direction: "outflow", kind: "subscription", amount: R(1_499), frequency: "yearly", nextDueDate: addDays(today, 40), accountId: card.id, categoryId: cat("Subscriptions"), essential: false },
    { userId, name: "Credit card bill", direction: "outflow", kind: "bill", amount: R(11_500), frequency: "monthly", nextDueDate: nextDom(18), accountId: bank.id },
    { userId, name: "Health insurance premium", direction: "outflow", kind: "bill", amount: R(14_200), frequency: "yearly", nextDueDate: addDays(today, 9), accountId: bank.id, categoryId: cat("Health") },
  ]);

  const [efund, laptop] = await db
    .insert(goals)
    .values([
      { userId, name: "Emergency fund", kind: "emergency", targetAmount: R(3_00_000), priority: 1, plannedMonthly: R(8_000) },
      { userId, name: "New laptop", kind: "purchase", targetAmount: R(85_000), targetDate: addMonths(today, 7), priority: 2, plannedMonthly: R(6_000) },
      { userId, name: "CFA Level I fees", kind: "education", targetAmount: R(1_20_000), targetDate: addMonths(today, 11), priority: 2, plannedMonthly: R(5_000) },
    ])
    .returning({ id: goals.id });
  await db.insert(goalContributions).values([
    { userId, goalId: efund.id, date: addMonths(today, -3), amount: R(60_000), note: "Starting balance moved from savings" },
    { userId, goalId: efund.id, date: addMonths(today, -2), amount: R(8_000) },
    { userId, goalId: efund.id, date: addMonths(today, -1), amount: R(8_000) },
    { userId, goalId: laptop.id, date: addMonths(today, -1), amount: R(6_000) },
  ]);

  await db.insert(holdings).values([
    { userId, name: "Nifty 50 index fund", assetClass: "equity", value: R(48_200), costBasis: R(42_000), valuationDate: addDays(today, -3), monthlyContribution: R(10_000), notes: "Sample holding. Value entered manually." },
    { userId, name: "Employee Provident Fund", assetClass: "debt", value: R(61_500), valuationDate: addDays(today, -30), notes: "Sample. Update from your EPFO passbook." },
    { userId, name: "Sovereign gold (sample)", assetClass: "gold", value: R(15_000), valuationDate: addDays(today, -45) },
  ]);

  await db
    .insert(financialProfile)
    .values({
      userId,
      monthlyIncome: R(92_000),
      incomeStability: "stable",
      monthlyEssentials: R(42_000),
      monthlyDebtPayments: 0,
      emergencySavings: R(76_000),
      liquidityNeeds: "Laptop and CFA exam fees within a year",
      liquidityAmount: R(2_05_000),
      liquidityWithinMonths: 12,
      riskTolerance: "medium",
      riskCapacity: "medium",
      investmentExperience: "some",
      skipped: [],
    })
    .onConflictDoNothing();

  // Schedule: today and a few past days, some carried forward.
  await db.insert(tasks).values([
    { userId, title: "Finish valuation case study", planDate: today, startTime: "10:00", durationMin: 90, isTopPriority: true, kind: "task" },
    { userId, title: "Mock interview prep: banking questions", planDate: today, startTime: "15:00", durationMin: 45, isTopPriority: true, kind: "task" },
    { userId, title: "Pay health insurance premium", planDate: today, durationMin: 10, isTopPriority: true, kind: "bill", linkRef: "demo:insurance" },
    { userId, title: "Read RBI policy explainer", planDate: today, durationMin: 20, kind: "briefing", carriedFromDate: addDays(today, -2), carryCount: 2 },
    { userId, title: "Update CV with internship metrics", planDate: today, durationMin: 60, kind: "task", carriedFromDate: addDays(today, -1), carryCount: 3 },
    { userId, title: "Group project sync", planDate: addDays(today, 1), startTime: "11:00", durationMin: 60, kind: "task" },
    { userId, title: "Sort last week's receipts", planDate: addDays(today, -1), durationMin: 15, kind: "money_review", status: "done", completedAt: new Date(Date.now() - 86400000) },
  ]);

  const [h1, h2] = await db
    .insert(habits)
    .values([
      { userId, title: "Read one business story", targetPerWeek: 5, skill: "business" },
      { userId, title: "Log spending before bed", targetPerWeek: 6, skill: "money" },
      { userId, title: "30-minute walk", targetPerWeek: 4, skill: "discipline" },
    ])
    .returning({ id: habits.id });
  const logs: { habitId: string; userId: string; date: string }[] = [];
  const xps: (typeof xpEvents.$inferInsert)[] = [];
  for (let i = 1; i <= 20; i++) {
    const d = addDays(today, -i);
    if (i === 4 || i === 11) continue; // rest days
    if (rand() < 0.8) logs.push({ habitId: h1.id, userId, date: d });
    if (rand() < 0.85) logs.push({ habitId: h2.id, userId, date: d });
    xps.push({ userId, idempotencyKey: `daily_log:${d}`, action: "daily_log", skill: "money", xp: 5, localDate: d });
    if (rand() < 0.7) xps.push({ userId, idempotencyKey: `morning:${d}`, action: "morning_plan", skill: "discipline", xp: 10, localDate: d });
    if (rand() < 0.5) xps.push({ userId, idempotencyKey: `briefing:${d}`, action: "briefing_read", skill: "business", xp: 5, localDate: d });
  }
  xps.push({ userId, idempotencyKey: `weekly:${addDays(startOfWeek(today, 1), -7)}`, action: "weekly_review", skill: "money", xp: 40, localDate: addDays(startOfWeek(today, 1), -1) });
  xps.push({ userId, idempotencyKey: "onboarding", action: "onboarding_complete", skill: "money", xp: 20, localDate: addDays(today, -21) });
  xps.push({ userId, idempotencyKey: "concept:sip", action: "concept_learned", skill: "investing", xp: 5, localDate: addDays(today, -9) });
  xps.push({ userId, idempotencyKey: "concept:repo-rate", action: "concept_learned", skill: "investing", xp: 5, localDate: addDays(today, -5) });
  if (logs.length) await db.insert(habitLogs).values(logs).onConflictDoNothing();
  await db.insert(xpEvents).values(xps).onConflictDoNothing();
  await db.insert(dailyReviews).values({ userId, date: addDays(today, -1), kind: "evening", data: { note: "Sample evening review" } }).onConflictDoNothing();
}
