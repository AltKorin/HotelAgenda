"""HTTP is a thin layer: parse, call one service, map DomainError to a status."""

from functools import wraps

from django.http import HttpResponse

from rest_framework.decorators import api_view, authentication_classes, parser_classes, permission_classes, throttle_classes
from rest_framework.parsers import MultiPartParser

from core.transport import BoundedJSONParser
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle

from core.domain_errors import DomainError

from core.views import PostThrottle, csrf_denied

from . import demo, exports, hotel_settings, pdf, public, services


def answer(fn, created=False):
    @wraps(fn)
    def view(request, *args, **kwargs):
        try:
            return Response(fn(request, *args, **kwargs), status=201 if created and request.method == "POST" else 200)
        except DomainError as error:
            return Response({"error": str(error)}, status=error.status)

    return view


# --- panel (session login, CSRF) ------------------------------------------------------------

@api_view(["GET"])
def point_kinds(request):
    from .domain import KIND_LIST

    return Response(KIND_LIST)


@api_view(["GET"])
@answer
def hotels(request):
    return services.list_hotels(request.user)


@api_view(["PATCH", "DELETE"])
@answer
def hotel(request, hotel_id):
    if request.method == "DELETE":
        result = hotel_settings.delete_hotel(request.user, hotel_id, request.data)
        if result["account_removed"]:
            request.session.flush()  # not logout(): that would log a fresh IP for an erased account
        return result
    return hotel_settings.update_hotel(request.user, hotel_id, request.data)


@api_view(["GET"])
def hotel_export(request, hotel_id):
    response = answer(lambda r: hotel_settings.export_hotel(r.user, hotel_id))(request)
    if response.status_code == 200:
        response["Content-Disposition"] = 'attachment; filename="agenda-dane-hotelu.json"'
    return response


@api_view(["GET", "POST"])
@answer
def spaces(request, hotel_id):
    if request.method == "POST":
        return services.create_space(request.user, hotel_id, request.data)
    return hotel_settings.list_spaces(request.user, hotel_id)


@api_view(["PATCH", "DELETE"])
@answer
def space(request, hotel_id, space_id):
    if request.method == "DELETE":
        return hotel_settings.delete_space(request.user, hotel_id, space_id)
    return hotel_settings.rename_space(request.user, hotel_id, space_id, request.data)


def _members(request, hotel_id):
    if request.method == "POST":
        return hotel_settings.create_member(request.user, hotel_id, request.data)
    return hotel_settings.list_members(request.user, hotel_id)


members = api_view(["GET", "POST"])(answer(_members, created=True))


@api_view(["PATCH", "DELETE"])
@answer
def member(request, hotel_id, member_id):
    if request.method == "DELETE":
        return hotel_settings.delete_member(request.user, hotel_id, member_id)
    return hotel_settings.update_member(request.user, hotel_id, member_id, request.data)


@api_view(["POST"])
@answer
def member_password(request, hotel_id, member_id):
    return hotel_settings.reset_password(request.user, hotel_id, member_id)


def _groups(request, hotel_id):
    if request.method == "POST":
        return services.create_group(request.user, hotel_id, request.data)
    return services.list_groups(request.user, hotel_id)


groups = api_view(["GET", "POST"])(answer(_groups, created=True))


@api_view(["GET", "PATCH", "DELETE"])
@answer
def group(request, hotel_id, group_id):
    if request.method == "DELETE":
        return services.delete_group(request.user, hotel_id, group_id, request.data)
    if request.method == "PATCH":
        return services.update_group(request.user, hotel_id, group_id, request.data)
    return services.group_detail(request.user, hotel_id, group_id)


def _points(request, hotel_id, group_id):
    return services.create_point(request.user, hotel_id, group_id, request.data)


points = api_view(["POST"])(answer(_points, created=True))


@api_view(["PATCH", "DELETE"])
@answer
def point(request, hotel_id, group_id, point_id):
    if request.method == "DELETE":
        return services.delete_point(request.user, hotel_id, group_id, point_id, request.data)
    return services.update_point(request.user, hotel_id, group_id, point_id, request.data)


def _typical(request, hotel_id, group_id):
    return services.add_typical_point(request.user, hotel_id, group_id, request.data)


typical_point = api_view(["POST"])(answer(_typical, created=True))


@api_view(["POST"])
@answer
def publish(request, hotel_id, group_id):
    return services.publish(request.user, hotel_id, group_id, request.data)


@api_view(["GET"])
@answer
def preview(request, hotel_id, group_id):
    return services.preview(request.user, hotel_id, group_id)


def _links(request, hotel_id):
    if request.method == "POST":
        return services.create_link(request.user, hotel_id, request.data)
    return services.list_links(request.user, hotel_id)


links = api_view(["GET", "POST"])(answer(_links, created=True))


def _typical_points(request, hotel_id):
    if request.method == "POST":
        return hotel_settings.create_typical(request.user, hotel_id, request.data)
    return hotel_settings.list_typical_points(request.user, hotel_id)


typical_points = api_view(["GET", "POST"])(answer(_typical_points, created=True))


@api_view(["PATCH", "DELETE"])
@answer
def typical(request, hotel_id, typical_id):
    if request.method == "DELETE":
        return hotel_settings.delete_typical(request.user, hotel_id, typical_id)
    return hotel_settings.update_typical(request.user, hotel_id, typical_id, request.data)


@api_view(["POST"])
@answer
def revoke_link(request, hotel_id, link_id):
    return services.revoke_link(request.user, hotel_id, link_id)


@api_view(["POST", "DELETE"])
@parser_classes([MultiPartParser])
@answer
def hotel_logo(request, hotel_id):
    upload = request.FILES.get("file") if request.method == "POST" else False
    return services.set_hotel_logo(request.user, hotel_id, upload)


@api_view(["POST", "DELETE"])
@parser_classes([MultiPartParser, BoundedJSONParser])  # DELETE carries {"version": n} as JSON
@answer
def organizer_logo(request, hotel_id, group_id):
    upload = request.FILES.get("file") if request.method == "POST" else False
    data = {"version": int(request.data["version"]) if str(request.data.get("version", "")).isdigit() else None}
    return services.set_organizer_logo(request.user, hotel_id, group_id, data, upload)


def _slides(request, hotel_id):
    if request.method == "POST":
        return services.create_slide(request.user, hotel_id, request.data, request.FILES.get("file"))
    return services.list_slides(request.user, hotel_id)


slides = api_view(["GET", "POST"])(parser_classes([MultiPartParser])(answer(_slides, created=True)))


@api_view(["PATCH", "DELETE"])
@answer
def slide(request, hotel_id, slide_id):
    if request.method == "DELETE":
        return services.delete_slide(request.user, hotel_id, slide_id)
    return services.update_slide(request.user, hotel_id, slide_id, request.data)


@api_view(["POST"])
@answer
def slide_order(request, hotel_id):
    return services.order_slides(request.user, hotel_id, request.data)


# --- public outputs (token in the path, no session) ------------------------------------------

class PublicThrottle(AnonRateThrottle):
    # Guests share the hotel Wi-Fi's single public IP: a per-IP limit must allow a full breakfast room.
    scope = "public"


def public_view(fn):
    view = answer(fn)
    for decorate in (throttle_classes([PublicThrottle]), permission_classes([AllowAny]), authentication_classes([])):
        view = decorate(view)
    return api_view(["GET"])(view)


def base_url(request):
    return f"{request.scheme}://{request.get_host()}"


screen = public_view(lambda request, token: public.screen(token, base_url(request)))
guest = public_view(lambda request, token: public.guest(token))
staff = public_view(lambda request, token: public.staff(token))


# --- printable PDFs --------------------------------------------------------------------------

class PdfThrottle(AnonRateThrottle):
    # Rendering a PDF costs CPU: a tighter per-client limit than the JSON outputs.
    scope = "pdf"

    def get_cache_key(self, request, view):
        ident = request.user.pk if request.user and request.user.is_authenticated else self.get_ident(request)
        return self.cache_format % {"scope": self.scope, "ident": ident}


def pdf_view(fn, public_access=False):
    @wraps(fn)
    def view(request, *args, **kwargs):
        try:
            name, html = fn(request, *args, **kwargs)
        except DomainError as error:
            return Response({"error": str(error)}, status=error.status)
        response = HttpResponse(pdf.render(html), content_type="application/pdf")
        response["Content-Disposition"] = f'attachment; filename="{name}"'
        return response

    view = throttle_classes([PdfThrottle])(view)
    if public_access:
        view = authentication_classes([])(permission_classes([AllowAny])(view))
    return api_view(["GET"])(view)


guest_pdf = pdf_view(lambda request, token: exports.guest_agenda(token), public_access=True)
staff_odprawa_pdf = pdf_view(lambda request, token, day: exports.staff_odprawa(token, day), public_access=True)
staff_karta_pdf = pdf_view(lambda request, token, point_id: exports.staff_karta(token, point_id), public_access=True)
draft_agenda_pdf = pdf_view(lambda request, hotel_id, group_id: exports.draft_agenda(request.user, hotel_id, group_id))
draft_karta_pdf = pdf_view(lambda request, hotel_id, group_id, point_id: exports.draft_karta(request.user, hotel_id, group_id, point_id))
qr_cards_pdf = pdf_view(lambda request, hotel_id, group_id: exports.qr_cards(request.user, hotel_id, group_id, base_url(request)))
odprawa_pdf = pdf_view(lambda request, hotel_id, day: exports.odprawa(request.user, hotel_id, day))


# --- public demo: „Wypróbuj demo” gives the visitor an own sandbox hotel (agenda.demo) -------------------------

class DemoThrottle(PostThrottle):
    scope = "demo"


@api_view(["GET", "POST"])
@permission_classes([AllowAny])
@throttle_classes([DemoThrottle])
def demo_start(request):
    if request.method == "POST" and csrf_denied(request):  # anonymous POST: DRF skips CSRF, we do not
        return Response({"error": "Błąd weryfikacji CSRF"}, status=403)
    return answer(lambda r: demo.start(r) if r.method == "POST" else demo.info(r))(request)
