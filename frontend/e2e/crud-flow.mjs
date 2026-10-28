// CLAUDE.md CRUD rule, end-to-end in the panel: room, typical point, staff account, group —
// each added, changed and deleted by clicking. Cleans up after itself.
// Run: CHROME=… npm run e2e:crud   (user konrad, ADMIN_PASSWORD from ../.env; local stack)
import { chromium } from "playwright-core";
import { mkdirSync, readFileSync } from "node:fs";
const out = process.argv[2] ?? "e2e/shots";
mkdirSync(out, { recursive: true });
const password = readFileSync(new URL("../../.env", import.meta.url), "utf8").match(/^ADMIN_PASSWORD=(.*)$/m)[1];
const browser = await chromium.launch({ executablePath: process.env.CHROME });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: "pl-PL", timezoneId: "Europe/Warsaw" });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !m.text().includes("409") && errors.push(m.text().slice(0, 160)));
const toast = async (text) => page.waitForSelector(`.toast:has-text("${text}")`);
const gone = (locator) => locator.waitFor({ state: "detached", timeout: 5000 }).then(() => true, () => false);
const checks = {};
await page.goto("http://localhost:8090/panel");
await page.fill("input[name=username]", "konrad");
await page.fill("input[name=password]", password);
await page.click("button.btn.primary");
await page.click("nav >> text=Hotel");
await page.waitForSelector(".settings-card");

// room: add → rename → delete
const rooms = page.locator(".settings-card", { hasText: "Sale i miejsca" });
await rooms.locator("input[name=name]").last().fill("E2E Sala");
await rooms.locator("button:has-text('Dodaj')").click();
await toast("Sala dodana");
await rooms.locator("li", { hasText: "E2E Sala" }).locator("button:has-text('Zmień nazwę')").click();
await rooms.locator("li form input[name=name]").fill("E2E Sala Nowa");
await rooms.locator("li form button:has-text('Zapisz')").click();
await toast("Nazwa sali zmieniona");
await rooms.locator("li", { hasText: "E2E Sala Nowa" }).locator("button:has-text('Usuń')").click();
await rooms.locator("li", { hasText: "E2E Sala Nowa" }).locator("button:has-text('Na pewno')").click();
await toast("Sala usunięta");
checks.room = await gone(rooms.locator("li", { hasText: "E2E Sala" }));
// room in use: blocked with a reason
const used = rooms.locator("li", { hasText: "w " }).filter({ hasText: "punktach" }).first();
await used.locator("button:has-text('Usuń')").click();
await used.locator("button:has-text('Na pewno')").click();
checks.roomInUseBlocked = (await rooms.locator(".error").textContent()).includes("Zmień w nich salę");

// typical point: add → edit → delete
const typical = page.locator(".settings-card", { hasText: "Typowe punkty" });
await typical.locator("button:has-text('Dodaj typowy punkt')").click();
const d = page.locator("dialog[open]");
await d.locator("input[name=title]").fill("E2E Kolacja");
await d.locator("input[name=start_time]").fill("19:00");
await d.locator("input[name=end_time]").fill("21:00");
await d.locator("textarea[name=menu]").fill("Zupa dnia");
await d.locator("button:has-text('Zapisz')").click();
await toast("Typowy punkt zapisany");
await typical.locator("li", { hasText: "E2E Kolacja" }).locator("button:has-text('Zmień')").click();
await page.locator("dialog[open] input[name=end_time]").fill("22:00");
await page.locator("dialog[open] button:has-text('Zapisz')").click();
await page.waitForSelector("text=19:00–22:00");
await typical.locator("li", { hasText: "E2E Kolacja" }).locator("button:has-text('Usuń')").click();
await typical.locator("li", { hasText: "E2E Kolacja" }).locator("button:has-text('Na pewno')").click();
await toast("Typowy punkt usunięty");
checks.typical = await gone(typical.locator("li", { hasText: "E2E Kolacja" }));

// account: add (password shown once) → role → new password → delete
const accounts = page.locator(".settings-card", { hasText: "Konta pracowników" });
await accounts.locator("input[name=username]").fill("e2e.kierownik");
await accounts.locator("button:has-text('Dodaj konto')").click();
await accounts.locator(".notice.secret code").waitFor();
const first = await accounts.locator(".notice.secret code").textContent();
await accounts.locator("button:has-text('Zapisane, ukryj')").click();
await accounts.locator("li", { hasText: "e2e.kierownik" }).locator("select").selectOption("dyrektor");
await toast("rola zmieniona");
await accounts.locator("li", { hasText: "e2e.kierownik" }).locator("button:has-text('Nowe hasło')").click();
const second = await accounts.locator(".notice.secret code").textContent();
await page.screenshot({ path: `${out}/crud-hotel.png`, fullPage: true });
await accounts.locator("button:has-text('Zapisane, ukryj')").click();
await accounts.locator("li", { hasText: "e2e.kierownik" }).locator("button:has-text('Usuń')").click();
await accounts.locator("li", { hasText: "e2e.kierownik" }).locator("button:has-text('Na pewno')").click();
await toast("nie ma już dostępu");
checks.account = first.length >= 12 && second !== first && (await gone(accounts.locator("li", { hasText: "e2e.kierownik" })));

// group: add → delete (with consequence)
await page.click("nav >> text=Grupy");
await page.click("button:has-text('Nowa grupa')");
await page.fill("dialog[open] input[name=name]", "E2E Grupa do usunięcia");
await page.fill("dialog[open] input[name=organizer]", "Test");
await page.fill("dialog[open] input[name=first_day]", "2026-12-01");
await page.fill("dialog[open] input[name=last_day]", "2026-12-02");
await page.click("dialog[open] button:has-text('Dodaj grupę')");
await page.waitForSelector("h1:has-text('E2E Grupa do usunięcia')");
await page.click("button:has-text('Dane grupy')");
await page.click("dialog[open] button:has-text('Usuń grupę')");
const consequence = await page.locator("dialog[open] .btn.danger").textContent();
await page.click("dialog[open] .btn.danger");
await page.waitForSelector("h1:has-text('Grupy')");
await toast("Grupa usunięta");
checks.group = consequence.includes("0 punktami") && (await page.locator("text=E2E Grupa do usunięcia").count()) === 0;

console.log(JSON.stringify({ checks, errors }));
if (Object.values(checks).some((v) => !v) || errors.length) { console.error("crud e2e: FAILED"); process.exitCode = 1; }
await browser.close();
