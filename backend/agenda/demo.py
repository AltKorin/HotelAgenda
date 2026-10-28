"""Hotel Bursztynowa Polana. One builder for `seed_demo` (a fixed demo hotel on a server) and for the sandbox every
visitor gets from „Wypróbuj demo”: an own copy built around today, an account without a password (only this session
enters it), erased after DEMO_HOURS. The demo bar opens the three outputs — lobby screen, guest phone, staff."""

import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth import login as sign_in
from django.db import transaction
from django.utils import timezone

from core.domain_errors import DomainError

from . import services
from .domain import hotel_zone
from .hotel_settings import erase_hotel
from .models import Hotel, HotelMember, HotelSlide, Space, TypicalPoint

HOTEL = "Hotel Bursztynowa Polana"
SESSION_KEY = "demo"


def build(user, demo_until=None):
    """Two groups (a training with a moved workshop and an announcement, a music weekend), both published,
    plus links. Returns the hotel and the tokens — shown once, stored only as digests."""
    hotel = Hotel.objects.create(name=HOTEL, logo="/demo/hotel-logo.svg", outputs_enabled=True, demo_until=demo_until)
    HotelMember.objects.create(hotel=hotel, user=user, role="dyrektor")
    rooms = {n: Space.objects.create(hotel=hotel, name=n) for n in (
        "Restauracja Pod Lipami", "Sala Jodłowa", "Sala Grabowa", "Sala Bukowa", "Sala Modrzewiowa", "Recepcja")}
    sid = lambda name: str(rooms[name].id)  # noqa: E731
    TypicalPoint.objects.create(hotel=hotel, kind="posilek", title="Śniadanie", start_time="08:00", end_time="10:00",
                                space=rooms["Restauracja Pod Lipami"], card={"menu": "Bufet śniadaniowy", "responsible": "Kuchnia"})
    HotelSlide.objects.create(hotel=hotel, image="/demo/slajd-spa.svg", alt="Strefa SPA czynna codziennie do 22:00")

    today = timezone.now().astimezone(hotel_zone(hotel.timezone)).date()
    d1, d2, d3 = today - timedelta(days=1), today, today + timedelta(days=1)
    at = lambda d, t: f"{d.isoformat()}T{t}"  # noqa: E731

    training = services.create_group(user, hotel.id, {
        "name": "Szkolenie wolontariuszy", "organizer_name": "Fundacja Wspólna Droga",
        "organizer_logo": "/demo/organizer-logo.svg", "first_day": d1.isoformat(), "last_day": d3.isoformat(),
        "theme": "granat-bursztyn", "agreed": True,
        "welcome": "Serdecznie witamy. Życzymy owocnego szkolenia i miłego pobytu.",
    })
    workshop_rooms = ["Sala Jodłowa", "Sala Grabowa", "Sala Bukowa", "Sala Modrzewiowa"]
    workshop = [{"space": sid(r), "subgroup": f"Grupa {'ABCD'[i]}", "headcount": 12, "setup": "Warsztatowy, 3 stoły po 4 osoby",
                 "required_items": ["Rzutnik", "Flipchart", "Woda"], "responsible": "Technik — p. Marek"} for i, r in enumerate(workshop_rooms)]
    meal = lambda menu, n: [{"space": sid("Restauracja Pod Lipami"), "headcount": n, "menu": menu, "responsible": "Kuchnia — p. Ania"}]  # noqa: E731
    coffee = [{"space": sid("Sala Jodłowa"), "headcount": 48, "menu": "Kawa, herbata, ciasto drożdżowe", "responsible": "Sala — p. Ola"}]
    points(user, hotel, training["id"], [
        ("przyjazd", "Przyjazd", at(d1, "14:30"), at(d1, "15:00"), "range", [], "Klucze do pokoi wydaje organizator"),
        ("posilek", "Obiadokolacja", at(d1, "16:30"), at(d1, "17:45"), "range", meal("Zupa dyniowa, pierś z kurczaka, sałatka", 48), ""),
        ("szkolenie", "Szkolenie", at(d1, "17:45"), at(d1, "19:00"), "range", workshop, ""),
        ("posilek", "Śniadanie", at(d2, "08:00"), at(d2, "10:00"), "range", meal("Bufet śniadaniowy", 48), ""),
        ("szkolenie", "Szkolenie", at(d2, "09:30"), at(d2, "17:00"), "range", workshop, ""),
        ("przerwa", "Przerwa kawowa", at(d2, "11:30"), at(d2, "11:45"), "range", coffee, ""),
        ("posilek", "Obiad", at(d2, "13:00"), at(d2, "14:00"), "range", meal("Rosół, schab, kompot", 48), ""),
        ("przerwa", "Przerwa kawowa", at(d2, "16:00"), at(d2, "16:15"), "range", coffee, ""),
        ("posilek", "Obiadokolacja", at(d2, "17:00"), at(d2, "18:00"), "range", meal("Pierogi, surówka", 48), ""),
        ("posilek", "Śniadanie", at(d3, "08:00"), at(d3, "10:00"), "range", meal("Bufet śniadaniowy", 48), ""),
        ("szkolenie", "Szkolenie", at(d3, "10:00"), at(d3, "14:00"), "range", workshop, ""),
        ("przyjazd", "Wymeldowanie", None, at(d3, "11:00"), "until", [], "Prosimy o zwolnienie pokoi"),
        ("przerwa", "Przerwa kawowa", at(d3, "11:00"), at(d3, "11:30"), "range", coffee, ""),
        ("posilek", "Obiad", at(d3, "14:00"), at(d3, "15:00"), "range", meal("Żurek, kotlet, sałatka", 48), ""),
        ("przyjazd", "Wyjazd", at(d3, "15:00"), None, "approx", [], "Dziękujemy i zapraszamy ponownie"),
    ])
    publish(user, hotel, training["id"])
    # A change after the first publication: workshop B moves, guests get an announcement.
    version = services.group_detail(user, hotel.id, training["id"])["version"]
    services.update_group(user, hotel.id, training["id"], {"announcement": "Warsztat grupy B przeniesiony do Sali Grabowej.", "version": version})
    publish(user, hotel, training["id"])

    weekend = services.create_group(user, hotel.id, {
        "name": "Weekend z muzyką na żywo", "organizer_name": HOTEL, "organizer_is_hotel": True,
        "first_day": d2.isoformat(), "last_day": d3.isoformat(), "theme": "braz-krem", "fonts": "grand-hotel--lato",
        "welcome": "Miłego weekendu w Bursztynowej Polanie.",
    })
    points(user, hotel, weekend["id"], [
        ("inne", "Dostawa kwiatów", at(d2, "07:00"), at(d2, "07:30"), "range",
         [{"space": sid("Recepcja"), "todo": "Odebrać i rozstawić w restauracji", "responsible": "Recepcja"}], "", "staff"),
        ("przyjazd", "Zameldowanie", at(d2, "15:00"), at(d2, "18:00"), "range", [{"space": sid("Recepcja"), "headcount": 30}], ""),
        ("impreza", "Kolacja przy muzyce", at(d2, "19:00"), at(d2, "23:00"), "range",
         [{"space": sid("Restauracja Pod Lipami"), "headcount": 30, "setup": "Stoły okrągłe, scena przy oknie",
           "required_items": ["Nagłośnienie", "2 mikrofony"], "menu": "Menu degustacyjne", "responsible": "Kierownik sali"}],
         "Zagra duet akustyczny"),
        ("posilek", "Śniadanie", at(d3, "08:00"), at(d3, "10:30"), "range", meal("Bufet śniadaniowy", 30), ""),
        ("inne", "Spacer z przewodnikiem", at(d3, "11:00"), at(d3, "12:00"), "range", [{"space": sid("Recepcja")}], "Zbiórka przed recepcją"),
        ("przyjazd", "Wymeldowanie", None, at(d3, "12:00"), "until", [], ""),
    ])
    publish(user, hotel, weekend["id"])

    links = {kind: services.create_link(user, hotel.id, {"kind": kind})["token"] for kind in ("screen", "staff")}
    guests = [{"name": g["name"], "token": services.create_link(user, hotel.id, {"kind": "guest", "group": g["id"]})["token"]}
              for g in (training, weekend)]
    return {"hotel": hotel, "screen": links["screen"], "staff": links["staff"], "guests": guests}


def points(user, hotel, group_id, rows):
    for kind, title, start, end, label, placements, note, *visibility in rows:
        version = services.group_detail(user, hotel.id, group_id)["version"]
        services.create_point(user, hotel.id, group_id, {
            "kind": kind, "title": title, "starts_at": start, "ends_at": end, "time_label": label,
            "placements": placements, "guest_note": note, "visibility": (visibility or ["guests"])[0], "version": version,
        })


def publish(user, hotel, group_id):
    version = services.group_detail(user, hotel.id, group_id)["version"]
    services.publish(user, hotel.id, group_id, {"version": version})


# --- the visitor's sandbox ---------------------------------------------------------------------------------

def purge_expired():
    """Expired sandboxes go with their throwaway accounts (they were never a person's)."""
    for hotel in Hotel.objects.filter(demo_until__lt=timezone.now()):
        for account in erase_hotel(hotel):
            account.delete()


@transaction.atomic
def start(request):
    purge_expired()
    if settings.DEMO_MAX <= 0:
        raise DomainError("Demo jest wyłączone", 503)
    if Hotel.objects.filter(demo_until__gt=timezone.now()).count() >= settings.DEMO_MAX:
        raise DomainError("Demo jest teraz oblegane — spróbuj za kilka minut", 503)  # backpressure, not a queue
    user = get_user_model().objects.create_user(f"demo-{secrets.token_hex(4)}")
    user.set_unusable_password()
    user.save()
    made = build(user, demo_until=timezone.now() + timedelta(hours=settings.DEMO_HOURS))
    sign_in(request, user, backend="django.contrib.auth.backends.ModelBackend")
    request.session[SESSION_KEY] = {
        "hotel": str(made["hotel"].id), "screen": f"/ekran/{made['screen']}", "staff": f"/o/{made['staff']}",
        "guests": [{"name": g["name"], "path": f"/g/{g['token']}"} for g in made["guests"]]}
    return info(request)


def current(request):
    demo = request.session.get(SESSION_KEY)
    if demo and Hotel.objects.filter(pk=demo["hotel"], demo_until__gt=timezone.now()).exists():
        return demo
    return None


def info(request):
    demo = current(request)
    if not demo:
        return {"demo": None}
    until = Hotel.objects.get(pk=demo["hotel"]).demo_until
    return {"demo": {**demo, "until": until.isoformat()}}
