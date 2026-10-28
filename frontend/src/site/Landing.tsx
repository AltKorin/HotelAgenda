// Landing: the product shown working, on the same fictional demo as /ekran/demo — no iframes
// (CSP frame-ancestors 'none'), the real DayView and GuestView components instead.
import { MotionConfig } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { GuestView } from "../guest/Guest.tsx";
import { DemoButton } from "../panel/Demo.tsx";
import { ScaledDay } from "../screen/LookPicker.tsx";
import { demoScreen } from "../screen/demo.ts";
import { buildSlides } from "../screen/slides.ts";
import { THEMES } from "../screen/themes.ts";
import type { DaySlide } from "../screen/types.ts";

const SLIDE_MS = 6000;

export default function Landing() {
  const [now] = useState(() => new Date());
  const [theme, setTheme] = useState("granat-bursztyn");
  const data = useMemo(() => {
    const demo = demoScreen(now);
    demo.groups[0] = { ...demo.groups[0], theme, fonts: null };
    return demo;
  }, [now, theme]);
  const days = useMemo(
    () => buildSlides(data, now).filter((s): s is DaySlide => s.kind === "day" && s.group.id === data.groups[0].id),
    [data, now],
  );
  const [index, setIndex] = useState(1); // day 2 = today in the demo, with "teraz" visible
  useEffect(() => {
    const id = window.setInterval(() => setIndex((i) => (i + 1) % days.length), SLIDE_MS);
    return () => window.clearInterval(id);
  }, [days.length]);
  const deleted = new URLSearchParams(window.location.search).has("usunieto");

  return (
    <main>
      {deleted && <p className="site-notice" role="status">Hotel i jego dane zostały usunięte. Dziękujemy, że korzystaliście z Agendy.</p>}
      <section className="hero">
        <div className="hero-text">
          <p className="kicker">Dla hoteli, ośrodków konferencyjnych i centrów szkoleniowych</p>
          <h1>Agenda grupy na ekranie w holu, w telefonie gościa i u obsługi — wpisujesz raz</h1>
          <p className="lead">
            Program szkolenia, posiłki, sale i zmiany w ostatniej chwili w jednym miejscu. Goście widzą aktualny plan, obsługa wie, co
            przygotować. Za darmo, w przeglądarce, bez instalacji.
          </p>
          <p className="hero-actions">
            <a className="btn primary big" href="/rejestracja">Załóż konto za darmo</a>
            <DemoButton />
            <a className="btn big" href="#jak-to-dziala">Jak to działa</a>
          </p>
        </div>
      </section>

      <section className="demo" aria-label="Działające demo na przykładowej grupie">
        <MotionConfig reducedMotion="always">
          <div className="demo-stage">
            <figure className="tv">
              {days[index % days.length] && <ScaledDay key={`${theme}:${index}`} slide={days[index % days.length]} data={data} now={now} />}
              <figcaption>Ekran w holu — dni pobytu zmieniają się same, kod QR prowadzi do telefonu</figcaption>
            </figure>
            <figure className="phone">
              <div className="phone-screen">
                <GuestView hotel={data.hotel} group={data.groups[0]} />
              </div>
              <figcaption>Telefon gościa — „teraz” i „następnie”</figcaption>
            </figure>
          </div>
        </MotionConfig>
        <fieldset className="demo-themes">
          <legend>Kolory grupy — wybierz, tak samo zrobisz w panelu:</legend>
          {THEMES.map((t) => (
            <label key={t.id} title={t.name}>
              <input type="radio" name="demo-theme" checked={t.id === theme} onChange={() => setTheme(t.id)} />
              <span className="swatches" aria-hidden="true">
                {[t.colors.bg, t.colors.ink, t.colors.accent].map((c) => <i key={c} style={{ background: c }} />)}
              </span>
              <span className="sr-only">{t.name}</span>
            </label>
          ))}
          <a href="/ekran/motywy">Wszystkie kolory i czcionki</a>
          <a href="/ekran/demo">Demo ekranu na pełnym ekranie</a>
        </fieldset>
      </section>

      <section id="jak-to-dziala" className="steps">
        <h2>Jak to działa</h2>
        <ol>
          <li>
            <h3>Wpisujesz agendę</h3>
            <p>Punkty programu, godziny i sale. Śniadanie, obiad czy przerwę kawową wstawiasz jednym kliknięciem z typowych punktów hotelu.</p>
          </li>
          <li>
            <h3>Publikujesz</h3>
            <p>Ekran w holu i telefony gości pokazują nową wersję w ciągu minuty. Zmienione punkty są oznaczone, ogłoszenie widać od razu.</p>
          </li>
          <li>
            <h3>Obsługa wie, co robić</h3>
            <p>Karty zlecenia dla kuchni i sal: ile osób, ustawienie, menu, kto odpowiada. Odprawa na dzień i agenda A4 w PDF.</p>
          </li>
        </ol>
      </section>

      <section className="faq">
        <h2>Pytania</h2>
        <dl>
          <dt>Ile to kosztuje?</dt>
          <dd>Nic. Agenda hotelowa jest darmowa, nie prosimy o kartę.</dd>
          <dt>Czy goście muszą coś instalować?</dt>
          <dd>Nie. Kod QR na ekranie lub na stole otwiera agendę grupy w przeglądarce telefonu. Bez konta i bez aplikacji.</dd>
          <dt>Czego potrzebuję na ekran w holu?</dt>
          <dd>Telewizora i dowolnego komputera lub przystawki z przeglądarką. Gdy zniknie internet, ekran pokazuje ostatnią wersję.</dd>
          <dt>Kto ma dostęp?</dt>
          <dd>Dyrektor i kierownicy mają konta. Obsługa dostaje wspólny link do kart zlecenia — bez haseł.</dd>
          <dt>Co z danymi gości?</dt>
          <dd>Nie zbieramy ich. Agenda dotyczy grupy, nie osób. Swoje dane pobierzesz w każdej chwili, a hotel usuniesz jednym przyciskiem.</dd>
        </dl>
        <p className="hero-actions">
          <a className="btn primary big" href="/rejestracja">Załóż konto za darmo</a>
          <DemoButton />
        </p>
      </section>
    </main>
  );
}
