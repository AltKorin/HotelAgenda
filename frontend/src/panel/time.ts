// Form ↔ API time conversion for the point editor. Pure: checked by time.check.ts.
// API speaks hotel wall-clock "YYYY-MM-DDTHH:MM"; the form edits one day plus "HH:MM" fields.
import { addDays } from "../screen/slides.ts";

export type TimeLabel = "range" | "until" | "approx";

export type TimeForm = { label: TimeLabel; start: string; end: string };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function splitLocal(value: string | null): { day: string; time: string } {
  return value ? { day: value.slice(0, 10), time: value.slice(11, 16) } : { day: "", time: "" };
}

/**
 * Build starts_at/ends_at for a point on `day`. An end at or before the start of a range means
 * "after midnight" (bal do 2:00), so it moves to the next day — no extra checkbox to click.
 */
export function toApiTimes(day: string, form: TimeForm): { starts_at: string | null; ends_at: string | null } | { error: string } {
  const start = form.start.trim();
  const end = form.end.trim();
  const at = (d: string, t: string) => `${d}T${t}`;
  if (form.label === "until") {
    if (!HHMM.test(end)) return { error: "Podaj godzinę, do której trwa punkt" };
    return { starts_at: null, ends_at: at(day, end) };
  }
  if (!HHMM.test(start)) return { error: "Podaj godzinę początku" };
  if (form.label === "approx") return { starts_at: at(day, start), ends_at: null };
  if (!HHMM.test(end)) return { error: "Podaj godzinę końca" };
  return { starts_at: at(day, start), ends_at: at(end > start ? day : addDays(day, 1), end) };
}

export function endsNextDay(form: TimeForm): boolean {
  return form.label === "range" && HHMM.test(form.start) && HHMM.test(form.end) && form.end <= form.start;
}

/** Service hours on the point's day; "" = not set. */
export function serviceTime(day: string, time: string): string | null {
  return HHMM.test(time.trim()) ? `${day}T${time.trim()}` : null;
}

export function displayTime(label: TimeLabel, starts: string | null, ends: string | null): string {
  const t = (v: string | null) => (v ? String(Number(v.slice(11, 13))) + v.slice(13, 16) : "");
  if (label === "until") return `do ${t(ends)}`;
  if (label === "approx") return `ok. ${t(starts)}`;
  return ends ? `${t(starts)}–${t(ends)}` : t(starts);
}

/** Polish plural: 1 punkt, 2–4 punkty, 5+ punktów (12–14 → punktów). */
export function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const tens = n % 100;
  return n % 10 >= 2 && n % 10 <= 4 && (tens < 12 || tens > 14) ? few : many;
}
