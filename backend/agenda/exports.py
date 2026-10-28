"""Which projection each PDF is built from. Returns (file name, HTML); views render it.

Guest PDF  ← published guest view (link) or draft guest view (panel, „szkic do uzgodnienia”).
Odprawa    ← published staff views of the groups in the hotel that day (panel and staff link alike).
Karta      ← one point of a published staff view (staff link) or of the draft (panel).
"""

from datetime import timedelta

from core.domain_errors import DomainError

from . import domain, pdf
from .access import group_in, hotel_access
from .public import NOT_FOUND, hotel_header, latest, link_for


def odprawa_groups(hotel, day):
    groups = []
    for group in hotel.groups.filter(first_day__lte=day, last_day__gte=day).order_by("first_day", "name"):
        view = latest(group, "staff_view")
        if view is not None:
            groups.append(view)
    return groups


def parse_day(value):
    return domain.calendar_day({"dzień": value}, "dzień")


# --- public (token) ------------------------------------------------------------------------

def guest_agenda(token):
    link = link_for(token, "guest")
    view = latest(link.group, "guest_view")
    if view is None:
        raise DomainError("Agenda nie jest jeszcze opublikowana", 404)
    return pdf.file_name("agenda", view["name"]), pdf.guest_agenda_html(hotel_header(link.hotel), view)


def staff_odprawa(token, day):
    link = link_for(token, "staff")
    day = parse_day(day)
    return pdf.file_name("odprawa", day), pdf.odprawa_html(hotel_header(link.hotel), day, odprawa_groups(link.hotel, day))


def staff_karta(token, point_id):
    link = link_for(token, "staff")
    wanted = str(domain.identifier(point_id, "Punkt"))
    recent = link.hotel.groups.filter(last_day__gte=link.today - timedelta(days=30))
    for group in recent:
        view = latest(group, "staff_view")
        point = next((p for p in (view or {}).get("points", []) if p["id"] == wanted), None)
        if point:
            return pdf.file_name("karta", point["title"]), pdf.karta_html(hotel_header(link.hotel), view, point)
    raise DomainError(NOT_FOUND, 404)


# --- panel (session) -----------------------------------------------------------------------

def draft_agenda(user, hotel_id, group_id):
    hotel = hotel_access(user, hotel_id)
    guest, _ = domain.build_views(group_in(hotel, group_id))
    return pdf.file_name("agenda-szkic", guest["name"]), pdf.guest_agenda_html(hotel_header(hotel), guest, draft=True)


def draft_karta(user, hotel_id, group_id, point_id):
    hotel = hotel_access(user, hotel_id)
    _, staff = domain.build_views(group_in(hotel, group_id))
    wanted = str(domain.identifier(point_id, "Punkt"))
    point = next((p for p in staff["points"] if p["id"] == wanted), None)
    if not point:
        raise DomainError("Punkt: nie znaleziono", 404)
    return pdf.file_name("karta", point["title"]), pdf.karta_html(hotel_header(hotel), staff, point, draft=True)


def qr_cards(user, hotel_id, group_id, base_url):
    hotel = hotel_access(user, hotel_id)
    group = group_in(hotel, group_id)
    link = group.links.filter(kind="guest", revoked=False).order_by("-created_at").first()
    if not link:
        raise DomainError("Najpierw utwórz link dla gości tej grupy", 409)
    url = f"{base_url}/g/{link.public_token}"
    return pdf.file_name("karty-qr", group.name), pdf.qr_cards_html(hotel_header(hotel), domain.group_header(group), url)


def odprawa(user, hotel_id, day):
    hotel = hotel_access(user, hotel_id)
    day = parse_day(day)
    return pdf.file_name("odprawa", day), pdf.odprawa_html(hotel_header(hotel), day, odprawa_groups(hotel, day))
