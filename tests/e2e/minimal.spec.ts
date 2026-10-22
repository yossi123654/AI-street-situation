import { expect, test } from "@playwright/test";
import { snap } from "./screenshots";

// Server with the out-of-the-box configuration: no API keys at all.

test("works without any API key and says clearly what is missing", async ({ page }) => {
  await page.goto("/");
  // SITE_NOTICE=demo shows the translated demo banner.
  await expect(page.getByTestId("site-notice")).toContainText("הדגמה ציבורית");
  await page.getByTestId("search-input").fill("רחוב יפו ירושלים");
  await page.getByTestId("search-submit").click();

  await expect(page.getByTestId("weather")).toContainText("23°");
  // Raster map mode and keyless parking search.
  await expect(page.locator(".leaflet-tile-loaded").first()).toBeVisible();
  await expect(page.getByTestId("parking-list").locator("li")).toHaveCount(5);
  await expect(page.locator("#traffic")).toContainText("אין נתונים ממקור זה: לא הוגדר ספק.");
  await expect(page.locator("#incidents")).toContainText("אין נתונים ממקור זה: לא הוגדר ספק.");
  await expect(page.locator("#cameras")).toContainText("אין מצלמות ציבוריות מאומתות");
  await expect(page.getByTestId("ai-summary")).toContainText("סיכום ה-AI כבוי");
  await expect(page.getByTestId("confidence")).toContainText("נמוכה");
  await expect(page.getByTestId("missing")).toContainText("אין נתוני זרימת תנועה");

  await page.locator("#sources summary").click();
  await expect(page.getByTestId("providers")).toContainText("TOMTOM_API_KEY");
  await page.evaluate(() => window.scrollTo(0, 0));
  await snap(page, "07-no-keys", { tall: 2150 });
});

test("summary endpoint reports that AI is not configured", async ({ request }) => {
  const response = await request.get("/api/summary?lat=31.78&lon=35.21");
  expect(response.status()).toBe(503);
  expect((await response.json()).error.code).toBe("not_configured");
});
