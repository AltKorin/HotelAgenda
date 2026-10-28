import "../screen/fonts.css";
import { useEffect, useState, type FormEvent } from "react";
import { localDate } from "../screen/slides.ts";
import { api, loadSession, logIn, logOut, useApi, type GroupSummary, type Hotel } from "./api.ts";
import { DemoBar } from "./Demo.tsx";
import GroupEditor from "./GroupEditor.tsx";
import HotelPage from "./HotelPage.tsx";
import Outputs from "./Outputs.tsx";
import { go, linkTo, usePath } from "./router.ts";
import { Dialog, Field, ToastProvider, dateRange, useToast } from "./ui.tsx";
import "./panel.css";

const HOTEL_KEY = "panel:hotel";

export default function Panel() {
  const [user, setUser] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    loadSession().then(setUser).catch(() => setUser(null));
  }, []);
  return (
    <div className="panel">
      <ToastProvider>
        {user === undefined ? null : user ? <Signed user={user} onLogout={() => setUser(null)} /> : <Login onLogin={setUser} />}
      </ToastProvider>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (user: string) => void }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      const user = await logIn(String(form.get("username")), String(form.get("password")));
      if (user) onLogin(user);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login">
      <form onSubmit={submit}>
        <h1>Agenda hotelu</h1>
        <p>Zaloguj się, żeby przygotować agendę grupy.</p>
        {error && <p className="error">{error}</p>}
        <Field label="Login lub e-mail">{(id) => <input id={id} name="username" type="text" autoComplete="username" required />}</Field>
        <Field label="Hasło">{(id) => <input id={id} name="password" type="password" autoComplete="current-password" required />}</Field>
        <button className="btn primary" disabled={busy}>
          {busy ? "Logowanie…" : "Zaloguj się"}
        </button>
        <p className="hint">
          Nie masz konta? <a href="/rejestracja">Załóż konto hotelu</a> — za darmo.
          <br />
          Nie pamiętasz hasła? Dyrektor hotelu nada nowe; dyrektor pisze na <a href="mailto:kontakt@sudomie.pl">kontakt@sudomie.pl</a>.
        </p>
      </form>
    </main>
  );
}

function Signed({ user, onLogout }: { user: string; onLogout: () => void }) {
  const path = usePath();
  const hotels = useApi<Hotel[]>("/hotels/");
  const [hotelId, setHotelId] = useState(() => localStorage.getItem(HOTEL_KEY) ?? "");
  const list = hotels.data ?? [];
  const hotel = list.find((h) => h.id === hotelId) ?? list[0];

  if (hotels.error) return <p className="page error">{hotels.error}</p>;
  if (!hotels.data) return null;
  if (!hotel)
    return (
      <main className="page">
        <p className="empty">To konto nie ma jeszcze dostępu do żadnego hotelu. Poproś dyrektora o dodanie.</p>
      </main>
    );

  const groupMatch = path.match(/^\/panel\/grupa\/([0-9a-f-]+)\/?$/);
  const choose = (id: string) => {
    try {
      localStorage.setItem(HOTEL_KEY, id);
    } catch {
      /* per-browser convenience only */
    }
    setHotelId(id);
    go("/panel");
  };

  return (
    <>
      <DemoBar />
      <header className="topbar">
        <span className="hotel">
          {list.length > 1 ? (
            <select value={hotel.id} onChange={(e) => choose(e.target.value)} aria-label="Hotel">
              {list.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
          ) : (
            hotel.name
          )}
        </span>
        <nav>
          <a {...linkTo("/panel")} aria-current={!/^\/panel\/(ekran|hotel)/.test(path) ? "page" : undefined}>
            Grupy
          </a>
          <a {...linkTo("/panel/hotel")} aria-current={path.startsWith("/panel/hotel") ? "page" : undefined}>
            Hotel
          </a>
          <a {...linkTo("/panel/ekran")} aria-current={path.startsWith("/panel/ekran") ? "page" : undefined}>
            Ekran i obsługa
          </a>
        </nav>
        {/* ponytail: sandbox logins (agenda.demo) are technical; the demo bar says what this is */}
        {!user.startsWith("demo-") && <span className="who">{user}</span>}
        <button className="link" onClick={() => logOut().then(onLogout)}>
          Wyloguj
        </button>
      </header>
      {groupMatch ? (
        <GroupEditor key={groupMatch[1]} hotel={hotel} groupId={groupMatch[1]} />
      ) : path.startsWith("/panel/hotel") ? (
        <HotelPage hotel={hotel} onHotelChange={hotels.reload} />
      ) : path.startsWith("/panel/ekran") ? (
        <Outputs hotel={hotel} onHotelChange={hotels.reload} />
      ) : (
        <Board hotel={hotel} />
      )}
    </>
  );
}

function Board({ hotel }: { hotel: Hotel }) {
  const groups = useApi<GroupSummary[]>(`/hotels/${hotel.id}/groups/`);
  const [creating, setCreating] = useState(false);
  const today = localDate(new Date(), hotel.timezone);
  const all = groups.data ?? [];
  const now = all.filter((g) => g.first_day <= today && today <= g.last_day);
  const next = all.filter((g) => g.first_day > today).reverse();
  const past = all.filter((g) => g.last_day < today);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Grupy</h1>
          <p>Kto jest dziś w hotelu, kto przyjeżdża i czy goście widzą aktualną agendę.</p>
        </div>
        <div className="group-actions">
          <a className="btn" href={`/api/hotels/${hotel.id}/odprawa/${today}.pdf`}>Odprawa na dziś (PDF)</a>
          <button className="btn primary" onClick={() => setCreating(true)}>
            Nowa grupa
          </button>
        </div>
      </div>
      {groups.error && <p className="error">{groups.error}</p>}
      {groups.data && all.length === 0 && (
        <div className="empty">
          <p>Nie ma jeszcze żadnej grupy. Zacznij od nazwy, organizatora i dni pobytu — punkty dodasz potem.</p>
          <p className="hint">Sale i typowe punkty (śniadanie, obiad, przerwa kawowa) dodasz w zakładce <a {...linkTo("/panel/hotel")}>Hotel</a> — przydadzą się w każdej agendzie.</p>
          <button className="btn primary" onClick={() => setCreating(true)}>
            Dodaj pierwszą grupę
          </button>
        </div>
      )}
      <GroupSection title="W hotelu dziś" groups={now} empty="Dziś w hotelu nie ma żadnej grupy." />
      <GroupSection title="Nadchodzące" groups={next} empty="Brak zaplanowanych grup." />
      {past.length > 0 && <GroupSection title="Minione" groups={past} />}
      <NewGroup hotel={hotel} open={creating} onClose={() => setCreating(false)} />
    </main>
  );
}

function GroupSection({ title, groups, empty }: { title: string; groups: GroupSummary[]; empty?: string }) {
  if (!groups.length && !empty) return null;
  return (
    <section className="board-section">
      <h2>{title}</h2>
      {groups.length === 0 ? (
        <p className="hint">{empty}</p>
      ) : (
        <ul className="group-list">
          {groups.map((g) => (
            <li key={g.id}>
              <a className="group-row" {...linkTo(`/panel/grupa/${g.id}`)}>
                <span className="name">{g.name}</span>
                <span className="meta">
                  {dateRange(g.first_day, g.last_day)}, {g.organizer.is_hotel ? "organizuje hotel" : g.organizer.name}
                </span>
                <span className="badges">
                  {g.unpublished_changes ? (
                    <span className="badge unpublished">{g.published_seq ? "Nieopublikowane zmiany" : "Jeszcze nie opublikowana"}</span>
                  ) : (
                    <span className="badge">Opublikowana</span>
                  )}
                  {g.agreed && <span className="badge agreed">Uzgodniona z organizatorem</span>}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function NewGroup({ hotel, open, onClose }: { hotel: Hotel; open: boolean; onClose: () => void }) {
  const toast = useToast();
  const [error, setError] = useState("");
  const [isHotel, setIsHotel] = useState(false);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      const group = await api.post<GroupSummary>(`/hotels/${hotel.id}/groups/`, {
        name: f.get("name"),
        organizer_name: isHotel ? hotel.name : f.get("organizer"),
        organizer_is_hotel: isHotel,
        first_day: f.get("first_day"),
        last_day: f.get("last_day"),
      });
      toast("Grupa dodana. Teraz dodaj punkty agendy.");
      onClose();
      go(`/panel/grupa/${group.id}`);
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <Dialog open={open} onClose={onClose} title="Nowa grupa">
      <form className="grid-form" onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        {error && <p className="error">{error}</p>}
        <Field label="Nazwa grupy" hint="Tak, jak mówicie o niej w hotelu, np. „Szkolenie wolontariuszy”.">
          {(id) => <input id={id} name="name" type="text" required maxLength={200} />}
        </Field>
        <label className="check">
          <input type="checkbox" checked={isHotel} onChange={(e) => setIsHotel(e.target.checked)} />
          Organizatorem jest hotel
        </label>
        {!isHotel && (
          <Field label="Organizator">{(id) => <input id={id} name="organizer" type="text" required maxLength={200} />}</Field>
        )}
        <div className="grid-2">
          <Field label="Przyjazd">{(id) => <input id={id} name="first_day" type="date" required />}</Field>
          <Field label="Wyjazd">{(id) => <input id={id} name="last_day" type="date" required />}</Field>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn quiet" onClick={onClose}>
            Anuluj
          </button>
          <button className="btn primary">Dodaj grupę</button>
        </div>
      </form>
    </Dialog>
  );
}
