// Free-tool path end to end: landing with the live demo → registration → panel → own password →
// data export → delete the hotel (RODO) → the e-mail no longer logs in. Leaves nothing behind.
// Run: CHROME=… npm run e2e:signup [base-url]   (default: local stack on :8090)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:8090";
const out = "e2e/shots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [];
const watch = (page) => {
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/40[0-9]/.test(m.text()) && errors.push(m.text().slice(0, 200)));
};
const checks = {};

// landing, phone width: no horizontal scroll, demo renders
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "pl-PL", timezoneId: "Europe/Warsaw" });
watch(mobile);
await mobile.goto(`${base}/`);
await mobile.waitForSelector(".tv .day");
checks.mobileNoScroll = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
await mobile.screenshot({ path: `${out}/landing-mobile.png`, fullPage: true });
await mobile.close();

const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "pl-PL", timezoneId: "Europe/Warsaw", acceptDownloads: true });
watch(page);
await page.goto(`${base}/`);
await page.waitForSelector(".tv .day");
await page.waitForSelector(".phone .g-main h1");
await page.screenshot({ path: `${out}/landing.png` });
const before = await page.locator(".phone .guest").evaluate((el) => getComputedStyle(el).backgroundColor);
await page.locator(".demo-themes label").nth(2).click();
const after = await page.locator(".phone .guest").evaluate((el) => getComputedStyle(el).backgroundColor);
checks.themeSwitch = before !== after;
await page.screenshot({ path: `${out}/landing-theme.png` });

await page.click("a:has-text('Regulamin')");
await page.waitForSelector(".terms h2");
checks.terms = (await page.locator(".terms").textContent()).includes("Usługodawca");

const email = `e2e-${Date.now()}@example.com`;
const hotel = `Hotel E2E ${Date.now() % 100000}`;
const first = "Pierwsze-haslo-e2e-2026";
const second = "Drugie-haslo-e2e-2026!";
await page.goto(`${base}/rejestracja`);
await page.fill("input[name=hotel]", hotel);
await page.fill("input[name=email]", email.toUpperCase());
await page.fill("input[name=password]", first);
await page.fill("input[name=repeat]", first);
await page.click("button:has-text('Załóż konto')");
checks.mustAccept = await page.locator("input[name=accept]:invalid").count() === 1;
await page.check("input[name=accept]");
await page.screenshot({ path: `${out}/rejestracja.png`, fullPage: true });
await page.click("button:has-text('Załóż konto')");
await page.waitForURL("**/panel");
await page.waitForSelector(".topbar");
checks.inPanel = (await page.locator(".topbar .hotel").textContent()).includes(hotel);
checks.director = await page.locator(`.topbar .who:has-text("${email}")`).count() === 1;
await page.screenshot({ path: `${out}/panel-nowy-hotel.png` });

await page.click("nav >> text=Hotel");
const mine = page.locator(".settings-card", { hasText: "Moje hasło" });
await mine.locator("input[name=current]").fill(first);
await mine.locator("input[name=new]").fill(second);
await mine.locator("input[name=repeat]").fill(second);
await mine.locator("button:has-text('Zmień hasło')").click();
await page.waitForSelector(".toast:has-text('Hasło zmienione')");
checks.password = true;

const data = page.locator(".settings-card", { hasText: "Dane hotelu w Agendzie" });
const [download] = await Promise.all([page.waitForEvent("download"), data.locator("a:has-text('Pobierz')").click()]);
const exported = JSON.parse(await (await download.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()));
checks.export = exported.hotel.name === hotel && exported.accounts[0].username === email;

await data.locator("button:has-text('Usuń hotel')").click();
const dialog = page.locator("dialog[open]");
checks.deleteDisabled = await dialog.locator("button:has-text('Usuń hotel na zawsze')").isDisabled();
await dialog.locator("input").fill(hotel);
await page.screenshot({ path: `${out}/usun-hotel.png` });
await dialog.locator("button:has-text('Usuń hotel na zawsze')").click();
await page.waitForURL("**/?usunieto=1");
checks.goodbye = await page.locator(".site-notice").count() === 1;

await page.goto(`${base}/panel`);
await page.fill("input[name=username]", email);
await page.fill("input[name=password]", second);
await page.click("button.btn.primary");
checks.cannotLogIn = (await page.locator(".error").textContent({ timeout: 5000 })).includes("Nieprawidłowy");

console.log(JSON.stringify({ checks, errors }, null, 2));
await browser.close();
process.exit(Object.values(checks).every(Boolean) && errors.length === 0 ? 0 : 1);
