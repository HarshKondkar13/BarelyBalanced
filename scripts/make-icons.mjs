// Renders the logo mark into PWA icon PNGs. Usage: node scripts/make-icons.mjs
import { chromium } from "@playwright/test";
const svg = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><defs><filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="32" height="32" rx="${pad ? 0 : 7}" fill="#07080f"/><g transform="${pad ? "translate(4.8 4.8) scale(0.7)" : ""}" filter="url(#g)"><circle cx="16" cy="17" r="8.5" fill="none" stroke="#22d3ee" stroke-width="2.4"/><path d="M10.5 18.5 L14.5 14.5 L17.5 17 L22.5 11.5" fill="none" stroke="#ff4fd8" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
for (const [file, size, pad] of [["icon-192.png", 192, false], ["icon-512.png", 512, false], ["icon-maskable-512.png", 512, true], ["apple-touch-icon.png", 180, true]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent">${svg(pad).replace("<svg ", `<svg width="${size}" height="${size}" `)}</body></html>`);
  await page.screenshot({ path: `public/${file}`, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
await browser.close();
