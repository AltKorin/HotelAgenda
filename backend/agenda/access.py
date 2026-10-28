"""One authority boundary for the panel API. Another hotel's objects answer 404, never 403."""

from core.domain_errors import DomainError

from .domain import identifier
from .models import Group, Hotel, HotelMember


def hotel_access(user, hotel_id, minimum="kierownik"):
    hotel = Hotel.objects.filter(pk=identifier(hotel_id, "Hotel")).first()
    if not hotel or not user.is_authenticated:
        raise DomainError("Hotel: nie znaleziono", 404)
    if user.is_superuser:  # agencja (CLAUDE.md: admin zawsze)
        hotel.role = "admin"
        return hotel
    member = HotelMember.objects.filter(hotel=hotel, user=user).first()
    if not member or (minimum == "dyrektor" and member.role != "dyrektor"):
        raise DomainError("Hotel: nie znaleziono", 404)
    hotel.role = member.role
    return hotel


def group_in(hotel, group_id, lock=False):
    qs = Group.objects.select_for_update() if lock else Group.objects
    group = qs.filter(hotel=hotel, pk=identifier(group_id, "Grupa")).first()
    if not group:
        raise DomainError("Grupa: nie znaleziono", 404)
    return group


def hotels_for(user):
    if user.is_superuser:  # all real hotels; visitors' demo sandboxes are not the agency's business
        return Hotel.objects.filter(demo_until__isnull=True).order_by("name")
    return Hotel.objects.filter(members__user=user).order_by("name")
