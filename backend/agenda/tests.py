"""Agenda boundaries (PLAN.md §6): what guests must NOT see, what other hotels must NOT reach,
what a stale editor must NOT overwrite, which times must NOT be accepted."""

import io
import json
import tempfile
import threading
from pathlib import Path
from datetime import date, datetime, timezone as dt_timezone
from unittest import mock, skipUnless

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test import TestCase, TransactionTestCase, override_settings
from rest_framework.test import APIClient

from . import services
from .models import AgendaPoint, Group, Hotel, HotelMember, HotelSlide, Placement, Publication, Space, TypicalPoint

NOW = datetime(2026, 10, 10, 8, 0, tzinfo=dt_timezone.utc)  # 10:00 in Warsaw, day 2 of the stay
SECRETS = {
    "subgroup": "SEKRET-PODGRUPA",
    "setup": "SEKRET-USTAWIENIE",
    "menu": "SEKRET-MENU",
    "todo": "SEKRET-ZADANIE",
    "responsible": "SEKRET-ODPOWIEDZIALNY",
}


def frozen():
    return mock.patch("django.utils.timezone.now", return_value=NOW)


class World:
    """Two hotels, each with a director and a published group; tokens kept for the tests."""

    def __init__(self):
        User = get_user_model()
        self.hotels = {}
        for key, name in (("x", "Hotel X"), ("y", "Hotel Y")):
            hotel = Hotel.objects.create(name=name, outputs_enabled=True)
            user = User.objects.create_user(f"dyrektor-{key}", password="A-long-unusual-phrase-74!")
            HotelMember.objects.create(hotel=hotel, user=user, role="dyrektor")
            hall = Space.objects.create(hotel=hotel, name=f"Sala {key.upper()}")
            group = services.create_group(user, hotel.id, {
                "name": f"Grupa {key.upper()}-MARKER", "organizer_name": "Fundacja", "theme": "lazur-slonce",
                "first_day": "2026-10-09", "last_day": "2026-10-11",
            })
            self.hotels[key] = {"hotel": hotel, "user": user, "hall": hall, "group": group["id"]}
            self.add(key, "Szkolenie", "2026-10-10T09:30", "2026-10-10T17:00", placements=[{
                "space": str(hall.id), "headcount": 4321, "required_items": ["SEKRET-ELEMENT"],
                "service_from": "2026-10-10T08:30", "service_to": "2026-10-10T17:30", **SECRETS,
            }])
            self.add(key, "SEKRET-PUNKT-OBSLUGI", "2026-10-10T07:00", "2026-10-10T07:30", visibility="staff")
            self.publish(key)
            h = self.hotels[key]
            h["guest"] = services.create_link(user, hotel.id, {"kind": "guest", "group": group["id"]})["token"]
            h["staff"] = services.create_link(user, hotel.id, {"kind": "staff"})["token"]
            h["screen"] = services.create_link(user, hotel.id, {"kind": "screen"})["token"]

    def version(self, key):
        return Group.objects.get(pk=self.hotels[key]["group"]).version

    def add(self, key, title, start, end, **extra):
        h = self.hotels[key]
        body = {"kind": "szkolenie", "title": title, "starts_at": start, "ends_at": end, "version": self.version(key), **extra}
        return services.create_point(h["user"], h["hotel"].id, h["group"], body)

    def publish(self, key):
        h = self.hotels[key]
        return services.publish(h["user"], h["hotel"].id, h["group"], {"version": self.version(key)})


class Base(TestCase):
    def setUp(self):
        cache.clear()
        self.w = World()
        self.x, self.y = self.w.hotels["x"], self.w.hotels["y"]
        self.anon = APIClient()
        self.client = APIClient()
        self.client.force_login(self.x["user"])

    def get(self, url):
        with frozen():
            return self.anon.get(url)


class GuestLeakTests(Base):
    def public_bodies(self):
        return {
            "guest": self.get(f"/api/g/{self.x['guest']}/"),
            "screen": self.get(f"/api/ekran/{self.x['screen']}/"),
            "preview": self.client.get(f"/api/hotels/{self.x['hotel'].id}/groups/{self.x['group']}/preview/"),
        }

    def test_no_karta_zlecenia_field_or_staff_point_reaches_guests(self):
        for name, response in self.public_bodies().items():
            self.assertEqual(response.status_code, 200, name)
            body = response.content.decode()
            for marker in [*SECRETS.values(), "SEKRET-ELEMENT", "SEKRET-PUNKT-OBSLUGI", "4321",
                           '"cards"', '"realizer"', '"visibility"', '"service_from"', '"agreed"']:
                self.assertNotIn(marker, body, f"{marker} leaked into {name}")
            self.assertIn("Szkolenie", body)
            self.assertIn("Sala X", body)

    def test_staff_link_carries_the_whole_card(self):
        body = self.get(f"/api/o/{self.x['staff']}/").content.decode()
        for marker in [*SECRETS.values(), "SEKRET-ELEMENT", "SEKRET-PUNKT-OBSLUGI", "4321"]:
            self.assertIn(marker, body)

    def test_screen_matches_frontend_contract(self):
        data = self.get(f"/api/ekran/{self.x['screen']}/").json()
        self.assertEqual(set(data), {"hotel", "slide_seconds", "refresh_seconds", "groups", "hotel_slides"})
        group = data["groups"][0]
        self.assertEqual(set(group), {"id", "name", "theme", "fonts", "organizer", "first_day", "last_day",
                                      "guest_url", "announcement", "welcome", "points"})
        self.assertEqual(set(group["points"][0]), {"id", "title", "starts_at", "ends_at", "time_label", "places", "note", "changed"})
        self.assertTrue(group["guest_url"].endswith(f"/g/{self.x['guest']}"))


class IsolationTests(Base):
    def test_outputs_never_mix_hotels_or_groups(self):
        for url in (f"/api/g/{self.x['guest']}/", f"/api/ekran/{self.x['screen']}/", f"/api/o/{self.x['staff']}/"):
            body = self.get(url).content.decode()
            self.assertIn("Grupa X-MARKER", body)
            self.assertNotIn("Grupa Y-MARKER", body)

    def test_guest_link_shows_only_its_own_group(self):
        other = services.create_group(self.x["user"], self.x["hotel"].id, {
            "name": "Inna grupa", "organizer_name": "Ktoś", "first_day": "2026-10-10", "last_day": "2026-10-10"})
        services.publish(self.x["user"], self.x["hotel"].id, other["id"], {"version": other["version"]})
        guest = self.get(f"/api/g/{self.x['guest']}/").content.decode()
        self.assertNotIn("Inna grupa", guest)
        self.assertIn("Inna grupa", self.get(f"/api/ekran/{self.x['screen']}/").content.decode())

    def test_bad_tokens_all_look_the_same(self):
        services.revoke_link(self.x["user"], self.x["hotel"].id,
                             self.x["hotel"].links.get(kind="screen").id)
        responses = [
            self.get(f"/api/ekran/{self.x['screen']}/"),          # revoked
            self.get(f"/api/ekran/{self.x['guest']}/"),           # wrong kind
            self.get(f"/api/g/{self.x['staff']}/"),               # wrong kind
            self.get("/api/g/" + "a" * 43 + "/"),                 # unknown
            self.get("/api/g/x/"),                                # garbage
            self.get("/api/o/" + "<script>" * 4 + "/"),           # garbage
        ]
        Hotel.objects.filter(pk=self.y["hotel"].pk).update(outputs_enabled=False)
        responses.append(self.get(f"/api/g/{self.y['guest']}/"))  # feature flag off
        for response in responses:
            self.assertEqual((response.status_code, response.json()), (404, {"error": "Nie znaleziono"}))

    def test_guest_link_expires_after_the_stay(self):
        late = datetime(2026, 10, 15, 8, 0, tzinfo=dt_timezone.utc)  # last_day 11.10 + 3 days grace = 14.10
        with mock.patch("django.utils.timezone.now", return_value=late):
            self.assertEqual(self.anon.get(f"/api/g/{self.x['guest']}/").status_code, 404)
            self.assertEqual(self.anon.get(f"/api/o/{self.x['staff']}/").status_code, 200)

    def test_manager_of_one_hotel_cannot_touch_another(self):
        self.y_slide = HotelSlide.objects.create(hotel=self.y["hotel"], image="/media/slides/y.jpg", alt="Y").id
        self.y_member = HotelMember.objects.get(hotel=self.y["hotel"]).id
        y, g = self.y["hotel"].id, self.y["group"]
        point = AgendaPoint.objects.filter(group_id=g).first().id
        version = self.w.version("y")
        calls = [
            ("get", f"/api/hotels/{y}/groups/", None),
            ("post", f"/api/hotels/{y}/groups/", {"name": "n", "organizer_name": "o", "first_day": "2026-10-09", "last_day": "2026-10-09"}),
            ("get", f"/api/hotels/{y}/groups/{g}/", None),
            ("patch", f"/api/hotels/{y}/groups/{g}/", {"name": "przejęte", "version": version}),
            ("post", f"/api/hotels/{y}/groups/{g}/points/", {"kind": "inne", "title": "t", "starts_at": "2026-10-10T10:00", "ends_at": "2026-10-10T11:00", "version": version}),
            ("patch", f"/api/hotels/{y}/groups/{g}/points/{point}/", {"title": "przejęte", "version": version}),
            ("delete", f"/api/hotels/{y}/groups/{g}/points/{point}/", {"version": version}),
            ("post", f"/api/hotels/{y}/groups/{g}/publish/", {"version": version}),
            ("get", f"/api/hotels/{y}/groups/{g}/preview/", None),
            ("get", f"/api/hotels/{y}/spaces/", None),
            ("post", f"/api/hotels/{y}/spaces/", {"name": "Nowa"}),
            ("post", f"/api/hotels/{y}/links/", {"kind": "screen"}),
            ("get", f"/api/hotels/{y}/links/", None),
            ("get", f"/api/hotels/{y}/typical-points/", None),
            ("get", f"/api/hotels/{y}/groups/{g}/agenda.pdf", None),
            ("get", f"/api/hotels/{y}/groups/{g}/points/{point}/karta.pdf", None),
            ("get", f"/api/hotels/{y}/odprawa/2026-10-10.pdf", None),
            ("get", f"/api/hotels/{y}/groups/{g}/karty-qr.pdf", None),
            ("delete", f"/api/hotels/{y}/logo/", None),
            ("patch", f"/api/hotels/{y}/", {"name": "przejęty"}),
            ("patch", f"/api/hotels/{y}/spaces/{self.y['hall'].id}/", {"name": "przejęta"}),
            ("delete", f"/api/hotels/{y}/spaces/{self.y['hall'].id}/", None),
            ("post", f"/api/hotels/{y}/typical-points/", {"kind": "inne", "title": "x", "start_time": "08:00", "end_time": "09:00"}),
            ("get", f"/api/hotels/{y}/members/", None),
            ("post", f"/api/hotels/{y}/members/", {"username": "intruz", "role": "dyrektor"}),
            ("patch", f"/api/hotels/{y}/members/{self.y_member}/", {"role": "kierownik"}),
            ("post", f"/api/hotels/{y}/members/{self.y_member}/password/", None),
            ("delete", f"/api/hotels/{y}/members/{self.y_member}/", None),
            ("delete", f"/api/hotels/{y}/groups/{g}/", {"version": version}),
            ("get", f"/api/hotels/{y}/slides/", None),
            ("post", f"/api/hotels/{y}/slides/order/", {"ids": []}),
            ("patch", f"/api/hotels/{y}/slides/{self.y_slide}/", {"alt": "przejęte"}),
            ("delete", f"/api/hotels/{y}/slides/{self.y_slide}/", None),
            ("delete", f"/api/hotels/{y}/groups/{g}/organizer-logo/", None),
            ("post", f"/api/hotels/{y}/links/{self.y['hotel'].links.first().id}/revoke/", None),
            # own hotel URL, foreign group id
            ("get", f"/api/hotels/{self.x['hotel'].id}/groups/{g}/", None),
            ("post", f"/api/hotels/{self.x['hotel'].id}/groups/{g}/publish/", {"version": version}),
        ]
        before = (Group.objects.get(pk=g).version, Publication.objects.count(), AgendaPoint.objects.count())
        for method, url, body in calls:
            response = getattr(self.client, method)(url, body, format="json")
            self.assertEqual(response.status_code, 404, f"{method} {url}")
        self.assertEqual(before, (Group.objects.get(pk=g).version, Publication.objects.count(), AgendaPoint.objects.count()))
        self.assertEqual(HotelSlide.objects.get(pk=self.y_slide).alt, "Y")
        self.assertEqual(Hotel.objects.get(pk=self.y["hotel"].pk).name, "Hotel Y")
        self.assertEqual((HotelMember.objects.get(pk=self.y_member).role, get_user_model().objects.filter(username="intruz").exists()), ("dyrektor", False))
        self.assertTrue(Space.objects.filter(pk=self.y["hall"].pk, name="Sala Y").exists())
        self.assertEqual([h["name"] for h in self.client.get("/api/hotels/").json()], ["Hotel X"])

    def test_foreign_space_cannot_be_used_in_own_point(self):
        with self.assertRaisesMessage(Exception, "Nieznana sala"):
            self.w.add("x", "Kradzież sali", "2026-10-10T12:00", "2026-10-10T13:00",
                       placements=[{"space": str(self.y["hall"].id)}])

    def test_anonymous_gets_nothing_from_the_panel(self):
        self.assertEqual(self.anon.get("/api/hotels/").status_code, 403)
        self.assertEqual(self.anon.get(f"/api/hotels/{self.x['hotel'].id}/groups/").status_code, 403)


class PublicationTests(Base):
    def test_draft_edits_and_announcement_stay_invisible_until_published(self):
        urls = [f"/api/g/{self.x['guest']}/", f"/api/ekran/{self.x['screen']}/", f"/api/o/{self.x['staff']}/"]
        before = [self.get(u).content for u in urls]
        h = self.x
        services.update_group(h["user"], h["hotel"].id, h["group"], {"announcement": "NOWE-OGLOSZENIE", "version": self.w.version("x")})
        self.w.add("x", "NOWY-PUNKT", "2026-10-10T18:00", "2026-10-10T19:00")
        self.assertEqual(before, [self.get(u).content for u in urls])
        self.w.publish("x")
        for url in urls:
            body = self.get(url).content.decode()
            self.assertIn("NOWE-OGLOSZENIE", body)
            self.assertIn("NOWY-PUNKT", body)

    def test_publishing_the_same_draft_twice_creates_one_publication(self):
        first = self.w.publish("x")
        self.assertEqual((first["created"], Publication.objects.filter(group_id=self.x["group"]).count()), (False, 1))

    def test_changed_marks_only_moved_and_new_points(self):
        h = self.x
        moved = AgendaPoint.objects.get(group_id=h["group"], title="Szkolenie")
        services.update_point(h["user"], h["hotel"].id, h["group"], moved.id, {
            "kind": "szkolenie", "title": "Szkolenie", "starts_at": "2026-10-10T10:00", "ends_at": "2026-10-10T17:00",
            "placements": [{"space": str(h["hall"].id)}], "version": self.w.version("x")})
        self.w.add("x", "Kolacja", "2026-10-10T19:00", "2026-10-10T21:00")
        self.w.publish("x")
        points = self.get(f"/api/g/{h['guest']}/").json()["group"]["points"]
        self.assertEqual({p["title"]: p["changed"] for p in points}, {"Szkolenie": True, "Kolacja": True})
        self.w.add("x", "Spacer", "2026-10-11T09:00", "2026-10-11T10:00")
        self.w.publish("x")
        points = self.get(f"/api/g/{h['guest']}/").json()["group"]["points"]
        self.assertEqual({p["title"]: p["changed"] for p in points}, {"Szkolenie": False, "Kolacja": False, "Spacer": True})

    def test_screen_rotation_only_includes_groups_in_the_hotel_today(self):
        h = self.x
        for name, first, last in (("Wyjechali", "2026-10-07", "2026-10-09"), ("Przyjadą", "2026-10-11", "2026-10-12")):
            g = services.create_group(h["user"], h["hotel"].id, {"name": name, "organizer_name": "o", "first_day": first, "last_day": last})
            services.publish(h["user"], h["hotel"].id, g["id"], {"version": g["version"]})
        HotelSlide.objects.create(hotel=h["hotel"], image="/a.svg", alt="Teraz SPA")
        HotelSlide.objects.create(hotel=h["hotel"], image="/b.svg", alt="Stara promocja", show_to=date(2026, 10, 1))
        HotelSlide.objects.create(hotel=h["hotel"], image="/c.svg", alt="Przyszła promocja", show_from=date(2026, 11, 1))
        data = self.get(f"/api/ekran/{h['screen']}/").json()
        self.assertEqual([g["name"] for g in data["groups"]], ["Grupa X-MARKER"])
        self.assertEqual([s["alt"] for s in data["hotel_slides"]], ["Teraz SPA"])

    def test_unpublished_group_is_absent_and_guest_sees_empty_agenda(self):
        h = self.x
        g = services.create_group(h["user"], h["hotel"].id, {"name": "Szkic", "organizer_name": "o", "first_day": "2026-10-10", "last_day": "2026-10-10"})
        token = services.create_link(h["user"], h["hotel"].id, {"kind": "guest", "group": g["id"]})["token"]
        self.assertEqual(self.get(f"/api/g/{token}/").json()["group"], None)
        self.assertNotIn("Szkic", self.get(f"/api/ekran/{h['screen']}/").content.decode())

    def test_publications_cannot_be_rewritten(self):
        publication = Publication.objects.first()
        publication.guest_view = {}
        with self.assertRaises(PermissionError):
            publication.save()


class VersionGateTests(Base):
    def test_stale_missing_or_fake_versions_are_rejected_without_changes(self):
        h = self.x
        url = f"/api/hotels/{h['hotel'].id}/groups/{h['group']}/"
        current = self.w.version("x")
        for version in (current - 1, current + 1, None, True, str(current), float(current)):
            body = {"name": "nadpisane"} if version is None else {"name": "nadpisane", "version": version}
            response = self.client.patch(url, body, format="json")
            self.assertEqual(response.status_code, 409, version)
        self.assertEqual(Group.objects.get(pk=h["group"]).name, "Grupa X-MARKER")
        ok = self.client.patch(url, {"name": "Nowa nazwa", "version": current}, format="json")
        self.assertEqual((ok.status_code, ok.json()["version"]), (200, current + 1))


class ValidationTests(Base):
    def rejects(self, message, **body):
        base = {"kind": "szkolenie", "title": "Punkt", "starts_at": "2026-10-10T10:00", "ends_at": "2026-10-10T11:00"}
        h = self.x
        with self.assertRaisesMessage(Exception, message):
            services.create_point(h["user"], h["hotel"].id, h["group"], {**base, **body, "version": self.w.version("x")})

    def test_times(self):
        self.rejects("Koniec musi być po początku", ends_at="2026-10-10T10:00")
        self.rejects("Koniec musi być po początku", ends_at="2026-10-10T09:00")
        self.rejects("wymaga początku i końca", ends_at=None)
        self.rejects("wymaga godziny końca", time_label="until", ends_at=None)
        self.rejects("nie ma godziny końca", time_label="approx")
        self.rejects("najwyżej 24 godziny", ends_at="2026-10-11T12:00")
        self.rejects("w dniach pobytu", starts_at="2026-10-12T10:00", ends_at="2026-10-12T11:00")
        self.rejects("oczekiwano daty i godziny", starts_at="jutro rano")
        self.rejects("oczekiwano daty i godziny", starts_at=1760000000)
        self.rejects("Nieznany sposób", time_label="kiedyś")

    def test_text_and_kind(self):
        self.rejects("jest wymagane", title="")
        self.rejects("jest wymagane", title="   \t ")
        self.rejects("oczekiwano tekstu", title=["Lista"])
        self.rejects("maksymalnie 200", title="x" * 201)
        self.rejects("Invalid storage text", title="nul\x00")
        self.rejects("Nieznany rodzaj", kind="koncert-rockowy")
        self.rejects("Nieznana widoczność", visibility="wszyscy")

    def test_karta_fields(self):
        hall = str(self.x["hall"].id)
        self.rejects("Liczba osób", placements=[{"space": hall, "headcount": -1}])
        self.rejects("Liczba osób", placements=[{"space": hall, "headcount": True}])
        self.rejects("Liczba osób", placements=[{"space": hall, "headcount": "30"}])
        self.rejects("Niezbędne elementy", placements=[{"space": hall, "required_items": "rzutnik"}])
        self.rejects("Nieznana sala", placements=[{"space": "nie-uuid"}])
        self.rejects("Nieznana sala", placements=[{}])
        self.rejects("Koniec obsługi", placements=[{"space": hall, "service_from": "2026-10-10T09:00", "service_to": "2026-10-10T08:00"}])
        self.rejects("Oczekiwano obiektu", placements=["Sala X"])

    def test_dst_gap_rejected_and_hotel_timezone_used(self):
        h = self.x
        g = services.create_group(h["user"], h["hotel"].id, {"name": "Wiosna", "organizer_name": "o", "first_day": "2026-03-29", "last_day": "2026-03-29"})
        with self.assertRaisesMessage(Exception, "zmiana czasu"):
            services.create_point(h["user"], h["hotel"].id, g["id"], {"kind": "inne", "title": "Nocny", "starts_at": "2026-03-29T02:30", "ends_at": "2026-03-29T03:30", "version": g["version"]})
        # 00:30 in Warsaw is still the previous day in UTC — the hotel's calendar decides.
        result = self.w.add("x", "Po północy", "2026-10-09T00:30", "2026-10-09T01:30")
        point = AgendaPoint.objects.get(pk=result["id"])
        self.assertEqual(point.starts_at.astimezone(dt_timezone.utc).date(), date(2026, 10, 8))
        # Over midnight is a valid span.
        self.w.add("x", "Bal", "2026-10-10T22:00", "2026-10-11T02:00")

    def test_group_days(self):
        h = self.x
        for first, last, message in (("2026-10-10", "2026-10-09", "przed pierwszym"), ("2026-01-01", "2026-12-31", "najwyżej 62"), ("10.10.2026", "2026-10-11", "RRRR-MM-DD")):
            with self.assertRaisesMessage(Exception, message):
                services.create_group(h["user"], h["hotel"].id, {"name": "n", "organizer_name": "o", "first_day": first, "last_day": last})
        with self.assertRaisesMessage(Exception, "poza nowe dni"):
            services.update_group(h["user"], h["hotel"].id, h["group"], {"first_day": "2026-10-11", "version": self.w.version("x")})

    def test_non_object_bodies(self):
        h = self.x
        for body in ([], "tekst", 5):
            with self.assertRaisesMessage(Exception, "Oczekiwano obiektu"):
                services.create_group(h["user"], h["hotel"].id, body)

    def test_link_rules(self):
        h = self.x
        with self.assertRaisesMessage(Exception, "Nieznany rodzaj"):
            services.create_link(h["user"], h["hotel"].id, {"kind": "admin"})
        with self.assertRaisesMessage(Exception, "całego hotelu"):
            services.create_link(h["user"], h["hotel"].id, {"kind": "screen", "group": h["group"]})
        with self.assertRaisesMessage(Exception, "nie znaleziono"):
            services.create_link(h["user"], h["hotel"].id, {"kind": "guest", "group": self.y["group"]})
        self.assertEqual(h["hotel"].links.get(kind="staff").public_token, "")  # only guest tokens are kept


class PdfTests(Base):
    MARKERS = [*SECRETS.values(), "SEKRET-ELEMENT", "SEKRET-PUNKT-OBSLUGI", "4321"]

    def test_guest_pdf_carries_no_karta_field(self):
        from . import exports

        with frozen():
            name, html = exports.guest_agenda(self.x["guest"])
        _, draft = exports.draft_agenda(self.x["user"], self.x["hotel"].id, self.x["group"])
        for body in (html, draft):
            for marker in self.MARKERS:
                self.assertNotIn(marker, body)
            self.assertIn("Szkolenie", body)
            self.assertIn("9:30–17:00", body)  # hotel wall-clock, not UTC
        self.assertIn("Szkic do uzgodnienia", draft)
        self.assertNotIn("Szkic", html)
        self.assertEqual(name, "agenda-grupa-x-marker.pdf")

    def test_guest_pdf_is_a_real_download(self):
        with frozen():
            response = self.anon.get(f"/api/g/{self.x['guest']}/agenda.pdf")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response["Content-Type"], "application/pdf")
        self.assertIn('attachment; filename="agenda-', response["Content-Disposition"])
        self.assertTrue(response.content.startswith(b"%PDF"))

    def test_odprawa_has_cards_of_that_day_only_and_one_hotel(self):
        from . import exports

        self.w.add("x", "JUTRZEJSZY-PUNKT", "2026-10-11T09:00", "2026-10-11T10:00")
        self.w.publish("x")
        _, html = exports.odprawa(self.x["user"], self.x["hotel"].id, "2026-10-10")
        for marker in self.MARKERS:
            self.assertIn(marker, html)
        self.assertNotIn("JUTRZEJSZY-PUNKT", html)
        self.assertNotIn("Grupa Y-MARKER", html)
        self.assertIn("Sobota, 10 października", html)

    def test_karta_only_from_own_hotel_and_published(self):
        from . import exports

        point_x = AgendaPoint.objects.get(group_id=self.x["group"], title="Szkolenie").id
        point_y = AgendaPoint.objects.get(group_id=self.y["group"], title="Szkolenie").id
        with frozen():
            _, html = exports.staff_karta(self.x["staff"], point_x)
            self.assertIn("SEKRET-MENU", html)
            self.assertIn("SEKRET-ELEMENT", html)
            for token, point in ((self.x["staff"], point_y), (self.x["guest"], point_x), ("x" * 43, point_x)):
                response = self.anon.get(f"/api/o/{token}/karta/{point}.pdf")
                self.assertEqual(response.status_code, 404)

    def test_bad_inputs(self):
        h = self.x
        for day in ("2026-13-40", "jutro", "10.10.2026"):
            self.assertEqual(self.client.get(f"/api/hotels/{h['hotel'].id}/odprawa/{day}.pdf").status_code, 400)
        self.assertEqual(self.anon.get(f"/api/hotels/{h['hotel'].id}/odprawa/2026-10-10.pdf").status_code, 403)
        g = services.create_group(h["user"], h["hotel"].id, {"name": "Szkic", "organizer_name": "o", "first_day": "2026-10-10", "last_day": "2026-10-10"})
        token = services.create_link(h["user"], h["hotel"].id, {"kind": "guest", "group": g["id"]})["token"]
        with frozen():
            self.assertEqual(self.anon.get(f"/api/g/{token}/agenda.pdf").status_code, 404)


def png_bytes(size=(40, 20), fmt="PNG", color=(200, 40, 40)):
    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", size, color).save(out, fmt)
    return out.getvalue()


class LogoUploadTests(Base):
    def setUp(self):
        super().setUp()
        self.media = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.media)
        self.override.enable()

    def tearDown(self):
        self.override.disable()

    def upload(self, url, content, name="logo.png", **fields):
        from django.core.files.uploadedfile import SimpleUploadedFile

        return self.client.post(url, {"file": SimpleUploadedFile(name, content), **fields}, format="multipart")

    def test_hotel_logo_is_re_encoded_and_served_by_every_output(self):
        from PIL import Image

        h = self.x
        response = self.upload(f"/api/hotels/{h['hotel'].id}/logo/", png_bytes((3000, 1000), "JPEG"), "logo.jpg")
        self.assertEqual(response.status_code, 200, response.content)
        path = response.json()["logo"]
        self.assertRegex(path, r"^/media/logos/[0-9a-f]{32}\.png$")
        stored = Path(self.media) / path.removeprefix("/media/")
        with Image.open(stored) as image:
            self.assertEqual((image.format, max(image.size)), ("PNG", 1200))  # re-encoded, downscaled
        self.assertEqual(self.get(f"/api/ekran/{h['screen']}/").json()["hotel"]["logo"], path)  # live, no publish needed
        self.assertEqual(self.client.delete(f"/api/hotels/{h['hotel'].id}/logo/").json(), {"logo": None})

    def test_rejected_files(self):
        url = f"/api/hotels/{self.x['hotel'].id}/logo/"
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        cases = {
            "SVG": (svg, "logo.svg", "PNG, JPG"),
            "tekst udający PNG": (b"\x89PNG\r\n\x1a\nto nie jest obraz", "logo.png", "To nie jest obraz"),
            "GIF": (png_bytes(fmt="GIF"), "logo.gif", "PNG, JPG"),
            "za ciężki": (b"0" * (2 * 1024 * 1024 + 1), "logo.png", "2 MB"),
            "za dużo pikseli": (png_bytes((6000, 5000)), "logo.png", "za duży"),
        }
        for label, (content, name, message) in cases.items():
            response = self.upload(url, content, name)
            self.assertEqual(response.status_code, 400, label)
            self.assertIn(message, response.json()["error"], label)
        self.assertEqual(self.client.post(url, {}, format="multipart").json()["error"], "Wybierz plik z logo")
        self.assertEqual(list(Path(self.media).rglob("*.png")), [])  # nothing stored
        self.assertEqual(Hotel.objects.get(pk=self.x["hotel"].pk).logo, "")

    def test_organizer_logo_goes_through_version_gate_and_publication(self):
        h = self.x
        url = f"/api/hotels/{h['hotel'].id}/groups/{h['group']}/organizer-logo/"
        stale = self.upload(url, png_bytes(), version=self.w.version("x") - 1)
        self.assertEqual(stale.status_code, 409)
        self.assertEqual(self.upload(url, png_bytes()).status_code, 409)  # no version at all
        ok = self.upload(url, png_bytes(), version=self.w.version("x"))
        self.assertEqual(ok.status_code, 200, ok.content)
        logo = ok.json()["organizer"]["logo"]
        self.assertIsNone(self.get(f"/api/g/{h['guest']}/").json()["group"]["organizer"]["logo"])  # draft
        self.w.publish("x")
        self.assertEqual(self.get(f"/api/g/{h['guest']}/").json()["group"]["organizer"]["logo"], logo)
        # Removing goes the same way the panel does it: DELETE with a JSON body carrying the version.
        removed = self.client.delete(url, {"version": self.w.version("x")}, format="json")
        self.assertEqual((removed.status_code, removed.json()["organizer"]["logo"]), (200, None))

    def test_anonymous_cannot_upload(self):
        response = self.anon.post(f"/api/hotels/{self.x['hotel'].id}/logo/", {}, format="multipart")
        self.assertEqual(response.status_code, 403)


class SlideUploadTests(LogoUploadTests.__bases__[0]):
    def setUp(self):
        super().setUp()
        self.media = tempfile.mkdtemp()
        self.override = override_settings(MEDIA_ROOT=self.media)
        self.override.enable()
        self.url = f"/api/hotels/{self.x['hotel'].id}/slides/"

    def tearDown(self):
        self.override.disable()

    def upload(self, content=None, name="slajd.jpg", **fields):
        from django.core.files.uploadedfile import SimpleUploadedFile

        content = png_bytes((3840, 2160), "JPEG") if content is None else content
        return self.client.post(self.url, {"file": SimpleUploadedFile(name, content), **fields}, format="multipart")

    def test_upload_order_dates_and_screen(self):
        from PIL import Image

        first = self.upload(alt="SPA")
        self.assertEqual(first.status_code, 201, first.content)
        body = first.json()
        self.assertRegex(body["image"], r"^/media/slides/[0-9a-f]{32}\.jpg$")
        self.assertEqual((body["width"], body["height"], body["state"]), (1920, 1080, "active"))
        with Image.open(Path(self.media) / body["image"].removeprefix("/media/")) as image:
            self.assertEqual(image.format, "JPEG")
        second = self.upload(png_bytes((800, 800)), "kwadrat.png", alt="Grudzień", show_from="2026-12-01", show_to="2026-12-31").json()
        self.assertEqual((second["state"], second["width"], second["height"]), ("planned", 800, 800))
        with frozen():  # 10.10.2026: the December slide is not on screen yet
            screen = self.get(f"/api/ekran/{self.x['screen']}/").json()
        self.assertEqual([s["alt"] for s in screen["hotel_slides"]], ["SPA"])
        ordered = self.client.post(f"{self.url}order/", {"ids": [second["id"], first.json()["id"]]}, format="json")
        self.assertEqual([s["alt"] for s in ordered.json()], ["Grudzień", "SPA"])
        edited = self.client.patch(f"{self.url}{second['id']}/", {"show_from": "", "show_to": None}, format="json").json()
        self.assertEqual((edited["state"], edited["alt"]), ("active", "Grudzień"))
        with frozen():
            screen = self.get(f"/api/ekran/{self.x['screen']}/").json()
        self.assertEqual([s["alt"] for s in screen["hotel_slides"]], ["Grudzień", "SPA"])  # order from the panel

    def test_rejections_store_nothing(self):
        svg = b'<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'
        for label, response, message in (
            ("SVG", self.upload(svg, "s.svg"), "PNG, JPG"),
            ("za ciężki", self.upload(b"0" * (5 * 1024 * 1024 + 1)), "5 MB"),
            ("daty odwrotnie", self.upload(show_from="2026-12-31", show_to="2026-12-01"), "przed początkiem"),
            ("zła data", self.upload(show_from="31.12.2026"), "RRRR-MM-DD"),
        ):
            self.assertEqual(response.status_code, 400, label)
            self.assertIn(message, response.json()["error"], label)
        self.assertEqual(self.client.post(self.url, {}, format="multipart").json()["error"], "Wybierz plik ze slajdem")
        self.assertEqual(list(Path(self.media).rglob("*.*")), [])
        self.assertFalse(HotelSlide.objects.filter(hotel=self.x["hotel"]).exists())

    def test_order_must_list_every_slide_once(self):
        a = self.upload().json()["id"]
        b = self.upload().json()["id"]
        foreign = HotelSlide.objects.create(hotel=self.y["hotel"], image="/media/slides/y.jpg", alt="Y").id
        for ids in ([a], [a, a], [a, b, foreign], [a, foreign], "a,b", [a, b, 999]):
            response = self.client.post(f"{self.url}order/", {"ids": ids}, format="json")
            self.assertEqual(response.status_code, 400, ids)

    def test_delete_removes_the_file_and_limit_holds(self):
        body = self.upload().json()
        stored = Path(self.media) / body["image"].removeprefix("/media/")
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete(f"{self.url}{body['id']}/").status_code, 200)
        self.assertFalse(stored.exists())
        HotelSlide.objects.bulk_create(HotelSlide(hotel=self.x["hotel"], image="/x.jpg", alt="x") for _ in range(30))
        self.assertEqual(self.upload().status_code, 409)


class QrCardTests(Base):
    def test_cards_need_a_guest_link_and_carry_it(self):
        from . import exports

        h = self.x
        _, html = exports.qr_cards(h["user"], h["hotel"].id, h["group"], "https://agenda.example.pl")
        self.assertIn(f"https://agenda.example.pl/g/{h['guest']}", html)
        self.assertIn("<svg", html)
        self.assertEqual(html.count('class="card"'), 4)
        g = services.create_group(h["user"], h["hotel"].id, {"name": "Bez linku", "organizer_name": "o", "first_day": "2026-10-10", "last_day": "2026-10-10"})
        response = self.client.get(f"/api/hotels/{h['hotel'].id}/groups/{g['id']}/karty-qr.pdf")
        self.assertEqual((response.status_code, response.json()["error"]), (409, "Najpierw utwórz link dla gości tej grupy"))


class SetupHotelTests(TestCase):
    EXAMPLE = Path(__file__).resolve().parent / "data" / "hotel.example.json"

    def run_setup(self, data=None, *args):
        from django.core.management import call_command

        out = io.StringIO()
        if data is None:
            call_command("setup_hotel", str(self.EXAMPLE), *args, stdout=out)
        else:
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f:
                json.dump(data, f)
            call_command("setup_hotel", f.name, *args, stdout=out)
        return out.getvalue()

    def test_example_file_is_idempotent(self):
        first = self.run_setup()
        hotel = Hotel.objects.get(name="Hotel Przykładowy")
        counts = (hotel.spaces.count(), hotel.typical_points.count(), hotel.members.count(), hotel.slides.count())
        self.assertEqual(counts, (5, 5, 2, 1))
        self.assertEqual(first.count("hasło:"), 2)
        self.assertFalse(hotel.outputs_enabled)
        second = self.run_setup(None, "--enable-outputs")
        hotel.refresh_from_db()
        self.assertEqual((hotel.spaces.count(), hotel.typical_points.count(), hotel.members.count(), hotel.slides.count()), counts)
        self.assertEqual(second.count("hasło:"), 0)  # existing accounts keep their passwords
        self.assertTrue(hotel.outputs_enabled)

    def test_bad_files_change_nothing(self):
        from django.core.management.base import CommandError

        base = json.loads(self.EXAMPLE.read_text(encoding="utf-8"))
        broken = [
            {**base, "hotel": {"name": " "}},
            {**base, "hotel": {**base["hotel"], "timezone": "Europe/Nowhere"}},
            {**base, "typical_points": [{"kind": "koncert", "title": "x", "start": "08:00", "end": "09:00"}]},
            {**base, "typical_points": [{"kind": "posilek", "title": "x", "start": "10:00", "end": "09:00"}]},
            {**base, "typical_points": [{"kind": "posilek", "title": "x", "start": "8", "end": "09:00"}]},
            {**base, "typical_points": [{"kind": "posilek", "title": "x", "start": "08:00", "end": "09:00", "space": "Piwnica"}]},
            {**base, "typical_points": [{"kind": "posilek", "title": "x", "start": "08:00", "end": "09:00", "card": {"hasło": "1"}}]},
            {**base, "accounts": [{"username": "x", "role": "prezes"}]},
        ]
        for data in broken:
            with self.assertRaises(CommandError, msg=data):
                self.run_setup(data)
        self.assertFalse(Hotel.objects.exists())
        self.assertFalse(get_user_model().objects.exists())

    def test_links_replace_old_ones(self):
        from django.core.management.base import CommandError

        with self.assertRaisesMessage(CommandError, "administratora"):
            self.run_setup(None, "--links")
        get_user_model().objects.create_superuser("admin", password="A-long-unusual-phrase-74!")
        out = self.run_setup(None, "--links", "--base-url", "https://agenda.example.pl")
        self.assertIn("Ekran w holu: https://agenda.example.pl/ekran/", out)
        self.run_setup(None, "--links")
        hotel = Hotel.objects.get(name="Hotel Przykładowy")
        self.assertEqual(hotel.links.filter(revoked=False).count(), 2)
        self.assertEqual(hotel.links.filter(revoked=True).count(), 2)


class HotelSettingsTests(Base):
    """CLAUDE.md: everything the client manages has list/add/edit/delete in the panel."""

    def url(self, tail=""):
        return f"/api/hotels/{self.x['hotel'].id}/{tail}"

    def test_group_delete_needs_version_and_takes_everything_with_it(self):
        g = self.x["group"]
        self.assertEqual(self.client.delete(self.url(f"groups/{g}/"), {"version": self.w.version("x") - 1}, format="json").status_code, 409)
        response = self.client.delete(self.url(f"groups/{g}/"), {"version": self.w.version("x")}, format="json")
        self.assertEqual(response.json(), {"deleted": True, "points": 2})
        self.assertFalse(Publication.objects.filter(group_id=g).exists())
        self.assertEqual(self.get(f"/api/g/{self.x['guest']}/").status_code, 404)  # guest link went with the group
        self.assertEqual(self.get(f"/api/ekran/{self.x['screen']}/").json()["groups"], [])

    def test_rooms_rename_and_delete_only_when_unused(self):
        hall = self.x["hall"].id
        self.assertEqual(self.client.patch(self.url(f"spaces/{hall}/"), {"name": "Sala Główna"}, format="json").json()["name"], "Sala Główna")
        self.client.post(self.url("spaces/"), {"name": "Pusta"}, format="json")
        self.assertEqual(self.client.patch(self.url(f"spaces/{hall}/"), {"name": "Pusta"}, format="json").status_code, 409)
        self.assertEqual(self.client.patch(self.url(f"spaces/{hall}/"), {"name": "  "}, format="json").status_code, 400)
        blocked = self.client.delete(self.url(f"spaces/{hall}/"))
        self.assertEqual(blocked.status_code, 409)
        self.assertIn("Grupa X-MARKER", blocked.json()["error"])
        rooms = {r["name"]: r for r in self.client.get(self.url("spaces/")).json()}
        self.assertEqual((rooms["Sala Główna"]["used"], rooms["Pusta"]["used"]), (1, 0))
        self.assertEqual(self.client.delete(self.url(f"spaces/{rooms['Pusta']['id']}/")).status_code, 200)

    def test_typical_points_crud_and_validation(self):
        body = {"kind": "posilek", "title": "Śniadanie", "time_label": "range", "start_time": "08:00", "end_time": "10:00",
                "space": str(self.x["hall"].id), "guest_note": "Bufet", "card": {"menu": "Jajecznica", "required_items": ["Kawa"]}}
        created = self.client.post(self.url("typical-points/"), body, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        tid = created.json()["id"]
        edited = self.client.patch(self.url(f"typical-points/{tid}/"), {**body, "title": "Brunch", "end_time": "11:00"}, format="json").json()
        self.assertEqual((edited["title"], edited["end_time"], edited["card"]["menu"]), ("Brunch", "11:00", "Jajecznica"))
        for bad, message in (({"title": ""}, "wymagane"), ({"end_time": "07:00"}, "po początku"), ({"start_time": "8"}, "GG:MM"),
                             ({"kind": "koncert"}, "rodzaj"), ({"space": str(self.y["hall"].id)}, "nie znaleziono"),
                             ({"card": {"headcount": -3}}, "Liczba osób"), ({"time_label": "until", "end_time": ""}, "godziny końca")):
            response = self.client.post(self.url("typical-points/"), {**body, **bad}, format="json")
            self.assertIn(message, response.json()["error"], bad)
        until = self.client.post(self.url("typical-points/"), {**body, "title": "Wymeldowanie", "time_label": "until", "start_time": "", "end_time": "11:00"}, format="json").json()
        self.assertEqual((until["start_time"], until["end_time"]), ("11:00", "11:00"))
        self.assertEqual(self.client.delete(self.url(f"typical-points/{tid}/")).status_code, 200)
        self.assertEqual([t["title"] for t in self.client.get(self.url("typical-points/")).json()], ["Wymeldowanie"])

    def test_accounts_are_the_directors_job(self):
        created = self.client.post(self.url("members/"), {"username": "ania.kowalska", "role": "kierownik"}, format="json")
        self.assertEqual(created.status_code, 201, created.content)
        account = created.json()
        self.assertGreaterEqual(len(account["password"]), 12)
        self.assertTrue(get_user_model().objects.get(username="ania.kowalska").check_password(account["password"]))
        self.assertNotIn("password", self.client.get(self.url("members/")).json()[0])
        manager = APIClient()
        manager.force_login(get_user_model().objects.get(username="ania.kowalska"))
        for method, tail in (("get", "members/"), ("post", "members/"), ("patch", ""), ("post", f"members/{account['id']}/password/")):
            self.assertEqual(getattr(manager, method)(self.url(tail), {"username": "x1x", "role": "dyrektor", "name": "x"}, format="json").status_code, 404, tail)
        self.assertEqual(manager.get(self.url("typical-points/")).status_code, 200)  # agenda work stays open
        for bad in ({"username": "ab", "role": "kierownik"}, {"username": "żółw", "role": "kierownik"}, {"username": "ok.login", "role": "prezes"}):
            self.assertEqual(self.client.post(self.url("members/"), bad, format="json").status_code, 400, bad)
        self.assertEqual(self.client.post(self.url("members/"), {"username": "ANIA.kowalska", "role": "kierownik"}, format="json").status_code, 409)
        reset = self.client.post(self.url(f"members/{account['id']}/password/")).json()["password"]
        self.assertNotEqual(reset, account["password"])
        # removed and added again: same account comes back (active, new password)
        self.assertEqual(self.client.delete(self.url(f"members/{account['id']}/")).status_code, 200)
        self.assertFalse(get_user_model().objects.get(username="ania.kowalska").is_active)
        again = self.client.post(self.url("members/"), {"username": "ania.kowalska", "role": "kierownik"}, format="json")
        self.assertEqual(again.status_code, 201, again.content)
        self.assertTrue(get_user_model().objects.get(username="ania.kowalska").is_active)
        # an active account of another hotel stays untouchable
        self.assertEqual(self.client.post(self.url("members/"), {"username": "dyrektor-y", "role": "kierownik"}, format="json").status_code, 409)

    def test_director_guards(self):
        me = HotelMember.objects.get(hotel=self.x["hotel"], user=self.x["user"])
        self.assertEqual(self.client.delete(self.url(f"members/{me.id}/")).json()["error"], "Nie możesz usunąć własnego konta")
        self.assertEqual(self.client.patch(self.url(f"members/{me.id}/"), {"role": "kierownik"}, format="json").status_code, 409)
        second = self.client.post(self.url("members/"), {"username": "drugi.dyrektor", "role": "dyrektor"}, format="json").json()
        self.assertEqual(self.client.patch(self.url(f"members/{me.id}/"), {"role": "kierownik"}, format="json").status_code, 200)
        other = APIClient()
        other.force_login(get_user_model().objects.get(username="drugi.dyrektor"))
        self.assertEqual(other.delete(self.url(f"members/{me.id}/")).status_code, 200)
        user = get_user_model().objects.get(pk=self.x["user"].pk)
        self.assertFalse(user.is_active)  # no other hotel: cannot log in any more, history keeps the author
        self.assertEqual(other.delete(self.url(f"members/{second['id']}/")).status_code, 409)  # self

    def test_hotel_name(self):
        self.assertEqual(self.client.patch(self.url(), {"name": "Hotel X Nowy"}, format="json").json()["name"], "Hotel X Nowy")
        self.assertEqual(self.client.patch(self.url(), {"name": " "}, format="json").status_code, 400)
        self.assertEqual(self.client.get("/api/hotels/").json()[0]["role"], "dyrektor")


class DeletionTests(Base):
    def test_room_in_use_cannot_be_deleted_but_hotel_can(self):
        from django.db.models import RestrictedError

        with self.assertRaises(RestrictedError):
            self.x["hall"].delete()
        self.x["hotel"].delete()
        self.assertFalse(Group.objects.filter(pk=self.x["group"]).exists())
        self.assertTrue(Group.objects.filter(pk=self.y["group"]).exists())


class EditorShapeTests(Base):
    def test_detail_round_trips_through_update_without_changes(self):
        h = self.x
        url = f"/api/hotels/{h['hotel'].id}/groups/{h['group']}/"
        detail = self.client.get(url).json()
        point = next(p for p in detail["points"] if p["title"] == "Szkolenie")
        self.assertEqual((point["starts_at"], point["placements"][0]["service_from"]), ("2026-10-10T09:30", "2026-10-10T08:30"))
        body = {k: v for k, v in point.items() if k != "id"}
        response = self.client.patch(f"{url}points/{point['id']}/", {**body, "version": detail["version"]}, format="json")
        self.assertEqual(response.status_code, 200, response.content)
        again = next(p for p in self.client.get(url).json()["points"] if p["id"] == point["id"])
        self.assertEqual(again, point)

    def test_links_list_shows_only_guest_tokens(self):
        links = self.client.get(f"/api/hotels/{self.x['hotel'].id}/links/").json()
        self.assertEqual({l["kind"]: bool(l["token"]) for l in links}, {"guest": True, "staff": False, "screen": False})


class TypicalPointTests(Base):
    def test_copy_is_independent_of_the_catalogue(self):
        h = self.x
        typical = TypicalPoint.objects.create(hotel=h["hotel"], kind="posilek", title="Śniadanie", guest_note="Bufet",
                                              start_time="08:00", end_time="10:00", space=h["hall"], card={"menu": "Jajecznica"})
        result = services.add_typical_point(h["user"], h["hotel"].id, h["group"], {"typical": str(typical.id), "day": "2026-10-11", "version": self.w.version("x")})
        typical.title, typical.card = "Brunch", {"menu": "Gofry"}
        typical.save()
        point = AgendaPoint.objects.get(pk=result["id"])
        self.assertEqual((point.title, point.placements.get().menu, point.guest_note), ("Śniadanie", "Jajecznica", "Bufet"))
        other = TypicalPoint.objects.create(hotel=self.y["hotel"], kind="posilek", title="Obce", start_time="08:00")
        with self.assertRaisesMessage(Exception, "nie znaleziono"):
            services.add_typical_point(h["user"], h["hotel"].id, h["group"], {"typical": str(other.id), "day": "2026-10-11", "version": self.w.version("x")})


@skipUnless(connection.vendor == "postgresql", "row locks need PostgreSQL")
class ConcurrencyTests(TransactionTestCase):
    def test_two_editors_with_the_same_version_one_wins(self):
        w = World()
        h = w.hotels["x"]
        version = w.version("x")
        results, barrier = [], threading.Barrier(2)

        def edit(name):
            barrier.wait()
            try:
                services.update_group(h["user"], h["hotel"].id, h["group"], {"name": name, "version": version})
                results.append("ok")
            except Exception as error:
                results.append(getattr(error, "status", repr(error)))
            finally:
                connection.close()

        threads = [threading.Thread(target=edit, args=(n,)) for n in ("A", "B")]
        [t.start() for t in threads]
        [t.join() for t in threads]
        self.assertEqual(sorted(results, key=str), [409, "ok"])
        self.assertEqual(Group.objects.get(pk=h["group"]).version, version + 1)

    def test_publish_and_edit_share_one_gate(self):
        w = World()
        h = w.hotels["x"]
        version = w.version("x")
        w.add("x", "Zmiana", "2026-10-10T12:00", "2026-10-10T13:00")  # draft now ahead of `version`
        with self.assertRaisesMessage(Exception, "odśwież"):
            services.publish(h["user"], h["hotel"].id, h["group"], {"version": version})


class HotelRemovalTests(Base):
    """RODO art. 17/20: the director exports and deletes the whole hotel from the panel."""

    def delete(self, client, hotel, confirm):
        return client.delete(f"/api/hotels/{hotel.id}/", {"confirm": confirm}, format="json")

    def test_export_has_everything_but_tokens(self):
        response = self.client.get(f"/api/hotels/{self.x['hotel'].id}/export/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("attachment", response["Content-Disposition"])
        body = response.content.decode()
        for marker in ("Grupa X-MARKER", "SEKRET-MENU", "Sala X", "dyrektor-x"):
            self.assertIn(marker, body)
        for token in (self.x["guest"], self.x["staff"], self.x["screen"]):
            self.assertNotIn(token, body)
        self.assertNotIn("Grupa Y-MARKER", body)

    def test_only_a_director_of_this_hotel_exports_or_deletes(self):
        from django.contrib.auth import get_user_model

        kierownik = get_user_model().objects.create_user("kier-x", password="A-long-unusual-phrase-74!")
        HotelMember.objects.create(hotel=self.x["hotel"], user=kierownik, role="kierownik")
        other = APIClient()
        other.force_login(kierownik)
        self.assertEqual(other.get(f"/api/hotels/{self.x['hotel'].id}/export/").status_code, 404)
        self.assertEqual(self.delete(other, self.x["hotel"], "Hotel X").status_code, 404)
        self.assertEqual(self.client.get(f"/api/hotels/{self.y['hotel'].id}/export/").status_code, 404)
        self.assertEqual(self.delete(self.client, self.y["hotel"], "Hotel Y").status_code, 404)
        self.assertTrue(Hotel.objects.filter(pk=self.y["hotel"].pk).exists())

    def test_wrong_confirmation_deletes_nothing(self):
        for confirm in ("", "hotel x", "Hotel", None, ["Hotel X"]):
            with self.subTest(confirm=confirm):
                self.assertEqual(self.delete(self.client, self.x["hotel"], confirm).status_code, 400)
        self.assertTrue(Hotel.objects.filter(pk=self.x["hotel"].pk).exists())

    def test_delete_takes_data_history_files_and_erases_lonely_accounts(self):
        from django.contrib.auth import get_user_model
        from django.core.files.uploadedfile import SimpleUploadedFile

        from core.models import LoginEvent, TermsAcceptance

        hotel, director = self.x["hotel"], self.x["user"]
        shared = get_user_model().objects.create_user("wspolny", password="A-long-unusual-phrase-74!")
        HotelMember.objects.create(hotel=hotel, user=shared, role="kierownik")
        HotelMember.objects.create(hotel=self.y["hotel"], user=shared, role="kierownik")
        LoginEvent.objects.create(kind="login", user=director, username="dyrektor-x", ip="203.0.113.5", user_agent="UA")
        LoginEvent.objects.create(kind="failed", username="dyrektor-x", ip="203.0.113.6")
        TermsAcceptance.objects.create(user=director, version="v", sha256="0" * 64, ip="203.0.113.7")
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            upload = SimpleUploadedFile("logo.png", png_bytes(), content_type="image/png")
            self.client.post(f"/api/hotels/{hotel.id}/logo/", {"file": upload}, format="multipart")
            logo = Path(media) / Hotel.objects.get(pk=hotel.pk).logo.removeprefix("/media/")
            self.assertTrue(logo.exists())
            with self.captureOnCommitCallbacks(execute=True):
                response = self.delete(self.client, hotel, " Hotel X ")
            self.assertEqual(response.status_code, 200, response.content)
            self.assertFalse(logo.exists())
        self.assertTrue(response.json()["account_removed"])
        self.assertFalse(Hotel.objects.filter(pk=hotel.pk).exists())
        self.assertFalse(Group.objects.filter(hotel_id=hotel.pk).exists())
        self.assertFalse(Hotel.history.filter(id=hotel.pk).exists())
        self.assertFalse(Group.history.filter(hotel_id=hotel.pk).exists())
        self.assertFalse(HotelMember.history.filter(hotel_id=hotel.pk).exists())
        self.assertFalse(AgendaPoint.history.filter(group_id=self.x["group"]).exists())
        self.assertFalse(Placement.history.filter(menu="SEKRET-MENU", point__isnull=True).exists()
                         or Placement.history.filter(space_id=self.x["hall"].pk).exists())
        director.refresh_from_db()
        self.assertEqual((director.username, director.is_active, director.has_usable_password()),
                         (f"usuniety-{director.pk}", False, False))
        events = LoginEvent.objects.filter(username=f"usuniety-{director.pk}")
        self.assertGreaterEqual(events.count(), 2)  # force_login in setUp logs one more
        self.assertFalse(LoginEvent.objects.filter(username="dyrektor-x").exists())
        self.assertFalse(events.exclude(ip=None).exists() or events.exclude(user_agent="").exists())
        self.assertIsNone(TermsAcceptance.objects.get().ip)
        shared.refresh_from_db()
        self.assertEqual((shared.username, shared.is_active), ("wspolny", True))  # still works in hotel Y
        # Hotel Y untouched; caller logged out
        self.assertTrue(Group.objects.filter(pk=self.y["group"]).exists())
        self.assertEqual(self.client.get("/api/hotels/").status_code, 403)


@override_settings(DEMO_MAX=3, DEMO_HOURS=24)
class SandboxDemoTests(TestCase):
    """„Wypróbuj demo”: every visitor gets an own hotel with live outputs; it all disappears, uploads are refused."""

    def setUp(self):
        cache.clear()  # the per-IP limit on new demos would carry over between tests

    def visitor(self):
        client = APIClient()
        started = client.post("/api/demo/", format="json")
        self.assertEqual(started.status_code, 200, started.content)
        return client, started.json()["demo"]

    def test_visitor_gets_own_hotel_with_working_outputs(self):
        a, demo_a = self.visitor()
        b, demo_b = self.visitor()
        self.assertNotEqual(demo_a["hotel"], demo_b["hotel"])
        self.assertEqual([h["id"] for h in a.get("/api/hotels/").json()], [demo_a["hotel"]])
        self.assertEqual(b.get(f"/api/hotels/{demo_a['hotel']}/groups/").status_code, 404)  # the other visitor's hotel
        anyone = APIClient()
        self.assertEqual(anyone.get("/api" + demo_a["screen"].replace("/ekran/", "/ekran/") + "/").status_code, 200)
        self.assertEqual(anyone.get("/api" + demo_a["staff"] + "/").status_code, 200)
        self.assertEqual(len(demo_a["guests"]), 2)
        self.assertEqual(anyone.get("/api" + demo_a["guests"][0]["path"] + "/").status_code, 200)
        self.assertEqual(a.get("/api/demo/").json()["demo"]["hotel"], demo_a["hotel"])
        self.assertIsNone(APIClient().get("/api/demo/").json()["demo"])

    def test_no_password_and_no_uploads(self):
        client, demo = self.visitor()
        account = HotelMember.objects.get(hotel_id=demo["hotel"]).user
        self.assertFalse(account.has_usable_password())
        png = io.BytesIO(b"\x89PNG\r\n\x1a\n" + b"0" * 64)
        png.name = "logo.png"
        self.assertEqual(client.post(f"/api/hotels/{demo['hotel']}/logo/", {"file": png}, format="multipart").status_code, 403)
        png.seek(0)
        self.assertEqual(client.post(f"/api/hotels/{demo['hotel']}/slides/", {"file": png, "alt": "x"}, format="multipart").status_code, 403)

    def test_limit_csrf_and_switch_off(self):
        for _ in range(3):
            self.visitor()
        self.assertEqual(APIClient().post("/api/demo/", format="json").status_code, 503)  # backpressure
        self.assertEqual(APIClient(enforce_csrf_checks=True).post("/api/demo/", format="json").status_code, 403)
        with override_settings(DEMO_MAX=0):
            self.assertEqual(APIClient().post("/api/demo/", format="json").status_code, 503)
            self.assertFalse(APIClient().get("/api/public-config/").json()["demo"])

    def test_expired_sandbox_disappears_with_its_account(self):
        client, demo = self.visitor()
        users = get_user_model().objects.count()
        later = datetime.now(dt_timezone.utc).replace(microsecond=0)
        from datetime import timedelta
        with mock.patch("django.utils.timezone.now", return_value=later + timedelta(hours=25)):
            self.assertIsNone(client.get("/api/demo/").json()["demo"])
            self.visitor()  # starting a new one sweeps the expired ones
        self.assertFalse(Hotel.objects.filter(pk=demo["hotel"]).exists())
        self.assertEqual(get_user_model().objects.count(), users)  # one gone, one new

    def test_seed_reset_and_superuser_leave_sandboxes_alone(self):
        from django.core.management import call_command

        _, demo = self.visitor()
        call_command("seed_demo", "--reset", stdout=io.StringIO())
        self.assertTrue(Hotel.objects.filter(pk=demo["hotel"]).exists())
        admin = get_user_model().objects.create_superuser("szef", password="A-long-unusual-phrase-74!")
        client = APIClient()
        client.force_authenticate(admin)
        self.assertNotIn(demo["hotel"], [h["id"] for h in client.get("/api/hotels/").json()])
