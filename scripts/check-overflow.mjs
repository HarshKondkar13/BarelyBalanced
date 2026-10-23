// Reports pages that scroll horizontally at phone width. Usage: node scripts/check-overflow.mjs [baseUrl]
import { chromium } from "@playwright/test";
const base = process.argv[2] ?? "http://localhost:3000";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const p = await (await b.newContext({ viewport: { width: 360, height: 800 } })).newPage();
await p.goto(base);
await p.getByRole("button", { name: /Explore with sample data/ }).click();
await p.waitForURL("**/today");
let bad = 0;
for (const path of ["/today", "/today?flow=morning", "/today?flow=evening", "/money", "/money/transactions", "/money/transactions/new", "/money/budgets", "/money/bills", "/money/accounts", "/money/holdings", "/money/import", "/plan", "/plan/review", "/plan/goals", "/plan/scenarios", "/signals", "/signals/recap", "/signals/learn", "/schedule", "/schedule/focus", "/schedule/routines", "/progress", "/settings", "/settings/notifications", "/settings/integrations", "/settings/categories", "/settings/data", "/onboarding"]) {
  await p.goto(base + path);
  await p.waitForTimeout(400);
  const { sw, vw } = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: document.documentElement.clientWidth }));
  if (sw > vw) { bad++; console.log(`OVERFLOW ${path}: ${sw}px > ${vw}px`); }
}
await b.close();
console.log(bad ? `${bad} page(s) overflow` : "No horizontal overflow at 360px");
process.exit(bad ? 1 : 0);
