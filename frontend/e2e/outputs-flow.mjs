// Outputs end-to-end: guest phone (/g/), staff view (/o/) and the three printable PDFs.
// Run: CHROME=/path/to/chrome npm run e2e:outputs -- <guest-token> <staff-token> [dir]
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
const [guestToken, staffToken, out = "e2e/shots"] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const errors = [];
const watch = (page) => {
  page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
  page.on("pageerror", (e) => errors.push(String(e)));
};
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: "pl-PL", timezoneId: "Europe/Warsaw", deviceScaleFactor: 2 });
watch(phone);
await phone.goto(`http://localhost:8090/g/${guestToken}`);
await phone.waitForSelector(".g-list li");
await phone.screenshot({ path: `${out}/g-telefon.png` });
await phone.screenshot({ path: `${out}/g-telefon-cala.png`, fullPage: true });
const desk = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "pl-PL", timezoneId: "Europe/Warsaw" });
watch(desk);
await desk.goto(`http://localhost:8090/o/${staffToken}`);
await desk.waitForSelector(".staff-points");
await desk.screenshot({ path: `${out}/o-obsluga.png` });
const pointId = await desk.locator(".staff-points a.btn").first().getAttribute("href");
const today = await desk.evaluate(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Warsaw" }).format(new Date()));
const pdfs = {
  "pdf-gosc.pdf": `/api/g/${guestToken}/agenda.pdf`,
  "pdf-odprawa.pdf": `/api/o/${staffToken}/odprawa/${today}.pdf`,
  "pdf-karta.pdf": pointId,
};
const result = {};
for (const [file, url] of Object.entries(pdfs)) {
  const response = await desk.request.get(`http://localhost:8090${url}`);
  const body = await response.body();
  writeFileSync(`${out}/${file}`, body);
  result[file] = { status: response.status(), type: response.headers()["content-type"], pdf: body.subarray(0, 4).toString() === "%PDF" };
}
console.log(JSON.stringify({ result, errors }));
if (errors.length || Object.values(result).some((r) => r.status !== 200 || !r.pdf)) process.exitCode = 1;
await browser.close();
