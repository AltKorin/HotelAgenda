"""Hotel-level things the client manages in the panel: name, rooms, typical points, staff accounts.

CLAUDE.md: everything the client manages has list / add / edit / delete in the client panel —
setup_hotel only seeds them. Accounts are the director's job (role „dyrektor”); the rest is open to
kierownicy too.
"""

import re
import secrets
from datetime import time

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.db.models import Q

from core.domain_errors import DomainError
from core.models import LoginEvent, TermsAcceptance

from . import domain, uploads
from .access import hotel_access
from .models import AgendaPoint, Group, Hotel, HotelMember, Placement, Publication, Space, TypicalPoint

USERNAME = re.compile(r"[A-Za-z0-9_.-]{3,40}")


# --- hotel ---------------------------------------------------------------------------------

@transaction.atomic
def update_hotel(user, hotel_id, data):
    hotel = hotel_access(user, hotel_id, minimum="dyrektor")
    hotel.name = domain.text(domain.body_object(data), "name", 200, True, "nazwa hotelu")
    hotel.save(update_fields=["name"])
    return {"id": str(hotel.id), "name": hotel.name}


# --- rooms ---------------------------------------------------------------------------------

def space_in(hotel, space_id):
    space = hotel.spaces.filter(pk=domain.identifier(space_id, "Sala")).first()
    if not space:
        raise DomainError("Sala: nie znaleziono", 404)
    return space


def list_spaces(user, hotel_id):
    hotel = hotel_access(user, hotel_id)
    return [
        {"id": str(s.id), "name": s.name, "used": Placement.objects.filter(space=s).count(),
         "typical": s.typicalpoint_set.count()}
        for s in hotel.spaces.order_by("name")
    ]


@transaction.atomic
def rename_space(user, hotel_id, space_id, data):
    hotel = hotel_access(user, hotel_id)
    space = space_in(hotel, space_id)
    space.name = domain.text(domain.body_object(data), "name", 120, True, "nazwa sali")
    try:
        with transaction.atomic():
            space.save(update_fields=["name"])
    except IntegrityError:
        raise DomainError("Taka sala już istnieje", 409) from None
    return {"id": str(space.id), "name": space.name}


@transaction.atomic
def delete_space(user, hotel_id, space_id):
    hotel = hotel_access(user, hotel_id)
    space = space_in(hotel, space_id)
    used = Placement.objects.filter(space=space).select_related("point__group")
    if used.exists():
        groups = sorted({p.point.group.name for p in used})
        raise DomainError(
            f"Sala jest w {used.count()} punktach agendy (grupy: {', '.join(groups)}). "
            "Zmień w nich salę albo usuń te punkty, wtedy sala da się usunąć.", 409)
    space.delete()  # typical points keep working without a default room (SET_NULL)
    return {"deleted": True}


# --- typical points --------------------------------------------------------------------------

def clock(data, key, label):
    value = data.get(key)
    if value in (None, ""):
        return None
    try:
        return time.fromisoformat(value) if isinstance(value, str) and len(value) <= 8 else None
    except ValueError:
        return None


def typical_values(data, hotel):
    domain.body_object(data)
    if data.get("kind") not in domain.POINT_KINDS:
        raise DomainError("Nieznany rodzaj punktu")
    label = data.get("time_label", "range")
    if label not in ("range", "until", "approx"):
        raise DomainError("Nieznany sposób podania godziny")
    start, end = clock(data, "start_time", "od"), clock(data, "end_time", "do")
    for key, value in (("start_time", start), ("end_time", end)):
        if data.get(key) not in (None, "") and value is None:
            raise DomainError("Godzina w formacie GG:MM")
    if label == "range":
        if not start or not end:
            raise DomainError("Punkt od–do wymaga początku i końca")
        if end <= start:
            raise DomainError("Koniec musi być po początku")
    elif label == "until":
        if not end:
            raise DomainError("Punkt „do” wymaga godziny końca")
        start = end
    else:
        if not start:
            raise DomainError("Punkt „ok.” wymaga godziny")
        end = None
    space = None
    if data.get("space"):
        space = space_in(hotel, data["space"])
    raw = data.get("card") or {}
    if not isinstance(raw, dict):
        raise DomainError("Karta zlecenia: oczekiwano obiektu")
    headcount = raw.get("headcount")
    if headcount is not None and (type(headcount) is not int or not 0 <= headcount <= 10000):
        raise DomainError("Liczba osób: oczekiwano liczby 0–10000")
    items = raw.get("required_items", [])
    if not isinstance(items, list) or len(items) > 50:
        raise DomainError("Niezbędne elementy: najwyżej 50 pozycji")
    card = {
        "setup": domain.text(raw, "setup", 300, label="ustawienie"),
        "menu": domain.text(raw, "menu", 2000, label="menu"),
        "todo": domain.text(raw, "todo", 2000, label="co zrobić"),
        "responsible": domain.text(raw, "responsible", 200, label="odpowiedzialny"),
        "required_items": [domain.text({"v": i}, "v", 120, True, "element") for i in items],
        "headcount": headcount,
    }
    return {
        "kind": data["kind"], "title": domain.text(data, "title", 200, True, "nazwa punktu"),
        "time_label": label, "start_time": start, "end_time": end, "space": space,
        "guest_note": domain.text(data, "guest_note", 300, label="uwaga dla gości"),
        "card": {k: v for k, v in card.items() if v not in ("", [], None)},
    }


def typical_json(t):
    return {
        "id": str(t.id), "kind": t.kind, "title": t.title, "time_label": t.time_label,
        "start_time": t.start_time.strftime("%H:%M"), "end_time": t.end_time.strftime("%H:%M") if t.end_time else None,
        "space": t.space.name if t.space else None, "space_id": str(t.space_id) if t.space_id else None,
        "guest_note": t.guest_note, "card": t.card or {},
    }


def list_typical_points(user, hotel_id):
    hotel = hotel_access(user, hotel_id)
    return [typical_json(t) for t in hotel.typical_points.select_related("space").order_by("start_time", "title")]


def typical_in(hotel, typical_id):
    typical = hotel.typical_points.filter(pk=domain.identifier(typical_id, "Typowy punkt")).first()
    if not typical:
        raise DomainError("Typowy punkt: nie znaleziono", 404)
    return typical


@transaction.atomic
def create_typical(user, hotel_id, data):
    hotel = hotel_access(user, hotel_id)
    return typical_json(TypicalPoint.objects.create(hotel=hotel, **typical_values(data, hotel)))


@transaction.atomic
def update_typical(user, hotel_id, typical_id, data):
    hotel = hotel_access(user, hotel_id)
    typical = typical_in(hotel, typical_id)
    for key, value in typical_values(data, hotel).items():
        setattr(typical, key, value)
    typical.save()
    return typical_json(typical)


@transaction.atomic
def delete_typical(user, hotel_id, typical_id):
    hotel = hotel_access(user, hotel_id)
    typical_in(hotel, typical_id).delete()  # points already copied into agendas stay as they are
    return {"deleted": True}


# --- staff accounts (director only) ------------------------------------------------------------

def member_json(member, user):
    return {"id": member.id, "username": member.user.get_username(), "role": member.role,
            "me": member.user_id == user.pk, "active": member.user.is_active,
            "last_login": member.user.last_login.isoformat() if member.user.last_login else None}


def list_members(user, hotel_id):
    hotel = hotel_access(user, hotel_id, minimum="dyrektor")
    members = hotel.members.select_related("user").order_by("role", "user__username")
    return [member_json(m, user) for m in members]


def member_in(hotel, member_id):
    member = hotel.members.select_related("user").filter(pk=member_id).first() if str(member_id).isdigit() else None
    if not member:
        raise DomainError("Konto: nie znaleziono", 404)
    return member


def role_value(data):
    role = data.get("role")
    if role not in ("dyrektor", "kierownik"):
        raise DomainError("Rola: dyrektor albo kierownik")
    return role


def keep_a_director(hotel, member):
    if member.role == "dyrektor" and not hotel.members.filter(role="dyrektor").exclude(pk=member.pk).exists():
        raise DomainError("Hotel musi mieć przynajmniej jednego dyrektora", 409)


def new_password():
    return secrets.token_urlsafe(12)


@transaction.atomic
def create_member(user, hotel_id, data):
    hotel = hotel_access(user, hotel_id, minimum="dyrektor")
    domain.body_object(data)
    username = data.get("username")
    if not isinstance(username, str) or not USERNAME.fullmatch(username.strip()):
        raise DomainError("Login: 3–40 znaków, litery bez polskich znaków, cyfry, kropka, myślnik, podkreślenie")
    role = role_value(data)
    User = get_user_model()
    password = new_password()
    account = User.objects.filter(username__iexact=username.strip()).first()
    if account:
        # A removed person coming back: reactivate their account (history keeps one author), but
        # never take over an active login or one that another hotel still uses.
        if account.is_active or account.is_superuser or account.hotel_memberships.exists():
            raise DomainError("Ten login jest już zajęty — wybierz inny", 409)
        account.is_active = True
        account.set_password(password)
        account.save(update_fields=["is_active", "password"])
    else:
        account = User.objects.create_user(username.strip(), password=password)
    member = HotelMember.objects.create(hotel=hotel, user=account, role=role)
    return {**member_json(member, user), "password": password}


@transaction.atomic
def update_member(user, hotel_id, member_id, data):
    hotel = hotel_access(user, hotel_id, minimum="dyrektor")
    member = member_in(hotel, member_id)
    role = role_value(domain.body_object(data))
    if role != member.role:
        keep_a_director(hotel, member)
        member.role = role
        member.save(update_fields=["role"])
    return member_json(member, user)


@transaction.atomic
def reset_password(user, hotel_id, member_id):
    hotel = hotel_access(user, hotel_id, minimum="dyrektor")
    member = member_in(hotel, member_id)
    password = new_password()
    member.user.set_password(password)
    member.user.is_active = True
    member.user.save(update_fields=["password", "is_active"])
    return {**member_json(member, user), "password": password}


@transaction.atomic
def delete_member(user, hotel_id, member_id):
    hotel = hotel_access(user, hotel_id, minimum="dyrektor")
    member = member_in(hotel, member_id)
    if member.user_id == user.pk:
        raise DomainError("Nie możesz usunąć własnego konta", 409)
    keep_a_director(hotel, member)
    account = member.user
    member.delete()
    # The account stays (history keeps its author) but can no longer log in, unless another hotel uses it.
    if not account.is_superuser and not account.hotel_memberships.exists():
        account.is_active = False
        account.save(update_fields=["is_active"])
    return {"deleted": True}


# --- the whole hotel: export and deletion (director only, RODO art. 17/20) ------------------------

def export_hotel(user, hotel_id):
    """Everything the hotel entered, in the shapes the panel already reads (tokens never leave)."""
    from . import services

    hotel = hotel_access(user, hotel_id, minimum="dyrektor")
    return {
        "hotel": {"id": str(hotel.id), "name": hotel.name, "timezone": hotel.timezone, "logo": hotel.logo or None},
        "spaces": list_spaces(user, hotel_id),
        "typical_points": list_typical_points(user, hotel_id),
        "accounts": [{k: m[k] for k in ("username", "role", "active", "last_login")} for m in list_members(user, hotel_id)],
        "slides": services.list_slides(user, hotel_id),
        "groups": [services.group_detail(user, hotel_id, g.id) for g in hotel.groups.order_by("first_day")],
        "publications": [
            {"group": str(p.group_id), "seq": p.seq, "created_at": p.created_at.isoformat(), "guest_view": p.guest_view}
            for p in Publication.objects.filter(group__hotel=hotel).order_by("group_id", "seq")
        ],
    }


def anonymize(account):
    """Account stops pointing at a person; its pk stays so nothing that referenced it breaks."""
    old = account.get_username()
    alias = f"usuniety-{account.pk}"
    account.username, account.email, account.first_name, account.last_name = alias, "", "", ""
    account.is_active = False
    account.set_unusable_password()
    account.save()
    # queryset.update: the audit rows stay (immutable), only the identifying fields are erased.
    LoginEvent.objects.filter(Q(user=account) | Q(user__isnull=True, username__iexact=old)).update(
        username=alias, ip=None, user_agent="")
    TermsAcceptance.objects.filter(user=account).update(ip=None)


def purge_history(hotel_id):
    """simple-history keeps old values (and deletion rows) — erasure that skips them erases nothing."""
    group_ids = list(Group.history.filter(hotel_id=hotel_id).values_list("id", flat=True).distinct())
    point_ids = list(AgendaPoint.history.filter(group_id__in=group_ids).values_list("id", flat=True).distinct())
    Placement.history.filter(point_id__in=point_ids).delete()
    AgendaPoint.history.filter(group_id__in=group_ids).delete()
    Group.history.filter(hotel_id=hotel_id).delete()
    HotelMember.history.filter(hotel_id=hotel_id).delete()
    Hotel.history.filter(id=hotel_id).delete()


@transaction.atomic
def delete_hotel(user, hotel_id, data):
    """Removes the hotel with everything in it, its history and files; accounts left without any
    hotel are anonymized. Returns whether the caller's own account went with it."""
    hotel = hotel_access(user, hotel_id, minimum="dyrektor")
    typed = domain.body_object(data).get("confirm")
    if not isinstance(typed, str) or typed.strip() != hotel.name.strip():
        raise DomainError("Wpisz dokładną nazwę hotelu, żeby potwierdzić usunięcie")
    removed = erase_hotel(hotel)
    for account in removed:
        anonymize(account)
    return {"deleted": True, "account_removed": any(a.pk == user.pk for a in removed)}


def erase_hotel(hotel):
    """The hotel with everything in it, its history and files; returns the accounts left without any hotel."""
    accounts = [m.user for m in hotel.members.select_related("user")]
    files = [hotel.logo, *hotel.groups.values_list("organizer_logo", flat=True), *hotel.slides.values_list("image", flat=True)]
    hotel_pk = hotel.pk
    hotel.delete()
    purge_history(hotel_pk)
    transaction.on_commit(lambda: uploads.delete_unused([f for f in files if f]))
    return [a for a in accounts if not a.is_superuser and not a.hotel_memberships.exists()]
