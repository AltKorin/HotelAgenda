import uuid

from django.conf import settings
from django.db import models
from simple_history.models import HistoricalRecords


class Hotel(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=200)
    timezone = models.CharField(max_length=64, default="Europe/Warsaw")
    logo = models.CharField(max_length=300, blank=True)  # path/URL; uploads come with the panel
    # Feature flag: screen, guest and staff links answer only when the hotel is switched on.
    outputs_enabled = models.BooleanField(default=False)
    # A visitor's sandbox from „Wypróbuj demo” (agenda.demo): erased after this moment. Empty = a real hotel.
    demo_until = models.DateTimeField(null=True, blank=True, db_index=True)
    history = HistoricalRecords()

    def __str__(self):
        return self.name


class HotelMember(models.Model):
    ROLES = [("dyrektor", "Dyrektor"), ("kierownik", "Kierownik")]

    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name="members")
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="hotel_memberships")
    role = models.CharField(max_length=10, choices=ROLES)
    history = HistoricalRecords()

    class Meta:
        constraints = [models.UniqueConstraint(fields=["hotel", "user"], name="unique_hotel_member")]


class Space(models.Model):
    """Sala, restauracja, recepcja — any place a point can happen in."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name="spaces")
    name = models.CharField(max_length=120)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["hotel", "name"], name="unique_space_name")]

    def __str__(self):
        return self.name


class TypicalPoint(models.Model):
    """Hotel's catalogue entry (np. śniadanie 8:00–10:00) copied into a group's agenda on demand."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name="typical_points")
    kind = models.CharField(max_length=20)
    title = models.CharField(max_length=200)
    start_time = models.TimeField()
    end_time = models.TimeField(null=True, blank=True)
    time_label = models.CharField(max_length=6, default="range")
    space = models.ForeignKey(Space, on_delete=models.SET_NULL, null=True, blank=True)
    card = models.JSONField(default=dict, blank=True)  # default karta zlecenia fields
    guest_note = models.CharField(max_length=300, blank=True)  # np. „Prosimy o zwolnienie pokoi”


class Group(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name="groups")
    name = models.CharField(max_length=200)
    organizer_name = models.CharField(max_length=200)
    organizer_is_hotel = models.BooleanField(default=False)
    organizer_logo = models.CharField(max_length=300, blank=True)
    first_day = models.DateField()
    last_day = models.DateField()
    agreed = models.BooleanField(default=False)  # „uzgodnione” z organizatorem, poza systemem
    announcement = models.CharField(max_length=300, blank=True)
    welcome = models.CharField(max_length=300, blank=True)
    theme = models.CharField(max_length=60, blank=True)
    fonts = models.CharField(max_length=80, blank=True)
    # One version gate for the whole agenda: every edit and every publish checks and bumps it.
    version = models.PositiveIntegerField(default=1)
    history = HistoricalRecords()


class AgendaPoint(models.Model):
    TIME_LABELS = [("range", "od–do"), ("until", "do"), ("approx", "ok.")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="points")
    kind = models.CharField(max_length=20)
    title = models.CharField(max_length=200)
    starts_at = models.DateTimeField()
    ends_at = models.DateTimeField(null=True, blank=True)
    time_label = models.CharField(max_length=6, choices=TIME_LABELS, default="range")
    realizer = models.CharField(max_length=10, choices=[("hotel", "Hotel"), ("organizer", "Organizator")], default="hotel")
    visibility = models.CharField(max_length=6, choices=[("guests", "Dla gości"), ("staff", "Tylko obsługa")], default="guests")
    guest_note = models.CharField(max_length=300, blank=True)
    history = HistoricalRecords()


class Placement(models.Model):
    """Punkt × sala = karta zlecenia. Nothing here except the space name ever reaches guests."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    point = models.ForeignKey(AgendaPoint, on_delete=models.CASCADE, related_name="placements")
    # RESTRICT: a room used in a karta cannot be deleted alone, but goes with its hotel.
    space = models.ForeignKey(Space, on_delete=models.RESTRICT)
    order = models.PositiveSmallIntegerField(default=0)
    subgroup = models.CharField(max_length=120, blank=True)
    headcount = models.PositiveIntegerField(null=True, blank=True)
    setup = models.CharField(max_length=300, blank=True)
    menu = models.TextField(blank=True)
    required_items = models.JSONField(default=list, blank=True)
    todo = models.TextField(blank=True)
    responsible = models.CharField(max_length=200, blank=True)
    service_from = models.DateTimeField(null=True, blank=True)
    service_to = models.DateTimeField(null=True, blank=True)
    history = HistoricalRecords()

    class Meta:
        ordering = ["order"]


class Publication(models.Model):
    """Append-only: what guests, the screen and staff saw from this moment on."""

    group = models.ForeignKey(Group, on_delete=models.CASCADE, related_name="publications")
    seq = models.PositiveIntegerField()
    group_version = models.PositiveIntegerField()
    guest_view = models.JSONField()
    staff_view = models.JSONField()
    actor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["group", "seq"], name="unique_publication_seq"),
            # Publishing the same draft twice is a no-op, not a second publication.
            models.UniqueConstraint(fields=["group", "group_version"], name="unique_publication_version"),
        ]

    def save(self, *args, **kwargs):
        if self.pk:
            raise PermissionError("Publication is immutable")
        super().save(*args, **kwargs)


class HotelSlide(models.Model):
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name="slides")
    image = models.CharField(max_length=300)
    alt = models.CharField(max_length=200)
    show_from = models.DateField(null=True, blank=True)
    show_to = models.DateField(null=True, blank=True)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]


class AccessLink(models.Model):
    KINDS = [("guest", "Link gościa"), ("staff", "Link obsługi"), ("screen", "Ekran")]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    hotel = models.ForeignKey(Hotel, on_delete=models.CASCADE, related_name="links")
    group = models.ForeignKey(Group, on_delete=models.CASCADE, null=True, blank=True, related_name="links")
    kind = models.CharField(max_length=6, choices=KINDS)
    digest = models.CharField(max_length=64, unique=True, editable=False)
    # Guest links are printed on cards and shown as QR on the lobby screen, so the token is kept
    # to rebuild that QR. Staff and screen tokens are shown once and stored only as a digest.
    public_token = models.CharField(max_length=64, blank=True, editable=False)
    revoked = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
