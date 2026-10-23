import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, makeUser } from "./helpers";
import { categories, finAccounts, jobRuns, user, xpEvents } from "@/db/schema";
import { createTransaction, deleteTransaction, loadTransactions, OwnershipError, updateTransaction } from "@/server/finance";
import { awardXp, revokeXp, xpSummary } from "@/server/xp";
import { runOnce } from "@/server/jobs/run";
import { pool } from "@/db";
import { notifications, recurringItems } from "@/db/schema";
import { hourlyUserTick } from "@/server/jobs/tasks";

async function account(userId: string, name = "Bank") {
  const [a] = await db.insert(finAccounts).values({ userId, name, type: "bank", openingBalance: 0, openingDate: "2026-01-01" }).returning();
  return a.id;
}
async function category(userId: string) {
  const [c] = await db.select().from(categories).where(eq(categories.userId, userId)).limit(1);
  return c.id;
}

const created: string[] = [];
afterAll(async () => {
  for (const id of created) await db.delete(user).where(eq(user.id, id));
  await db.delete(jobRuns).where(eq(jobRuns.job, "test-job"));
  await pool.end();
});

describe("user data isolation", () => {
  it("cannot read, write into, or delete another user's data", async () => {
    const alice = await makeUser("alice");
    const bob = await makeUser("bob");
    created.push(alice, bob);
    const aliceAcct = await account(alice);
    const bobAcct = await account(bob);
    const aliceCat = await category(alice);
    const id = await createTransaction(db, alice, { type: "expense", date: "2026-10-01", amount: 500_00, accountId: aliceAcct, description: "Lunch", splits: [{ categoryId: aliceCat, amount: 500_00 }] });

    expect(await loadTransactions(db, bob)).toHaveLength(0);
    // Bob can't post into Alice's account or use her category
    await expect(createTransaction(db, bob, { type: "expense", date: "2026-10-01", amount: 1, accountId: aliceAcct, description: "x", splits: [{ categoryId: null, amount: 1 }] })).rejects.toBeInstanceOf(OwnershipError);
    await expect(createTransaction(db, bob, { type: "expense", date: "2026-10-01", amount: 1, accountId: bobAcct, description: "x", splits: [{ categoryId: aliceCat, amount: 1 }] })).rejects.toBeInstanceOf(OwnershipError);
    // Bob can't transfer into Alice's account
    await expect(createTransaction(db, bob, { type: "transfer", date: "2026-10-01", amount: 1, accountId: bobAcct, toAccountId: aliceAcct, description: "x", splits: [] })).rejects.toBeInstanceOf(OwnershipError);
    // Bob can't edit or delete Alice's transaction
    await expect(updateTransaction(db, bob, id, { type: "expense", date: "2026-10-01", amount: 1, accountId: bobAcct, description: "hijack", splits: [{ categoryId: null, amount: 1 }] })).rejects.toBeInstanceOf(OwnershipError);
    expect(await deleteTransaction(db, bob, id)).toBe(false);
    expect(await loadTransactions(db, alice)).toHaveLength(1);
  });

  it("stores splits and rejects inconsistent ones", async () => {
    const u = await makeUser("splits");
    created.push(u);
    const a = await account(u);
    const cats = await db.select().from(categories).where(eq(categories.userId, u)).limit(2);
    await createTransaction(db, u, { type: "expense", date: "2026-10-02", amount: 300_00, accountId: a, description: "Big basket", splits: [{ categoryId: cats[0].id, amount: 200_00 }, { categoryId: cats[1].id, amount: 100_00 }] });
    const [t] = await loadTransactions(db, u);
    expect(t.splits.map((s) => s.amount).sort()).toEqual([100_00, 200_00]);
    await expect(createTransaction(db, u, { type: "expense", date: "2026-10-02", amount: 300_00, accountId: a, description: "x", splits: [{ categoryId: null, amount: 1 }] })).rejects.toThrow(/add up/);
  });
});

describe("XP integrity", () => {
  it("awards once per key, even under concurrent double-clicks", async () => {
    const u = await makeUser("xp");
    created.push(u);
    const results = await Promise.all(Array.from({ length: 5 }, () => awardXp(db, u, "weekly_review", "weekly:2026-10-19", "2026-10-25")));
    expect(results.filter((r) => r.awarded)).toHaveLength(1);
    expect((await xpSummary(db, u)).total).toBe(40);
  });

  it("revokes on undo and reinstates without double counting", async () => {
    const u = await makeUser("xp2");
    created.push(u);
    await awardXp(db, u, "priority_done", "task:t1", "2026-10-25");
    expect(await revokeXp(db, u, "task:t1")).toBe(5);
    expect((await xpSummary(db, u)).total).toBe(0);
    expect((await awardXp(db, u, "priority_done", "task:t1", "2026-10-25")).awarded).toBe(true);
    expect((await awardXp(db, u, "priority_done", "task:t1", "2026-10-25")).awarded).toBe(false);
    expect((await xpSummary(db, u)).total).toBe(5);
  });

  it("enforces daily caps", async () => {
    const u = await makeUser("xp3");
    created.push(u);
    for (let i = 0; i < 5; i++) await awardXp(db, u, "priority_done", `task:cap${i}`, "2026-10-25");
    const rows = await db.select().from(xpEvents).where(eq(xpEvents.userId, u));
    expect(rows).toHaveLength(3);
  });

  it("awards nothing when gamification is off", async () => {
    const u = await makeUser("xp4");
    created.push(u);
    const { preferences } = await import("@/db/schema");
    await db.update(preferences).set({ gamification: "off" }).where(eq(preferences.userId, u));
    expect((await awardXp(db, u, "morning_plan", "morning:x", "2026-10-25")).reason).toBe("disabled");
  });
});

describe("background job runner", () => {
  it("retries failures and is idempotent once successful", async () => {
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls === 1) throw new Error("transient");
      return { done: true };
    };
    await expect(runOnce(db, "test-job", "slot-1", flaky)).rejects.toThrow("transient");
    let [row] = await db.select().from(jobRuns).where(eq(jobRuns.runKey, "slot-1"));
    expect(row.status).toBe("error");
    expect((await runOnce(db, "test-job", "slot-1", flaky)).skipped).toBe(false);
    [row] = await db.select().from(jobRuns).where(eq(jobRuns.runKey, "slot-1"));
    expect(row.status).toBe("ok");
    expect(row.attempts).toBe(2);
    expect((await runOnce(db, "test-job", "slot-1", flaky)).skipped).toBe(true);
    expect(calls).toBe(2);
  });
});

describe("reminder job", () => {
  it("creates one bill reminder per due date, idempotently, in the user's timezone", async () => {
    const u = await makeUser("remind");
    created.push(u);
    await db.insert(recurringItems).values({ userId: u, name: "Rent", direction: "outflow", kind: "bill", amount: 20_000_00, frequency: "monthly", nextDueDate: "2026-10-25", remindDaysBefore: 2 });
    const tenAmIst = new Date("2026-10-24T04:30:00Z");
    await hourlyUserTick(db, tenAmIst);
    await hourlyUserTick(db, tenAmIst); // job redelivered / ran twice
    const rows = await db.select().from(notifications).where(eq(notifications.userId, u));
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Rent due tomorrow");
    expect(rows[0].body).not.toMatch(/undefined/);
  });

  it("does not remind before 8am local time", async () => {
    const u = await makeUser("early");
    created.push(u);
    await db.insert(recurringItems).values({ userId: u, name: "Netflix", direction: "outflow", kind: "subscription", amount: 649_00, frequency: "monthly", nextDueDate: "2026-10-24", remindDaysBefore: 1 });
    await hourlyUserTick(db, new Date("2026-10-23T21:30:00Z")); // 03:00 IST
    expect(await db.select().from(notifications).where(eq(notifications.userId, u))).toHaveLength(0);
  });
});
