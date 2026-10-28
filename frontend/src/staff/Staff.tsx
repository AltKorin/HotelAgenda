// /o/<token> — shared staff view: every group in the hotel with full karty zlecenia,
// so whoever a guest asks can answer. Published data only, like the TV.
import { useEffect, useMemo, useState } from "react";
import "../screen/fonts.css";
import "../panel/panel.css";
import { dayTab } from "../panel/ui.tsx";
import { fetchJson, useLive } from "../screen/data.ts";
import { addDays, daysBetween, localDate, localTime, placesText, pointState, timeText } from "../screen/slides.ts";
import type { ScreenGroup, ScreenPoint } from "../screen/types.ts";
import "./staff.css";

type Card = {
  place: string;
  subgroup: string;
  headcount: number | null;
  setup: string;
  menu: string;
  required_items: string[];
  todo: string;
  responsible: string;
  service_from: string | null;
  service_to: string | null;
};
type StaffPoint = ScreenPoint & { kind: string; realizer: "hotel" | "organizer"; visibility: "guests" | "staff"; cards: Card[] };
type StaffGroup = Omit<ScreenGroup, "guest_url" | "points"> & { agreed: boolean; points: StaffPoint[] };
type StaffData = { hotel: { name: string; timezone: string }; today: string; groups: StaffGroup[] };

export default function Staff({ token }: { token: string }) {
  const base = `/api/o/${encodeURIComponent(token)}`;
  const live = useLive<StaffData>(`obsluga:${token}`, () => fetchJson(`${base}/`), 60);
  const [now, setNow] = useState(() => new Date());
  const [chosen, setChosen] = useState<string | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const data = live.data;
  const tz = data?.hotel.timezone ?? "Europe/Warsaw";
  const today = localDate(now, tz);
  const days = useMemo(() => {
    if (!data?.groups.length) return [today];
    const last = data.groups.map((g) => g.last_day).sort().at(-1)!;
    return daysBetween(today, last < today ? today : last).slice(0, 14);
  }, [data, today]);

  if (live.revoked) return <div className="panel staff-notice"><p>Ten link do agendy obsługi już nie działa. Poproś kierownika o nowy.</p></div>;
  if (!data) return <div className="panel staff-notice"><p>{live.offline ? "Brak połączenia." : "Wczytywanie…"}</p></div>;

  const day = chosen && days.includes(chosen) ? chosen : today;
  const groups = data.groups
    .map((g) => ({ ...g, points: g.points.filter((p) => localDate(p.starts_at, tz) === day) }))
    .filter((g) => g.points.length);
  const nowPoints = data.groups.flatMap((g) => g.points.filter((p) => pointState(p, now) === "now").map((p) => ({ g, p })));

  return (
    <div className="panel">
      <header className="topbar">
        <span className="hotel">{data.hotel.name}</span>
        <span style={{ color: "#e9e1cf" }}>Agenda obsługi</span>
      </header>
      <main className="page staff">
        {day === today && nowPoints.length > 0 && (
          <section className="staff-now" aria-label="Teraz w hotelu">
            <h2>Teraz w hotelu</h2>
            <ul>
              {nowPoints.map(({ g, p }) => (
                <li key={p.id}>
                  <strong>{p.title}</strong> {timeText(p, tz)}, {placesText(p.places) || "bez sali"} <span className="hint">— {g.name}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="staff-bar">
          <nav className="day-tabs" aria-label="Dzień">
            {days.map((d) => {
              const tab = dayTab(d);
              return (
                <button key={d} aria-selected={d === day} onClick={() => setChosen(d)}>
                  <strong>{d === today ? "Dziś" : d === addDays(today, 1) ? "Jutro" : tab.weekday}</strong>
                  <span className="count">{tab.date}</span>
                </button>
              );
            })}
          </nav>
          <a className="btn primary" href={`${base}/odprawa/${day}.pdf`}>Odprawa na ten dzień (PDF)</a>
        </div>

        {groups.length === 0 && <p className="empty">Tego dnia w hotelu nie ma opublikowanych punktów.</p>}
        {groups.map((g) => (
          <section key={g.id} className="staff-group">
            <h2>{g.name}</h2>
            <p className="hint">{g.organizer.is_hotel ? "Organizuje hotel" : `Organizator: ${g.organizer.name}`}</p>
            {g.announcement && <p className="notice">Ogłoszenie dla gości: {g.announcement}</p>}
            <ol className="staff-points">
              {g.points.map((p) => {
                const state = day === today ? pointState(p, now) : "later";
                return (
                  <li key={p.id} className={state}>
                    <div className="staff-head">
                      <span className="time">{timeText(p, tz)}</span>
                      <span className="title">
                        {p.title}
                        {p.visibility === "staff" && <span className="badge staff">tylko obsługa</span>}
                        {p.realizer === "organizer" && <span className="badge">realizuje organizator</span>}
                        {p.changed && <span className="badge unpublished">zmiana</span>}
                        {state === "now" && <span className="badge agreed">trwa</span>}
                      </span>
                      <a className="btn quiet" href={`${base}/karta/${p.id}.pdf`}>Karta (PDF)</a>
                    </div>
                    {p.note && <p className="hint">Goście widzą: {p.note}</p>}
                    {p.cards.map((c, i) => (
                      <dl key={i} className="staff-card">
                        <div><dt>Sala</dt><dd>{c.place}{c.subgroup && `, ${c.subgroup}`}{c.headcount != null && `, ${c.headcount} os.`}</dd></div>
                        {(c.service_from || c.service_to) && (
                          <div><dt>Obsługa</dt><dd>{[c.service_from, c.service_to].map((v) => (v ? localTime(v, tz) : "")).join("–")}</dd></div>
                        )}
                        {c.setup && <div><dt>Ustawienie</dt><dd>{c.setup}</dd></div>}
                        {c.menu && <div><dt>Menu</dt><dd className="pre">{c.menu}</dd></div>}
                        {c.required_items.length > 0 && <div><dt>Potrzebne</dt><dd>{c.required_items.join(", ")}</dd></div>}
                        {c.todo && <div><dt>Do zrobienia</dt><dd className="pre">{c.todo}</dd></div>}
                        {c.responsible && <div><dt>Odpowiada</dt><dd>{c.responsible}</dd></div>}
                      </dl>
                    ))}
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
        <p className="hint" style={{ marginTop: 32 }}>
          {live.offline
            ? `Brak połączenia — widzisz wersję z ${live.updatedAt ? localTime(live.updatedAt, tz) : "wcześniej"}.`
            : live.updatedAt && `Aktualne na ${localTime(live.updatedAt, tz)}. Odświeża się samo co minutę.`}
        </p>
      </main>
    </div>
  );
}
