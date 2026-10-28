import { AnimatePresence, MotionConfig, motion } from "motion/react";
import QRCode from "qrcode";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useScreenData } from "./data.ts";
import { buildSlides, localDate, localTime, placesText, pointState, startsTodayFirst, timeText } from "./slides.ts";
import { lookStyle, qrColor, resolveFonts, themeById } from "./themes.ts";
import type { DaySlide, ScreenData } from "./types.ts";
import "./screen.css";

const STAGE_W = 1920;
const STAGE_H = 1080;

function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const fit = () => setScale(Math.min(window.innerWidth / STAGE_W, window.innerHeight / STAGE_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return scale;
}

function useNow(everyMs: number) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), everyMs);
    return () => window.clearInterval(id);
  }, [everyMs]);
  return now;
}

export default function Screen({ token, theme, fonts }: { token: string; theme?: string; fonts?: string }) {
  const data = useScreenData(token);
  const scale = useStageScale();
  const now = useNow(10_000);
  const tz = data?.hotel.timezone ?? "Europe/Warsaw";
  const today = localDate(now, tz);
  // Rebuild the rotation when the agenda or the calendar day changes, not on every clock tick.
  const slides = useMemo(() => (data ? buildSlides(data, now) : []), [data, today]); // eslint-disable-line react-hooks/exhaustive-deps
  // Start each day on today's slide, decided during render so day 1 never flashes first.
  const [rotation, setRotation] = useState({ key: "", index: 0 });
  const rotationKey = `${today}:${slides.length}`;
  if (data && slides.length && rotation.key !== rotationKey) {
    setRotation({ key: rotationKey, index: startsTodayFirst(slides, data, now) });
  }
  const index = rotation.index;
  const seconds = data?.slide_seconds ?? 12;

  useEffect(() => {
    if (slides.length < 2) return;
    const id = window.setTimeout(() => setRotation((r) => ({ ...r, index: (r.index + 1) % slides.length })), seconds * 1000);
    return () => window.clearTimeout(id);
  }, [index, slides.length, seconds]);

  const slide = slides.length ? slides[index % slides.length] : null;

  return (
    <MotionConfig reducedMotion="user">
      <div className="screen-viewport">
        <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
          <AnimatePresence>
            {slide && (
              <motion.div
                key={slide.key}
                className="slide"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeInOut" }}
              >
                {slide.kind === "day" ? (
                  <DayView slide={slide} data={data!} now={now} theme={theme} fonts={fonts} />
                ) : (
                  <img className="hotel-slide" src={slide.slide.image} alt={slide.slide.alt} />
                )}
              </motion.div>
            )}
          </AnimatePresence>
          {!slide && data && <Idle data={data} />}
          {slide && slides.length > 1 && (
            <div key={`${slide.key}:${index}`} className="progress" style={{ animationDuration: `${seconds}s` }} />
          )}
        </div>
      </div>
    </MotionConfig>
  );
}

function Idle({ data }: { data: ScreenData }) {
  return (
    <div className="slide idle">
      {data.hotel.logo ? <img src={data.hotel.logo} alt={data.hotel.name} /> : <p>{data.hotel.name}</p>}
    </div>
  );
}

const weekday = new Intl.DateTimeFormat("pl-PL", { weekday: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("pl-PL", { day: "numeric", month: "long", timeZone: "UTC" });
const noonUtc = (date: string) => new Date(`${date}T12:00:00Z`);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function DayView({ slide, data, now, theme: themeOverride, fonts: fontsOverride, style, still = false }: {
  slide: DaySlide;
  data: ScreenData;
  now: Date;
  theme?: string;
  fonts?: string;
  style?: CSSProperties;
  still?: boolean; // previews render settled, without the entry sequence
}) {
  const theme = themeById(themeOverride ?? slide.group.theme);
  const fonts = resolveFonts(theme, fontsOverride ?? slide.group.fonts);
  const tz = data.hotel.timezone;
  const { group } = slide;
  const isToday = slide.date === localDate(now, tz);
  const rowHeight = Math.min(88, 430 / slide.points.length);

  return (
    <div className="day" style={{ ...lookStyle(theme, fonts), ...style }}>
      <header className="brand">
        {!group.organizer.is_hotel && group.organizer.logo && (
          <img className="logo" src={group.organizer.logo} alt={group.organizer.name} />
        )}
        {data.hotel.logo && <img className="logo hotel" src={data.hotel.logo} alt={data.hotel.name} />}
      </header>

      <section className="body">
        <div className="title-row">
          <h1>
            {capitalize(weekday.format(noonUtc(slide.date)))}
            <span className="date">{dayMonth.format(noonUtc(slide.date))}</span>
          </h1>
          <time className="clock">{localTime(now, tz)}</time>
        </div>
        <p className="group-line">
          <span className="group-name">{group.name}</span>
          {slide.dayCount > 1 && (
            <span className="day-count">
              dzień {slide.dayNumber} z {slide.dayCount}
            </span>
          )}
        </p>

        <ol className="points" style={{ ["--row" as string]: `${rowHeight}px` }}>
          {slide.points.map((point, i) => {
            const state = isToday ? pointState(point, now) : "later";
            return (
              <motion.li
                key={point.id}
                className={`point ${state}`}
                initial={still ? false : { opacity: 0, x: -28 }}
                animate={{ opacity: state === "past" ? 0.42 : 1, x: 0 }}
                transition={{ delay: 0.25 + i * 0.07, duration: 0.5, ease: "easeOut" }}
              >
                <span className="time">{timeText(point, tz)}</span>
                <span className="what">
                  {point.title}
                  {point.changed && <em className="changed">zmiana</em>}
                </span>
                <span className="where">
                  {placesText(point.places)}
                  {point.note && <span className={point.places.length ? "note" : undefined}>{point.note}</span>}
                </span>
              </motion.li>
            );
          })}
        </ol>
      </section>

      <footer className="foot">
        {group.announcement ? (
          <p className="announcement">{group.announcement}</p>
        ) : (
          <p className="welcome">{group.welcome}</p>
        )}
        {group.guest_url && <Qr url={group.guest_url} color={qrColor(theme)} />}
      </footer>
    </div>
  );
}

function Qr({ url, color }: { url: string; color: string }) {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    QRCode.toString(url, { type: "svg", margin: 0, color: { dark: color, light: "#0000" } })
      .then(setSvg)
      .catch(() => setSvg(""));
  }, [url, color]);
  return (
    <div className="qr">
      {/* qrcode emits only <svg>/<path> markup generated locally from the URL */}
      <div className="qr-code" dangerouslySetInnerHTML={{ __html: svg }} />
      <span>Agenda w telefonie</span>
    </div>
  );
}
