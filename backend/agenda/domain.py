"""Validation of untrusted input and the two published projections (guest, staff).

Guest projection is an explicit whitelist built from the model, never a filtered staff view:
a field added to the karta zlecenia can only reach guests if someone writes it here on purpose.
"""

import json
import re
import uuid
from datetime import date, datetime, timedelta, timezone as dt_timezone
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from core.domain_errors import DomainError
from core.transport import storage_string

KIND_LIST = json.loads((Path(__file__).parent / "data" / "point_kinds.json").read_text())
POINT_KINDS = {k["id"] for k in KIND_LIST}
SLUG = re.compile(r"[a-z0-9-]{0,80}")
MAX_POINT_HOURS = 24
MAX_GROUP_DAYS = 62
MAX_PLACEMENTS = 20


def body_object(data):
    if not isinstance(data, dict):
        raise DomainError("Oczekiwano obiektu JSON")
    return data


def identifier(value, what="Obiekt"):
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        raise DomainError(f"{what}: nie znaleziono", 404) from None


def text(data, key, limit, required=False, label=None):
    value = data.get(key, "")
    label = label or key
    if value is None:
        value = ""
    if not isinstance(value, str):
        raise DomainError(f"Pole „{label}”: oczekiwano tekstu")
    value = storage_string(value).strip()
    if required and not value:
        raise DomainError(f"Pole „{label}” jest wymagane")
    if len(value) > limit:
        raise DomainError(f"Pole „{label}”: maksymalnie {limit} znaków")
    return value


def boolean(data, key, default=False):
    value = data.get(key, default)
    if not isinstance(value, bool):
        raise DomainError(f"Pole „{key}”: oczekiwano tak/nie")
    return value


def slug(data, key):
    value = data.get(key, "") or ""
    if not isinstance(value, str) or not SLUG.fullmatch(value):
        raise DomainError(f"Pole „{key}”: nieprawidłowy identyfikator")
    return value


def calendar_day(data, key):
    value = data.get(key)
    if not isinstance(value, str):
        raise DomainError(f"Pole „{key}”: oczekiwano daty RRRR-MM-DD")
    try:
        return date.fromisoformat(value)
    except ValueError:
        raise DomainError(f"Pole „{key}”: oczekiwano daty RRRR-MM-DD") from None


def hotel_zone(name):
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        raise DomainError("Nieznana strefa czasowa hotelu") from None


def local_moment(value, tz, label):
    """'2026-10-10T09:30' in hotel wall-clock time → aware datetime. Rejects DST gaps."""
    if not isinstance(value, str) or len(value) > 40:
        raise DomainError(f"Pole „{label}”: oczekiwano daty i godziny")
    try:
        parsed = datetime.fromisoformat(value)
    except ValueError:
        raise DomainError(f"Pole „{label}”: oczekiwano daty i godziny") from None
    if parsed.tzinfo is not None:
        return parsed.astimezone(tz)
    aware = parsed.replace(tzinfo=tz)
    if aware.astimezone(dt_timezone.utc).astimezone(tz).replace(tzinfo=None) != parsed:
        raise DomainError(f"Pole „{label}”: tej godziny nie ma w strefie hotelu (zmiana czasu)")
    return aware


def optional_moment(data, key, tz, label):
    value = data.get(key)
    return None if value in (None, "") else local_moment(value, tz, label)


def group_values(data, partial=False):
    body_object(data)
    values = {}
    fields = {
        "name": lambda: text(data, "name", 200, True, "nazwa grupy"),
        "organizer_name": lambda: text(data, "organizer_name", 200, True, "organizator"),
        "organizer_is_hotel": lambda: boolean(data, "organizer_is_hotel"),
        "organizer_logo": lambda: text(data, "organizer_logo", 300),
        "agreed": lambda: boolean(data, "agreed"),
        "announcement": lambda: text(data, "announcement", 300, label="ogłoszenie"),
        "welcome": lambda: text(data, "welcome", 300, label="powitanie"),
        "theme": lambda: slug(data, "theme"),
        "fonts": lambda: slug(data, "fonts"),
        "first_day": lambda: calendar_day(data, "first_day"),
        "last_day": lambda: calendar_day(data, "last_day"),
    }
    for key, read in fields.items():
        if key in data or not partial:
            values[key] = read()
    return values


def check_group_days(first_day, last_day):
    if last_day < first_day:
        raise DomainError("Ostatni dzień nie może być przed pierwszym")
    if (last_day - first_day).days >= MAX_GROUP_DAYS:
        raise DomainError(f"Grupa może trwać najwyżej {MAX_GROUP_DAYS} dni")


def point_values(data, group, tz, spaces):
    """Validated fields of a point plus its placements (karty zlecenia). `spaces`: hotel's {id: Space}."""
    body_object(data)
    kind = data.get("kind")
    if kind not in POINT_KINDS:
        raise DomainError("Nieznany rodzaj punktu")
    label = data.get("time_label", "range")
    if label not in ("range", "until", "approx"):
        raise DomainError("Nieznany sposób podania godziny")
    starts_at = optional_moment(data, "starts_at", tz, "początek")
    ends_at = optional_moment(data, "ends_at", tz, "koniec")
    if label == "range":
        if not starts_at or not ends_at:
            raise DomainError("Punkt od–do wymaga początku i końca")
        if ends_at <= starts_at:
            raise DomainError("Koniec musi być po początku")
    elif label == "until":
        if not ends_at:
            raise DomainError("Punkt „do” wymaga godziny końca")
        starts_at = starts_at or ends_at
        if ends_at < starts_at:
            raise DomainError("Koniec musi być po początku")
    else:
        if not starts_at:
            raise DomainError("Punkt „ok.” wymaga godziny")
        if ends_at:
            raise DomainError("Punkt „ok.” nie ma godziny końca")
    if ends_at and ends_at - starts_at > timedelta(hours=MAX_POINT_HOURS):
        raise DomainError(f"Punkt może trwać najwyżej {MAX_POINT_HOURS} godziny")
    day = starts_at.astimezone(tz).date()
    if not group.first_day <= day <= group.last_day:
        raise DomainError("Punkt musi zaczynać się w dniach pobytu grupy")
    realizer = data.get("realizer", "hotel")
    visibility = data.get("visibility", "guests")
    if realizer not in ("hotel", "organizer"):
        raise DomainError("Nieznany realizator")
    if visibility not in ("guests", "staff"):
        raise DomainError("Nieznana widoczność")
    raw_placements = data.get("placements", [])
    if not isinstance(raw_placements, list) or len(raw_placements) > MAX_PLACEMENTS:
        raise DomainError(f"Najwyżej {MAX_PLACEMENTS} miejsc w punkcie")
    return {
        "kind": kind,
        "title": text(data, "title", 200, True, "nazwa punktu"),
        "starts_at": starts_at,
        "ends_at": ends_at,
        "time_label": label,
        "realizer": realizer,
        "visibility": visibility,
        "guest_note": text(data, "guest_note", 300, label="uwaga dla gości"),
    }, [placement_values(p, tz, spaces) for p in raw_placements]


def placement_values(data, tz, spaces):
    body_object(data)
    try:
        space = spaces[uuid.UUID(str(data.get("space")))]
    except (ValueError, TypeError, AttributeError, KeyError):
        raise DomainError("Nieznana sala") from None  # also: a space of another hotel
    headcount = data.get("headcount")
    if headcount is not None and (type(headcount) is not int or not 0 <= headcount <= 10000):
        raise DomainError("Liczba osób: oczekiwano liczby 0–10000")
    items = data.get("required_items", [])
    if not isinstance(items, list) or len(items) > 50:
        raise DomainError("Niezbędne elementy: najwyżej 50 pozycji")
    clean_items = [text({"v": i}, "v", 120, True, "element") for i in items]
    service_from = optional_moment(data, "service_from", tz, "obsługa od")
    service_to = optional_moment(data, "service_to", tz, "obsługa do")
    if service_from and service_to and service_to <= service_from:
        raise DomainError("Koniec obsługi musi być po jej początku")
    return {
        "space": space,
        "subgroup": text(data, "subgroup", 120, label="podgrupa"),
        "headcount": headcount,
        "setup": text(data, "setup", 300, label="ustawienie"),
        "menu": text(data, "menu", 2000, label="menu"),
        "required_items": clean_items,
        "todo": text(data, "todo", 2000, label="co zrobić"),
        "responsible": text(data, "responsible", 200, label="odpowiedzialny"),
        "service_from": service_from,
        "service_to": service_to,
    }


# --- projections ---------------------------------------------------------------------------

def iso(moment):
    return moment.isoformat() if moment else None


def group_header(group):
    return {
        "id": str(group.id),
        "name": group.name,
        "theme": group.theme,
        "fonts": group.fonts or None,
        "organizer": {"name": group.organizer_name, "logo": group.organizer_logo or None, "is_hotel": group.organizer_is_hotel},
        "first_day": group.first_day.isoformat(),
        "last_day": group.last_day.isoformat(),
        "announcement": group.announcement,
        "welcome": group.welcome,
    }


def guest_point(point):
    return {
        "id": str(point.id),
        "title": point.title,
        "starts_at": iso(point.starts_at),
        "ends_at": iso(point.ends_at),
        "time_label": point.time_label,
        "places": [p.space.name for p in point.placements.all()],
        "note": point.guest_note,
        "changed": False,
    }


def staff_point(point):
    return {
        **guest_point(point),
        "kind": point.kind,
        "realizer": point.realizer,
        "visibility": point.visibility,
        "cards": [
            {
                "place": p.space.name,
                "subgroup": p.subgroup,
                "headcount": p.headcount,
                "setup": p.setup,
                "menu": p.menu,
                "required_items": p.required_items,
                "todo": p.todo,
                "responsible": p.responsible,
                "service_from": iso(p.service_from),
                "service_to": iso(p.service_to),
            }
            for p in point.placements.all()
        ],
    }


def ordered_points(group):
    return group.points.prefetch_related("placements__space").order_by("starts_at", "title", "id")


def local_iso(moment, tz):
    return moment.astimezone(tz).replace(tzinfo=None).isoformat(timespec="minutes") if moment else None


def editor_point(point, tz):
    """Panel shape: exactly what create/update_point accept, so the editor can round-trip it."""
    return {
        "id": str(point.id),
        "kind": point.kind,
        "title": point.title,
        "starts_at": local_iso(point.starts_at, tz),
        "ends_at": local_iso(point.ends_at, tz),
        "time_label": point.time_label,
        "realizer": point.realizer,
        "visibility": point.visibility,
        "guest_note": point.guest_note,
        "placements": [
            {
                "space": str(p.space_id),
                "subgroup": p.subgroup,
                "headcount": p.headcount,
                "setup": p.setup,
                "menu": p.menu,
                "required_items": p.required_items,
                "todo": p.todo,
                "responsible": p.responsible,
                "service_from": local_iso(p.service_from, tz),
                "service_to": local_iso(p.service_to, tz),
            }
            for p in point.placements.all()
        ],
    }


def build_views(group):
    points = list(ordered_points(group))
    guest = {**group_header(group), "points": [guest_point(p) for p in points if p.visibility == "guests"]}
    staff = {**group_header(group), "agreed": group.agreed, "points": [staff_point(p) for p in points]}
    return guest, staff


def mark_changed(view, previous):
    """Flag points that are new or differ from the previous publication of the same audience."""
    if previous is None:
        return view
    before = {p["id"]: {k: v for k, v in p.items() if k != "changed"} for p in previous["points"]}
    for point in view["points"]:
        now = {k: v for k, v in point.items() if k != "changed"}
        point["changed"] = before.get(point["id"]) != now
    return view
