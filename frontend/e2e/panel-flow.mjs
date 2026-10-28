// Panel end-to-end: log in → add a point with a karta zlecenia → publish → the lobby screen API
// shows it and does NOT carry the karta's menu. Needs the Docker stack + `seed_demo` + DEMO_PASSWORD.
// Run: CHROME=/path/to/chrome npm run e2e -- <screen-token> [screenshot-dir]
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
const [screenToken, out = "e2e/shots"] = process.argv.slice(2);
const exe = process.env.CHROME;
mkdirSync(out, { recursive: true });
const password = readFileSync(new URL("../../.env", import.meta.url), "utf8").match(/^DEMO_PASSWORD=(.*)$/m)[1];
const browser = await chromium.launch({ executablePath: exe });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, locale: "pl-PL", timezoneId: "Europe/Warsaw" });
const errors = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text().slice(0, 200)));
page.on("pageerror", (e) => errors.push(String(e)));
const shot = (name) => page.screenshot({ path: `${out}/${name}.png` });
await page.goto("http://localhost:8090/panel");
await page.fill("input[name=username]", "dyrektor-demo");
await page.fill("input[name=password]", password);
await page.click("button.btn.primary");
await page.click("text=Szkolenie wolontariuszy");
await page.waitForSelector(".agenda");
// new point with a room and a karta zlecenia
await page.click("button:has-text('Dodaj punkt')");
const d = page.locator("dialog.drawer");
await d.locator("select").first().selectOption("impreza");
await d.getByLabel("Nazwa", { exact: true }).fill("Wieczór przy ognisku");
await d.getByLabel("Od", { exact: true }).fill("20:00");
await d.getByLabel("Do", { exact: true }).fill("23:30");
await d.getByLabel("Uwaga dla gości", { exact: true }).fill("Strój dowolny");
await d.locator("button:has-text('Dodaj salę i kartę zlecenia')").click();
await d.getByLabel("Sala", { exact: true }).selectOption({ label: "Restauracja Pod Lipami" });
await d.getByLabel("Liczba osób", { exact: true }).fill("48");
await d.getByLabel("Menu", { exact: true }).fill("TAJNE-MENU-KOLACJI");
await d.getByLabel("Odpowiedzialny", { exact: true }).fill("Kierownik sali");
await shot("9-nowy-punkt");
await d.locator("button:has-text('Zapisz punkt')").click();
await page.waitForSelector("text=Wieczór przy ognisku");
await page.waitForSelector(".publish-bar.dirty");
await page.waitForTimeout(300);
await shot("10-po-zapisie");
await page.click(".publish-bar button:has-text('Opublikuj')");
await page.waitForSelector(".publish-bar:not(.dirty)");
await page.waitForTimeout(300);
await shot("11-opublikowano");
const screen = await (await page.request.get(`http://localhost:8090/api/ekran/${screenToken}/`)).json();
const points = screen.groups.flatMap((g) => g.points);
const party = points.find((p) => p.title === "Wieczór przy ognisku");
const leak = JSON.stringify(screen).includes("TAJNE-MENU-KOLACJI");
console.log(JSON.stringify({ party, leak, errors }));
if (!party || !party.changed || leak || errors.length) {
  console.error("panel e2e: FAILED");
  process.exitCode = 1;
}
await page.setViewportSize({ width: 390, height: 844 });
await page.click("text=Wszystkie grupy");
await page.waitForSelector(".group-row");
await shot("12-mobile-pulpit");
await browser.close();
