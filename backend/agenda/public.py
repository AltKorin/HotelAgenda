"""Read-only outputs behind tokens (no account): lobby screen, guest agenda, staff agenda.

They read ONLY published snapshots. Unknown, revoked, expired and switched-off links all
answer the same 404 so a token cannot be probed.
"""

from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from core.domain_errors import DomainError

from . import domain
from .models import AccessLink, HotelSlide, Publication
from .services import digest

NOT_FOUND = "Nie znaleziono"


def link_for(token, kind):
    if not isinstance(token, str) or not 20 <= len(token) <= 128:
        raise DomainError(NOT_FOUND, 404)
    link = (
        AccessLink.objects.select_related("hotel", "group")
        .filter(digest=digest(token), kind=kind, revoked=False, hotel__outputs_enabled=True)
        .first()
    )
    if not link:
        raise DomainError(NOT_FOUND, 404)
    link.today = timezone.now().astimezone(domain.hotel_zone(link.hotel.timezone)).date()
    if kind == "guest" and link.today > link.group.last_day + timedelta(days=settings.GUEST_LINK_GRACE_DAYS):
        raise DomainError(NOT_FOUND, 404)
    return link


def hotel_header(hotel):
    return {"name": hotel.name, "logo": hotel.logo or None, "timezone": hotel.timezone}


def latest(group, field):
    publication = Publication.objects.filter(group=group).order_by("-seq").only(field).first()
    return getattr(publication, field) if publication else None


def guest_url(group, base_url):
    link = group.links.filter(kind="guest", revoked=False).order_by("-created_at").first()
    return f"{base_url}/g/{link.public_token}" if link else ""


def screen(token, base_url):
    link = link_for(token, "screen")
    hotel, today = link.hotel, link.today
    groups = []
    for group in hotel.groups.filter(first_day__lte=today, last_day__gte=today).order_by("first_day", "name"):
        view = latest(group, "guest_view")
        if view is not None:
            groups.append({**view, "guest_url": guest_url(group, base_url)})
    slides = (
        HotelSlide.objects.filter(hotel=hotel)
        .exclude(show_from__gt=today)
        .exclude(show_to__lt=today)
    )
    return {
        "hotel": hotel_header(hotel),
        "slide_seconds": settings.SCREEN_SLIDE_SECONDS,
        "refresh_seconds": settings.SCREEN_REFRESH_SECONDS,
        "groups": groups,
        "hotel_slides": [{"id": str(s.id), "image": s.image, "alt": s.alt} for s in slides],
    }


def guest(token):
    link = link_for(token, "guest")
    return {"hotel": hotel_header(link.hotel), "group": latest(link.group, "guest_view")}


def staff(token):
    link = link_for(token, "staff")
    groups = []
    for group in link.hotel.groups.filter(last_day__gte=link.today).order_by("first_day", "name"):
        view = latest(group, "staff_view")
        if view is not None:
            groups.append(view)
    return {"hotel": hotel_header(link.hotel), "today": link.today.isoformat(), "groups": groups}
