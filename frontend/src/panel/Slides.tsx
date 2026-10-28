// Hotel's own slides in the lobby rotation (SPA, restauracja…). Live: no publishing, like the hotel logo.
import { useState, type FormEvent } from "react";
import { api, upload, useApi, type Hotel } from "./api.ts";
import { Field, useToast } from "./ui.tsx";

type Slide = {
  id: number;
  image: string;
  alt: string;
  order: number;
  state: "active" | "planned" | "ended";
  show_from: string | null;
  show_to: string | null;
};

const dayMonth = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" });
const fmt = (d: string) => dayMonth.format(new Date(`${d}T12:00:00Z`));

function windowText(s: Slide) {
  if (s.show_from && s.show_to) return `${fmt(s.show_from)} – ${fmt(s.show_to)}`;
  if (s.show_from) return `od ${fmt(s.show_from)}`;
  if (s.show_to) return `do ${fmt(s.show_to)}`;
  return "zawsze";
}

const STATE: Record<Slide["state"], [string, string]> = {
  active: ["Na ekranie", "badge agreed"],
  planned: ["Zaplanowany", "badge"],
  ended: ["Zakończony", "badge"],
};

export default function Slides({ hotel }: { hotel: Hotel }) {
  const base = `/hotels/${hotel.id}/slides/`;
  const slides = useApi<Slide[]>(base);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const list = slides.data ?? [];

  const add = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const file = f.get("file");
    if (!(file instanceof File) || !file.size) return setError("Wybierz plik ze slajdem");
    setBusy(true);
    setError("");
    try {
      const saved = await upload<Slide & { width: number; height: number }>(base, file, {
        alt: String(f.get("alt") ?? ""),
        show_from: String(f.get("show_from") ?? ""),
        show_to: String(f.get("show_to") ?? ""),
      });
      form.reset();
      slides.reload();
      const ratio = saved.width / saved.height;
      toast(
        Math.abs(ratio - 16 / 9) > 0.05
          ? "Slajd dodany, ale ma inne proporcje niż telewizor (16:9) — ekran przytnie brzegi. Najlepiej 1920 × 1080 px."
          : "Slajd dodany. Ekran pokaże go przy najbliższym odświeżeniu.",
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const move = async (index: number, by: -1 | 1) => {
    const ids = list.map((s) => s.id);
    [ids[index], ids[index + by]] = [ids[index + by], ids[index]];
    try {
      slides.set(await api.post<Slide[]>(`${base}order/`, { ids }));
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: number) => {
    try {
      await api.delete(`${base}${id}/`, {});
      setConfirm(null);
      slides.reload();
      toast("Slajd usunięty z ekranu.");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const saveDates = async (e: FormEvent<HTMLFormElement>, id: number) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await api.patch(`${base}${id}/`, { alt: f.get("alt"), show_from: f.get("show_from") || null, show_to: f.get("show_to") || null });
      setEditing(null);
      slides.reload();
      toast("Zapisano.");
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <section className="link-card slides-card">
      <div>
        <h2>Slajdy hotelu na ekranie</h2>
        <p className="hint">
          Pokazują się w holu między agendami grup, w tej kolejności. Najlepiej obraz 1920 × 1080 px (PNG, JPG albo WebP, do 5 MB).
          Daty są opcjonalne — np. promocja tylko w grudniu.
        </p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      {slides.data && list.length === 0 && <p className="hint">Nie ma jeszcze slajdów hotelu — ekran pokazuje tylko agendy grup.</p>}
      <ol className="slide-list">
        {list.map((s, i) => (
          <li key={s.id} className={s.state === "ended" ? "ended" : undefined}>
            <img src={s.image} alt={s.alt} />
            <div className="slide-info">
              <strong>{s.alt}</strong>
              <span>
                <span className={STATE[s.state][1]}>{STATE[s.state][0]}</span> {windowText(s)}
              </span>
              {editing === s.id ? (
                <form className="slide-edit" onSubmit={(e) => saveDates(e, s.id)}>
                  <Field label="Opis">{(id) => <input id={id} name="alt" type="text" defaultValue={s.alt} maxLength={200} />}</Field>
                  <div className="grid-2">
                    <Field label="Od">{(id) => <input id={id} name="show_from" type="date" defaultValue={s.show_from ?? ""} />}</Field>
                    <Field label="Do">{(id) => <input id={id} name="show_to" type="date" defaultValue={s.show_to ?? ""} />}</Field>
                  </div>
                  <div className="dialog-actions">
                    <button type="button" className="btn quiet" onClick={() => setEditing(null)}>Anuluj</button>
                    <button className="btn primary">Zapisz</button>
                  </div>
                </form>
              ) : (
                <div className="slide-actions">
                  <button className="btn quiet" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Przesuń „${s.alt}” wcześniej`}>↑</button>
                  <button className="btn quiet" disabled={i === list.length - 1} onClick={() => move(i, 1)} aria-label={`Przesuń „${s.alt}” później`}>↓</button>
                  <button className="btn quiet" onClick={() => setEditing(s.id)}>Opis i daty</button>
                  {confirm === s.id ? (
                    <button className="btn danger" onClick={() => remove(s.id)}>Na pewno usunąć?</button>
                  ) : (
                    <button className="btn quiet" onClick={() => setConfirm(s.id)}>Usuń</button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
      <form className="slide-add" onSubmit={add}>
        <h3 className="section-title">Dodaj slajd</h3>
        <Field label="Plik">{(id) => <input id={id} name="file" type="file" accept="image/png,image/jpeg,image/webp" required />}</Field>
        <Field label="Co jest na slajdzie" hint="Krótko, np. „Strefa SPA czynna do 22:00” — dla czytników ekranu i dla Was na liście.">
          {(id) => <input id={id} name="alt" type="text" maxLength={200} />}
        </Field>
        <div className="grid-2">
          <Field label="Pokazuj od (opcjonalnie)">{(id) => <input id={id} name="show_from" type="date" />}</Field>
          <Field label="Pokazuj do (opcjonalnie)">{(id) => <input id={id} name="show_to" type="date" />}</Field>
        </div>
        <div>
          <button className="btn primary" disabled={busy}>{busy ? "Wgrywanie…" : "Dodaj slajd"}</button>
        </div>
      </form>
    </section>
  );
}
