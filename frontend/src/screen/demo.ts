// Fictional demo for /ekran/demo, built around today so "teraz" is always visible.
// Mirrors the structure of the hotel's real slides (Materiały/), with invented names and logos.
import { addDays, localDate, zonedInstant } from "./slides.ts";
import type { ScreenData, ScreenPoint } from "./types.ts";

const TZ = "Europe/Warsaw";

export function demoScreen(now: Date): ScreenData {
  const today = localDate(now, TZ);
  const d1 = addDays(today, -1);
  const d3 = addDays(today, 1);
  let n = 0;
  const p = (
    date: string, from: string, to: string | null, title: string, places: string[], note = "",
    time_label: ScreenPoint["time_label"] = "range", changed = false,
  ): ScreenPoint => ({
    id: `p${++n}`,
    title,
    starts_at: zonedInstant(date, from, TZ).toISOString(),
    ends_at: to ? zonedInstant(date, to, TZ).toISOString() : null,
    time_label,
    places,
    note,
    changed,
  });
  const rooms = ["Sala Jodłowa", "Sala Grabowa", "Sala Bukowa", "Sala Modrzewiowa"];

  return {
    hotel: { name: "Hotel Bursztynowa Polana", logo: "/demo/hotel-logo.svg", timezone: TZ },
    slide_seconds: 12,
    refresh_seconds: 60,
    groups: [
      {
        id: "szkolenie",
        name: "Szkolenie wolontariuszy",
        theme: "granat-bursztyn",
        fonts: null,
        organizer: { name: "Fundacja Wspólna Droga", logo: "/demo/organizer-logo.svg", is_hotel: false },
        first_day: d1,
        last_day: d3,
        guest_url: "https://agenda.example.pl/g/demo-szkolenie",
        announcement: "Warsztat grupy B przeniesiony do Sali Grabowej.",
        welcome: "Serdecznie witamy. Życzymy owocnego szkolenia i miłego pobytu.",
        points: [
          p(d1, "14:30", "15:00", "Przyjazd", [], "Klucze do pokoi wydaje organizator"),
          p(d1, "16:30", "17:45", "Obiadokolacja", ["Restauracja Pod Lipami"]),
          p(d1, "17:45", "19:00", "Szkolenie", rooms),
          p(today, "08:00", "10:00", "Śniadanie", ["Restauracja Pod Lipami"]),
          p(today, "09:30", "17:00", "Szkolenie", rooms, "", "range", true),
          p(today, "11:30", "11:45", "Przerwa kawowa", ["Sala Jodłowa"]),
          p(today, "13:00", "14:00", "Obiad", ["Restauracja Pod Lipami"]),
          p(today, "16:00", "16:15", "Przerwa kawowa", ["Sala Jodłowa"]),
          p(today, "17:00", "18:00", "Obiadokolacja", ["Restauracja Pod Lipami"]),
          p(d3, "08:00", "10:00", "Śniadanie", ["Restauracja Pod Lipami"]),
          p(d3, "10:00", "14:00", "Szkolenie", rooms),
          p(d3, "10:00", "11:00", "Wymeldowanie", [], "Prosimy o zwolnienie pokoi", "until"),
          p(d3, "11:00", "11:30", "Przerwa kawowa", ["Sala Jodłowa"]),
          p(d3, "14:00", "15:00", "Obiad", ["Restauracja Pod Lipami"]),
          p(d3, "15:00", null, "Wyjazd", [], "Dziękujemy i zapraszamy ponownie", "approx"),
        ],
      },
      {
        id: "weekend",
        name: "Weekend z muzyką na żywo",
        theme: "braz-krem",
        fonts: "grand-hotel--lato",
        organizer: { name: "Hotel Bursztynowa Polana", logo: "/demo/hotel-logo.svg", is_hotel: true },
        first_day: today,
        last_day: d3,
        guest_url: "https://agenda.example.pl/g/demo-weekend",
        announcement: "",
        welcome: "Miłego weekendu w Bursztynowej Polanie.",
        points: [
          p(today, "15:00", "18:00", "Zameldowanie", ["Recepcja"]),
          p(today, "19:00", "23:00", "Kolacja przy muzyce", ["Restauracja Pod Lipami"], "Zagra duet akustyczny"),
          p(d3, "08:00", "10:30", "Śniadanie", ["Restauracja Pod Lipami"]),
          p(d3, "11:00", "12:00", "Spacer z przewodnikiem", ["Zbiórka przed recepcją"]),
          p(d3, "12:00", null, "Wymeldowanie", [], "", "until"),
        ],
      },
    ],
    hotel_slides: [{ id: "spa", image: "/demo/slajd-spa.svg", alt: "Strefa SPA czynna codziennie do 22:00" }],
  };
}
