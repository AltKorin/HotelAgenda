# HANDOFF — HotelAgenda

> **Od 2026-10-26 kolejka pracy = OpenProject** (`~/Claude/OpenProject/op.py todo hotelagenda`, https://projekty.sudomie.pl/projects/hotelagenda). Listy „Następne kroki / Otwarte” w tym pliku zostały tam przeniesione i mogą być nieaktualne — nowe sprawy dopisuj w OpenProject.

Stan: 2026-10-16. MVP gotowe (kroki 1–6) + pakiet wdrożeniowy przećwiczony od zera. **PRODUKCJA: https://agenda.sudomie.pl** (LXC 106 na proxmox-hp, alias `hotelagenda-prod`, Cloudflare Tunnel `hotelagenda`) — szczegóły w `deploy/PROXMOX-HP.md`. Następne: część B `deploy/WDROZENIE.md` w hotelu. Klient: **Hotel Niedźwiadek** (Wdzydze) — `deploy/hotel.json` i logo przygotowane, przećwiczone lokalnie; czeka: rezerwacja DHCP dla LXC 106 na routerze, potwierdzenie `_do_potwierdzenia` przez dyrektora, slajdy hotelu.

## Dokumenty
- `PLAN.md` — **v2**, plan MVP; ustalenia w §1, kolejność prac §8, paleta §9.
- `GLOSSARY.md` — kanoniczne terminy (Grupa, Agenda, Punkt agendy, Karta zlecenia, Ekran, Odprawa…). Pisz w tym języku, także w UI.
- `BRIEF.md` — brief startowy; część założeń zastąpiona przez `PLAN.md` §1.
- `NOTICE.md` + `LICENSE` — pochodzenie kodu z Narrative Framework (MIT), licencje krojów PDF (OFL).
- `deploy/WDROZENIE.md` — runbook: co zebrać, część A (z domu), część B (w hotelu), C (rollback). `docs/weryfikacja.md` — co sprawdzone i czym, czego nie.

## Uruchomienie
- Docker: `cp .env.example .env` (wygeneruj sekrety), `docker compose up -d --build` → http://localhost:8090/ekran/demo i /ekran/motywy (na tej maszynie porty 8090/8453 w `.env`, bo 8080/8443 zajmuje inny projekt). Admin `/admin/` po `docker compose exec api python manage.py createsuperuser`.
- Panel: http://localhost:8090/panel — admin agencji `konrad` (hasło lokalne w `.env` jako `ADMIN_PASSWORD`; słabe, tylko lokalnie!) albo `dyrektor-demo` (hasło `DEMO_PASSWORD` z `.env`, ustawiane przez `seed_demo`).
- Ostatnie linki demo: `.seed-links.txt` (gitignored; nadpisywany przy `seed_demo --reset > .seed-links.txt`).
- Demo z prawdziwymi danymi: `docker compose exec api python manage.py seed_demo` (idempotentny; `--reset` = nowe linki) — wypisuje adresy `/ekran/…`, `/o/…`, `/g/…` (tokeny pokazywane tylko raz).
- E2E panelu: `cd frontend && CHROME=~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome npm run e2e -- <token-ekranu>` (loguje się, dodaje punkt z kartą, publikuje, sprawdza API ekranu i brak wycieku menu; zrzuty w `frontend/e2e/shots/`). Dodaje punkt do demo → potem `seed_demo --reset`.
- E2E wyjść: `cd frontend && CHROME=… npm run e2e:outputs -- <token-gościa> <token-obsługi>` (telefon gościa, obsługa, 3 PDF-y; nie zmienia danych). PDF-y do obejrzenia: `pdftoppm -png -r 60 e2e/shots/pdf-*.pdf`.
- Lokalnie: `cd backend && DEBUG=1 ../.venv/bin/python manage.py test agenda core` (66 testów; 2 współbieżne tylko na PostgreSQL); `cd frontend && npm run check && npm run dev`.
- Testy na PostgreSQL (wszystkie 66, bez pominięć): `docker compose exec -T api python manage.py test agenda core`.

## Stack
- Backend: Django 6.1 + DRF 3.18, jazzmin (panel serwisowy, nie dla hotelu), simple-history (middleware po auth), `LoginEvent` (niezmienialny), WhiteNoise dla statyk admina, cache w bazie zamiast Redisa. App `core` = infrastruktura.
- Frontend: React 19 + Vite 8 + TS 7, Motion, qrcode, fonty z `@fontsource-variable`. Ekran w `frontend/src/screen/`: logika czasu i rotacji `slides.ts` (czysta, `npm run check`), dane `data.ts` (cache w localStorage; 404 = link unieważniony → czyści ekran), demo `demo.ts` budowane względem dzisiejszej daty.
- Caddy: `/api/*`, `/admin*`, `/static/*` → api; reszta SPA (`try_files {path} /index.html`); CSP bez zewnętrznych domen.

## API (krok 2)
- Panel (sesja + CSRF): `/api/hotels/`, `/api/hotels/<h>/spaces/`, `…/groups/`, `…/groups/<g>/` (GET/PATCH), `…/points/` (POST), `…/points/<p>/` (PATCH/DELETE), `…/points/from-typical/`, `…/publish/`, `…/preview/`, `/api/hotels/<h>/links/`, `…/links/<l>/revoke/`. Każda zmiana agendy wymaga `version` (bramka 409).
- Publiczne (token w ścieżce): `/api/ekran/<t>/` (kontrakt = `frontend/src/screen/types.ts`), `/api/g/<t>/`, `/api/o/<t>/`. Czytają WYŁĄCZNIE opublikowane migawki; zły/unieważniony/wyłączony/po terminie → identyczne 404.
- Kod: `backend/agenda/` — `domain.py` (walidacja + projekcje gość/obsługa), `services.py` (mutacje), `access.py`, `public.py`, `views.py` (cienkie), `tests.py`.

## Panel (krok 3)
- `frontend/src/panel/`: `Panel.tsx` (logowanie, wybór hotelu, pulpit grup, nowa grupa), `GroupEditor.tsx` (zakładki dni, arkusz punktów, pasek publikacji, okna: dane grupy, typowe punkty, podgląd dla gości, wygląd ekranu, link dla gości z QR), `PointDrawer.tsx` (punkt + karty zlecenia; koniec ≤ początek = następny dzień), `Outputs.tsx` (linki ekranu i obsługi, pokazywane raz), `api.ts`, `router.ts` (pushState), `time.ts` (czysta logika + `time.check.ts`), `ui.tsx`, `panel.css`.
- Konflikt zapisu (409) → czerwony pasek „Ktoś inny zmienił tę agendę” + „Odśwież”.
- Konfigurator wyglądu = `screen/LookPicker.tsx`, wspólny dla `/ekran/motywy` i panelu.

## Wyjścia i PDF (krok 5)
- `frontend/src/guest/Guest.tsx` — telefon gościa w wyglądzie grupy (te same zmienne motywu co TV): ogłoszenie, „Teraz” / „Następnie” („za 25 min”, „jutro o 8:00”), dni, oznaczenia „zmiana”/„trwa”, przycisk PDF. `frontend/src/staff/Staff.tsx` — obsługa: „Teraz w hotelu”, dni, pełne karty, odprawa i karty w PDF.
- `screen/data.ts` → `useLive()` wspólne dla ekranu, gościa i obsługi: kopia offline w localStorage, odświeżanie co minutę i po powrocie do karty, 404 = link unieważniony.
- PDF: `backend/agenda/pdf.py` (budowanie HTML + WeasyPrint), `exports.py` (z której projekcji który PDF), szablony `agenda/templates/agenda/pdf/`. Endpointy: `/api/g/<t>/agenda.pdf`, `/api/o/<t>/odprawa/<RRRR-MM-DD>.pdf`, `/api/o/<t>/karta/<id>.pdf`; panel: `…/groups/<g>/agenda.pdf` (szkic), `…/points/<p>/karta.pdf` (szkic), `/api/hotels/<h>/odprawa/<dzień>.pdf` (opublikowane). Limit `THROTTLE_PDF` 30/min.
- PDF gościa budowany wyłącznie z widoku gościa; testy sprawdzają HTML przed renderem (mutacja „staff_view zamiast guest_view” wykrywana).

## Wdrożenie (`deploy/`)
- `push.sh` (rsync bez `.env`), `deploy.sh` (odmawia przy wartościach z szablonu / `DEBUG≠0`; build, healthcheck, `check --deploy`, testy), `backup.sh` (cron, 14 dumpów, weryfikacja `pg_restore --list`), `smoke.sh <url> [token-ekranu]`, `env.production.example` (tunel Cloudflare, `SSL_REDIRECT=1` + `TRUSTED_PROXY_CIDRS=private_ranges`, porty tylko na 127.0.0.1), `media/` (`logos/` i `slides/` = pliki wgrane w panelu; montowany do API z zapisem i do Caddy tylko do odczytu, `deploy.sh` ustawia właściciela uid 1000).
- `setup_hotel <plik|->` — hotel z JSON (wzór `backend/agenda/data/hotel.example.json`): sale, typowe punkty, konta (hasła wypisane raz), slajdy, `--enable-outputs`, `--links`. Idempotentny, błędny plik nic nie zapisuje.
- Compose: serwis `tunnel` (cloudflared 2026.9.3) w profilu `tunnel`; `deploy.sh` włącza go, gdy w `.env` jest `TUNNEL_TOKEN`.
- Karty QR do druku: panel → *Link dla gości* → *Karty z kodem QR (PDF)* (`…/groups/<g>/karty-qr.pdf`, 4 × A6 na A4).

## Logotypy (wgrywanie)
- Panel: *Ekran i obsługa* → *Logo hotelu* (od razu na wszystkich wyjściach, bez publikacji); *Dane grupy* → *Logo organizatora* (bramka wersji, widoczne po publikacji). API: `POST/DELETE /api/hotels/<h>/logo/`, `POST/DELETE …/groups/<g>/organizer-logo/` (multipart `file`; DELETE organizatora z JSON `{"version"}`).
- `backend/agenda/uploads.py`: tylko PNG/JPG/WebP ≤ 2 MB, ≤ 25 Mpx, kodowane od nowa do PNG (max 1200 px), losowa nazwa. Caddy: limit 3 MB tylko na ścieżkach logo, reszta 512 KB.
- E2E: `npm run e2e:logo -- <token-ekranu>` (konto `konrad`, `ADMIN_PASSWORD` z `.env`; wgrywa pliki do demo → potem `seed_demo --reset` i `rm deploy/media/logos/*.png`).

## Slajdy hotelu (wgrywanie)
- Panel: *Ekran i obsługa* → *Slajdy hotelu na ekranie*: wgrywanie (opis, opcjonalnie od/do), stan (na ekranie / zaplanowany / zakończony), kolejność ↑↓, edycja opisu i dat, usuwanie (kasuje plik). Na żywo, bez publikacji. Ostrzeżenie, gdy proporcje ≠ 16:9.
- API: `GET/POST /api/hotels/<h>/slides/` (multipart `file`, `alt`, `show_from`, `show_to`), `PATCH/DELETE …/slides/<id>/`, `POST …/slides/order/ {"ids": [...]}` (wszystkie slajdy hotelu, każdy raz). Limit 30 slajdów.
- `uploads.py`: wspólne `save_image(upload, LOGO|SLIDE)`; slajd → JPG ≤ 1920×1080, ≤ 5 MB. Caddy: 6 MB tylko na ścieżkach wgrywania.
- E2E `npm run e2e:logo` obejmuje logo i slajdy (zostawia pliki w demo → `seed_demo --reset` + `rm deploy/media/{logos,slides}/*`).

## Panel „Hotel” i pełny CRUD (16.10, zasada w /home/konrad/Claude/CLAUDE.md)
- `/panel/hotel`: nazwa hotelu (dyrektor), sale (lista z liczbą użyć, dodaj/zmień/usuń — w użyciu 409 z nazwami grup), typowe punkty (pełny formularz z kartą), konta pracowników (dyrektor: dodaj z hasłem pokazanym raz, rola, nowe hasło, usuń = dezaktywacja; ponowne dodanie przywraca konto). Usuwanie grupy: *Dane grupy* → *Usuń grupę* (z bramką wersji).
- Backend: `agenda/hotel_settings.py` (+ `services.delete_group`); role: konta i nazwa hotelu tylko dyrektor/admin (pierwsza realna różnica ról). `list_hotels` zwraca `role`.
- Audyt CRUD: tabela w `docs/weryfikacja.md`. E2E: `npm run e2e:crud` (lokalnie, konto `konrad`).

## Darmowe narzędzie (16.10, wzór fc.sudomie.pl) — WDROŻONE na agenda.sudomie.pl 16.10 22:20
- Publiczne: `/` landing z demo, `/rejestracja`, `/regulamin` (`src/site/`). GA4 tylko tam, przez `GA_MEASUREMENT_ID` w `.env` (puste = brak tagu) → `/api/public-config/`; Consent Mode v2 jak fc (`src/site/consent.ts`).
- Regulamin = plik `backend/agenda/data/regulamin.html`; wersja z komentarza w 1. linii. Zmiana treści = nowa data wersji + e-mail do użytkowników 14 dni wcześniej (§ 12).
- RODO: usunięcie hotelu w panelu (`hotel_settings.delete_hotel`) czyści dane, `historical_*`, pliki i anonimizuje konta; `retencja_danych` (env `RETENCJA_LOGIN_DNI`, 365) leci po nocnym backupie.
- Nowe env (prod): `GA_MEASUREMENT_ID`, `RETENCJA_LOGIN_DNI`, `THROTTLE_REGISTRATION` — wzór w `deploy/env.production.example`.
- Polityka prywatności: sekcja `#agenda` w `/home/konrad/Claude/sudomie.pl/polityka-prywatnosci.html` — zaakceptowana 16.10; wgrywać SAMYM `scp` tego pliku (alias `sudomie-deploy` wysyła też index.html). Kopia na serwerze: `polityka-prywatnosci.html.bak-2026-10-16`.
- Prod 16.10: deploy 78/78, smoke „Wszystko OK”, `e2e:signup https://agenda.sudomie.pl` 11/11, `retencja_danych --dry-run` działa. GA4 `G-9X4R75M9Q1` (osobna usługa, nie fc) w `.env` na serwerze od 16.10 22:33 (kopia `.env` przed zmianą: `/root/hotelagenda-env-przed-ga.bak`). Kontrola trackingu po każdym wdrożeniu: `node e2e/tracking-check.mjs` (8 sprawdzeń: tag, brak `_ga` przed zgodą, `gcs=G100` → `G101` po zgodzie, cookies usuwane po „Odrzucam”, brak tagu w panelu).
- E2E: `npm run e2e:signup [base-url]` — zakłada i usuwa własny hotel, nic nie zostawia.

## Przykładowe agendy (produkcja, 16.10)
- `deploy/przyklady/agendy_materialy.py` (idempotentny; `docker compose exec -T api python manage.py shell < …`): „Szkolenie — Lighthouse Centrum Wsparcia Rodzin Caritas” 9–11.10 (wierny zapis slajdów z `Materiały/`, wzór) i „PRZYKŁAD — szkolenie (wg agendy Caritas)” 16–18.10 (widoczny teraz na ekranie — **usunąć przed startem**: Dane grupy → Usuń grupę). Logo organizatora wycięte ze slajdu: `deploy/media/organizatorzy/caritas-lighthouse.png`. Karty zlecenia przykładowe (bez liczby osób — slajdy jej nie podają).
- Lekcja: sala z karty zlecenia jest pokazywana gościom jako miejsce punktu — karty „zaplecza” (np. klucze na recepcji przy przyjeździe) dawać jako osobny punkt „tylko obsługa”.

## Demo bez rejestracji (28.10, wzór: Grafik) — WDROŻONE na agenda.sudomie.pl 28.10 17:55 (`DEMO_MAX=200` w `.env`)
- `backend/agenda/demo.py`: „Wypróbuj demo” = własna kopia Hotelu Bursztynowa Polana w sesji (konto `demo-<hex>` bez hasła,
  `Hotel.demo_until`), te same dane co `seed_demo` (`demo.build`). Wygasłe usuwa start kolejnego demo (z kontem i historią,
  `hotel_settings.erase_hotel`). Flaga `DEMO_MAX` (0 = przycisk ukryty, kod domyślnie 0), `DEMO_HOURS`, `THROTTLE_DEMO`.
- W piaskownicy wgrywanie logo/slajdów → 403 (`services.no_files_in_demo`) — inaczej 200 kopii × 30 slajdów zapełni dysk.
- Front: `panel/Demo.tsx` (przycisk na stronie, pasek z linkami: ekran, telefony gości, obsługa, „Załóż własne konto”).
- `seed_demo --reset` usuwa tylko hotel bez `demo_until` — wcześniej kasowałby też piaskownice odwiedzających (ta sama nazwa).

## Gotcha
- Bez `DJANGO_SECRET_KEY` albo `DEBUG=1` Django celowo nie startuje.
- Wygląd ekranu = dwa niezależne wybory per grupa: kolory `group.theme` (`themes.json`, 10) i czcionki `group.fonts` (`fonts.json`, 31 par Figmy; `null` = proponowane przez motyw). Konfigurator `/ekran/motywy`, pełny ekran `/ekran/demo?motyw=<id>&czcionki=<id>`. Nowy krój: sprawdź glify ą ć ę ł ń ó ś ź ż (metadane `latin-ext` kłamią: Alice, Philosopher, Rufina…), dodaj `@fontsource/<id>` + import w `fonts.css` + wpis w `fonts.json`.
- Kontrakt danych ekranu = `frontend/src/screen/types.ts`; test `test_screen_matches_frontend_contract` pilnuje kluczy po stronie backendu.
- Widok gościa = jawna lista pól w `domain.guest_point()` — nowe pole karty zlecenia NIE trafi do gościa, dopóki ktoś go tam nie dopisze. Test wycieków szuka znaczników w surowym body.
- Tokeny gościa trzymane jawnie (`AccessLink.public_token`), bo są drukowane i pokazywane jako QR na ekranie; obsługa/ekran tylko jako sha256.
- Hotel ma flagę `outputs_enabled` (feature flag) — bez niej wszystkie linki zwracają 404.
- Limit publiczny `THROTTLE_PUBLIC` 600/min na IP, bo goście dzielą jedno IP hotelowego Wi-Fi.
- `SSL_REDIRECT=1` tylko za proxy ustawiającym `X-Forwarded-Proto` (`SECURE_PROXY_SSL_HEADER` zawsze włączony); healthcheck wyłączony z przekierowania.
- Vite: `build.assetsInlineLimit: 0` — inaczej małe fonty idą jako `data:` i CSP (`font-src 'self'`) je blokuje (było: 36 błędów w konsoli, część znaków bez kroju).
- Zrzuty: rozszerzenie Chrome nie robi zrzutów, gdy okno jest w tle — używać Playwright (`npm run e2e`, Chromium z `~/.cache/ms-playwright`). `input type=time` w headless pokazuje AM/PM (locale), w polskiej przeglądarce 24h.
- `Placement.space` = `RESTRICT` (nie `PROTECT`): sali używanej w karcie nie da się usunąć osobno, ale razem z hotelem tak.
- WeasyPrint potrzebuje w obrazie `libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0` (Dockerfile). Kroje PDF to pełne TTF (Lato, Young Serif) — nie subsety `@fontsource`. Brak glifu ☐ w Lato → pola do odhaczenia rysowane CSS-em.
- `compose.yaml` ma `name: hotelagenda` → druga instancja na tym samym hoście (np. próba) MUSI mieć `COMPOSE_PROJECT_NAME` w swoim `.env`, inaczej podmienia kontenery pierwszej (zdarzyło się w próbie; dane całe dzięki wspólnemu wolumenowi).
- `createsuperuser` bez TTY (Claude Code `!`, skrypty): `--noinput` + `DJANGO_SUPERUSER_PASSWORD`.
- Sprawdzanie ciasteczek: `curl -I` (HEAD) nie dostaje `Set-Cookie` z `/api/session/` — używać GET (`curl -s -D - -o /dev/null`).
- Kontener API ma rootfs tylko do odczytu → `XDG_CACHE_HOME=/tmp` (compose), inaczej Fontconfig przy każdym PDF-ie: „No writable cache directories” (wyszło na produkcji).
- Sekrety produkcji tylko na serwerze: `ssh hotelagenda-prod grep ADMIN_PASSWORD /opt/hotelagenda/.env`; hasła kont hotelu: `/root/hotelagenda-start.txt`; aktualne linki ekranu/obsługi: `/root/hotelagenda-linki.txt`.
- Testy w kontenerze produkcyjnym: `SECURE_SSL_REDIRECT` i bezpieczne ciasteczka wyłączone, gdy `TESTING` (inaczej 36 testów pada na 301 — wyszło przy etapie 2).
- `push.sh` wyklucza `deploy/media/logos` i `deploy/media/slides` — inaczej `rsync --delete` skasowałby z serwera pliki wgrane w panelu (sprawdzone plikami-strażnikami).
- `pkill -f "<wzorzec>"` w jednym poleceniu z resztą skryptu zabija własną powłokę — zamykać serwery po porcie (`fuser -k PORT/tcp`).
- `Materiały/*.jpg` — slajdy z logotypami realnych podmiotów; w demo tylko fikcyjne (Bursztynowa Polana, Fundacja Wspólna Droga).
- Lokalnie w bazie dev jest też prawdziwy „Hotel Niedźwiadek” (z `setup_hotel`) i „Grupa testowa — szkolenie” z typowych punktów; linki w `.setup-niedzwiadek.txt` (gitignored). Hasła kont `dyrektor`/`recepcja` lokalnie nieznane — używać admina `konrad`.
- Źródło OSS (tylko odczyt): `/home/konrad/Claude/NarrativeFramework-OSS/web`.

## Podlinkowanie sudomie — 2026-10-28

Wdrożono stopkę publicznych stron z frontend/src/site/sudomie.ts; lista pochodzi z ../sudomie.pl/data/produkty.json. Zmieniono wyłącznie frontend web. Build, test slajdów i czasu, smoke 10/10, produkcja 390/1440 px OK.

Demo bez rejestracji pozostaje osobnym zadaniem [472](https://projekty.sudomie.pl/work_packages/472). Zadanie źródłowe: [473](https://projekty.sudomie.pl/work_packages/473).
