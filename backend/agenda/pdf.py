"""Printable PDFs (A4): guest agenda, daily odprawa, karta zlecenia of one point.

Built ONLY from the projections in domain.py (guest_view / staff_view dicts), so a PDF can never
show more than the screen it belongs to. HTML builders are separate from rendering so tests can
inspect the exact text that goes into the file.
"""

from datetime import date, datetime
from pathlib import Path

from django.template.loader import render_to_string
from django.utils.text import slugify

from .domain import hotel_zone

FONTS = Path(__file__).parent / "fonts"
WEEKDAYS = ["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"]
MONTHS = ["stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca", "lipca", "sierpnia", "września",
          "października", "listopada", "grudnia"]


def local(value, tz):
    return datetime.fromisoformat(value).astimezone(tz) if value else None


def clock(moment):
    return f"{moment.hour}:{moment.minute:02d}" if moment else ""


def time_text(point, tz):
    start, end = clock(local(point["starts_at"], tz)), clock(local(point["ends_at"], tz))
    if point["time_label"] == "until":
        return f"do {end or start}"
    if point["time_label"] == "approx":
        return f"ok. {start}"
    return f"{start}–{end}" if end else start


def places_text(places):
    """'Sale: Jodłowa, Grabowa' like the lobby screen; mixed names stay as they are."""
    if len(places) < 2:
        return places[0] if places else ""
    if all(p.startswith("Sala ") for p in places):
        return "Sale: " + ", ".join(p[5:] for p in places)
    return ", ".join(places)


def day_title(day):
    return f"{WEEKDAYS[day.weekday()].capitalize()}, {day.day} {MONTHS[day.month - 1]}"


def day_range(first, last):
    first, last = date.fromisoformat(first), date.fromisoformat(last)
    if first == last:
        return f"{first.day} {MONTHS[first.month - 1]} {first.year}"
    if (first.year, first.month) == (last.year, last.month):
        return f"{first.day}–{last.day} {MONTHS[last.month - 1]} {last.year}"
    return f"{first.day} {MONTHS[first.month - 1]} – {last.day} {MONTHS[last.month - 1]} {last.year}"


def point_day(point, tz):
    return local(point["starts_at"] or point["ends_at"], tz).date()


def row(point, tz):
    cards = [
        {**card, "service": f"{clock(local(card['service_from'], tz))}–{clock(local(card['service_to'], tz))}".strip("–")}
        for card in point.get("cards", [])
    ]
    return {**point, "time": time_text(point, tz), "where": places_text(point["places"]), "cards": cards}


def by_day(points, tz):
    days = {}
    for point in points:
        days.setdefault(point_day(point, tz), []).append(row(point, tz))
    return [{"title": day_title(d), "date": d, "rows": rows} for d, rows in sorted(days.items())]


def file_name(prefix, *parts):
    text = "-".join(str(p) for p in parts).replace("ł", "l").replace("Ł", "L")
    return f"{prefix}-{slugify(text)[:60] or 'agenda'}.pdf"


# --- HTML builders ---------------------------------------------------------------------------

def guest_agenda_html(hotel, group, draft=False):
    tz = hotel_zone(hotel["timezone"])
    return render_to_string("agenda/pdf/guest.html", {
        "hotel": hotel, "group": group, "days": by_day(group["points"], tz),
        "range": day_range(group["first_day"], group["last_day"]), "draft": draft,
    })


def odprawa_html(hotel, day, groups):
    """groups: staff views of the groups in the hotel that day."""
    tz = hotel_zone(hotel["timezone"])
    sections = []
    for group in groups:
        rows = [row(p, tz) for p in group["points"] if point_day(p, tz) == day]
        if rows:
            sections.append({"group": group, "rows": rows})
    return render_to_string("agenda/pdf/odprawa.html", {"hotel": hotel, "day": day_title(day), "sections": sections})


def karta_html(hotel, group, point, draft=False):
    tz = hotel_zone(hotel["timezone"])
    return render_to_string("agenda/pdf/karta.html", {
        "hotel": hotel, "group": group, "point": row(point, tz),
        "day": day_title(point_day(point, tz)), "draft": draft,
    })


def qr_cards_html(hotel, group, url):
    """Four A6 cards per A4 sheet with the guest link as QR — for rooms and the reception desk."""
    import segno

    qr = segno.make(url, error="m").svg_inline(scale=4, dark="#1d3d4d", border=0)
    return render_to_string("agenda/pdf/qr.html", {
        "hotel": hotel, "group": group, "url": url, "qr": qr, "cards": range(4),
        "range": day_range(group["first_day"], group["last_day"]),
    })


def render(html):
    from weasyprint import HTML  # heavy import: only when a PDF is actually requested

    return HTML(string=html, base_url=str(FONTS)).write_pdf()
