// /g/<token> — the group's agenda on a guest's phone, in the group's own look (same as the lobby TV).
import { useEffect, useMemo, useState } from "react";
import { fetchJson, useLive } from "../screen/data.ts";
import { addDays, daysBetween, localDate, localTime, nextPoint, placesText, pointState, timeText, whenText } from "../screen/slides.ts";
import { lookStyle, resolveFonts, themeById } from "../screen/themes.ts";
import type { ScreenGroup, ScreenPoint } from "../screen/types.ts";
import "./guest.css";

type GuestHotel = { name: string; logo: string | null; timezone: string };
type GuestGroup = Omit<ScreenGroup, "guest_url">;
type GuestData = { hotel: GuestHotel; group: GuestGroup | null };

const weekday = new Intl.DateTimeFormat("pl-PL", { weekday: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" });
const noon = (d: string) => new Date(`${d}T12:00:00Z`);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function useNow(ms: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return now;
}

export default function Guest({ token }: { token: string }) {
  const live = useLive<GuestData>(`gosc:${token}`, () => fetchJson(`/api/g/${encodeURIComponent(token)}/`), 60);
  const data = live.data;
  const group = data?.group ?? null;

  useEffect(() => {
    document.title = group ? `${group.name} — agenda` : "Agenda";
  }, [group]);

  if (live.revoked) return <Notice text="Ten link już nie działa. Zapytaj w recepcji o aktualny kod QR." />;
  if (!data) return <Notice text={live.offline ? "Brak połączenia. Spróbuj ponownie za chwilę." : "Wczytywanie agendy…"} />;
  if (!group) return <Notice text="Agenda pojawi się tutaj wkrótce. Zajrzyj ponownie przed przyjazdem." />;

  const tz = data.hotel.timezone;
  const status = live.offline
    ? `Brak połączenia — widzisz wersję z ${live.updatedAt ? localTime(live.updatedAt, tz) : "wcześniej"}.`
    : live.updatedAt
      ? `Aktualne na ${localTime(live.updatedAt, tz)}. Zmiany pojawiają się tu same.`
      : "";
  return <GuestView hotel={data.hotel} group={group} pdf={`/api/g/${encodeURIComponent(token)}/agenda.pdf`} status={status} />;
}

/** The phone view itself — also shown on the landing page with demo data. */
export function GuestView({ hotel, group, pdf, status }: { hotel: GuestHotel; group: GuestGroup; pdf?: string; status?: string }) {
  const now = useNow(30_000);
  const [chosen, setChosen] = useState<string | null>(null);
  const tz = hotel.timezone;
  const today = localDate(now, tz);
  const days = useMemo(() => daysBetween(group.first_day, group.last_day), [group]);

  const theme = themeById(group.theme);
  const fonts = resolveFonts(theme, group.fonts);
  const shown = chosen && days.includes(chosen) ? chosen : days.includes(today) ? today : days[0];
  const onDay = (d: string) => group.points.filter((p) => localDate(p.starts_at, tz) === d);
  const current = group.points.filter((p) => pointState(p, now) === "now");
  const next = nextPoint(group.points, now);
  const inStay = group.first_day <= today && today <= group.last_day;

  return (
    <div className={`guest${theme.dark ? " dark" : ""}`} style={lookStyle(theme, fonts)}>
      <header className="g-band">
        {!group.organizer.is_hotel && group.organizer.logo && <img src={group.organizer.logo} alt={group.organizer.name} />}
        {hotel.logo && <img className="hotel" src={hotel.logo} alt={hotel.name} />}
      </header>

      <main className="g-main">
        <h1>{group.name}</h1>
        <p className="g-sub">{rangeText(group.first_day, group.last_day)}</p>
        {group.announcement && <p className="g-announcement" role="status">{group.announcement}</p>}

        {inStay && (
          <section className="g-now" aria-label="Teraz i następnie">
            <div>
              <h2>Teraz</h2>
              {current.length ? current.map((p) => <Brief key={p.id} point={p} tz={tz} />) : <p className="g-quiet">Teraz nic nie jest zaplanowane.</p>}
            </div>
            {next && (
              <div>
                <h2>Następnie <span className="g-when">{whenText(next, now, tz)}</span></h2>
                <Brief point={next} tz={tz} />
              </div>
            )}
          </section>
        )}

        <nav className="g-days" aria-label="Dni pobytu">
          {days.map((d) => (
            <button key={d} aria-pressed={d === shown} onClick={() => setChosen(d)}>
              {d === today ? "Dziś" : d === addDays(today, 1) ? "Jutro" : cap(weekday.format(noon(d)))}
              <small>{dayMonth.format(noon(d))}</small>
            </button>
          ))}
        </nav>

        <ol className="g-list">
          {onDay(shown).map((p) => {
            const state = shown === today ? pointState(p, now) : "later";
            return (
              <li key={p.id} className={state}>
                <span className="g-time">{timeText(p, tz)}</span>
                <div>
                  <p className="g-title">
                    {p.title}
                    {p.changed && <em className="g-changed">zmiana</em>}
                    {state === "now" && <em className="g-live">trwa</em>}
                  </p>
                  {p.places.length > 0 && <p className="g-place">{placesText(p.places)}</p>}
                  {p.note && <p className="g-note">{p.note}</p>}
                </div>
              </li>
            );
          })}
          {onDay(shown).length === 0 && <li className="g-quiet">Tego dnia nie ma punktów.</li>}
        </ol>

        {pdf && (
          <a className="g-pdf" href={pdf}>
            Pobierz agendę do druku (PDF)
          </a>
        )}
        <p className="g-foot">
          {hotel.name}
          {status && <br />}
          {status}
        </p>
      </main>
    </div>
  );
}

function Brief({ point, tz }: { point: ScreenPoint; tz: string }) {
  return (
    <p className="g-brief">
      <strong>{point.title}</strong>
      <span>{[timeText(point, tz), placesText(point.places)].filter(Boolean).join(", ")}</span>
    </p>
  );
}

function Notice({ text }: { text: string }) {
  return (
    <div className="guest notice-page">
      <p>{text}</p>
    </div>
  );
}

function rangeText(first: string, last: string) {
  const f = noon(first);
  const l = noon(last);
  if (first === last) return dayMonth.format(f);
  return first.slice(0, 7) === last.slice(0, 7) ? `${f.getUTCDate()}–${dayMonth.format(l)}` : `${dayMonth.format(f)} – ${dayMonth.format(l)}`;
}
