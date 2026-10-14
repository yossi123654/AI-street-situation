import type { Page } from "@playwright/test";

/**
 * Saves README screenshots when SCREENSHOTS=1 (npm run screenshots).
 * `tall` temporarily enlarges the viewport instead of a full-page capture,
 * which would misplace the sticky map.
 */
export async function snap(
  page: Page,
  name: string,
  options: { tall?: number; fullPage?: boolean } = {},
) {
  if (process.env.SCREENSHOTS !== "1") return;
  // Let map fly-to animations and tile fades finish.
  await page.waitForTimeout(1200);
  const original = page.viewportSize();
  if (options.tall && original) {
    await page.setViewportSize({ width: original.width, height: options.tall });
    await page.waitForTimeout(400);
  }
  await page.screenshot({
    path: `docs/screenshots/${name}.png`,
    fullPage: options.fullPage ?? false,
  });
  if (options.tall && original) await page.setViewportSize(original);
}
