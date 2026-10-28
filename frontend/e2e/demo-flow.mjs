// „Wypróbuj demo” end to end: landing button → own sandbox hotel in the panel → the demo bar opens the lobby
// screen, a guest phone and the staff view, each showing the sandbox's published agenda. Sandboxes expire on their own.
// Run: CHROME=… npm run e2e:demo [base-url]   (default: local stack on :8090; needs DEMO_MAX > 0)
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const base = process.argv[2] ?? "http://localhost:8090";
const out = "e2e/shots";
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, locale: "pl-PL", timezoneId: "Europe/Warsaw" });
const errors = [];
context.on("page", (p) => p.on("pageerror", (e) => errors.push(String(e))));
const checks = {};

const page = await context.newPage();
page.on("pageerror", (e) => errors.push(String(e)));
await page.goto(`${base}/`);
await page.getByRole("button", { name: "Wypróbuj demo — bez rejestracji" }).first().click();
await page.waitForURL("**/panel");
await page.getByText("twój własny hotel przykładowy").waitFor();
checks.panelShowsGroups = await page.getByText("Szkolenie wolontariuszy").first().isVisible();
await page.screenshot({ path: `${out}/demo-panel.png` });

const open = async (name) => {
  const [tab] = await Promise.all([context.waitForEvent("page"), page.getByRole("link", { name }).first().click()]);
  await tab.waitForLoadState("networkidle");
  return tab;
};
const screen = await open(/Ekran w holu/);
checks.screen = await screen.getByText(/Szkolenie wolontariuszy|Weekend z muzyką/).first().isVisible();
await screen.screenshot({ path: `${out}/demo-ekran.png` });
const guest = await open(/Telefon gościa: Szkolenie wolontariuszy/);
checks.guestAnnouncement = await guest.getByText("Warsztat grupy B przeniesiony do Sali Grabowej.").first().isVisible();
const staff = await open(/Obsługa/);
checks.staff = await staff.getByText(/Teraz w hotelu|Dziś/).first().isVisible();
checks.noJsErrors = errors.length === 0;

console.log(JSON.stringify({ checks, errors }, null, 1));
await browser.close();
process.exit(Object.values(checks).every(Boolean) ? 0 : 1);
