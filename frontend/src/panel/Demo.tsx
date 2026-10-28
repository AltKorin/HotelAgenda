// The public sandbox („Wypróbuj demo”, backend agenda.demo): a button for the site and a bar for the panel.
import { useEffect, useState } from "react";
import { api, loadSession, useApi } from "./api.ts";

type Demo = { hotel: string; until: string; screen: string; staff: string; guests: { name: string; path: string }[] };

/** Shown only when the server has the demo on (DEMO_MAX > 0). */
export function DemoButton({ className = "btn big" }: { className?: string }) {
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/public-config/").then((r) => r.json()).then((c: { demo?: boolean }) => setOn(Boolean(c.demo))).catch(() => undefined);
  }, []);
  if (!on) return null;
  const start = async () => {
    setBusy(true);
    setError("");
    try {
      await loadSession(); // CSRF token for the POST
      await api.post("/demo/");
      window.location.assign("/panel");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <>
      <button className={className} onClick={start} disabled={busy}>{busy ? "Przygotowuję demo…" : "Wypróbuj demo — bez rejestracji"}</button>
      {error && <span className="error">{error}</span>}
    </>
  );
}

export function DemoBar() {
  const state = useApi<{ demo: Demo | null }>("/demo/");
  const demo = state.data?.demo;
  if (!demo) return null;
  const until = new Date(demo.until).toLocaleString("pl-PL", { weekday: "short", hour: "2-digit", minute: "2-digit" });
  const out = (href: string, label: string) => <a className="btn quiet" href={href} target="_blank" rel="noopener">{label} ↗</a>;
  return (
    <div className="demo-bar no-print">
      <p>
        <strong>Demo</strong> — twój własny hotel przykładowy. Klikaj śmiało, zniknie {until}. Zmień coś w agendzie, opublikuj i zobacz, jak to widzą inni:
      </p>
      <div className="demo-actions">
        {out(demo.screen, "Ekran w holu")}
        {demo.guests.map((g) => <span key={g.path}>{out(g.path, `Telefon gościa: ${g.name}`)}</span>)}
        {out(demo.staff, "Obsługa (karty zlecenia)")}
        <a className="btn primary" href="/rejestracja">Załóż własne konto</a>
      </div>
    </div>
  );
}
