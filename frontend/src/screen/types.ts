// Shape of GET /api/ekran/<token>/ — the published guest view of every group in a hotel.

export type TimeLabel = "range" | "until" | "approx";

export type ScreenPoint = {
  id: string;
  title: string;
  starts_at: string; // ISO with offset
  ends_at: string | null;
  time_label: TimeLabel;
  places: string[];
  note: string;
  changed: boolean;
};

export type ScreenGroup = {
  id: string;
  name: string;
  theme: string; // colour theme id (themes.json), chosen by whoever enters the agenda
  fonts: string | null; // font pairing id (fonts.json); null = the theme's proposed pairing
  organizer: { name: string; logo: string | null; is_hotel: boolean };
  first_day: string; // YYYY-MM-DD in hotel timezone
  last_day: string;
  guest_url: string;
  announcement: string;
  welcome: string;
  points: ScreenPoint[];
};

export type HotelSlide = { id: string; image: string; alt: string };

export type ScreenData = {
  hotel: { name: string; logo: string | null; timezone: string };
  slide_seconds: number;
  refresh_seconds: number;
  groups: ScreenGroup[];
  hotel_slides: HotelSlide[];
};

export type DaySlide = {
  kind: "day";
  key: string;
  group: ScreenGroup;
  date: string;
  dayNumber: number;
  dayCount: number;
  points: ScreenPoint[];
};

export type Slide = DaySlide | { kind: "hotel"; key: string; slide: HotelSlide };
