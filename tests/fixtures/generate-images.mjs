// Generates the synthetic fixture images used by the e2e mock upstream.
// Run: node tests/fixtures/generate-images.mjs  (requires Playwright's Chromium)
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";

const out = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

const camera = `<!doctype html><html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9cc9ea"/><stop offset="1" stop-color="#e3eef6"/></linearGradient>
    <linearGradient id="road" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#6b7280"/><stop offset="1" stop-color="#374151"/></linearGradient>
  </defs>
  <rect width="960" height="540" fill="url(#sky)"/>
  <g fill="#d6c7a1" stroke="#b8a77f">
    <rect x="0" y="120" width="170" height="200"/><rect x="180" y="160" width="120" height="160"/>
    <rect x="660" y="140" width="140" height="180"/><rect x="810" y="100" width="150" height="220"/>
  </g>
  <g fill="#8fb3c9">
    ${Array.from({ length: 12 }, (_, i) => `<rect x="${20 + (i % 4) * 38}" y="${140 + Math.floor(i / 4) * 55}" width="22" height="32"/>`).join("")}
    ${Array.from({ length: 12 }, (_, i) => `<rect x="${830 + (i % 4) * 34}" y="${120 + Math.floor(i / 4) * 60}" width="20" height="34"/>`).join("")}
  </g>
  <polygon points="300,320 660,320 960,540 0,540" fill="url(#road)"/>
  <g stroke="#f3f4f6" stroke-width="6" stroke-dasharray="40 40"><line x1="480" y1="325" x2="480" y2="540"/></g>
  <g>
    <rect x="390" y="380" width="70" height="40" rx="8" fill="#dc2626"/><rect x="520" y="350" width="56" height="32" rx="7" fill="#f8fafc"/>
    <rect x="300" y="440" width="96" height="54" rx="10" fill="#1d4ed8"/><rect x="560" y="420" width="90" height="50" rx="10" fill="#facc15"/>
    <rect x="430" y="335" width="44" height="26" rx="6" fill="#16a34a"/>
  </g>
  <rect x="12" y="12" width="330" height="34" rx="4" fill="rgba(0,0,0,.55)"/>
  <text x="24" y="36" font-family="monospace" font-size="18" fill="#fff">TEST FIXTURE · synthetic image</text>
</svg></body></html>`;

const tile = `<!doctype html><html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
  <rect width="256" height="256" fill="#eef0eb"/>
  <rect x="20" y="20" width="96" height="96" fill="#e2e5dd"/><rect x="140" y="140" width="96" height="96" fill="#dfe8d6"/>
  <g stroke="#ffffff" stroke-width="12"><line x1="0" y1="128" x2="256" y2="128"/><line x1="128" y1="0" x2="128" y2="256"/></g>
  <g stroke="#ffffff" stroke-width="5"><line x1="0" y1="0" x2="0" y2="256"/><line x1="0" y1="0" x2="256" y2="0"/></g>
  <g stroke="#f6d38b" stroke-width="4"><line x1="0" y1="128" x2="256" y2="128"/></g>
</svg></body></html>`;

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined,
});
const page = await browser.newPage();
await page.setViewportSize({ width: 960, height: 540 });
await page.setContent(camera);
await page.screenshot({ path: out("camera.jpg"), type: "jpeg", quality: 80 });
await page.setViewportSize({ width: 256, height: 256 });
await page.setContent(tile);
await page.screenshot({ path: out("tile.png") });
await browser.close();
console.log("fixtures written");
