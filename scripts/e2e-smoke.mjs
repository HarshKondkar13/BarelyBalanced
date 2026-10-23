// Drives the main journey in a real browser and saves screenshots.
// Usage: node scripts/e2e-smoke.mjs [baseUrl] [outDir]
import { chromium } from "@playwright/test";

const base = process.argv[2] ?? "http://localhost:3000";
const out = process.argv[3] ?? "screenshots";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
async function shoot(page, name) {
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
  for (const path of ["/money", "/money/transactions", "/money/budgets", "/money/bills", "/money/accounts", "/money/holdings", "/schedule", "/schedule/routines", "/schedule/focus", "/onboarding", "/money/transactions/new"]) {
    const res = await page.goto(base + path);
    if (!res || res.status() >= 400) errors.push(`${label} ${path} -> ${res?.status()}`);
    await shoot(page, `${label}${path.replaceAll("/", "-")}`);
  }
  await ctx.close();
}
await browser.close();
console.log(errors.length ? errors.join("\n") : "NO ERRORS");
