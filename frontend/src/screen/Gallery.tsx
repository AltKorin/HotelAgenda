// /ekran/motywy — look configurator on demo content; choice kept in the URL so it can be shared.
import { useEffect, useState } from "react";
import { LookPicker, type Look } from "./LookPicker.tsx";
import { demoScreen } from "./demo.ts";
import { buildSlides, localDate } from "./slides.ts";
import { resolveFonts, themeById } from "./themes.ts";
import type { DaySlide } from "./types.ts";

export default function Gallery() {
  const [look, setLook] = useState<Look>(() => {
    const query = new URLSearchParams(window.location.search);
    const theme = themeById(query.get("motyw"));
    return { theme: theme.id, fonts: resolveFonts(theme, query.get("czcionki")).id };
  });
  const [now] = useState(() => new Date());
  const data = demoScreen(now);
  const today = localDate(now, data.hotel.timezone);
  const slide = buildSlides(data, now).find(
    (s): s is DaySlide => s.kind === "day" && s.group.id === "szkolenie" && s.date === today,
  )!;

  useEffect(() => {
    window.history.replaceState(null, "", `/ekran/motywy?motyw=${look.theme}&czcionki=${look.fonts}`);
  }, [look]);

  return (
    <main className="picker">
      <header className="picker-head">
        <h1>Wygląd ekranu</h1>
        <p>
          Wybierz kolory, a potem czcionki. Każde kolory mają proponowane czcionki, ale możesz wziąć dowolne inne. Pary
          czcionek pochodzą z zestawienia Figmy; zostawiliśmy tylko te z polskimi znakami.
        </p>
      </header>
      <LookPicker value={look} onChange={setLook} slide={slide} data={data} now={now} />
      <p className="picker-open">
        <a className="open" href={`/ekran/demo?motyw=${look.theme}&czcionki=${look.fonts}`}>
          Otwórz na pełnym ekranie
        </a>
      </p>
    </main>
  );
}
