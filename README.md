# HotelAgenda — agenda grupy dla hoteli

Agenda pobytu grupy (szkolenie, konferencja, weekend) w jednym miejscu:

- **ekran w holu** — slajdy agendy na TV, rotacja punktów programu,
- **telefon gościa** — ta sama agenda pod linkiem lub kodem QR, działa też bez internetu (ostatnia pobrana wersja),
- **widok obsługi** — karty zlecenia na sale, godziny, odpowiedzialni, itemy do przygotowania,
- **plan dla grup** — punkty programu z podziałem na podgrupy i wymienionym wyposażeniem sal.

Hostowana wersja: <https://agenda.sudomie.pl> (demo bez rejestracji na stronie głównej).

## Stos

Django + Django REST Framework, PostgreSQL 17, React 19 + Vite + TypeScript, Docker Compose, Cloudflare Tunnel.
Podgląd projektu w licencji i decyzjach: `PLAN.md`, `BRIEF.md`, `docs/`.

## Uruchomienie lokalnie

```sh
cp .env.example .env       # sekrety, porty; wypełnij wartości
docker compose -p agenda-local up -d --build   # api + db (+ tunnel tylko z profilem)
cd frontend && npm ci && npm run build
```

Panel: `http://localhost:<PORT>/panel` — konto administratora agencji zakłada `seed_demo` (hasło z `.env`,
tylko lokalnie). Ekran i widoki gościa: `docker compose exec api python manage.py seed_demo` wypisuje adresy
z tokenami (pokazywane raz).

Testy backendu: `docker compose exec api python manage.py test` w katalogu `backend/`.

## Licencja

MIT — plik `LICENSE`. Prawa: Komorowski & Windorpski sp. z o.o.
