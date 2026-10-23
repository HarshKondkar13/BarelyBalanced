// End-to-end main journey as a brand-new (non-demo) user. Usage: node scripts/e2e-journey.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "screenshots";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "en-IN", timezoneId: "Asia/Kolkata" });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
page.on("console", (m) => { if (m.type() === "error" && !/caret-color|hydrat/i.test(m.text())) errors.push(`console: ${m.text()}`); });
const shot = (n) => page.screenshot({ path: `${out}/journey-${n}.png`, fullPage: true, caret: "initial" });
const step = (s) => console.log(`✓ ${s}`);
const toast = async (re) => { await page.getByRole("status").filter({ hasText: re }).first().waitFor({ timeout: 15000 }); };

// 1. Sign up
const email = `journey-${Date.now()}@example.com`;
await page.goto(`${base}/sign-up`);
await page.getByLabel("Name").fill("Riya Test");
await page.getByLabel("Email").fill(email);
await page.getByLabel("Password").fill("a-strong-password-1");
await page.getByRole("button", { name: "Create account" }).click();
await page.waitForURL("**/onboarding");
step("signed up");

// Onboarding: answer some, skip some
await page.getByRole("button", { name: "Continue" }).click();
await page.getByLabel(/monthly take-home/i).fill("85000");
await page.getByLabel(/How predictable/).selectOption("stable");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByLabel(/Essential monthly expenses/).fill("40000");
await page.getByLabel(/EMI payments/).fill("0");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByLabel(/Emergency savings/).fill("60000");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByRole("button", { name: "Skip" }).click(); // skip risk questions
await page.getByLabel(/Balance today/).fill("50000");
await page.getByRole("button", { name: "Continue" }).click();
await page.getByLabel("Target (₹)").fill("240000");
await shot("onboarding-last");
await page.getByRole("button", { name: "Finish setup" }).click();
await page.waitForURL("**/today");
await shot("today-first");
step("onboarding done (risk skipped)");

// 2. Add income and expenses
async function addTxn(type, amount, desc, category) {
  await page.goto(`${base}/money/transactions/new?type=${type}`);
  await page.getByLabel("Amount (₹)").fill(amount);
  await page.getByLabel("Description").fill(desc);
  if (category) await page.getByLabel("Category").selectOption({ label: category });
  await page.getByRole("button", { name: "Add transaction" }).click();
  await page.waitForURL("**/money/transactions");
}
await addTxn("income", "85000", "October salary", "Salary & stipend");
await addTxn("expense", "1,250.50", "Swiggy dinner", "Dining & delivery");
await addTxn("expense", "2400", "Groceries", "Groceries");
await shot("transactions");
step("added income and two expenses");

// 3. Budget + savings goal
await page.goto(`${base}/money/budgets`);
await page.getByLabel("Dining & delivery").fill("1000");
await page.getByLabel("Groceries").fill("8000");
await page.getByRole("button", { name: "Save budgets" }).click();
await toast(/Budgets saved/);
step("budgets saved");
await page.goto(`${base}/plan/goals/new`);
await page.getByLabel("Goal").fill("New laptop");
await page.getByLabel("Target amount (₹)").fill("80000");
await page.getByRole("button", { name: "Add goal" }).click();
await page.waitForURL("**/plan/goals");
step("goal created");

// 4. Actionable insight: dining is over budget -> schedule the review
await page.goto(`${base}/money`);
await shot("money");
const insight = page.getByRole("heading", { name: /Dining & delivery is over budget/ });
await insight.waitFor();
await page.getByRole("button", { name: /Schedule a 5-minute review on Sunday/ }).first().click();
await toast(/Scheduled|Already on your schedule/);
step("insight understood and scheduled");

// 5. Plan the day and finish a task
await page.goto(`${base}/schedule`);
await page.getByRole("button", { name: "Add a task" }).click();
await page.getByLabel("Task").fill("Prepare DCF model");
await page.locator("form").getByLabel("Top priority (max 3 a day)").check();
await page.getByRole("button", { name: "Add task" }).click();
await toast(/Added/);
await page.goto(`${base}/today?flow=morning`);
await page.getByRole("button", { name: /^Prepare DCF model \d+ min$/ }).waitFor();
await page.getByRole("button", { name: "Start the day" }).click();
await page.waitForURL(/\/today$/);
await page.getByRole("button", { name: 'Complete "Prepare DCF model"' }).click();
await toast(/\+5 XP/);
// Repeat-click farming: un-complete and re-complete must not add XP twice
await page.getByRole("button", { name: 'Mark "Prepare DCF model" as not done' }).click();
await toast(/XP \(undone\)/);
await page.getByRole("button", { name: 'Complete "Prepare DCF model"' }).click();
await toast(/\+5 XP/);
await shot("today-after");
step("planned day, completed task, undo/redo XP correct");

// 6. XP check: onboarding 20 + daily log 5 + budget 15 + morning plan 10 + priority 5 = 55
await page.goto(`${base}/progress`);
await shot("progress");
const header = await page.getByRole("heading", { name: /^Level/ }).locator("..").innerText();
assert.match(header, /55 XP/, `expected 55 XP, got: ${header}`);
step("XP total correct (55)");

// 7. Weekly review
await page.goto(`${base}/plan/review`);
await page.getByText("Build cash reserves first").first().waitFor();
await page.getByRole("checkbox").first().check().catch(() => {});
await shot("review");
await page.getByRole("button", { name: /Complete weekly review/ }).click();
await page.waitForURL("**/today");
await page.goto(`${base}/progress`);
const header2 = await page.getByRole("heading", { name: /^Level/ }).locator("..").innerText();
assert.match(header2, /95 XP/, `expected 95 XP after weekly review, got: ${header2}`);
step("weekly review completed (+40 XP)");

// 8. Integrations show an honest awaiting-credentials state
await page.goto(`${base}/settings/integrations`);
await page.getByText("Awaiting credentials").waitFor();
await shot("integrations");
step("integrations honest disconnected state");

// Export works and contains only this user's data
const res = await page.request.get(`${base}/api/export?format=json`);
const data = await res.json();
assert.equal(data.transactions.length, 3);
assert.equal(data.user.email, email);
step("export ok");

await browser.close();
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
console.log("JOURNEY PASSED");
