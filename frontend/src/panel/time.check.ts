import assert from "node:assert/strict";
import { displayTime, endsNextDay, plural, serviceTime, splitLocal, toApiTimes } from "./time.ts";

const day = "2026-10-10";
assert.deepEqual(toApiTimes(day, { label: "range", start: "09:30", end: "17:00" }), { starts_at: "2026-10-10T09:30", ends_at: "2026-10-10T17:00" });
// End before start = after midnight, not an error.
assert.deepEqual(toApiTimes(day, { label: "range", start: "22:00", end: "02:00" }), { starts_at: "2026-10-10T22:00", ends_at: "2026-10-11T02:00" });
assert.deepEqual(toApiTimes("2026-10-31", { label: "range", start: "23:00", end: "00:30" }), { starts_at: "2026-10-31T23:00", ends_at: "2026-11-01T00:30" });
assert.equal(endsNextDay({ label: "range", start: "22:00", end: "02:00" }), true);
assert.equal(endsNextDay({ label: "range", start: "09:00", end: "10:00" }), false);
assert.equal(endsNextDay({ label: "approx", start: "22:00", end: "02:00" }), false);
assert.deepEqual(toApiTimes(day, { label: "until", start: "", end: "11:00" }), { starts_at: null, ends_at: "2026-10-10T11:00" });
assert.deepEqual(toApiTimes(day, { label: "approx", start: "15:00", end: "16:00" }), { starts_at: "2026-10-10T15:00", ends_at: null });
for (const bad of [
  { label: "range", start: "", end: "10:00" },
  { label: "range", start: "9:00", end: "10:00" },
  { label: "range", start: "09:00", end: "24:00" },
  { label: "range", start: "  ", end: "  " },
  { label: "until", start: "10:00", end: "" },
  { label: "approx", start: "", end: "" },
] as const) {
  assert.ok("error" in toApiTimes(day, bad), JSON.stringify(bad));
}
assert.equal(serviceTime(day, "08:30"), "2026-10-10T08:30");
assert.equal(serviceTime(day, ""), null);
assert.equal(serviceTime(day, "8:30"), null);
assert.deepEqual(splitLocal("2026-10-10T09:30"), { day: "2026-10-10", time: "09:30" });
assert.deepEqual(splitLocal(null), { day: "", time: "" });
assert.equal(displayTime("range", "2026-10-10T08:00", "2026-10-10T10:00"), "8:00–10:00");
assert.equal(displayTime("until", null, "2026-10-10T11:00"), "do 11:00");
assert.equal(displayTime("approx", "2026-10-10T15:00", null), "ok. 15:00");

const p = (n: number) => plural(n, "punkt", "punkty", "punktów");
assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 112, 122].map(p),
  ["punkt", "punkty", "punkty", "punktów", "punktów", "punktów", "punktów", "punktów", "punkty", "punktów", "punktów", "punkty"]);

console.log("time.check: ok");
