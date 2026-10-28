// „Hotel”: name, rooms, typical points and staff accounts — each with list / add / edit / delete
// (CLAUDE.md: nothing the client manages is left to the admin or to setup scripts).
import { useState, type FormEvent } from "react";
import { api, useApi, type Hotel, type Kind } from "./api.ts";
import { Dialog, Field, Segmented, useToast } from "./ui.tsx";

type Room = { id: string; name: string; used: number; typical: number };
type TypicalCard = { menu?: string; setup?: string; todo?: string; responsible?: string; required_items?: string[]; headcount?: number | null };
type Typical = {
  id: string;
  kind: string;
  title: string;
  time_label: "range" | "until" | "approx";
  start_time: string;
  end_time: string | null;
  space: string | null;
  space_id: string | null;
  guest_note: string;
  card: TypicalCard;
};
type Member = { id: number; username: string; role: "dyrektor" | "kierownik"; me: boolean; active: boolean; last_login: string | null };

const run = async (action: () => Promise<unknown>, onError: (m: string) => void) => {
  try {
    await action();
    return true;
  } catch (e) {
    onError((e as Error).message);
    return false;
  }
};

export default function HotelPage({ hotel, onHotelChange }: { hotel: Hotel; onHotelChange: () => void }) {
  const director = hotel.role === "dyrektor" || hotel.role === "admin";
  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Hotel</h1>
          <p>Sale, typowe punkty do szybkiego wstawiania w agendy{director ? " i konta pracowników z dostępem do panelu" : ""}.</p>
        </div>
      </div>
      {director && <HotelName hotel={hotel} onChange={onHotelChange} />}
      <Rooms hotel={hotel} />
      <TypicalPoints hotel={hotel} />
      {director && <Accounts hotel={hotel} />}
      <MyAccount />
      {director && <HotelData hotel={hotel} />}
    </main>
  );
}

function HotelName({ hotel, onChange }: { hotel: Hotel; onChange: () => void }) {
  const toast = useToast();
  const [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const name = new FormData(e.currentTarget).get("name");
    if (await run(() => api.patch(`/hotels/${hotel.id}/`, { name }), setError)) {
      setError("");
      onChange();
      toast("Nazwa hotelu zapisana. Widać ją w stopkach PDF i w telefonach gości.");
    }
  };
  return (
    <section className="link-card settings-card">
      <h2>Dane hotelu</h2>
      <form className="inline-form" onSubmit={submit}>
        <Field label="Nazwa hotelu">{(id) => <input id={id} name="name" type="text" defaultValue={hotel.name} required maxLength={200} />}</Field>
        <button className="btn primary">Zapisz</button>
      </form>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

function Rooms({ hotel }: { hotel: Hotel }) {
  const rooms = useApi<Room[]>(`/hotels/${hotel.id}/spaces/`);
  const toast = useToast();
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const base = `/hotels/${hotel.id}/spaces/`;

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    if (await run(() => api.post(base, { name: new FormData(form).get("name") }), setError)) {
      form.reset();
      setError("");
      rooms.reload();
      toast("Sala dodana.");
    }
  };
  const rename = async (e: FormEvent<HTMLFormElement>, id: string) => {
    e.preventDefault();
    if (await run(() => api.patch(`${base}${id}/`, { name: new FormData(e.currentTarget).get("name") }), setError)) {
      setEditing(null);
      setError("");
      rooms.reload();
      toast("Nazwa sali zmieniona. Opublikowane agendy pokażą ją po ponownej publikacji.");
    }
  };
  const remove = async (id: string) => {
    setConfirm(null);
    if (await run(() => api.delete(`${base}${id}/`, {}), setError)) {
      setError("");
      rooms.reload();
      toast("Sala usunięta.");
    }
  };

  return (
    <section className="link-card settings-card">
      <h2>Sale i miejsca</h2>
      <p className="hint">Wszystko, co może być miejscem punktu agendy: sale, restauracja, recepcja, taras.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="settings-list">
        {rooms.data?.map((r) => (
          <li key={r.id}>
            {editing === r.id ? (
              <form className="inline-form" onSubmit={(e) => rename(e, r.id)}>
                <Field label="Nowa nazwa">{(id) => <input id={id} name="name" type="text" defaultValue={r.name} required maxLength={120} autoFocus />}</Field>
                <button className="btn primary">Zapisz</button>
                <button type="button" className="btn quiet" onClick={() => setEditing(null)}>Anuluj</button>
              </form>
            ) : (
              <>
                <span className="settings-name">{r.name}</span>
                <span className="hint">{r.used ? `w ${r.used} punktach agendy` : "nieużywana w agendach"}</span>
                <span className="settings-actions">
                  <button className="btn quiet" onClick={() => setEditing(r.id)}>Zmień nazwę</button>
                  {confirm === r.id ? (
                    <button className="btn danger" onClick={() => remove(r.id)}>Na pewno usunąć „{r.name}”?</button>
                  ) : (
                    <button className="btn quiet" onClick={() => setConfirm(r.id)}>Usuń</button>
                  )}
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={add}>
        <Field label="Nowa sala lub miejsce">{(id) => <input id={id} name="name" type="text" required maxLength={120} placeholder="np. Sala Kominkowa" />}</Field>
        <button className="btn primary">Dodaj</button>
      </form>
    </section>
  );
}

function TypicalPoints({ hotel }: { hotel: Hotel }) {
  const list = useApi<Typical[]>(`/hotels/${hotel.id}/typical-points/`);
  const rooms = useApi<Room[]>(`/hotels/${hotel.id}/spaces/`);
  const kinds = useApi<Kind[]>("/point-kinds/");
  const toast = useToast();
  const [form, setForm] = useState<Typical | "new" | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [error, setError] = useState("");
  const base = `/hotels/${hotel.id}/typical-points/`;
  const time = (t: Typical) =>
    t.time_label === "until" ? `do ${t.end_time}` : t.time_label === "approx" ? `ok. ${t.start_time}` : `${t.start_time}–${t.end_time}`;

  const remove = async (t: Typical) => {
    setConfirm(null);
    if (await run(() => api.delete(`${base}${t.id}/`, {}), setError)) {
      list.reload();
      toast("Typowy punkt usunięty. Punkty już wstawione do agend zostają bez zmian.");
    }
  };

  return (
    <section className="link-card settings-card">
      <h2>Typowe punkty</h2>
      <p className="hint">Gotowe punkty z kartą zlecenia (np. śniadanie, przerwa kawowa) — w agendzie grupy: „Z typowych punktów”.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <ul className="settings-list">
        {list.data?.map((t) => (
          <li key={t.id}>
            <span className="settings-name">{t.title}</span>
            <span className="hint">{[time(t), t.space].filter(Boolean).join(", ")}</span>
            <span className="settings-actions">
              <button className="btn quiet" onClick={() => setForm(t)}>Zmień</button>
              {confirm === t.id ? (
                <button className="btn danger" onClick={() => remove(t)}>Na pewno usunąć?</button>
              ) : (
                <button className="btn quiet" onClick={() => setConfirm(t.id)}>Usuń</button>
              )}
            </span>
          </li>
        ))}
        {list.data?.length === 0 && <li className="hint">Nie ma jeszcze typowych punktów.</li>}
      </ul>
      <div>
        <button className="btn primary" onClick={() => setForm("new")}>Dodaj typowy punkt</button>
      </div>
      {form && kinds.data && rooms.data && (
        <TypicalForm
          hotel={hotel}
          typical={form === "new" ? null : form}
          kinds={kinds.data}
          rooms={rooms.data}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null);
            list.reload();
            toast("Typowy punkt zapisany.");
          }}
        />
      )}
    </section>
  );
}

function TypicalForm({ hotel, typical, kinds, rooms, onClose, onSaved }: {
  hotel: Hotel;
  typical: Typical | null;
  kinds: Kind[];
  rooms: Room[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState<Typical["time_label"]>(typical?.time_label ?? "range");
  const [error, setError] = useState("");
  const card = typical?.card ?? {};
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const headcount = s("headcount");
    if (headcount && !/^\d+$/.test(headcount)) return setError("Liczba osób musi być liczbą.");
    const body = {
      kind: s("kind"),
      title: s("title"),
      time_label: label,
      start_time: label === "until" ? "" : s("start_time"),
      end_time: label === "approx" ? "" : s("end_time"),
      space: s("space") || null,
      guest_note: s("guest_note"),
      card: {
        menu: s("menu"), setup: s("setup"), todo: s("todo"), responsible: s("responsible"),
        required_items: s("items").split("\n").map((x) => x.trim()).filter(Boolean),
        headcount: headcount ? Number(headcount) : null,
      },
    };
    const path = `/hotels/${hotel.id}/typical-points/${typical ? `${typical.id}/` : ""}`;
    if (await run(() => (typical ? api.patch(path, body) : api.post(path, body)), setError)) onSaved();
  };
  return (
    <Dialog open side onClose={onClose} title={typical ? "Typowy punkt" : "Nowy typowy punkt"}>
      <form onSubmit={submit} style={{ display: "grid", gap: 14 }}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="grid-2">
          <Field label="Rodzaj">
            {(id) => (
              <select id={id} name="kind" defaultValue={typical?.kind ?? kinds[0]?.id}>
                {kinds.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Nazwa">{(id) => <input id={id} name="title" type="text" defaultValue={typical?.title} required maxLength={200} />}</Field>
        </div>
        <Segmented label="Godzina" value={label} onChange={setLabel} options={[["range", "od – do"], ["until", "do"], ["approx", "około"]]} />
        <div className="grid-2">
          {label !== "until" && <Field label={label === "approx" ? "Około" : "Od"}>{(id) => <input id={id} name="start_time" type="time" defaultValue={typical?.start_time} required />}</Field>}
          {label !== "approx" && <Field label="Do">{(id) => <input id={id} name="end_time" type="time" defaultValue={typical?.end_time ?? ""} required />}</Field>}
        </div>
        <Field label="Sala (domyślna)">
          {(id) => (
            <select id={id} name="space" defaultValue={typical?.space_id ?? ""}>
              <option value="">— bez sali —</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </Field>
        <Field label="Uwaga dla gości">{(id) => <input id={id} name="guest_note" type="text" defaultValue={typical?.guest_note} maxLength={300} />}</Field>
        <h3 className="section-title">Karta zlecenia <small>— widzi tylko obsługa</small></h3>
        <div className="grid-2">
          <Field label="Odpowiedzialny">{(id) => <input id={id} name="responsible" type="text" defaultValue={card.responsible} maxLength={200} />}</Field>
          <Field label="Liczba osób">{(id) => <input id={id} name="headcount" type="number" min={0} defaultValue={card.headcount ?? ""} />}</Field>
        </div>
        <Field label="Ustawienie sali">{(id) => <input id={id} name="setup" type="text" defaultValue={card.setup} maxLength={300} />}</Field>
        <Field label="Menu">{(id) => <textarea id={id} name="menu" defaultValue={card.menu} />}</Field>
        <Field label="Niezbędne elementy" hint="Jeden w linii.">{(id) => <textarea id={id} name="items" defaultValue={(card.required_items ?? []).join("\n")} />}</Field>
        <Field label="Co trzeba zrobić">{(id) => <textarea id={id} name="todo" defaultValue={card.todo} />}</Field>
        <div className="dialog-actions">
          <button type="button" className="btn quiet" onClick={onClose}>Anuluj</button>
          <button className="btn primary">Zapisz</button>
        </div>
      </form>
    </Dialog>
  );
}

function Accounts({ hotel }: { hotel: Hotel }) {
  const members = useApi<Member[]>(`/hotels/${hotel.id}/members/`);
  const toast = useToast();
  const [error, setError] = useState("");
  const [secret, setSecret] = useState<{ username: string; password: string } | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const base = `/hotels/${hotel.id}/members/`;

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      const created = await api.post<Member & { password: string }>(base, { username: f.get("username"), role: f.get("role") });
      form.reset();
      setError("");
      setSecret({ username: created.username, password: created.password });
      members.reload();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const role = async (m: Member, value: string) => {
    if (await run(() => api.patch(`${base}${m.id}/`, { role: value }), setError)) {
      setError("");
      members.reload();
      toast(`${m.username}: rola zmieniona.`);
    } else members.reload();
  };
  const reset = async (m: Member) => {
    try {
      const r = await api.post<{ password: string }>(`${base}${m.id}/password/`);
      setSecret({ username: m.username, password: r.password });
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const remove = async (m: Member) => {
    setConfirm(null);
    if (await run(() => api.delete(`${base}${m.id}/`, {}), setError)) {
      setError("");
      members.reload();
      toast(`Konto ${m.username} nie ma już dostępu do panelu.`);
    }
  };

  return (
    <section className="link-card settings-card">
      <h2>Konta pracowników</h2>
      <p className="hint">Kierownicy układają i publikują agendy; dyrektor dodatkowo zarządza kontami. Obsługa nie potrzebuje konta — ma link obsługi.</p>
      {error && <p className="error" role="alert">{error}</p>}
      {secret && (
        <div className="notice secret">
          <p>
            Hasło dla <strong>{secret.username}</strong> (pokazujemy je tylko teraz — przekaż osobiście, nie mailem):
          </p>
          <div className="url">
            <code>{secret.password}</code>
            <button className="btn" onClick={() => navigator.clipboard?.writeText(secret.password).then(() => toast("Hasło skopiowane."))}>Kopiuj</button>
            <button className="btn quiet" onClick={() => setSecret(null)}>Zapisane, ukryj</button>
          </div>
        </div>
      )}
      <ul className="settings-list">
        {members.data?.map((m) => (
          <li key={m.id}>
            <span className="settings-name">{m.username}{m.me ? " (Ty)" : ""}</span>
            <select aria-label={`Rola ${m.username}`} value={m.role} onChange={(e) => role(m, e.target.value)}>
              <option value="dyrektor">Dyrektor</option>
              <option value="kierownik">Kierownik</option>
            </select>
            <span className="settings-actions">
              <button className="btn quiet" onClick={() => reset(m)}>Nowe hasło</button>
              {!m.me && (confirm === m.id ? (
                <button className="btn danger" onClick={() => remove(m)}>Na pewno odebrać dostęp?</button>
              ) : (
                <button className="btn quiet" onClick={() => setConfirm(m.id)}>Usuń</button>
              ))}
            </span>
          </li>
        ))}
      </ul>
      <form className="inline-form" onSubmit={add}>
        <Field label="Login nowej osoby" hint="np. anna.kowalska — bez polskich znaków">{(id) => <input id={id} name="username" type="text" required minLength={3} maxLength={40} />}</Field>
        <Field label="Rola">
          {(id) => (
            <select id={id} name="role" defaultValue="kierownik">
              <option value="kierownik">Kierownik</option>
              <option value="dyrektor">Dyrektor</option>
            </select>
          )}
        </Field>
        <button className="btn primary">Dodaj konto</button>
      </form>
    </section>
  );
}

function MyAccount() {
  const toast = useToast();
  const [error, setError] = useState("");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    if (f.get("new") !== f.get("repeat")) return setError("Nowe hasło i powtórzenie się różnią");
    if (await run(() => api.post("/me/password/", { current: f.get("current"), new: f.get("new") }), setError)) {
      form.reset();
      setError("");
      toast("Hasło zmienione. Na innych urządzeniach zaloguj się ponownie.");
    }
  };
  return (
    <section className="link-card settings-card">
      <h2>Moje hasło</h2>
      <form className="inline-form" onSubmit={submit}>
        <Field label="Obecne hasło">{(id) => <input id={id} name="current" type="password" autoComplete="current-password" required />}</Field>
        <Field label="Nowe hasło" hint="Co najmniej 12 znaków">{(id) => <input id={id} name="new" type="password" autoComplete="new-password" required minLength={12} />}</Field>
        <Field label="Powtórz nowe">{(id) => <input id={id} name="repeat" type="password" autoComplete="new-password" required minLength={12} />}</Field>
        <button className="btn primary">Zmień hasło</button>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  );
}

function HotelData({ hotel }: { hotel: Hotel }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState("");
  const remove = async () => {
    try {
      const r = await api.delete<{ account_removed: boolean }>(`/hotels/${hotel.id}/`, { confirm: typed });
      window.location.assign(r.account_removed ? "/?usunieto=1" : "/panel");
    } catch (err) {
      setError((err as Error).message);
    }
  };
  return (
    <section className="link-card settings-card">
      <h2>Dane hotelu w Agendzie</h2>
      <p className="hint">Wszystko, co wpisaliście — grupy, punkty, karty zlecenia, sale, konta — należy do Was.</p>
      <div className="group-actions">
        <a className="btn" href={`/api/hotels/${hotel.id}/export/`}>Pobierz wszystkie dane (JSON)</a>
        <button className="btn danger" onClick={() => { setTyped(""); setError(""); setOpen(true); }}>Usuń hotel i wszystkie dane…</button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Usunąć hotel?">
        <div style={{ display: "grid", gap: 14 }}>
          <p>Usuniemy od razu i bez możliwości cofnięcia:</p>
          <ul>
            <li>wszystkie grupy z agendami, kartami zlecenia i publikacjami,</li>
            <li>sale, typowe punkty, logo i slajdy,</li>
            <li>linki ekranu, obsługi i gości — ekran w holu i telefony gości przestaną działać,</li>
            <li>konta pracowników, które nie mają innego hotelu (także Twoje — zostaniesz wylogowany).</li>
          </ul>
          <p>Jeśli chcesz zachować kopię, najpierw pobierz dane.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <Field label={`Wpisz nazwę hotelu: ${hotel.name}`}>
            {(id) => <input id={id} type="text" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />}
          </Field>
          <div className="dialog-actions">
            <button type="button" className="btn quiet" onClick={() => setOpen(false)}>Anuluj</button>
            <button className="btn danger" disabled={typed.trim() !== hotel.name.trim()} onClick={remove}>Usuń hotel na zawsze</button>
          </div>
        </div>
      </Dialog>
    </section>
  );
}
