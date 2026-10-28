// Mandatory tracking check after a deploy (as in fc.sudomie.pl docs/WDROZENIA.md): GA4 only on public
// pages, Consent Mode denied until "Akceptuję", cookies only after consent, gone after "Odrzucam".
// Run: CHROME=… node e2e/tracking-check.mjs [base-url] [G-ID]
import { chromium } from "playwright-core";
const base = process.argv[2] ?? "https://agenda.sudomie.pl";
const id = process.argv[3] ?? "G-9X4R75M9Q1";
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const context = await browser.newContext({ locale: "pl-PL" });
const page = await context.newPage();
const hits = [];
const errors = [];
page.on("request", (r) => /google-analytics\.com\/g\/collect|googletagmanager\.com\/gtag/.test(r.url()) && hits.push(r.url()));
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
const ga = async () => (await context.cookies()).filter((c) => c.name.startsWith("_ga")).map((c) => c.name);
const gcs = () => hits.filter((u) => u.includes("/g/collect")).map((u) => new URL(u).searchParams.get("gcs"));
const checks = {};

await page.goto(`${base}/`);
await page.waitForSelector(".cc-bar");
await page.waitForTimeout(4000);
checks.tagLoaded = hits.some((u) => u.includes(`gtag/js?id=${id}`));
checks.noCookiesBeforeConsent = (await ga()).length === 0;
checks.deniedPings = gcs().length > 0 && gcs().every((v) => v === "G100");

await page.click(".cc-bar >> text=Akceptuję");
await page.waitForTimeout(1000);
await page.goto(`${base}/regulamin`);
await page.waitForTimeout(4000);
checks.cookiesAfterConsent = (await ga()).length > 0;
checks.grantedPings = gcs().includes("G101"); // gcs = G1<ad_storage><analytics_storage>: ads stay denied, analytics granted
checks.bannerGone = (await page.locator(".cc-bar").count()) === 0;

await page.click("text=Ustawienia cookies");
await page.click(".cc-bar >> text=Odrzucam");
await page.waitForTimeout(500);
checks.cookiesRemovedOnDecline = (await ga()).length === 0;

const before = hits.length;
await page.goto(`${base}/panel`);
await page.waitForTimeout(3000);
checks.noTagInPanel = hits.slice(before).length === 0;

console.log(JSON.stringify({ checks, gcs: [...new Set(gcs())], errors }, null, 2));
await browser.close();
process.exit(Object.values(checks).every(Boolean) && errors.length === 0 ? 0 : 1);
