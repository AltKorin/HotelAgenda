// Run: npm run check  (Node strips the types; no test framework needed)
import assert from "node:assert/strict";
import { buildSlides, daysBetween, nextPoint, placesText, whenText, localDate, localTime, pointState, timeText, zonedInstant } from "./slides.ts";
import type { ScreenData, ScreenPoint } from "./types.ts";

const TZ = "Europe/Warsaw";

// Wall clock <-> instant, including both sides of the 25.10.2026 DST switch and midnight.
assert.equal(zonedInstant("2026-10-10", "08:00", TZ).toISOString(), "2026-10-10T06:00:00.000Z");
assert.equal(zonedInstant("2026-10-26", "08:00", TZ).toISOString(), "2026-10-26T07:00:00.000Z");
assert.equal(zonedInstant("2026-03-29", "12:00", TZ).toISOString(), "2026-03-29T10:00:00.000Z");
assert.equal(localDate("2026-10-10T22:30:00Z", TZ), "2026-10-11"); // 00:30 next day in Warsaw
assert.equal(localDate("2026-10-10T21:59:00Z", TZ), "2026-10-10");
assert.equal(localTime("2026-10-10T06:00:00Z", TZ), "8:00");
assert.equal(localTime("2026-10-10T15:45:00Z", TZ), "17:45");
assert.deepEqual(daysBetween("2026-10-09", "2026-10-11"), ["2026-10-09", "2026-10-10", "2026-10-11"]);
assert.deepEqual(daysBetween("2026-10-11", "2026-10-09"), []);
assert.deepEqual(daysBetween("2026-10-24", "2026-10-26"), ["2026-10-24", "2026-10-25", "2026-10-26"]);

const at = (date: string, time: string) => zonedInstant(date, time, TZ).toISOString();
const point = (id: string, date: string, from: string, to: string | null, label: ScreenPoint["time_label"] = "range"): ScreenPoint => ({
  id, title: id, starts_at: at(date, from), ends_at: to ? at(date, to) : null, time_label: label, places: [], note: "", changed: false,
});

assert.equal(timeText(point("a", "2026-10-10", "09:30", "17:00"), TZ), "9:30–17:00");
assert.equal(timeText(point("a", "2026-10-11", "10:00", "11:00", "until"), TZ), "do 11:00");
assert.equal(timeText(point("a", "2026-10-11", "15:00", null, "approx"), TZ), "ok. 15:00");
assert.equal(timeText(point("a", "2026-10-11", "15:00", null), TZ), "15:00");

// Overlaps are normal: a coffee break inside a training — both are "now".
const training = point("szkolenie", "2026-10-10", "09:30", "17:00");
const coffee = point("kawa", "2026-10-10", "11:30", "11:45");
const noon = new Date(at("2026-10-10", "11:35"));
assert.equal(pointState(training, noon), "now");
assert.equal(pointState(coffee, noon), "now");
assert.equal(pointState(point("x", "2026-10-10", "08:00", "10:00"), noon), "past");
assert.equal(pointState(point("x", "2026-10-11", "10:00", "11:00", "until"), noon), "later");
assert.equal(pointState(point("x", "2026-10-10", "10:00", "11:00", "until"), noon), "past");

// Rotation: only groups staying today, every day of their stay, empty days skipped, hotel slides last.
const group = (id: string, first: string, last: string, points: ScreenPoint[]) => ({
  id, name: id, theme: "", fonts: null, organizer: { name: id, logo: null, is_hotel: false }, first_day: first, last_day: last,
  guest_url: "", announcement: "", welcome: "", points,
});
const data: ScreenData = {
  hotel: { name: "H", logo: null, timezone: TZ },
  slide_seconds: 12,
  refresh_seconds: 60,
  groups: [
    group("b", "2026-10-10", "2026-10-11", [point("kolacja", "2026-10-10", "19:00", "22:00")]),
    group("a", "2026-10-09", "2026-10-11", [
      point("wyjazd", "2026-10-11", "15:00", null, "approx"),
      point("przyjazd", "2026-10-09", "14:30", "15:00"),
      training, coffee,
      point("po-polnocy", "2026-10-10", "23:30", null),
    ]),
    group("wczoraj", "2026-10-08", "2026-10-09", [point("x", "2026-10-09", "08:00", "09:00")]),
    group("jutro", "2026-10-11", "2026-10-12", [point("x", "2026-10-11", "08:00", "09:00")]),
  ],
  hotel_slides: [{ id: "spa", image: "/x.svg", alt: "SPA" }],
};
const slides = buildSlides(data, noon);
assert.deepEqual(slides.map((s) => s.key), ["a:2026-10-09", "a:2026-10-10", "a:2026-10-11", "b:2026-10-10", "hotel:spa"]);
const day2 = slides[1];
assert.ok(day2.kind === "day");
assert.deepEqual(day2.points.map((p) => p.id), ["szkolenie", "kawa", "po-polnocy"]);
assert.equal(day2.dayNumber, 2);
assert.equal(day2.dayCount, 3);
assert.deepEqual(buildSlides({ ...data, groups: [], hotel_slides: [] }, noon), []);

assert.equal(placesText([]), "");
assert.equal(placesText(["Restauracja Pod Lipami"]), "Restauracja Pod Lipami");
assert.equal(placesText(["Sala Jodłowa", "Sala Grabowa"]), "Sale: Jodłowa, Grabowa");
assert.equal(placesText(["Sala Jodłowa", "Hol"]), "Sala Jodłowa, Hol");

// "Następnie" and how it is phrased for a guest.
const noonPoints = [training, coffee, point("obiad", "2026-10-10", "13:00", "14:00"), point("sniadanie", "2026-10-11", "08:00", "10:00")];
assert.equal(nextPoint(noonPoints, noon)?.id, "obiad");
assert.equal(nextPoint(noonPoints, new Date(at("2026-10-11", "09:00"))), null);
assert.equal(whenText(point("a", "2026-10-10", "11:50", null), noon, TZ), "za 15 min");
assert.equal(whenText(point("a", "2026-10-10", "13:00", null), noon, TZ), "za 85 min");
assert.equal(whenText(point("a", "2026-10-10", "15:00", null), noon, TZ), "o 15:00");
assert.equal(whenText(point("a", "2026-10-11", "08:00", null), noon, TZ), "jutro o 8:00");
assert.equal(whenText(point("a", "2026-10-13", "10:00", null), noon, TZ), "we wtorek o 10:00");
assert.equal(whenText(point("a", "2026-10-14", "10:00", null), noon, TZ), "w środę o 10:00");
assert.equal(whenText(point("a", "2026-10-17", "10:00", null), noon, TZ), "w sobotę o 10:00");

console.log("slides.check: ok");
