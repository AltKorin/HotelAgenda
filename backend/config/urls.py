from django.contrib import admin
from django.urls import path

from agenda import views as agenda
from core import views

H = "api/hotels/<uuid:hotel_id>"
G = f"{H}/groups/<uuid:group_id>"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/health/", views.health),
    path("api/session/", views.session),
    path("api/register/", views.register),
    path("api/me/password/", views.password),
    path("api/terms/", views.terms),
    path("api/public-config/", views.public_config),
    # panel
    path("api/point-kinds/", agenda.point_kinds),
    path("api/hotels/", agenda.hotels),
    path(f"{H}/", agenda.hotel),
    path(f"{H}/export/", agenda.hotel_export),
    path(f"{H}/spaces/", agenda.spaces),
    path(f"{H}/spaces/<uuid:space_id>/", agenda.space),
    path(f"{H}/members/", agenda.members),
    path(f"{H}/members/<int:member_id>/", agenda.member),
    path(f"{H}/members/<int:member_id>/password/", agenda.member_password),
    path(f"{H}/groups/", agenda.groups),
    path(f"{G}/", agenda.group),
    path(f"{G}/points/", agenda.points),
    path(f"{G}/points/<uuid:point_id>/", agenda.point),
    path(f"{G}/points/from-typical/", agenda.typical_point),
    path(f"{G}/publish/", agenda.publish),
    path(f"{G}/preview/", agenda.preview),
    path(f"{G}/agenda.pdf", agenda.draft_agenda_pdf),
    path(f"{G}/karty-qr.pdf", agenda.qr_cards_pdf),
    path(f"{G}/points/<uuid:point_id>/karta.pdf", agenda.draft_karta_pdf),
    path(f"{H}/odprawa/<str:day>.pdf", agenda.odprawa_pdf),
    path(f"{H}/logo/", agenda.hotel_logo),
    path(f"{H}/slides/", agenda.slides),
    path(f"{H}/slides/order/", agenda.slide_order),
    path(f"{H}/slides/<int:slide_id>/", agenda.slide),
    path(f"{G}/organizer-logo/", agenda.organizer_logo),
    path(f"{H}/typical-points/", agenda.typical_points),
    path(f"{H}/typical-points/<uuid:typical_id>/", agenda.typical),
    path(f"{H}/links/", agenda.links),
    path(f"{H}/links/<uuid:link_id>/revoke/", agenda.revoke_link),
    # public outputs
    path("api/demo/", agenda.demo_start),
    path("api/ekran/<str:token>/", agenda.screen),
    path("api/g/<str:token>/", agenda.guest),
    path("api/o/<str:token>/", agenda.staff),
    path("api/g/<str:token>/agenda.pdf", agenda.guest_pdf),
    path("api/o/<str:token>/odprawa/<str:day>.pdf", agenda.staff_odprawa_pdf),
    path("api/o/<str:token>/karta/<uuid:point_id>.pdf", agenda.staff_karta_pdf),
]
