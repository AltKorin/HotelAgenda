// Pure time and rotation logic for the lobby screen. No React, no DOM: checked by slides.check.ts.
import type { DaySlide, ScreenData, ScreenGroup, ScreenPoint, Slide } from "./types.ts";

const partsCache = new Map<string, Intl.DateTimeFormat>();
function parts(date: Date, timeZone: string) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partsCache.set(timeZone, f);
  }
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return p as Record<"year" | "month" | "day" | "hour" | "minute" | "second", string>;
}

/** Calendar date (YYYY-MM-DD) of an instant, as seen in the hotel. */
export function localDate(instant: Date | string, timeZone: string): string {
  const p = parts(new Date(instant), timeZone);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "8:00", "17:45" — hotel wall-clock time without a leading zero, like the printed slides. */
export function localTime(instant: Date | string, timeZone: string): string {
  const p = parts(new Date(instant), timeZone);
  return `${Number(p.hour)}:${p.minute}`;
}

function offsetMs(utcMs: number, timeZone: string): number {
  const p = parts(new Date(utcMs), timeZone);
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - utcMs;
}

/** Instant of a hotel wall-clock time (date "YYYY-MM-DD", time "HH:MM"); DST-safe. */
export function zonedInstant(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  let utc = guess - offsetMs(guess, timeZone);
  utc = guess - offsetMs(utc, timeZone); // second pass settles times near a DST switch
  return new Date(utc);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(first: string, last: string): string[] {
  const days: string[] = [];
  for (let d = first; d <= last && days.length < 62; d = addDays(d, 1)) days.push(d);
  return days;
}

export function timeText(point: ScreenPoint, timeZone: string): string {
  const start = localTime(point.starts_at, timeZone);
  const end = point.ends_at ? localTime(point.ends_at, timeZone) : null;
  if (point.time_label === "until") return `do ${end ?? start}`;
  if (point.time_label === "approx") return `ok. ${start}`;
  return end ? `${start}–${end}` : start;
}

/** Every non-empty day of one group's stay, whatever today is (panel preview uses it too). */
export function daySlides(group: ScreenGroup, timeZone: string): DaySlide[] {
  const days = daysBetween(group.first_day, group.last_day);
  const slides: DaySlide[] = [];
  days.forEach((date, i) => {
    const points = group.points
      .filter((p) => localDate(p.starts_at, timeZone) === date)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at) || a.title.localeCompare(b.title));
    if (points.length)
      slides.push({ kind: "day", key: `${group.id}:${date}`, group, date, dayNumber: i + 1, dayCount: days.length, points });
  });
  return slides;
}

/** Lobby rotation: every day of every group staying today, then the hotel's own slides. */
export function buildSlides(data: ScreenData, now: Date): Slide[] {
  const tz = data.hotel.timezone;
  const today = localDate(now, tz);
  const slides: Slide[] = data.groups
    .filter((g) => g.first_day <= today && today <= g.last_day)
    .sort((a, b) => a.first_day.localeCompare(b.first_day) || a.name.localeCompare(b.name))
    .flatMap((group) => daySlides(group, tz));
  for (const slide of data.hotel_slides) slides.push({ kind: "hotel", key: `hotel:${slide.id}`, slide });
  return slides;
}

export type PointState = "past" | "now" | "later";

export function pointState(point: ScreenPoint, now: Date): PointState {
  const start = new Date(point.starts_at).getTime();
  const end = point.ends_at ? new Date(point.ends_at).getTime() : null;
  const t = now.getTime();
  if (point.time_label === "range" && end !== null) return t < start ? "later" : t < end ? "now" : "past";
  // "do 11:00" and "ok. 15:00" are moments, not spans: they are never "now".
  return t < (end ?? start) ? "later" : "past";
}

export function startsTodayFirst(slides: Slide[], data: ScreenData, now: Date): number {
  const today = localDate(now, data.hotel.timezone);
  const i = slides.findIndex((s) => s.kind === "day" && (s as DaySlide).date === today);
  return Math.max(i, 0);
}

/** "Sale: Jodłowa, Grabowa" like the printed slides; names without a common "Sala" prefix stay as they are. */
export function placesText(places: string[]): string {
  if (places.length < 2) return places[0] ?? "";
  const rooms = places.every((p) => p.startsWith("Sala "));
  return rooms ? `Sale: ${places.map((p) => p.slice(5)).join(", ")}` : places.join(", ");
}

/** The next thing to happen after `now` (by start; "do 11:00" counts at its deadline). */
export function nextPoint(points: ScreenPoint[], now: Date): ScreenPoint | null {
  const at = (p: ScreenPoint) => new Date(p.starts_at).getTime();
  const upcoming = points.filter((p) => at(p) > now.getTime()).sort((a, b) => at(a) - at(b));
  return upcoming[0] ?? null;
}

/** "za 25 min", "o 13:00", "jutro o 8:00", "w sobotę o 10:00" — how a guest says it. */
export function whenText(point: ScreenPoint, now: Date, timeZone: string): string {
  const start = new Date(point.starts_at);
  const minutes = Math.round((start.getTime() - now.getTime()) / 60000);
  const time = localTime(start, timeZone);
  const today = localDate(now, timeZone);
  const day = localDate(start, timeZone);
  if (day === today) return minutes <= 90 ? `za ${Math.max(minutes, 1)} min` : `o ${time}`;
  if (day === addDays(today, 1)) return `jutro o ${time}`;
  const weekday = new Intl.DateTimeFormat("pl-PL", { weekday: "long", timeZone: "UTC" }).format(new Date(`${day}T12:00:00Z`));
  const prep = /^(wtorek)$/.test(weekday) ? "we" : "w";
  const accusative: Record<string, string> = { środa: "środę", sobota: "sobotę", niedziela: "niedzielę" };
  return `${prep} ${accusative[weekday] ?? weekday} o ${time}`;
}
