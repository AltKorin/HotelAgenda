"""Fictional demo hotel built around today (mirrors the structure of the hotel's real TV slides).

Idempotent: a second run does nothing unless --reset. Tokens are printed once — they are stored
only as digests (guest tokens excepted, they are printed on cards anyway).
"""

import os

from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand
from django.db import transaction

from agenda import demo
from agenda.demo import HOTEL
from agenda.models import Hotel


class Command(BaseCommand):
    help = "Create the fictional demo hotel with two groups, publications and links."

    def add_arguments(self, parser):
        parser.add_argument("--reset", action="store_true", help="Delete the demo hotel first.")

    @transaction.atomic
    def handle(self, *args, reset=False, **options):
        user, _ = get_user_model().objects.get_or_create(username="dyrektor-demo")
        # Local demo login only: password comes from .env (DEMO_PASSWORD), never from code.
        if os.environ.get("DEMO_PASSWORD"):
            user.set_password(os.environ["DEMO_PASSWORD"])
        else:
            user.set_unusable_password()
        user.save()
        if reset:
            Hotel.objects.filter(name=HOTEL, demo_until__isnull=True).delete()  # never the visitors' sandboxes
        if Hotel.objects.filter(name=HOTEL, demo_until__isnull=True).exists():
            self.stdout.write("Demo już istnieje (użyj --reset, żeby utworzyć od nowa i dostać nowe linki).")
            return
        made = demo.build(user)
        self.stdout.write(self.style.SUCCESS("Demo gotowe. Linki (pokazywane tylko teraz):"))
        self.stdout.write(f"  ekran:   /ekran/{made['screen']}")
        self.stdout.write(f"  obsługa: /o/{made['staff']}")
        for guest in made["guests"]:
            self.stdout.write(f"  gość ({guest['name']}): /g/{guest['token']}")
