"""Mutations and panel reads. Every agenda edit locks the group row and passes one version gate."""

import hashlib
import secrets
from datetime import datetime

from django.conf import settings
from django.db import IntegrityError, transaction

from core.domain_errors import DomainError

from . import domain, uploads
from .access import group_in, hotel_access, hotels_for
from .models import AccessLink, AgendaPoint, Group, HotelMember, HotelSlide, Placement, Publication, Space, TypicalPoint


def expected(data, group):
    version = data.get("version") if isinstance(data, dict) else None
    if type(version) is not int or version != group.version:
        raise DomainError("Ktoś inny zmienił tę agendę — odśwież i spróbuj ponownie", 409)


def bump(group):
    group.version += 1
    group.save(update_fields=["version"])


def locked_group(user, hotel_id, group_id, data):
    domain.body_object(data)
    hotel = hotel_access(user, hotel_id)
    group = group_in(hotel, group_id, lock=True)
    expected(data, group)
    return hotel, group


def hotel_spaces(hotel):
    return {s.id: s for s in Space.objects.filter(hotel=hotel)}


# --- reads ---------------------------------------------------------------------------------

def list_hotels(user):
    roles = {} if user.is_superuser else dict(HotelMember.objects.filter(user=user).values_list("hotel_id", "role"))
    return [{"id": str(h.id), "name": h.name, "timezone": h.timezone, "logo": h.logo or None,
             "outputs_enabled": h.outputs_enabled, "role": "admin" if user.is_superuser else roles.get(h.id)}
            for h in hotels_for(user)]


def list_groups(user, hotel_id):
    hotel = hotel_access(user, hotel_id)
    return [group_summary(g) for g in hotel.groups.order_by("-first_day", "name")]


def group_summary(group):
    last = group.publications.order_by("-seq").first()
    return {
        **domain.group_header(group),
        "agreed": group.agreed,
        "version": group.version,
        "published_seq": last.seq if last else None,
        "unpublished_changes": not last or last.group_version != group.version,
    }


def group_detail(user, hotel_id, group_id):
    hotel = hotel_access(user, hotel_id)
    group = group_in(hotel, group_id)
    tz = domain.hotel_zone(hotel.timezone)
    return {**group_summary(group), "points": [domain.editor_point(p, tz) for p in domain.ordered_points(group)]}


def preview(user, hotel_id, group_id):
    """„Jak zobaczy gość” — the guest projection of the current draft."""
    guest, _ = domain.build_views(group_in(hotel_access(user, hotel_id), group_id))
    return guest


def list_links(user, hotel_id):
    hotel = hotel_access(user, hotel_id)
    return [
        {"id": str(link.id), "kind": link.kind, "group": str(link.group_id) if link.group_id else None,
         "token": link.public_token or None, "created_at": link.created_at.isoformat()}
        for link in hotel.links.filter(revoked=False).order_by("-created_at")
    ]


# --- mutations -----------------------------------------------------------------------------

@transaction.atomic
def create_space(user, hotel_id, data):
    hotel = hotel_access(user, hotel_id)
    name = domain.text(domain.body_object(data), "name", 120, True, "nazwa sali")
    try:
        with transaction.atomic():
            space = Space.objects.create(hotel=hotel, name=name)
    except IntegrityError:
        raise DomainError("Taka sala już istnieje", 409) from None
    return {"id": str(space.id), "name": space.name}


@transaction.atomic
def create_group(user, hotel_id, data):
    hotel = hotel_access(user, hotel_id)
    values = domain.group_values(data)
    domain.check_group_days(values["first_day"], values["last_day"])
    group = Group.objects.create(hotel=hotel, **values)
    return group_summary(group)


@transaction.atomic
def update_group(user, hotel_id, group_id, data):
    _, group = locked_group(user, hotel_id, group_id, data)
    values = domain.group_values(data, partial=True)
    first, last = values.get("first_day", group.first_day), values.get("last_day", group.last_day)
    domain.check_group_days(first, last)
    if (first, last) != (group.first_day, group.last_day) and group.points.exists():
        tz = domain.hotel_zone(group.hotel.timezone)
        days = {p.starts_at.astimezone(tz).date() for p in group.points.all()}
        if min(days) < first or max(days) > last:
            raise DomainError("Najpierw przenieś punkty, które wypadają poza nowe dni pobytu", 409)
    for key, value in values.items():
        setattr(group, key, value)
    group.version += 1
    group.save()
    return group_summary(group)


@transaction.atomic
def delete_group(user, hotel_id, group_id, data):
    """Removes the group with its points, publications and guest links; the screen drops it at once."""
    _, group = locked_group(user, hotel_id, group_id, data)
    points = group.points.count()
    group.delete()
    return {"deleted": True, "points": points}


def save_placements(point, placements):
    point.placements.all().delete()
    for order, values in enumerate(placements):
        Placement.objects.create(point=point, order=order, **values)


@transaction.atomic
def create_point(user, hotel_id, group_id, data):
    hotel, group = locked_group(user, hotel_id, group_id, data)
    values, placements = domain.point_values(data, group, domain.hotel_zone(hotel.timezone), hotel_spaces(hotel))
    point = AgendaPoint.objects.create(group=group, **values)
    save_placements(point, placements)
    bump(group)
    return {"id": str(point.id), "version": group.version}


@transaction.atomic
def update_point(user, hotel_id, group_id, point_id, data):
    hotel, group = locked_group(user, hotel_id, group_id, data)
    point = group.points.filter(pk=domain.identifier(point_id, "Punkt")).first()
    if not point:
        raise DomainError("Punkt: nie znaleziono", 404)
    values, placements = domain.point_values(data, group, domain.hotel_zone(hotel.timezone), hotel_spaces(hotel))
    for key, value in values.items():
        setattr(point, key, value)
    point.save()
    save_placements(point, placements)
    bump(group)
    return {"id": str(point.id), "version": group.version}


@transaction.atomic
def delete_point(user, hotel_id, group_id, point_id, data):
    _, group = locked_group(user, hotel_id, group_id, data)
    deleted, _ = group.points.filter(pk=domain.identifier(point_id, "Punkt")).delete()
    if not deleted:
        raise DomainError("Punkt: nie znaleziono", 404)
    bump(group)
    return {"version": group.version}


@transaction.atomic
def add_typical_point(user, hotel_id, group_id, data):
    """Copy a catalogue entry into the agenda; later catalogue edits do not touch the copy."""
    hotel, group = locked_group(user, hotel_id, group_id, data)
    typical = TypicalPoint.objects.filter(hotel=hotel, pk=domain.identifier(data.get("typical"), "Typowy punkt")).first()
    if not typical:
        raise DomainError("Typowy punkt: nie znaleziono", 404)
    day = domain.calendar_day(data, "day")

    def local(t):
        return datetime.combine(day, t).isoformat(timespec="minutes") if t else None

    card = dict(typical.card or {})
    body = {
        "kind": typical.kind,
        "title": typical.title,
        "time_label": typical.time_label,
        "starts_at": local(typical.start_time),
        "ends_at": local(typical.end_time),
        "placements": [{**card, "space": str(typical.space_id)}] if typical.space_id else [],
        "guest_note": typical.guest_note,
    }
    values, placements = domain.point_values(body, group, domain.hotel_zone(hotel.timezone), hotel_spaces(hotel))
    point = AgendaPoint.objects.create(group=group, **values)
    save_placements(point, placements)
    bump(group)
    return {"id": str(point.id), "version": group.version}


@transaction.atomic
def publish(user, hotel_id, group_id, data):
    _, group = locked_group(user, hotel_id, group_id, data)
    existing = group.publications.filter(group_version=group.version).first()
    if existing:  # same draft published again: idempotent
        return {"seq": existing.seq, "version": group.version, "created": False}
    previous = group.publications.order_by("-seq").first()
    guest, staff = domain.build_views(group)
    publication = Publication.objects.create(
        group=group,
        seq=(previous.seq + 1) if previous else 1,
        group_version=group.version,
        guest_view=domain.mark_changed(guest, previous.guest_view if previous else None),
        staff_view=domain.mark_changed(staff, previous.staff_view if previous else None),
        actor=user,
    )
    return {"seq": publication.seq, "version": group.version, "created": True}


def no_files_in_demo(hotel, upload):
    """A sandbox (agenda.demo) takes no uploads: 200 visitors × 30 slides would fill the disk. Removing is fine."""
    if hotel.demo_until and upload is not False:
        raise DomainError("W demo nie wgrywa się plików — załóż własne konto, żeby dodać logo i slajdy", 403)


# --- logos ---------------------------------------------------------------------------------

@transaction.atomic
def set_hotel_logo(user, hotel_id, upload):
    """Hotel logo is read live by every output (not part of a publication)."""
    hotel = hotel_access(user, hotel_id)
    no_files_in_demo(hotel, upload)
    hotel.logo = uploads.save_logo(upload) if upload is not False else ""
    hotel.save(update_fields=["logo"])
    return {"logo": hotel.logo or None}


@transaction.atomic
def set_organizer_logo(user, hotel_id, group_id, data, upload):
    """Organizer logo is part of the agenda: version gate, visible to guests after „Opublikuj”."""
    hotel, group = locked_group(user, hotel_id, group_id, data)
    no_files_in_demo(hotel, upload)
    group.organizer_logo = uploads.save_logo(upload) if upload is not False else ""
    group.version += 1
    group.save(update_fields=["organizer_logo", "version"])
    return group_summary(group)


# --- hotel slides (live on the lobby screen, like the hotel logo) ---------------------------

MAX_SLIDES = 30


def slide_json(slide, today):
    state = "active"
    if slide.show_from and slide.show_from > today:
        state = "planned"
    elif slide.show_to and slide.show_to < today:
        state = "ended"
    return {
        "id": slide.id, "image": slide.image, "alt": slide.alt, "order": slide.order, "state": state,
        "show_from": slide.show_from.isoformat() if slide.show_from else None,
        "show_to": slide.show_to.isoformat() if slide.show_to else None,
    }


def hotel_today(hotel):
    from django.utils import timezone

    return timezone.now().astimezone(domain.hotel_zone(hotel.timezone)).date()


def list_slides(user, hotel_id):
    hotel = hotel_access(user, hotel_id)
    today = hotel_today(hotel)
    return [slide_json(s, today) for s in hotel.slides.order_by("order", "id")]


def slide_values(data, current=None):
    """alt and the optional display window; a missing key keeps the current value."""
    values = {}
    if "alt" in data or current is None:
        values["alt"] = domain.text(data, "alt", 200, label="opis slajdu") or "Slajd hotelu"
    for key in ("show_from", "show_to"):
        if key in data or current is None:
            values[key] = None if data.get(key) in (None, "") else domain.calendar_day(data, key)
    start = values.get("show_from", current.show_from if current else None)
    end = values.get("show_to", current.show_to if current else None)
    if start and end and end < start:
        raise DomainError("Koniec wyświetlania nie może być przed początkiem")
    return values


@transaction.atomic
def create_slide(user, hotel_id, data, upload):
    hotel = hotel_access(user, hotel_id)
    no_files_in_demo(hotel, upload)
    if hotel.slides.count() >= MAX_SLIDES:
        raise DomainError(f"Hotel może mieć najwyżej {MAX_SLIDES} slajdów — usuń stare", 409)
    values = slide_values(data)  # validate before writing the file
    saved = uploads.save_image(upload, uploads.SLIDE)
    last = hotel.slides.order_by("-order").first()
    slide = HotelSlide.objects.create(hotel=hotel, image=saved.url, order=(last.order + 1) if last else 0, **values)
    return {**slide_json(slide, hotel_today(hotel)), "width": saved.width, "height": saved.height}


def slide_in(hotel, slide_id):
    slide = hotel.slides.filter(pk=slide_id).first() if str(slide_id).isdigit() else None
    if not slide:
        raise DomainError("Slajd: nie znaleziono", 404)
    return slide


@transaction.atomic
def update_slide(user, hotel_id, slide_id, data):
    hotel = hotel_access(user, hotel_id)
    slide = slide_in(hotel, slide_id)
    for key, value in slide_values(domain.body_object(data), slide).items():
        setattr(slide, key, value)
    slide.save()
    return slide_json(slide, hotel_today(hotel))


@transaction.atomic
def delete_slide(user, hotel_id, slide_id):
    hotel = hotel_access(user, hotel_id)
    slide = slide_in(hotel, slide_id)
    image = slide.image
    slide.delete()
    transaction.on_commit(lambda: uploads.delete_file(image))
    return {"deleted": True}


@transaction.atomic
def order_slides(user, hotel_id, data):
    hotel = hotel_access(user, hotel_id)
    ids = domain.body_object(data).get("ids")
    current = list(hotel.slides.values_list("id", flat=True))
    if not isinstance(ids, list) or sorted(map(str, ids)) != sorted(map(str, current)) or len(set(map(str, ids))) != len(ids):
        raise DomainError("Podaj kolejność wszystkich slajdów hotelu, każdy raz")
    for order, slide_id in enumerate(ids):
        HotelSlide.objects.filter(hotel=hotel, pk=int(slide_id)).update(order=order)
    return list_slides(user, hotel_id)


# --- links ---------------------------------------------------------------------------------

def digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


@transaction.atomic
def create_link(user, hotel_id, data):
    hotel = hotel_access(user, hotel_id)
    domain.body_object(data)
    kind = data.get("kind")
    if kind not in ("guest", "staff", "screen"):
        raise DomainError("Nieznany rodzaj linku")
    group = group_in(hotel, data.get("group")) if kind == "guest" else None
    if kind != "guest" and data.get("group") is not None:
        raise DomainError("Link obsługi i ekranu dotyczy całego hotelu, nie grupy")
    if hotel.links.filter(revoked=False).count() >= settings.MAX_ACTIVE_LINKS:
        raise DomainError("Za dużo aktywnych linków — unieważnij nieużywane", 409)
    token = secrets.token_urlsafe(32)
    link = AccessLink.objects.create(
        hotel=hotel, group=group, kind=kind, digest=digest(token), public_token=token if kind == "guest" else ""
    )
    return {"id": str(link.id), "kind": kind, "token": token}


@transaction.atomic
def revoke_link(user, hotel_id, link_id):
    hotel = hotel_access(user, hotel_id)
    updated = hotel.links.filter(pk=domain.identifier(link_id, "Link")).update(revoked=True)
    if not updated:
        raise DomainError("Link: nie znaleziono", 404)
    return {"revoked": True}
