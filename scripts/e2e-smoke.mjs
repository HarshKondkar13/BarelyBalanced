// Drives the main journey in a real browser and saves screenshots.
// Usage: node scripts/e2e-smoke.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "screenshots";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
async function shoot(page, name) {
  await page.waitForTimeout(700); // let charts measure their containers
  await page.screenshot({ path: `${out}/${name}.png`, fullPage: true, caret: "initial" });
}
for (const [label, viewport] of [["mobile", { width: 390, height: 844 }], ["desktop", { width: 1280, height: 860 }]]) {
  const ctx = await browser.newContext({ viewport, locale: "en-IN", timezoneId: "Asia/Kolkata" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${label} pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`${label} console: ${m.text()}`); });
  await page.goto(base);
  await shoot(page, `${label}-landing`);
  await page.getByRole("button", { name: /Explore with sample data/ }).click();
  await page.waitForURL("**/today", { timeout: 60000 });
  await shoot(page, `${label}-today`);
  for (const path of ["/money", "/money/transactions", "/money/budgets", "/money/bills", "/money/accounts", "/money/holdings", "/money/import", "/money/transactions/new", "/plan", "/plan/review", "/plan/goals", "/plan/scenarios", "/signals", "/signals/recap", "/signals/learn", "/schedule", "/schedule/routines", "/schedule/focus", "/schedule/inbox", "/progress", "/settings", "/settings/notifications", "/settings/integrations", "/settings/categories", "/settings/data", "/notifications", "/onboarding", "/about"]) {
    const res = await page.goto(base + path);
    if (!res || res.status() >= 400) errors.push(`${label} ${path} -> ${res?.status()}`);
    await shoot(page, `${label}${path.replaceAll("/", "-")}`);
  }
  // Open the first story, then check dark mode renders.
  await page.goto(base + "/signals");
  await page.locator('a[href^="/signals/"]').filter({ hasText: "Demo:" }).first().click();
  await page.waitForURL(/\/signals\/[0-9a-f-]{36}/);
  await shoot(page, `${label}-story`);
  await page.emulateMedia({ colorScheme: "dark" });
  for (const path of ["/today", "/money", "/plan/scenarios"]) {
    await page.goto(base + path);
    await shoot(page, `${label}-dark${path.replaceAll("/", "-")}`);
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "NO ERRORS");
