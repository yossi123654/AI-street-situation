import { expect, test } from "@playwright/test";
import { snap } from "./screenshots";

// Server configured with every provider, pointed at the mock upstream
// (see playwright.config.ts and tests/e2e/mock-upstream.mjs).

test.describe("with all providers configured", () => {
  test("search → full situation report in Hebrew (RTL)", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "he");
    await expect(page.getByRole("heading", { name: "האזור שלך עכשיו" })).toBeVisible();
    // Vector base map (MapLibre inside Leaflet) with its attribution.
    await expect(page.locator(".leaflet-container canvas.maplibregl-canvas")).toBeVisible();
    await expect(page.locator(".leaflet-control-attribution")).toContainText("Test vector style");
    await snap(page, "01-home");

    await page.getByTestId("search-input").fill("רחוב יפו ירושלים");
    await page.getByTestId("search-submit").click();

    await expect(page.getByTestId("place-label")).toHaveText("רחוב יפו, מרכז העיר, ירושלים, ישראל");
    await expect(page).toHaveURL(/lat=31\.78330&lon=35\.21860/);

    // Weather (Open-Meteo shape)
    await expect(page.getByTestId("weather")).toContainText("23°");
    await expect(page.getByTestId("weather")).toContainText("בהיר ברובו");
    // Traffic (TomTom flow): 17 of 38 km/h → heavy
    await expect(page.getByTestId("traffic")).toContainText("כבדה");
    await expect(page.getByTestId("traffic")).toContainText("17");
    // Incidents (TomTom incident details)
    await expect(page.getByTestId("incidents")).toContainText("עבודות בכביש");
    await expect(page.getByTestId("incidents")).toContainText("עבודות תשתית, נתיב אחד סגור");
    // Open-data road works (WZDx) are merged with TomTom incidents.
    await expect(page.getByTestId("incidents")).toContainText("Light rail track maintenance");
    // Confidence: weather + traffic + incidents all live
    await expect(page.getByTestId("confidence")).toContainText("גבוהה");

    // Cameras: nearest embeddable camera shown first with its image.
    const list = page.getByTestId("camera-list");
    await expect(list.getByRole("button")).toHaveCount(3);
    const image = page.getByTestId("camera-viewer").locator("img");
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);

    // AI summary (Ollama) mentions the camera observation.
    await expect(page.getByTestId("ai-summary")).toContainText("ברחוב יפו התנועה כבדה");
    await expect(page.getByTestId("ai-summary")).toContainText(
      "Jaffa St / King George (test fixture)",
    );

    // Sources and attribution
    await expect(page.getByTestId("sources")).toContainText("Open-Meteo");
    await expect(page.getByTestId("sources")).toContainText("TomTom");
    await expect(page.getByTestId("sources")).toContainText("Example Road Authority (WZDx)");
    await expect(page.getByTestId("geocoder-credit")).toContainText("© OpenStreetMap contributors");
    await expect(page.locator(".leaflet-control-attribution")).toContainText("OpenStreetMap");
    await snap(page, "02-report-he");
    await snap(page, "03-report-he-full", { tall: 2600 });
  });

  test("parking search: list, filters, map markers and navigation links", async ({ page }) => {
    await page.goto("/?lat=31.7833&lon=35.2186");
    const list = page.getByTestId("parking-list");
    await expect(list.locator("li")).toHaveCount(5);
    await expect(list.locator("li").first()).toContainText("חניון כלל");
    await expect(list.locator("li").first()).toContainText("350 מקומות");
    await expect(list.locator("li").first()).toContainText("תת-קרקעי");
    await expect(page.getByTestId("parking")).not.toContainText("Private");
    await expect(page.getByTestId("parking")).toContainText("אין נתוני תפוסה בזמן אמת");
    await expect(list.locator("li").first().getByRole("link", { name: "Waze" })).toHaveAttribute(
      "href",
      /^https:\/\/waze\.com\/ul\?ll=31\.78\d+,35\.21\d+&navigate=yes$/,
    );
    await expect(page.locator(".parking-marker")).toHaveCount(5);

    await page.getByRole("button", { name: "רק חינם" }).click();
    await expect(list.locator("li")).toHaveCount(2);
    await expect(list).toContainText("חניון הדווידקה");
    await page.getByRole("button", { name: "רק ציבוריים" }).click();
    await expect(list).not.toContainText("ללקוחות בלבד");

    // Selecting a marker on the map highlights the facility in the list.
    await page.getByRole("button", { name: "הכל" }).click();
    await page.locator(".parking-marker[title='חניון ממילא']").click();
    await expect(
      list.locator("[data-parking-id='osm:way/103'] button[aria-pressed='true']"),
    ).toBeVisible();
    await expect(page.locator("#summary")).toContainText("חניה: 5 חניונים");
    await expect(page.getByTestId("ai-summary")).toContainText("יש 5 חניונים בטווח 800");
    await page.locator("#parking").scrollIntoViewIfNeeded();
    await snap(page, "08-parking");
  });

  test("camera permissions: link-only camera is never embedded", async ({ page }) => {
    await page.goto("/?lat=31.7833&lon=35.2186&label=Jaffa");
    await page
      .getByTestId("camera-list")
      .getByRole("button", { name: /Mahane Yehuda/ })
      .click();
    const viewer = page.getByTestId("camera-viewer");
    await expect(viewer.locator("img")).toHaveCount(0);
    await expect(viewer.getByRole("link", { name: "פתיחה באתר המקור" }).first()).toHaveAttribute(
      "href",
      "http://127.0.0.1:4010/pages/mahane-yehuda",
    );
    await expect(page.getByTestId("analyze-camera")).toHaveCount(0);
  });

  test("camera image endpoint refuses link-only cameras and unknown ids", async ({ request }) => {
    expect((await request.get("/api/cameras/il-test-mahane-yehuda/image")).status()).toBe(403);
    expect((await request.get("/api/cameras/il-test-nope/image")).status()).toBe(404);
    expect((await request.get("/api/cameras/..%2F..%2Fetc/image")).status()).toBe(400);
    const ok = await request.get("/api/cameras/il-test-jaffa-center/image");
    expect(ok.status()).toBe(200);
    expect(ok.headers()["content-type"]).toBe("image/jpeg");
    expect(ok.headers()["x-image-time"]).toBeTruthy();
  });

  test("broken camera shows an error instead of a broken image", async ({ page }) => {
    await page.goto("/?lat=31.7833&lon=35.2186");
    await page
      .getByTestId("camera-list")
      .getByRole("button", { name: /Broken camera/ })
      .click();
    await expect(page.getByTestId("camera-viewer")).toContainText("תמונת המצלמה אינה זמינה כרגע");
  });

  test("AI analysis of a permitted camera", async ({ page }) => {
    await page.goto("/?lat=31.7833&lon=35.2186");
    await page.getByTestId("analyze-camera").click();
    const analysis = page.getByTestId("camera-analysis");
    await expect(analysis).toContainText("תנועה בינונית");
    await expect(analysis).toContainText("ראות: טובה");
    await expect(analysis).toContainText("רמת אי-ודאות: נמוכה");
    await snap(page, "04-camera-analysis");
  });

  test("multiple matches let the user choose, and English switches to LTR", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("language-select").selectOption("en");
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.getByRole("heading", { name: "Street Situation" })).toBeVisible();

    await page.getByTestId("search-input").fill("Azrieli");
    await page.getByTestId("search-submit").click();
    const results = page.getByTestId("search-results");
    await expect(results.getByRole("button")).toHaveCount(2);
    await results.getByRole("button", { name: /Azrieli Junction/ }).click();
    await expect(page.getByTestId("place-label")).toHaveText(
      "Azrieli Junction, Tel Aviv-Yafo, Israel",
    );
    await expect(page.getByTestId("weather")).toContainText("Mainly clear");
    // No cameras near Tel Aviv in the fixtures.
    await expect(page.locator("#cameras")).toContainText("No verified public cameras within 3 km");
    await expect(page.getByTestId("missing")).toContainText("No permitted cameras nearby");
    await snap(page, "05-report-en");
  });

  test("clicking the map selects a location", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("map").click({ position: { x: 200, y: 300 } });
    await expect(page).toHaveURL(/lat=/);
    await expect(page.getByTestId("place-label")).toContainText("רחוב יפו");
  });

  test("no results and validation messages", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("search-input").fill("zzzz-nowhere");
    await page.getByTestId("search-submit").click();
    await expect(page.getByText("לא נמצאו מקומות עבור „zzzz-nowhere”")).toBeVisible();
    await page.getByTestId("search-input").fill("a");
    await page.getByTestId("search-submit").click();
    await expect(page.getByText("הקלידו לפחות 2 תווים.")).toBeVisible();
  });

  test("mobile layout", async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    await page.goto(`/?lat=31.7833&lon=35.2186&label=${encodeURIComponent("רחוב יפו, ירושלים")}`);
    await expect(page.getByTestId("ai-summary")).toContainText("רחוב יפו");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    await snap(page, "06-mobile", { fullPage: true });
    await context.close();
  });

  test("API validates input", async ({ request }) => {
    expect((await request.get("/api/geocode?q=a")).status()).toBe(400);
    expect((await request.get("/api/situation?lat=200&lon=0")).status()).toBe(400);
    expect((await request.get("/api/situation")).status()).toBe(400);
    const providers = await (await request.get("/api/providers")).json();
    expect(JSON.stringify(providers)).not.toContain("test-key");
  });

  test("YouTube live cameras play in YouTube's privacy-enhanced player", async ({ page }) => {
    await page.route(/youtube-nocookie\.com/, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<html></html>" }),
    );
    await page.goto("/?lat=32.8191&lon=34.9983");
    const frame = page.getByTestId("camera-youtube");
    await expect(frame).toBeVisible();
    await expect(frame).toHaveAttribute(
      "src",
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/abcDEF12345\?autoplay=1&mute=1/,
    );
    // Video streams are never sent to the AI.
    await expect(page.getByTestId("analyze-camera")).toHaveCount(0);
    expect((await page.request.get("/api/cameras/il-test-haifa-youtube/image")).status()).toBe(403);
  });

  test("published photos of the place, proxied with credits", async ({ page }) => {
    await page.goto("/?lat=31.7833&lon=35.2186");
    const photos = page.getByTestId("photos");
    await expect(photos.getByTestId("photo-list").locator("li")).toHaveCount(4);
    // Nearest first: the Commons photo (~38 m), then street-level imagery.
    await expect(photos.getByTestId("photo-credit")).toContainText("Test Photographer");
    await expect(photos.getByTestId("photo-credit")).toContainText("CC BY 4.0");
    const large = photos.getByTestId("photo-large");
    await expect(large).toHaveAttribute("src", /^\/api\/photos\/commons-4242\/image\?size=large$/);
    await expect
      .poll(() => large.evaluate((img: HTMLImageElement) => img.naturalWidth))
      .toBeGreaterThan(0);
    await photos.getByTestId("photo-list").locator("li").nth(1).getByRole("button").click();
    await expect(photos.getByTestId("photo-credit")).toContainText("mapper1");
    await expect(photos).toContainText("Panoramax");
    // The browser never sees the upstream image URLs, and unknown ids are refused.
    const api = await page.request.get("/api/photos?lat=31.7833&lon=35.2186");
    expect(await api.text()).not.toContain("thumb.jpg");
    expect((await page.request.get("/api/photos/panoramax-nope/image")).status()).toBe(404);
    expect((await page.request.get("/api/photos/..%2Fetc/image")).status()).toBe(400);
  });

  test.describe("home page", () => {
    test.use({ timezoneId: "Asia/Jerusalem" });

    test("without location: approximate area from the time zone, weather and today", async ({
      page,
    }) => {
      await page.goto("/");
      await expect(page.getByTestId("home-area")).toContainText("תל אביב, ישראל");
      await expect(page.getByTestId("home-area")).toContainText("משוער, לפי אזור הזמן שלך");
      await expect(page.getByTestId("home-temp")).toHaveText("23°");
      const today = page.getByTestId("home-today");
      await expect(today).toContainText("28° / 16°");
      await expect(today).toContainText("10%");
      await expect(today).toContainText("17:59");
      // The test cameras are in Jerusalem, more than 50 km from Tel Aviv.
      await expect(page.getByTestId("home-camera-count")).toHaveText("0");
      await expect(page.getByTestId("home-cameras")).toContainText("עזרו להוסיף");
      await expect(page.getByTestId("home-locate")).toBeVisible();
      await page.getByTestId("home-plan-trip").click();
      await expect(page.getByTestId("trip-from")).toBeVisible();
    });
  });

  test.describe("home page with location", () => {
    test.use({
      timezoneId: "Asia/Jerusalem",
      permissions: ["geolocation"],
      geolocation: { latitude: 31.7833, longitude: 35.2186 },
    });

    test("uses the shared location (rounded) and shows cameras and photos nearby", async ({
      page,
    }) => {
      const areaRequests: string[] = [];
      page.on("request", (request) => {
        if (request.url().includes("/api/area")) areaRequests.push(request.url());
      });
      await page.goto("/");
      await expect(page.getByTestId("home-area")).toContainText("לפי המיקום שלך");
      await expect(page.getByTestId("home-area")).toContainText("רחוב יפו");
      await expect(page.getByTestId("home-camera-count")).toHaveText("3");
      await expect(page.getByTestId("home-cameras")).toContainText("2 מציגות כאן תמונה חיה");
      await expect(page.getByTestId("home-camera-preview").locator("img")).toHaveAttribute(
        "src",
        "/api/cameras/il-test-jaffa-center/image",
      );
      await expect(page.getByTestId("home-photos").locator("img")).toHaveCount(4);
      await expect(page.getByTestId("home-locate")).toHaveCount(0);
      // The browser never sends more than ~1 km precision to the server.
      expect(areaRequests.some((url) => url.includes("lat=31.78&lon=35.22"))).toBe(true);
      await snap(page, "13-home-he");

      await page.getByTestId("home-open").click();
      await expect(page.getByTestId("weather")).toContainText("23°");
    });
  });
});
