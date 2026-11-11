"""Self-service accounts: registration of a new hotel, own password, the regulamin.

RODO — czynność „konto w Agendzie” (django.contrib.auth.User):
· dane: e-mail (jest też loginem), hasło (skrót), data ostatniego logowania
· cel: logowanie do panelu hotelu i kontakt w sprawie usługi
· podstawa: art. 6 ust. 1 lit. b (umowa — regulamin)
· retencja: do usunięcia hotelu przez klienta; wtedy konto bez innych hoteli jest anonimizowane
  (`agenda.hotel_settings.delete_hotel`)
· dostęp: dyrektor hotelu (lista kont), my (admin serwisowy)
Danych gości nie zbieramy: gość widzi agendę z linku, bez konta i bez cookies.
"""

import hashlib
import re
from functools import cache
from pathlib import Path

from django.contrib.auth import get_user_model, update_session_auth_hash
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.db import IntegrityError, transaction

from . import newsletter
from .domain_errors import DomainError
from .models import TermsAcceptance
from .signals import client_ip

TERMS_FILE = Path(__file__).resolve().parent.parent / "agenda" / "data" / "regulamin.html"


@cache
def terms():
    """One source: the file. Version from its first-line comment, hash over the exact bytes served."""
    raw = TERMS_FILE.read_bytes()
    version = re.search(rb"wersja: ([\d-]+)", raw).group(1).decode()
    return {"version": version, "sha256": hashlib.sha256(raw).hexdigest(), "html": raw.decode()}


def password_errors(password, user):
    try:
        validate_password(password, user)
    except ValidationError as error:
        raise DomainError(" ".join(error.messages)) from None


def text(data, key, limit):
    value = data.get(key, "")
    if not isinstance(value, str) or len(value) > limit:
        raise DomainError("Nieprawidłowe pola formularza")
    return value


@transaction.atomic
def register(request, data):
    """New account + new hotel; the person becomes its director. Returns the user, not logged in yet."""
    from agenda.models import Hotel, HotelMember

    if not isinstance(data, dict):
        raise DomainError("Oczekiwano obiektu JSON")
    if text(data, "website", 200):  # honeypot: people never see this field
        raise DomainError("Nie udało się założyć konta")
    email = text(data, "email", 150).strip().lower()
    password = text(data, "password", 4096)
    hotel_name = text(data, "hotel", 200).strip()
    try:
        validate_email(email)
    except ValidationError:
        raise DomainError("Podaj poprawny adres e-mail") from None
    if not hotel_name:
        raise DomainError("Podaj nazwę hotelu")
    if data.get("accept") is not True:
        raise DomainError("Zaakceptuj regulamin, żeby założyć konto")
    User = get_user_model()
    if User.objects.filter(username__iexact=email).exists():
        raise DomainError("Konto z tym adresem już istnieje — zaloguj się", 409)
    password_errors(password, User(username=email, email=email))
    try:
        with transaction.atomic():
            user = User.objects.create_user(email, email=email, password=password)
    except IntegrityError:  # two submits of the same form at once
        raise DomainError("Konto z tym adresem już istnieje — zaloguj się", 409) from None
    hotel = Hotel.objects.create(name=hotel_name, outputs_enabled=True)
    HotelMember.objects.create(hotel=hotel, user=user, role="dyrektor")
    current = terms()
    TermsAcceptance.objects.create(user=user, version=current["version"], sha256=current["sha256"], ip=client_ip(request))
    if data.get("newsletter") is True and newsletter.wlaczony():
        # Dopiero po zatwierdzeniu transakcji: nieudana rejestracja nie zapisuje nikogo do newslettera.
        transaction.on_commit(lambda ip=client_ip(request): newsletter.zapisz(email, ip))
    return user, hotel


def change_password(request, data):
    if not isinstance(data, dict):
        raise DomainError("Oczekiwano obiektu JSON")
    user = request.user
    if not user.check_password(text(data, "current", 4096)):
        raise DomainError("Obecne hasło się nie zgadza")
    new = text(data, "new", 4096)
    password_errors(new, user)
    user.set_password(new)
    user.save(update_fields=["password"])
    update_session_auth_hash(request, user)  # stay logged in here, other sessions end
    return {"changed": True}
