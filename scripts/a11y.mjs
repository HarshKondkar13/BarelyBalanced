// Automated accessibility scan (axe-core, WCAG 2.1 A/AA rules) of the main pages in light and dark mode.
// Usage: node scripts/a11y.mjs [baseUrl]
import { chromium } from "@playwright/test";
import { AxeBuilder } from "@axe-core/playwright";
const base = process.argv[2] ?? "http://localhost:3000";
const b = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 } });
const p = await ctx.newPage();
await p.goto(base);
await p.getByRole("button", { name: /Explore with sample data/ }).click();
await p.waitForURL("**/today");
let total = 0;
for (const scheme of ["light", "dark"]) {
  await p.emulateMedia({ colorScheme: scheme });
  for (const path of ["/today", "/money", "/money/transactions/new", "/money/budgets", "/plan", "/plan/review", "/plan/scenarios", "/signals", "/schedule", "/progress", "/settings", "/onboarding"]) {
    await p.goto(base + path);
    await p.waitForTimeout(400);
    const r = await new AxeBuilder({ page: p }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    for (const v of r.violations) {
      total++;
      console.log(`[${scheme}] ${path} ${v.id} (${v.impact}): ${v.help} → ${v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | ")}`);
    }
  }
}
await b.close();
console.log(total ? `${total} violation group(s)` : "No axe violations");
