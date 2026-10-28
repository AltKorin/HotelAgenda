// Colours and fonts are separate choices; picking colours switches to their proposed fonts,
// which can then be swapped for any other pairing. Used by /ekran/motywy and the panel.
import { MotionConfig } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { DayView } from "./Screen.tsx";
import { FONT_PAIRS, THEMES, resolveFonts, themeById } from "./themes.ts";
import type { DaySlide, ScreenData } from "./types.ts";
import "./screen.css";

export type Look = { theme: string; fonts: string };

export function LookPicker({ value, onChange, slide, data, now }: {
  value: Look;
  onChange: (look: Look) => void;
  slide: DaySlide | null;
  data: ScreenData;
  now: Date;
}) {
  const theme = themeById(value.theme);
  const fonts = resolveFonts(theme, value.fonts);
  return (
    <MotionConfig reducedMotion="always">
      <div className="picker-grid">
        <div className="picker-options">
          <fieldset>
            <legend>Kolory</legend>
            {THEMES.map((t) => (
              <label key={t.id} className="option">
                <input type="radio" name="motyw" checked={t.id === theme.id} onChange={() => onChange({ theme: t.id, fonts: t.fonts })} />
                <span className="swatches" aria-hidden="true">
                  {[t.colors.bg, t.colors.ink, t.colors.muted, t.colors.accent].map((c) => (
                    <i key={c} style={{ background: c }} />
                  ))}
                </span>
                <span className="option-name">{t.name}</span>
                {!t.dark && <span className="option-note">jasny</span>}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Czcionki</legend>
            {FONT_PAIRS.map((f) => (
              <label key={f.id} className="option">
                <input type="radio" name="czcionki" checked={f.id === fonts.id} onChange={() => onChange({ theme: theme.id, fonts: f.id })} />
                <span className="specimen" aria-hidden="true" style={{ fontFamily: f.display.family, fontWeight: f.display.weight }}>
                  Piątek
                </span>
                <span className="option-name" style={{ fontFamily: f.text.family }}>
                  {f.name}
                  <small>{f.mood}</small>
                  {f.id === theme.fonts && <span className="option-note">proponowane do tych kolorów</span>}
                </span>
              </label>
            ))}
          </fieldset>
        </div>
        <div className="picker-preview">
          {slide ? (
            <ScaledDay slide={slide} data={data} now={now} theme={theme.id} fonts={fonts.id} />
          ) : (
            <p className="picker-empty">Dodaj punkty agendy, żeby zobaczyć podgląd.</p>
          )}
          <p className="picker-caption">
            <strong>{theme.name}</strong> z czcionkami {fonts.name}
            <br />
            <span>Kolory ze Słownika Kolorów, połączenie {theme.slownik.split(":")[0]}</span>
          </p>
        </div>
      </div>
    </MotionConfig>
  );
}

/** A 1920×1080 day slide scaled into its box. */
export function ScaledDay(props: { slide: DaySlide; data: ScreenData; now: Date; theme?: string; fonts?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setScale(entry.contentRect.width / 1920));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="thumb" ref={box} role="img" aria-label={`Podgląd dnia ${props.slide.date}`}>
      <DayView {...props} still style={{ transform: `scale(${scale})` }} />
    </div>
  );
}
