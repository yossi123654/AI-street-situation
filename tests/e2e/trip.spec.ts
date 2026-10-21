import { expect, test } from "@playwright/test";
import { snap } from "./screenshots";

// Trip planning. The "full" server routes with the (mock) TomTom Routing API,
// so travel times include traffic and slow sections are marked; the "minimal"
// server routes with (mock) OSRM, free-flow only.

// The mock geocoder knows two queries: "יפו" (one result) and "עזריאלי" (two results).
const FROM = "רחוב יפו ירושלים";
const TO = "צומת עזריאלי תל אביב";

test.describe("trip planning", () => {
  test("plan a trip: route, ETA with traffic, weather along the way, stops, parking", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "full", "runs on the full server only");
    await page.goto("/");
    await page.getByTestId("mode-trip").click();
    await expect(
      page.getByRole("heading", { name: "תכננו נסיעה כדי לראות מה מחכה בדרך" }),
    ).toBeVisible();
    await page.getByTestId("trip-from").fill(FROM);
    await page.getByTestId("trip-to").fill(TO);
    await page.getByTestId("trip-submit").click();
    // The origin resolves to one place; the destination is ambiguous and asks which one.
    await expect(page.getByTestId("trip-from-results")).toHaveCount(0);
    await page.getByTestId("trip-to-results").getByRole("button").first().click();

    await expect(page).toHaveURL(/from=31\.78330%2C35\.21860&to=32\.07430%2C34\.79180/);
    await expect(page.getByTestId("trip-label")).toContainText("רחוב יפו");
    const overview = page.getByTestId("trip-overview");
    await expect(overview).toContainText("66.1 ק״מ");
    await expect(overview).toContainText("1 שע׳ 12 דק׳"); // 4320 s with traffic
    await expect(overview).toContainText("כולל תנועה בזמן אמת");
    await expect(overview).toContainText("עיכוב של 13 דק׳");
    await expect(overview).toContainText("1 · כביש ירושלים תל אביב");
    await expect(page.getByTestId("trip-confidence")).toContainText("גבוהה");

    // Weather along the route: cooler inland, warmer at the coast, forecast after 30 min.
    const weather = page.getByTestId("trip-weather");
    const cards = weather.locator("li");
    await expect(cards.first()).toContainText("ק״מ 0");
    await expect(cards.first()).toContainText("עכשיו");
    await expect(cards.last()).toContainText("תחזית");
    const first = Number((await cards.first().innerText()).match(/(\d+)°/)![1]);
    const last = Number((await cards.last().innerText()).match(/(\d+)°/)![1]);
    expect(last).toBeGreaterThan(first);

    // Traffic sections from the router.
    const traffic = page.getByTestId("trip-traffic");
    await expect(traffic).toContainText("2 קטעים איטיים, 13 דק׳ עיכוב");
    await expect(traffic).toContainText("פקק");
    await expect(traffic).toContainText("22 קמ״ש");

    // Incidents from TomTom + WZDx near the start, filtered to the corridor.
    await expect(page.locator("#incidents")).toContainText("אירועים בדרך");

    // Stops along the corridor: private and far-away ones are hidden.
    const stops = page.getByTestId("trip-stops-list");
    await expect(stops.locator("li")).toHaveCount(4);
    await expect(stops.locator("li").first()).toContainText("פז שער הגיא");
    await expect(stops.locator("li").first()).toContainText("שירותים");
    await expect(page.getByTestId("trip-stops")).not.toContainText("Far away");
    const filters = page.getByRole("group", { name: "סינון עצירות" });
    await filters.getByRole("button", { name: "מנוחה" }).click();
    await expect(stops.locator("li")).toHaveCount(1);
    await expect(stops).toContainText("חניון לטרון");
    await filters.getByRole("button", { name: "הכל" }).click();
    await expect(page.locator(".stop-marker")).toHaveCount(4);
    await expect(page.locator(".weather-marker").first()).toBeVisible();

    // Cameras along the route, in the order they are passed; the far one behind the start is not.
    const tripCameras = page.getByTestId("trip-cameras");
    await expect(tripCameras.locator("ol > li")).toHaveCount(2);
    await expect(tripCameras).toContainText("Jaffa St / King George");
    await expect(tripCameras).toContainText("Mahane Yehuda");
    await expect(tripCameras).not.toContainText("Broken camera");
    await expect(tripCameras.getByTestId("camera-viewer")).toBeVisible();

    // Parking at the destination and the AI briefing.
    await expect(page.locator("#parking")).toContainText("חניה ביעד");
    await expect(page.getByTestId("parking-list").locator("li")).toHaveCount(5);
    await expect(page.getByTestId("trip-ai-summary")).toContainText("כולל התנועה הנוכחית");
    await expect(page.getByTestId("trip-ai-summary")).toContainText("2 קטעים איטיים");

    // Attribution for the router.
    await expect(page.getByTestId("sources")).toContainText("TomTom Routing");
    await page.evaluate(() => window.scrollTo(0, 0));
    await snap(page, "09-trip-he");
    await page.locator("#trip-weather").scrollIntoViewIfNeeded();
    await snap(page, "10-trip-he-details", { tall: 2400 });
  });

  test("trip links restore, swap works, and English layout", async ({ page }, info) => {
    test.skip(info.project.name !== "full", "runs on the full server only");
    await page.goto(
      `/?from=31.7833,35.2186&to=32.0743,34.7918&fromLabel=${encodeURIComponent("ירושלים")}&toLabel=${encodeURIComponent("תל אביב")}`,
    );
    await expect(page.getByTestId("mode-trip")).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("trip-overview")).toContainText("66.1 ק״מ");
    await page.getByRole("button", { name: "החלפה בין מוצא ליעד" }).click();
    await expect(page).toHaveURL(/from=32\.07430%2C34\.79180&to=31\.78330%2C35\.21860/);
    await expect(page.getByTestId("trip-label")).toContainText("תל אביב ← ירושלים");

    await page.getByTestId("language-select").selectOption("en");
    await expect(page.getByTestId("trip-overview")).toContainText("Includes live traffic");
    await expect(page.getByTestId("trip-weather")).toContainText("forecast");
    await snap(page, "11-trip-en");
  });

  test("leaving later: predicted traffic, forecast weather, departure in the link", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "full", "runs on the full server only");
    // Tomorrow, about this time + 2 h, rounded to the hour.
    const depart = new Date(
      Math.ceil((Date.now() + 26 * 3_600_000) / 3_600_000) * 3_600_000,
    ).toISOString();
    await page.goto(
      `/?from=31.7833,35.2186&to=32.0743,34.7918&fromLabel=${encodeURIComponent("ירושלים")}&toLabel=${encodeURIComponent("תל אביב")}&depart=${encodeURIComponent(depart)}`,
    );
    const overview = page.getByTestId("trip-overview");
    await expect(overview).toContainText("1 שע׳ 5 דק׳"); // 3900 s, predicted
    await expect(overview).toContainText("כולל תנועה צפויה לשעה הזו");
    await expect(overview).toContainText("עיכוב צפוי של כ-6 דק׳");
    await expect(page.getByTestId("trip-departure")).toContainText("יציאה");
    await expect(page.getByTestId("trip-departure")).not.toContainText("עכשיו");
    // Every weather point is a forecast for the time the driver gets there.
    const cards = page.getByTestId("trip-weather").locator("li");
    await expect(cards.first()).toContainText("תחזית");
    await expect(cards.filter({ hasText: "עכשיו" })).toHaveCount(0);
    await expect(page.getByTestId("trip-ai-summary")).toContainText(
      "לפי התנועה הצפויה בשעת היציאה",
    );
    // The picker reflects the link.
    await expect(page.getByTestId("depart-later")).toHaveAttribute("aria-pressed", "true");
    await snap(page, "12-trip-later-he");

    // Switching back to "now" re-plans with live traffic.
    await page.getByTestId("depart-now").click();
    await page.getByTestId("trip-submit").click();
    await expect(page).not.toHaveURL(/depart=/);
    await expect(page.getByTestId("trip-overview")).toContainText("כולל תנועה בזמן אמת");
  });

  test("choosing a departure time in the form", async ({ page }, info) => {
    test.skip(info.project.name !== "full", "runs on the full server only");
    await page.goto("/?from=31.7833,35.2186&to=32.0743,34.7918&fromLabel=A&toLabel=B");
    await expect(page.getByTestId("trip-overview")).toContainText("כולל תנועה בזמן אמת");
    await page.getByTestId("depart-later").click();
    await expect(page.getByTestId("depart-time")).toBeVisible();
    // Defaults to the next full hour; push it to tomorrow.
    const value = await page.getByTestId("depart-time").inputValue();
    const tomorrow = new Date(new Date(value).getTime() + 24 * 3_600_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    await page
      .getByTestId("depart-time")
      .fill(
        `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T${pad(tomorrow.getHours())}:00`,
      );
    await page.getByTestId("trip-submit").click();
    await expect(page).toHaveURL(/depart=/);
    await expect(page.getByTestId("trip-overview")).toContainText("כולל תנועה צפויה לשעה הזו");

    // A time more than a week ahead is refused before any request.
    const far = new Date(Date.now() + 9 * 86_400_000);
    await page
      .getByTestId("depart-time")
      .fill(`${far.getFullYear()}-${pad(far.getMonth() + 1)}-${pad(far.getDate())}T10:00`);
    await page.getByTestId("trip-submit").click();
    await expect(page.getByText("בחרו שעת יציאה בשבעת הימים הקרובים.")).toBeVisible();
  });

  test("trip API validates input", async ({ request }) => {
    expect((await request.get("/api/trip?from=x&to=1,2")).status()).toBe(400);
    expect((await request.get("/api/trip?from=31.78,35.21&to=31.78,35.21")).status()).toBe(400);
    expect(
      (
        await request.get(
          "/api/trip?from=31.7833,35.2186&to=32.0743,34.7918&depart=2001-01-01T00:00:00Z",
        )
      ).status(),
    ).toBe(400);
    expect(
      (await request.get("/api/trip?from=31.7833,35.2186&to=32.0743,34.7918&depart=soon")).status(),
    ).toBe(400);
    const ok = await request.get("/api/trip?from=31.7833,35.2186&to=32.0743,34.7918");
    expect(ok.status()).toBe(200);
    const body = await ok.json();
    expect(body.route.status).toBe("ok");
    expect(JSON.stringify(body)).not.toContain("test-key");
  });
});

test.describe("trip planning without keys", () => {
  test("OSRM route with free-flow times and weather, says traffic is missing", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "minimal", "runs on the minimal server only");
    await page.goto(`/?from=31.7833,35.2186&to=32.0743,34.7918&fromLabel=A&toLabel=B`);
    const overview = page.getByTestId("trip-overview");
    await expect(overview).toContainText("59 דק׳");
    await expect(overview).toContainText("הערכה לדרך פנויה");
    await expect(overview).toContainText("20 · איילון צפון");
    await expect(page.getByTestId("trip-missing")).toContainText("אין תנועה בזמן אמת");
    await expect(page.getByTestId("trip-weather").locator("li").first()).toContainText("°");
    await expect(page.locator("#trip-traffic")).toContainText("לא הוגדר ספק");
    await expect(page.getByTestId("sources")).toContainText("OSRM");
  });
});
