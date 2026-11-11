// Public pages: landing with a working demo, registration, regulamin. Only here GA may run (consent.ts).
import "../screen/fonts.css";
import { useEffect, useId, useState, type FormEvent, type ReactNode } from "react";
import { api, loadSession } from "../panel/api.ts";
import { choose, readChoice, startAnalytics } from "./consent.ts";
import Landing from "./Landing.tsx";
import { SUDOMIE_HUB, SUDOMIE_PRODUCTS } from "./sudomie.ts";
import "../panel/panel.css"; // .btn, .error, .check — shared with the panel
import "./site.css";

export const PRIVACY = "https://sudomie.pl/polityka-prywatnosci.html#agenda";

export default function Site({ path }: { path: string }) {
  const page = /^\/rejestracja\/?$/.test(path) ? "register" : /^\/regulamin\/?$/.test(path) ? "terms" : "landing";
  useEffect(() => {
    document.title = { landing: "Agenda hotelowa — agenda grupy na ekranie, w telefonie i u obsługi", register: "Załóż konto — Agenda hotelowa", terms: "Regulamin — Agenda hotelowa" }[page];
  }, [page]);
  return (
    <div className="site">
      <header className="site-top">
        <a className="site-brand" href="/">Agenda hotelowa</a>
        <nav>
          <a href="/panel">Zaloguj się</a>
          {page !== "register" && <a className="btn primary" href="/rejestracja">Załóż konto</a>}
        </nav>
      </header>
      {page === "register" ? <Register /> : page === "terms" ? <Terms /> : <Landing />}
      <Footer />
      <ConsentBar />
    </div>
  );
}

function Footer() {
  return (
    <footer className="site-foot">
      <p>
        Agenda hotelowa jest darmowa. Prowadzi ją Komorowski &amp; Windorpski sp. z o.o., ul. Kawaleryjska 3, 83-400 Kościerzyna-Wybudowanie, KRS 0001265889, NIP 5911731573.
      </p>
      <p className="site-links">
        <a href="/regulamin">Regulamin</a>
        <a href={PRIVACY}>Polityka prywatności</a>
        <button className="link" onClick={() => window.dispatchEvent(new Event("cc:open"))}>Ustawienia cookies</button>
        <a href="mailto:kontakt@sudomie.pl">kontakt@sudomie.pl</a>
        <a href="tel:+48668341191">+48 668 341 191</a>
      </p>
      <nav className="sudomie-produkty" aria-labelledby="sudomie-tools-title">
        <strong id="sudomie-tools-title">Narzędzia sudomie</strong>
        <ul>
          {SUDOMIE_PRODUCTS.map((product) => (
            <li key={product.id}><a href={product.url} title={product.pl}>{product.name}</a></li>
          ))}
          <li><a href={SUDOMIE_HUB.url}>{SUDOMIE_HUB.pl}</a></li>
        </ul>
      </nav>
    </footer>
  );
}

function ConsentBar() {
  const [id, setId] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    startAnalytics().then((value) => {
      setId(value);
      setOpen(Boolean(value) && readChoice() === null);
    });
    const reopen = () => setOpen(true);
    window.addEventListener("cc:open", reopen);
    return () => window.removeEventListener("cc:open", reopen);
  }, []);
  if (!open) return null;
  const pick = (choice: "accepted" | "declined") => {
    choose(choice);
    setOpen(false);
  };
  return (
    <div className="cc-bar" role="region" aria-label="Zgoda na statystyki">
      <p>
        {id
          ? <>Używamy Google Analytics, żeby wiedzieć, jak korzystasz z tej strony. Bez zgody nie zapisujemy cookies statystycznych. <a href={PRIVACY}>Polityka prywatności</a></>
          : "Ta strona nie używa cookies statystycznych."}
      </p>
      {id ? (
        <span>
          <button className="btn primary" onClick={() => pick("accepted")}>Akceptuję</button>
          <button className="btn" onClick={() => pick("declined")}>Odrzucam</button>
        </span>
      ) : (
        <button className="btn" onClick={() => setOpen(false)}>Zamknij</button>
      )}
    </div>
  );
}

function Register() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [newsletter, setNewsletter] = useState(false);
  useEffect(() => {
    // Pole pokazujemy tylko, gdy wdrożenie ma klucz newslettera (flaga w public-config).
    fetch("/api/public-config/").then((r) => r.json()).then((c: { newsletter?: boolean }) => setNewsletter(Boolean(c.newsletter))).catch(() => undefined);
  }, []);
  useEffect(() => {
    loadSession().catch(() => undefined); // sets the CSRF cookie and token
  }, []);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("repeat")) return setError("Hasło i powtórzenie się różnią");
    setBusy(true);
    setError("");
    try {
      await api.post("/register/", {
        email: f.get("email"),
        hotel: f.get("hotel"),
        password: f.get("password"),
        accept: f.get("accept") === "on",
        website: f.get("website") ?? "",
        newsletter: f.get("newsletter") === "on",
      });
      window.gtag?.("event", "sign_up", { method: "email" });
      window.location.assign("/panel");
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <main className="site-narrow">
      <h1>Załóż konto hotelu</h1>
      <p className="lead">Za darmo, bez karty. Po założeniu od razu przygotujesz pierwszą agendę.</p>
      <form className="site-form" onSubmit={submit}>
        {error && <p className="error" role="alert">{error}</p>}
        <Labeled label="Nazwa hotelu lub ośrodka">
          {(id) => <input id={id} name="hotel" type="text" required maxLength={200} autoComplete="organization" />}
        </Labeled>
        <Labeled label="Twój e-mail" hint="Będzie Twoim loginem.">
          {(id) => <input id={id} name="email" type="email" required maxLength={150} autoComplete="email" />}
        </Labeled>
        <Labeled label="Hasło" hint="Co najmniej 12 znaków.">
          {(id) => <input id={id} name="password" type="password" required minLength={12} autoComplete="new-password" />}
        </Labeled>
        <Labeled label="Powtórz hasło">
          {(id) => <input id={id} name="repeat" type="password" required minLength={12} autoComplete="new-password" />}
        </Labeled>
        <div className="hp" aria-hidden="true">
          <label>
            Strona www
            <input name="website" type="text" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <label className="check">
          <input name="accept" type="checkbox" required />
          <span>
            Akceptuję <a href="/regulamin" target="_blank">regulamin</a> i zapoznałem/am się z{" "}
            <a href={PRIVACY} target="_blank" rel="noopener">polityką prywatności</a>.
          </span>
        </label>
        {newsletter && (
          <label className="check">
            <input name="newsletter" type="checkbox" />
            <span>Chcę dostawać newsletter sudomie raz w miesiącu: nowości w Agendzie i poradniki. Potwierdzę zapis linkiem z maila, wypiszę się w każdej chwili.</span>
          </label>
        )}
        <button className="btn primary big" disabled={busy}>{busy ? "Zakładam konto…" : "Załóż konto"}</button>
        <p className="hint">
          Zostaniesz dyrektorem hotelu w Agendzie: dodasz konta kierowników, sale i typowe punkty. Masz już konto? <a href="/panel">Zaloguj się</a>.
        </p>
      </form>
    </main>
  );
}

function Terms() {
  const [html, setHtml] = useState("");
  useEffect(() => {
    fetch("/api/terms/")
      .then((r) => r.json())
      .then((t: { html: string }) => setHtml(t.html))
      .catch(() => setHtml("<p>Nie udało się wczytać regulaminu. Odśwież stronę.</p>"));
  }, []);
  // Our own file from the backend (agenda/data/regulamin.html) — the same bytes whose hash we store.
  return (
    <main className="site-narrow terms">
      <h1>Regulamin Agendy hotelowej</h1>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </main>
  );
}

function Labeled({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <small>{hint}</small>}
    </div>
  );
}
