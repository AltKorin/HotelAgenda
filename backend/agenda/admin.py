# Service panel for us (jazzmin), not for the hotel — CLAUDE.md.
from django.contrib import admin
from simple_history.admin import SimpleHistoryAdmin

from .models import AccessLink, AgendaPoint, Group, Hotel, HotelMember, HotelSlide, Placement, Publication, Space, TypicalPoint


@admin.register(Hotel)
class HotelAdmin(SimpleHistoryAdmin):
    list_display = ["name", "timezone", "outputs_enabled"]


@admin.register(HotelMember)
class HotelMemberAdmin(SimpleHistoryAdmin):
    list_display = ["user", "hotel", "role"]
    list_filter = ["hotel", "role"]


class PlacementInline(admin.TabularInline):
    model = Placement
    extra = 0


@admin.register(AgendaPoint)
class AgendaPointAdmin(SimpleHistoryAdmin):
    list_display = ["title", "group", "starts_at", "visibility"]
    list_filter = ["group__hotel"]
    inlines = [PlacementInline]


@admin.register(Group)
class GroupAdmin(SimpleHistoryAdmin):
    list_display = ["name", "hotel", "first_day", "last_day", "version"]
    list_filter = ["hotel"]


@admin.register(Publication)
class PublicationAdmin(admin.ModelAdmin):
    list_display = ["group", "seq", "group_version", "created_at", "actor"]
    readonly_fields = [f.name for f in Publication._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(AccessLink)
class AccessLinkAdmin(admin.ModelAdmin):
    list_display = ["kind", "hotel", "group", "revoked", "created_at"]
    exclude = ["digest", "public_token"]

    def has_add_permission(self, request):
        return False  # tokens are created by the service so the plain token can be shown once


admin.site.register(Space)
admin.site.register(TypicalPoint)
admin.site.register(HotelSlide)
