import "server-only";
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import { categories, preferences, routines, type NotificationPrefs } from "@/db/schema";

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  inApp: true,
  browserPush: false,
  billReminders: true,
  weeklyReview: true,
  dailyBriefing: false,
  quietStart: "22:00",
  quietEnd: "07:30",
  maxPerDay: 3,
};

export const DEFAULT_CATEGORIES: Array<{ name: string; kind: "expense" | "income"; essential: boolean; color: string }> = [
  { name: "Rent & housing", kind: "expense", essential: true, color: "indigo" },
  { name: "Groceries", kind: "expense", essential: true, color: "emerald" },
  { name: "Utilities & phone", kind: "expense", essential: true, color: "sky" },
  { name: "Transport", kind: "expense", essential: true, color: "amber" },
  { name: "Health", kind: "expense", essential: true, color: "rose" },
  { name: "Education", kind: "expense", essential: true, color: "violet" },
  { name: "EMI & loan payments", kind: "expense", essential: true, color: "slate" },
  { name: "Dining & delivery", kind: "expense", essential: false, color: "orange" },
  { name: "Shopping", kind: "expense", essential: false, color: "pink" },
  { name: "Subscriptions", kind: "expense", essential: false, color: "cyan" },
  { name: "Entertainment", kind: "expense", essential: false, color: "fuchsia" },
  { name: "Travel", kind: "expense", essential: false, color: "teal" },
  { name: "Personal care", kind: "expense", essential: false, color: "lime" },
  { name: "Gifts & family", kind: "expense", essential: false, color: "red" },
  { name: "Fees & charges", kind: "expense", essential: false, color: "stone" },
  { name: "Other spending", kind: "expense", essential: false, color: "zinc" },
  { name: "Salary & stipend", kind: "income", essential: false, color: "emerald" },
  { name: "Freelance & side income", kind: "income", essential: false, color: "teal" },
  { name: "Interest & dividends", kind: "income", essential: false, color: "sky" },
  { name: "Family support", kind: "income", essential: false, color: "violet" },
  { name: "Other income", kind: "income", essential: false, color: "zinc" },
];

/** Financial follow-through routines suggested to every user (editable, can be paused). */
export const DEFAULT_ROUTINES = [
  { title: "Weekly money review", kind: "money_review" as const, daysOfWeek: [0], startTime: "18:00", durationMin: 20 },
  { title: "Read the business briefing", kind: "briefing" as const, daysOfWeek: [1, 2, 3, 4, 5], startTime: "08:30", durationMin: 10 },
];

/** Idempotent: creates preferences, default categories and starter routines once. */
export async function ensureUserInitialized(db: DB, userId: string) {
  const [existing] = await db.select({ userId: preferences.userId }).from(preferences).where(eq(preferences.userId, userId));
  if (existing) return;
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(preferences)
      .values({ userId, notifications: DEFAULT_NOTIFICATION_PREFS, newsTopics: ["economy", "business", "banking", "markets", "technology"] })
      .onConflictDoNothing()
      .returning({ userId: preferences.userId });
    if (inserted.length === 0) return; // a concurrent request initialised the user
    await tx.insert(categories).values(DEFAULT_CATEGORIES.map((c) => ({ ...c, userId }))).onConflictDoNothing();
    await tx.insert(routines).values(DEFAULT_ROUTINES.map((r) => ({ ...r, userId })));
  });
}
