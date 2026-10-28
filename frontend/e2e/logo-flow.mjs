// Upload end-to-end: hotel logo and hotel slides (live on the TV API), organizer logo (after publish), served by Caddy.
// Run: CHROME=… npm run e2e:logo -- <screen-token>   (uses ADMIN_PASSWORD of user konrad from ../.env)
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
const [screenToken, out = "e2e/shots"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const env = readFileSync(new URL("../../.env", import.meta.url), "utf8");
const password = env.match(/^ADMIN_PASSWORD=(.*)$/m)[1];
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "pl-PL" });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto("http://localhost:8090/panel");
await page.fill("input[name=username]", "konrad");
await page.fill("input[name=password]", password);
await page.click("button.btn.primary");
await page.click("text=Ekran i obsługa");
const input = page.locator(".logo-field input[type=file]");
await input.setInputFiles("e2e/fixtures/za-duzy.png");
await page.waitForSelector(".logo-field .error");
const tooBig = await page.locator(".logo-field .error").textContent();
await input.setInputFiles("e2e/fixtures/logo-test.png");
await page.waitForSelector(".toast:has-text('Logo hotelu zapisane')");
await page.waitForSelector(".toast", { state: "detached", timeout: 8000 });
await page.screenshot({ path: `${out}/logo-hotel.png` });
const screenApi = async () => (await page.request.get(`http://localhost:8090/api/ekran/${screenToken}/`)).json();
const screen = await screenApi();
const served = await page.request.get(`http://localhost:8090${screen.hotel.logo}`);
// hotel slides: 16:9 (no warning), square (crop warning), reorder, delete
const add = async (file, alt) => {
  await page.locator(".slide-add input[type=file]").setInputFiles(file);
  await page.locator(".slide-add input[name=alt]").fill(alt);
  await page.click(".slide-add button.btn.primary");
  const text = await (await page.waitForSelector(".toast:has-text('Slajd dodany')")).textContent();
  await page.waitForSelector(".toast", { state: "detached", timeout: 8000 });
  return text;
};
const toast169 = await add("e2e/fixtures/slajd-169.jpg", "E2E szeroki");
const toastSquare = await add("e2e/fixtures/slajd-kwadrat.png", "E2E kwadrat");
await page.waitForSelector("text=E2E kwadrat");
const altsBefore = (await screenApi()).hotel_slides.map((s) => s.alt);
await page.click(`button[aria-label="Przesuń „E2E kwadrat” wcześniej"]`);
await page.waitForTimeout(500);
const altsAfter = (await screenApi()).hotel_slides.map((s) => s.alt);
const slideFile = (await screenApi()).hotel_slides.find((s) => s.alt === "E2E szeroki").image;
const slideServed = (await page.request.get(`http://localhost:8090${slideFile}`)).status();
await page.screenshot({ path: `${out}/slajdy-panel.png`, fullPage: true });
await page.locator(".slide-list li", { hasText: "E2E kwadrat" }).locator("button:has-text('Usuń')").click();
await page.locator(".slide-list li", { hasText: "E2E kwadrat" }).locator("button:has-text('Na pewno usunąć?')").click();
await page.waitForSelector("text=E2E kwadrat", { state: "detached" });
const altsFinal = (await screenApi()).hotel_slides.map((s) => s.alt);
await page.click("text=Grupy");
await page.click("text=Szkolenie wolontariuszy");
await page.click("button:has-text('Dane grupy')");
await page.locator("dialog[open] .logo-field input[type=file]").setInputFiles("e2e/fixtures/logo-test.png");
await page.waitForSelector("text=Logo organizatora zapisane");
await page.waitForSelector(".publish-bar.dirty", { timeout: 5000 }).catch(() => {});
await page.screenshot({ path: `${out}/logo-organizator.png` });
const dirty = await page.locator(".publish-bar.dirty").count();
const organizerLogo = await page.locator("dialog[open] .logo-band img").getAttribute("src");
const slidesOk = !toast169.includes("proporcje") && toastSquare.includes("proporcje")
  && altsAfter.indexOf("E2E kwadrat") < altsAfter.indexOf("E2E szeroki") && altsBefore.indexOf("E2E kwadrat") > altsBefore.indexOf("E2E szeroki")
  && !altsFinal.includes("E2E kwadrat") && slideServed === 200;
const logoOk = screen.hotel.logo?.startsWith("/media/logos/") && served.headers()["content-type"] === "image/png";
const result = { logoOk, tooBig, hotelLogo: screen.hotel.logo, served: [served.status(), served.headers()["content-type"]], organizerLogo, publishBarDirty: dirty === 1,
  slides: { toast169, toastSquare, altsBefore, altsAfter, altsFinal, slideServed, ok: slidesOk }, errors };
console.log(JSON.stringify(result));
if (!result.tooBig?.includes("2 MB") || served.status() !== 200 || !organizerLogo?.startsWith("/media/logos/") || !logoOk || !result.publishBarDirty || !slidesOk || errors.length) {
  console.error("logo e2e: FAILED");
  process.exitCode = 1;
}
await browser.close();
