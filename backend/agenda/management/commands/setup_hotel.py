"""Set up a real hotel from a JSON file (agenda/data/hotel.example.json) — idempotent.

On the server the file lives outside the image: `docker compose exec -T api python manage.py
setup_hotel - < deploy/hotel.json` (path "-" = standard input).

Run again after editing the file: spaces and typical points are added/updated, slides replaced,
existing accounts keep their passwords (unless --reset-passwords). New passwords and new links are
printed ONCE; write them down or hand them over right away.
"""

import json
import secrets
import sys
from datetime import time

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from agenda import services
from agenda.domain import POINT_KINDS, hotel_zone
from agenda.models import Hotel, HotelMember, HotelSlide, Space, TypicalPoint
from core.domain_errors import DomainError

CARD_FIELDS = {"subgroup", "headcount", "setup", "menu", "required_items", "todo", "responsible"}


def clock(value, where):
    try:
        return time.fromisoformat(value)
    except (TypeError, ValueError):
        raise CommandError(f"{where}: godzina w formacie GG:MM, a jest {value!r}") from None


class Command(BaseCommand):
    help = "Utwórz lub zaktualizuj hotel z pliku JSON (sale, typowe punkty, konta, slajdy, linki)."

    def add_arguments(self, parser):
        parser.add_argument("path", help="plik JSON albo - (standardowe wejście)")
        parser.add_argument("--enable-outputs", action="store_true", help="Włącz ekran i linki (feature flag hotelu).")
        parser.add_argument("--links", action="store_true", help="Nowe linki ekranu i obsługi (stare przestają działać).")
        parser.add_argument("--base-url", default="", help="Adres publiczny do wypisania linków, np. https://agenda.hotel.pl")
        parser.add_argument("--reset-passwords", action="store_true", help="Nadaj nowe hasła także istniejącym kontom.")

    @transaction.atomic
    def handle(self, path, enable_outputs=False, links=False, base_url="", reset_passwords=False, **options):
        try:
            if path == "-":
                data = json.load(sys.stdin)
            else:
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
        except (OSError, json.JSONDecodeError) as error:
            raise CommandError(f"Nie da się odczytać {path}: {error}") from None
        if not isinstance(data, dict) or not isinstance(data.get("hotel"), dict):
            raise CommandError("Plik musi mieć obiekt „hotel” z polem „name”.")

        info = data["hotel"]
        name = str(info.get("name", "")).strip()
        if not name:
            raise CommandError("hotel.name jest wymagane.")
        timezone = info.get("timezone", "Europe/Warsaw")
        try:
            hotel_zone(timezone)
        except DomainError:
            raise CommandError(f"Nieznana strefa czasowa: {timezone}") from None
        hotel, created = Hotel.objects.get_or_create(name=name, defaults={"timezone": timezone})
        hotel.timezone, hotel.logo = timezone, info.get("logo", "")
        if enable_outputs:
            hotel.outputs_enabled = True
        hotel.save()
        self.stdout.write(f"{'Utworzono' if created else 'Zaktualizowano'} hotel: {hotel.name}")

        spaces = {}
        for space_name in data.get("spaces", []):
            space_name = str(space_name).strip()
            if not space_name:
                raise CommandError("Pusta nazwa sali w „spaces”.")
            spaces[space_name], _ = Space.objects.get_or_create(hotel=hotel, name=space_name)
        self.stdout.write(f"Sale: {len(spaces)}")

        for i, item in enumerate(data.get("typical_points", [])):
            where = f"typical_points[{i}]"
            if item.get("kind") not in POINT_KINDS:
                raise CommandError(f"{where}: rodzaj musi być jednym z {sorted(POINT_KINDS)}")
            label = item.get("label", "range")
            if label not in ("range", "until", "approx"):
                raise CommandError(f"{where}: label to range, until albo approx")
            start = clock(item.get("start") or item.get("end"), where)
            end = clock(item["end"], where) if item.get("end") else None
            if label == "range" and (not end or end <= start):
                raise CommandError(f"{where}: punkt od–do wymaga końca po początku")
            space = spaces.get(item.get("space")) if item.get("space") else None
            if item.get("space") and not space:
                raise CommandError(f"{where}: sali {item['space']!r} nie ma w „spaces”")
            card = item.get("card", {})
            if not isinstance(card, dict) or set(card) - CARD_FIELDS:
                raise CommandError(f"{where}: karta może mieć tylko pola {sorted(CARD_FIELDS)}")
            TypicalPoint.objects.update_or_create(
                hotel=hotel, title=str(item.get("title", "")).strip() or "Punkt", start_time=start,
                defaults={"kind": item["kind"], "end_time": end, "time_label": label, "space": space, "card": card,
                          "guest_note": str(item.get("guest_note", ""))[:300]},
            )
        self.stdout.write(f"Typowe punkty: {hotel.typical_points.count()}")

        User = get_user_model()
        for account in data.get("accounts", []):
            username, role = account.get("username", ""), account.get("role")
            if role not in ("dyrektor", "kierownik") or not username:
                raise CommandError(f"Konto {account!r}: potrzebny username i rola dyrektor/kierownik")
            user, new = User.objects.get_or_create(username=username)
            if new or reset_passwords:
                password = secrets.token_urlsafe(12)
                user.set_password(password)
                user.save()
                self.stdout.write(self.style.WARNING(f"Konto {username} ({role}) — hasło: {password}"))
            HotelMember.objects.update_or_create(hotel=hotel, user=user, defaults={"role": role})

        if "slides" in data:
            hotel.slides.all().delete()
            for order, slide in enumerate(data["slides"]):
                HotelSlide.objects.create(hotel=hotel, image=slide["image"], alt=slide.get("alt", ""), order=order,
                                          show_from=slide.get("show_from"), show_to=slide.get("show_to"))
            self.stdout.write(f"Slajdy hotelu: {len(data['slides'])}")

        if links:
            hotel.links.filter(kind__in=("screen", "staff")).update(revoked=True)
            admin = User.objects.filter(is_superuser=True).first()
            if not admin:
                raise CommandError("Do tworzenia linków potrzebne jest konto administratora (createsuperuser).")
            for kind, path_prefix, label in (("screen", "ekran", "Ekran w holu"), ("staff", "o", "Obsługa")):
                token = services.create_link(admin, hotel.id, {"kind": kind})["token"]
                self.stdout.write(self.style.SUCCESS(f"{label}: {base_url}/{path_prefix}/{token}"))
        self.stdout.write(self.style.SUCCESS(f"Gotowe. Ekran i linki {'włączone' if hotel.outputs_enabled else 'WYŁĄCZONE (--enable-outputs)'}."))
