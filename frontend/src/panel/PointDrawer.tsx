// One point of the agenda + its karty zlecenia (one per room). Guests see only name, time, room and note.
import { useState, type FormEvent } from "react";
import type { EditorPoint, Kind, Placement, Space } from "./api.ts";
import { endsNextDay, serviceTime, splitLocal, toApiTimes, type TimeLabel } from "./time.ts";
import { Dialog, Field, Segmented, dayTab } from "./ui.tsx";

export type PointBody = Omit<EditorPoint, "id">;

type CardForm = {
  space: string;
  subgroup: string;
  headcount: string;
  setup: string;
  menu: string;
  items: string;
  todo: string;
  responsible: string;
  serviceFrom: string;
  serviceTo: string;
};

const emptyCard = (space = ""): CardForm => ({
  space, subgroup: "", headcount: "", setup: "", menu: "", items: "", todo: "", responsible: "", serviceFrom: "", serviceTo: "",
});

function toCard(p: Placement): CardForm {
  return {
    space: p.space,
    subgroup: p.subgroup,
    headcount: p.headcount == null ? "" : String(p.headcount),
    setup: p.setup,
    menu: p.menu,
    items: p.required_items.join("\n"),
    todo: p.todo,
    responsible: p.responsible,
    serviceFrom: splitLocal(p.service_from).time,
    serviceTo: splitLocal(p.service_to).time,
  };
}

export default function PointDrawer({ open, point, day, days, kinds, spaces, kartaUrl, onClose, onSave, onDelete, onAddSpace }: {
  open: boolean;
  point: EditorPoint | null;
  day: string;
  days: string[];
  kinds: Kind[];
  spaces: Space[];
  kartaUrl?: string;
  onClose: () => void;
  onSave: (body: PointBody) => Promise<string | null>;
  onDelete: () => Promise<string | null>;
  onAddSpace: (name: string) => Promise<Space>;
}) {
  const startDay = splitLocal(point?.starts_at ?? point?.ends_at ?? null).day || day;
  const [pointDay, setPointDay] = useState(startDay);
  const [kind, setKind] = useState(point?.kind ?? kinds[0]?.id ?? "inne");
  const [title, setTitle] = useState(point?.title ?? "");
  const [label, setLabel] = useState<TimeLabel>(point?.time_label ?? "range");
  const [start, setStart] = useState(splitLocal(point?.starts_at ?? null).time);
  const [end, setEnd] = useState(splitLocal(point?.ends_at ?? null).time);
  const [visibility, setVisibility] = useState(point?.visibility ?? "guests");
  const [realizer, setRealizer] = useState(point?.realizer ?? "hotel");
  const [note, setNote] = useState(point?.guest_note ?? "");
  const [cards, setCards] = useState<CardForm[]>(point?.placements.map(toCard) ?? []);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const hints = new Set(kinds.find((k) => k.id === kind)?.card_hints ?? []);

  const setCard = (i: number, patch: Partial<CardForm>) => setCards((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const times = toApiTimes(pointDay, { label, start, end });
    if ("error" in times) return setError(times.error);
    for (const c of cards) {
      if (!c.space) return setError("Wybierz salę w każdej karcie zlecenia albo usuń pustą kartę.");
      if (c.headcount && !/^\d+$/.test(c.headcount.trim())) return setError("Liczba osób musi być liczbą.");
    }
    setSaving(true);
    const result = await onSave({
      kind,
      title,
      time_label: label,
      ...times,
      visibility,
      realizer,
      guest_note: note,
      placements: cards.map((c) => ({
        space: c.space,
        subgroup: c.subgroup,
        headcount: c.headcount.trim() ? Number(c.headcount) : null,
        setup: c.setup,
        menu: c.menu,
        required_items: c.items.split("\n").map((s) => s.trim()).filter(Boolean),
        todo: c.todo,
        responsible: c.responsible,
        service_from: serviceTime(pointDay, c.serviceFrom),
        service_to: serviceTime(pointDay, c.serviceTo),
      })),
    });
    setSaving(false);
    setError(result ?? "");
  };

  return (
    <Dialog open={open} side onClose={onClose} title={point ? "Punkt agendy" : "Nowy punkt"}>
      <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
        {error && <p className="error" role="alert">{error}</p>}
        <div className="grid-2">
          <Field label="Rodzaj">
            {(id) => (
              <select id={id} value={kind} onChange={(e) => setKind(e.target.value)}>
                {kinds.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
              </select>
            )}
          </Field>
          <Field label="Dzień">
            {(id) => (
              <select id={id} value={pointDay} onChange={(e) => setPointDay(e.target.value)}>
                {days.map((d) => { const t = dayTab(d); return <option key={d} value={d}>{t.weekday} {t.date}</option>; })}
              </select>
            )}
          </Field>
        </div>
        <Field label="Nazwa" hint="Tak jak na ekranie w holu, np. „Obiad”, „Szkolenie”.">
          {(id) => <input id={id} type="text" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} />}
        </Field>
        <Segmented label="Godzina" value={label} onChange={setLabel} options={[["range", "od – do"], ["until", "do"], ["approx", "około"]]} />
        <div className="grid-2">
          {label !== "until" && (
            <Field label={label === "approx" ? "Około" : "Od"}>
              {(id) => <input id={id} type="time" value={start} onChange={(e) => setStart(e.target.value)} required />}
            </Field>
          )}
          {label !== "approx" && (
            <Field label="Do" hint={endsNextDay({ label, start, end }) ? "Kończy się następnego dnia." : undefined}>
              {(id) => <input id={id} type="time" value={end} onChange={(e) => setEnd(e.target.value)} required />}
            </Field>
          )}
        </div>
        <Segmented label="Kto widzi" value={visibility} onChange={setVisibility} options={[["guests", "Goście i obsługa"], ["staff", "Tylko obsługa"]]} />
        <Segmented label="Kto realizuje" value={realizer} onChange={setRealizer} options={[["hotel", "Hotel"], ["organizer", "Organizator"]]} />
        {visibility === "guests" && (
          <Field label="Uwaga dla gości" hint="Krótko, np. „Klucze wydaje organizator”.">
            {(id) => <input id={id} type="text" value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />}
          </Field>
        )}

        {kartaUrl && (
          <p className="hint" style={{ margin: 0 }}>
            <a href={kartaUrl}>Pobierz kartę zlecenia do druku (PDF)</a> — wersja zapisana, bez niezapisanych zmian z tego formularza.
          </p>
        )}
        <h3 className="section-title">
          Sale i karty zlecenia <small>— widzi tylko obsługa (oprócz nazwy sali)</small>
        </h3>
        {cards.map((c, i) => (
          <Card
            key={i}
            card={c}
            spaces={spaces}
            hints={hints}
            onChange={(patch) => setCard(i, patch)}
            onRemove={() => setCards((cs) => cs.filter((_, j) => j !== i))}
            onAddSpace={onAddSpace}
          />
        ))}
        <button type="button" className="btn" onClick={() => setCards((cs) => [...cs, emptyCard()])}>
          {cards.length ? "Dodaj kolejną salę" : "Dodaj salę i kartę zlecenia"}
        </button>

        <div className="dialog-actions">
          {point && (
            confirmDelete ? (
              <button type="button" className="btn danger" onClick={async () => { const e = await onDelete(); if (e) setError(e); }}>
                Na pewno usunąć?
              </button>
            ) : (
              <button type="button" className="btn danger" onClick={() => setConfirmDelete(true)}>Usuń punkt</button>
            )
          )}
          <button type="button" className="btn quiet" onClick={onClose}>Anuluj</button>
          <button className="btn primary" disabled={saving}>{saving ? "Zapisywanie…" : "Zapisz punkt"}</button>
        </div>
      </form>
    </Dialog>
  );
}

function Card({ card, spaces, hints, onChange, onRemove, onAddSpace }: {
  card: CardForm;
  spaces: Space[];
  hints: Set<string>;
  onChange: (patch: Partial<CardForm>) => void;
  onRemove: () => void;
  onAddSpace: (name: string) => Promise<Space>;
}) {
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");
  const add = async () => {
    try {
      const space = await onAddSpace(newName);
      onChange({ space: space.id });
      setAdding(false);
      setNewName("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  // Fields the point's kind usually needs come first; the rest stay one click away.
  const [more, setMore] = useState(false);
  const show = (field: string) => more || hints.has(field) || Boolean(card[field as keyof CardForm]);

  return (
    <div className="placement">
      <div className="placement-head">
        {adding ? (
          <>
            <Field label="Nazwa nowej sali">{(id) => <input id={id} type="text" value={newName} onChange={(e) => setNewName(e.target.value)} />}</Field>
            <button type="button" className="btn primary" onClick={add} disabled={!newName.trim()}>Dodaj</button>
            <button type="button" className="btn quiet" onClick={() => setAdding(false)}>Anuluj</button>
          </>
        ) : (
          <>
            <Field label="Sala">
              {(id) => (
                <select id={id} value={card.space} onChange={(e) => (e.target.value === "__new" ? setAdding(true) : onChange({ space: e.target.value }))}>
                  <option value="">Wybierz salę…</option>
                  {spaces.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  <option value="__new">Nowa sala…</option>
                </select>
              )}
            </Field>
            <button type="button" className="btn quiet" onClick={onRemove} aria-label="Usuń tę salę z punktu">Usuń</button>
          </>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      <div className="grid-2">
        <Field label="Podgrupa">{(id) => <input id={id} type="text" value={card.subgroup} onChange={(e) => onChange({ subgroup: e.target.value })} placeholder="np. Grupa A" />}</Field>
        <Field label="Liczba osób">{(id) => <input id={id} type="number" min={0} inputMode="numeric" value={card.headcount} onChange={(e) => onChange({ headcount: e.target.value })} />}</Field>
        <Field label="Odpowiedzialny">{(id) => <input id={id} type="text" value={card.responsible} onChange={(e) => onChange({ responsible: e.target.value })} placeholder="np. Kuchnia — p. Ania" />}</Field>
        <div className="times">
          <Field label="Obsługa od">{(id) => <input id={id} type="time" value={card.serviceFrom} onChange={(e) => onChange({ serviceFrom: e.target.value })} />}</Field>
          <Field label="do">{(id) => <input id={id} type="time" value={card.serviceTo} onChange={(e) => onChange({ serviceTo: e.target.value })} />}</Field>
        </div>
      </div>
      {show("setup") && <Field label="Ustawienie sali">{(id) => <input id={id} type="text" value={card.setup} onChange={(e) => onChange({ setup: e.target.value })} placeholder="np. teatralne, 3 stoły po 4 osoby" />}</Field>}
      {show("menu") && <Field label="Menu">{(id) => <textarea id={id} value={card.menu} onChange={(e) => onChange({ menu: e.target.value })} />}</Field>}
      {show("items") || hints.has("required_items") ? (
        <Field label="Niezbędne elementy" hint="Jeden w linii, np. rzutnik, flipchart.">{(id) => <textarea id={id} value={card.items} onChange={(e) => onChange({ items: e.target.value })} />}</Field>
      ) : null}
      {show("todo") && <Field label="Co trzeba zrobić">{(id) => <textarea id={id} value={card.todo} onChange={(e) => onChange({ todo: e.target.value })} />}</Field>}
      {!more && <button type="button" className="btn quiet" onClick={() => setMore(true)}>Pokaż wszystkie pola karty</button>}
    </div>
  );
}
