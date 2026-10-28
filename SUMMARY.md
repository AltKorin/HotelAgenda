## Sesja 2026-10-16
### Zrobiono
- Przeczytano brief oraz w źródle OSS: README, compose, settings, modele, `campaign_access.py`, `wiki_sharing.py`, listę testów.
- Napisano `PLAN.md`: tabela kopiuj/adaptuj/wytnij, zgodność z CLAUDE.md, model domenowy, jeden przepływ MVP, plan testów negatywnych, pytania do właściciela.
### Zadziałało
- Wzorzec `campaign_access` → `projection` → `visible_records` + migawki publikacji mapuje się 1:1 na hotel/pobyt/migawkę; stąd decyzja „publikacja = migawka całego pobytu".
### Nie zadziałało
- Nic nie uruchamiano; testów źródła nie puszczano (brak PostgreSQL/Docker w tej sesji).
### Następne kroki
- Odpowiedzi właściciela na §7 planu; potem kopia szkieletu i zielone testy infrastruktury.
### Korekta (ta sama sesja)
- Właściciel: każdy pracownik i gość ma własny plan (różne obowiązki, wiedza, zakres). Model v0 (podgrupy + link grupowy) zastąpiony v1: `Participant` + tagi + `Briefing` + `Duty`, publikacja materializuje `PublishedPlan` na osobę, `PersonalLink` na osobę.
### Materiały (ta sama sesja)
- Obejrzano 3 slajdy TV (`Materiały/`). Dodano do `PLAN.md` §3a: czas jako start/koniec + etykieta („do", „ok."), wiele sal na punkt (`Placement`), zakładki to norma (kolizje = ostrzeżenie), karta zlecenia pracownika (liczba osób, ustawienie, menu, elementy, odpowiedzialny, godziny obsługi), nowe wyjście `/tv/<token>`.
- Zastrzeżenie: to wnioski z jednego przykładu; czy plany *gości* naprawdę różnią się od wspólnej agendy — pytanie 7 do właściciela.
### Sesja pytań (grill-with-docs, ta sama sesja)
- Rozstrzygnięto 37 pytań; powstał `GLOSSARY.md`, `PLAN.md` przepisany do v2.
- Kluczowe zmiany względem v1: brak planów osobistych; Grupa = jeden organizator (czasem sam hotel); ekran per hotel (pokaz slajdów: dni wszystkich grup + slajdy hotelu); link gościa na grupę; wspólny link obsługi + odprawa A4; konta tylko dyrektor/kierownicy (+ admin agencji).
- Zasada właściciela: „rozwiązujemy problemy, a nie dokładamy”.
### Następne kroki
- Frontend rozstrzygnięty: React wszędzie. Następnie krok 1 (szkielet) i 1b (prototyp ekranu + widoku gościa).

## Sesja 2026-10-16 (cd.) — krok 1 i prototyp ekranu
### Zrobiono
- Szkielet: backend Django 6.1/DRF (moduły infrastruktury ze źródła bez Redisa), `LoginEvent` + sygnały, jazzmin, simple-history, WhiteNoise; Compose (db, migrate, api, web) bez Redisa i MCP; Caddy z SPA i CSP.
- 13 testów infrastruktury (sesja, CSRF, throttling, LoginEvent, IP z XFF, ograniczony JSON, nagłówki prywatności) — zielone lokalnie (SQLite) i w kontenerze (PostgreSQL).
- Prototyp ekranu `/ekran/demo`: rotacja dni wszystkich obecnych grup + slajd hotelu, pasek „teraz”, oznaczenie zmiany, ogłoszenie, QR, odporność na brak sieci. Paleta ze Słownika Kolorów (połączenie 241).
### Zadziałało
- Logika czasu jako czysty moduł sprawdzany samym `node` (Node 22 obsługuje TS) — DST 25.10, północ, zakładki punktów.
- Scena 1920×1080 skalowana `transform` — wygląda jak slajd na każdym TV.
### Nie zadziałało
- Zrzut z headless Firefoksa łapie moment przejścia (pusta scena) — wygląd oceniać w prawdziwej przeglądarce po kilku sekundach.
- Pierwsza wersja centrowała scenę gridem — przy skali <1 ucinało prawą krawędź; poprawione na `translate(-50%,-50%) scale()`.
- Porty 8080/8443 zajęte przez inny projekt → lokalny `.env` na 8090/8453.
- `pkill -f` z wzorcem w tej samej linii polecenia zabił własną powłokę — zamykać po porcie.
### Następne kroki
- Krok 2: model `agenda` (Hotel, Grupa, Punkt, Karta zlecenia, Publikacja, Link) + `GET /api/ekran/<token>/` zgodny z `types.ts` + testy wycieków z `PLAN.md` §6.
- Widok gościa (`/g/<token>`) w tej sesji nie powstał.

## Sesja 2026-10-16 (cd.) — motywy ekranu
### Zrobiono
- Właściciel ocenił wygląd jako słaby i poprosił o ~10 kombinacji do wyboru. Powstało 10 motywów (`themes.json`): kolory z 10 połączeń Słownika Kolorów + 10 par krojów (19 rodzin, wszystkie z polskimi znakami). Motyw wybierany per grupa; galeria `/ekran/motywy`.
### Zadziałało
- Motyw jako zestaw zmiennych CSS ustawianych na korzeniu slajdu — layout jeden, a dwie grupy na tym samym ekranie mogą mieć różny wygląd.
- Fonty ładowane leniwie: wszystkie `@font-face` w bundlu, przeglądarka pobiera tylko używane.
### Nie zadziałało
- Zrzut z rozszerzenia Chrome przekraczał czas (karta w tle) — galerię sprawdzono headless Firefoksem; miniatury renderują się bez animacji wejścia (`still`), inaczej zrzut łapał puste wiersze.
- Logo demo ucinało się przy innym foncie zastępczym (Firefox) — poszerzony viewBox.
### Następne kroki
- Właściciel wybiera motywy do zostawienia/odrzucenia; potem krok 2 (model + `/api/ekran/<token>/` z polem `theme`).
- (cd.) Na prośbę właściciela kolory i czcionki rozdzielone: `themes.json` (kolory + proponowana para) i `fonts.json` (10 par). Grupa ma `theme` i `fonts` (null = proponowane). Galeria zamieniona w konfigurator: kolory → czcionki → duży podgląd → pełny ekran; wybór zapisany w adresie.
- (cd.) Czcionki zastąpione parami z zestawienia Figmy: 31 z 39 (8 odpadło na polskich znakach — 6 z nich deklaruje `latin-ext`, a liter nie ma; wykryte dopiero sprawdzeniem glifów fontTools). Kroje odręczne/ozdobne tylko w nagłówkach (`titles: "text"`). 53 rodziny jako `@fontsource` statyczne, importy w `fonts.css`.
### Wniosek
- Metadane `latin-ext` nie gwarantują polskich liter — przy każdym nowym kroju sprawdzać glify (skrypt w historii sesji: fontTools + pliki z jsDelivr).

## Sesja 2026-10-16 (cd.) — krok 2: model, publikacja, API
### Zrobiono
- App `agenda`: Hotel (flaga `outputs_enabled`), HotelMember (dyrektor/kierownik), Space, TypicalPoint, Group (motyw + czcionki, bramka `version`), AgendaPoint (etykieta czasu, realizator, widoczność), Placement (= karta zlecenia), Publication (append-only, widok gościa + obsługi), HotelSlide, AccessLink. simple-history na danych biznesowych, jazzmin jako panel serwisowy.
- Serwisy: edycja pod blokadą wiersza grupy z bramką wersji (409), publikacja idempotentna z oznaczaniem „zmienione”, typowe punkty kopiowane (niezależne od katalogu), linki gość/obsługa/ekran.
- API panelu + publiczne `/api/ekran|g|o/<token>/`; seed demo (idempotentny) — ekran działa na prawdziwych danych z PostgreSQL.
- 27 nowych testów (razem 40): wycieki karty do gościa/ekranu/podglądu, izolacja hoteli i grup (każdy endpoint panelu w pętli), identyczne 404 dla złych tokenów, wygaśnięcie linku gościa, szkic niewidoczny do publikacji, bramka wersji, współbieżność (PostgreSQL), walidacja czasu (DST, północ, strefa hotelu), dni grupy, pola karty.
### Zadziałało
- Testy mutacyjne: wpuszczenie pola karty do widoku gościa → test wycieków failuje.
- Odczyt publiczny wyłącznie z migawek publikacji — brak ścieżki kodu „filtruj obiekt obsługi”.
### Nie zadziałało
- Test bramki wersji pierwotnie NIE łapał usunięcia sprawdzenia typu (`3.0 == 3`) — dodane wartości liczbowo równe bieżącej wersji; mutacja teraz wykryta.
- Na prawdziwych danych wyszły 2 błędy frontu: „Sale: Sala Jodłowa…” (podwójne „Sala”) i mignięcie 1. dnia przed dzisiejszym (indeks ustawiany w efekcie) — poprawione, `placesText` w czystym module z testem.
- Zrzuty z rozszerzenia Chrome nie działają przy karcie w tle — weryfikacja przez odczyt DOM.
### Następne kroki
- Krok 3: panel (lista grup → edytor dnia → karta zlecenia → „Opublikuj” z podglądem gościa, wybór wyglądu z konfiguratora).
- Krok 5: widoki `/g/<token>` (telefon gościa) i `/o/<token>` (obsługa) + odprawa A4 — API już jest.
- Otwarte: upload logotypów i slajdów hotelu (dziś ścieżki tekstowe), zarządzanie kontami kierowników przez dyrektora (dziś role nie różnią się w API), walidacja id motywu/czcionek tylko po formacie (listy żyją we froncie).

## Sesja 2026-10-16 (cd.) — krok 3: panel kierownictwa
### Zrobiono
- Panel `/panel` (React, czysty CSS, paleta 249 ze Słownika): logowanie, pulpit grup (dziś / nadchodzące / minione, „nieopublikowane zmiany”, „uzgodniona”), nowa grupa, edytor z zakładkami dni i arkuszem punktów (godziny, sale, skrót karty), szuflada punktu z kartami zlecenia (pola wg rodzaju punktu, nowa sala z miejsca), typowe punkty, pasek „Podgląd dla gości / Opublikuj”, podgląd szkicu w wyglądzie ekranu, konfigurator wyglądu per grupa, link dla gości z QR, strona „Ekran i obsługa”.
- Backend: kształt punktu do edycji (round-trip przez PATCH bez zmian — test), listy typowych punktów, linków i rodzajów punktów; hasło demo z `.env`.
- E2E w repo (`npm run e2e`): logowanie → nowy punkt z kartą → publikacja → API ekranu ma punkt („zmienione”), brak wycieku menu, zero błędów konsoli.
### Zadziałało
- Playwright z Chromium z cache (`executablePath`) — zrzuty i klikanie bez widocznego okna.
- Wspólne komponenty ekranu (`DayView`, `LookPicker`, `daySlides`) — podgląd w panelu to dokładnie to, co zobaczy TV.
### Nie zadziałało (i naprawione)
- `seed_demo --reset` padał: `PROTECT` na `Placement.space` blokował usunięcie hotelu → `RESTRICT` + test.
- CSP blokowało fonty wbudowane przez Vite jako `data:` → `assetsInlineLimit: 0`.
- Komunikat po akcji bez stylu (poza `.panel`, brak zmiennych CSS); reguły mobilne nadpisane przez późniejsze w pliku; „3 punktów” → odmiana `plural()` z testem (12–14!).
- Zrzut „Ekran i obsługa” pokazywał „Nie ma jeszcze linku” przed wczytaniem danych → karty dopiero po załadowaniu.
### Następne kroki
- Krok 5: telefon gościa `/g/<token>` (teraz / następnie / cały dzień, ogłoszenie, zmiany) i widok obsługi `/o/<token>` + odprawa A4.
- Otwarte: upload logotypów i slajdów hotelu, zarządzanie kontami kierowników przez dyrektora, przeciąganie punktów (dnd-kit) — dopiero jeśli formularz okaże się za wolny.

## Sesja 2026-10-16 (cd.) — krok 5: gość, obsługa, PDF do druku
### Zrobiono
- Telefon gościa `/g/<token>` w wyglądzie grupy (Teraz / Następnie / dni / zmiany / ogłoszenie), widok obsługi `/o/<token>` (Teraz w hotelu, dni, pełne karty zlecenia).
- PDF do druku (WeasyPrint, Lato + Young Serif z polskimi znakami): agenda gościa (opublikowana z linku, szkic z panelu „do uzgodnienia” dla organizatora), odprawa A4 dnia (wszystkie grupy, karty), karta zlecenia punktu z polami do odhaczenia. Linki w panelu, u gościa i u obsługi.
- Wspólny `useLive()` (ekran, gość, obsługa) zamiast kopii logiki offline; `nextPoint`/`whenText` w czystym module z testami.
- 5 nowych testów PDF (razem 48) + E2E `npm run e2e:outputs`; konto admina `konrad` (lokalne).
### Zadziałało
- PDF budowany z tych samych projekcji co ekran → test wycieków na HTML wystarcza; mutacja wykryta.
- `pdftotext`/`pdftoppm` do sprawdzenia PDF-ów w sesji bez przeglądarki.
### Nie zadziałało (i naprawione)
- Test PDF gościa bez zamrożonego czasu: link już wygasł (dziś 16.10 > 11.10 + 3 dni) — poprawne zachowanie, poprawiony test.
- `createsuperuser` przez `!` w Claude Code nie ma TTY → konto utworzone `--noinput` z hasłem z `.env`.
- Godziny w telefonie łamały się w dwie linie → szersza kolumna + `nowrap`.
### Następne kroki
- Krok 6: dokument weryfikacji (co sprawdzone, czym, nazwane ograniczenia) — `docs/weryfikacja.md`.
- Wdrożenie na ProxMox (domena, Cloudflare Tunnel, `SSL_REDIRECT` + `SECURE_PROXY_SSL_HEADER`, nowe silne hasła, `outputs_enabled` dla hotelu).
- Otwarte: upload logotypów/slajdów, konta kierowników przez dyrektora.

## Sesja 2026-10-16 (cd.) — przygotowanie wdrożenia „na raz w hotelu”
### Zrobiono
- `setup_hotel` (hotel z JSON: sale, typowe punkty, konta, slajdy, linki, feature flag) + 3 testy; karty QR do druku (PDF, segno) + test; katalog `deploy/media` serwowany przez Caddy; tunel Cloudflare jako profil Compose; `env.production.example`; skrypty `push/deploy/backup/smoke`; `deploy/WDROZENIE.md` (A: z domu, B: w hotelu, C: rollback); `docs/weryfikacja.md` (krok 6).
- Próba generalna od zera na osobnej instancji: push → `.env` produkcyjny → `deploy.sh` (52 testy na PG) → admin → `setup_hotel` → `smoke.sh` (wszystko OK) → HTTPS za proxy (bez pętli, `Secure`) → backup + odtworzenie 1:1 → sprzątanie.
### Zadziałało
- Odczyt `hotel.json` ze stdin (`setup_hotel -`) — plik nie musi być w obrazie.
- Dekodowanie QR z PDF (OpenCV) zamiast telefonu — kody = dokładny link gościa.
### Nie zadziałało (i naprawione)
- Pierwsza próba podmieniła kontenery lokalnego stosu (`name: hotelagenda` w compose) → `COMPOSE_PROJECT_NAME` dla drugiej instancji; dane całe.
- `smoke.sh` sprawdzał ciasteczka przez HEAD (brak `Set-Cookie`) → fałszywy alarm na produkcji; poprawione na GET.
- Wzór `hotel.example.json` w `deploy/` był niewidoczny w kontenerze (testy) → przeniesiony do `backend/agenda/data/`.
### Następne kroki
- Od usera: serwer na ProxMox (SSH), domena + tunel Cloudflare, `deploy/hotel.json` (sale, typowe punkty, konta), logotypy/slajdy, najbliższa prawdziwa grupa.
- Potem `deploy/WDROZENIE.md` część A z domu, część B w hotelu.

## Sesja 2026-10-16 (cd.) — wgrywanie logotypów
### Zrobiono
- Logo hotelu (panel → Ekran i obsługa; od razu na ekranie, u gości, w PDF) i logo organizatora (Dane grupy; bramka wersji, widoczne po publikacji). Podgląd na jasnym pasie jak na TV.
- `uploads.py`: tylko PNG/JPG/WebP ≤ 2 MB i ≤ 25 Mpx, każdy plik kodowany od nowa do PNG przez Pillow (bez metadanych, bez SVG ze skryptami), losowa nazwa. `deploy/media` montowany do API (zapis) i Caddy (odczyt); stałe uid 1000 w obrazie, `deploy.sh` ustawia właściciela.
- 4 testy (razem 56; m.in. SVG, tekst udający PNG, GIF, >2 MB, 30 Mpx → 400 i nic na dysku) + E2E `npm run e2e:logo`.
### Zadziałało
- Re-enkodowanie przez Pillow zamiast listy dozwolonych nagłówków — przechowujemy tylko obraz, który sami wyprodukowaliśmy.
### Nie zadziałało (i naprawione)
- Caddy miał globalny limit 512 KB → logo 2 MB dostałoby 413 przed Django; limit 3 MB tylko na ścieżkach logo.
- DELETE logo organizatora z JSON (wersja) → widok przyjmował tylko multipart (415 w przeglądarce, test klienta nie wysyłał treści) → parser JSON + test.
- Pierwszy E2E logo czytał stan przed końcem wgrywania (stare logo w ramce) → czekanie na komunikat po akcji.
### Następne kroki
- Bez zmian: dane od usera (serwer, domena + tunel, `deploy/hotel.json`, slajdy), potem `deploy/WDROZENIE.md` A i B.

## Sesja 2026-10-16 (cd.) — wgrywanie slajdów hotelu
### Zrobiono
- Panel → *Ekran i obsługa* → *Slajdy hotelu na ekranie*: wgrywanie z opisem i opcjonalnym okresem, stan na dziś, kolejność, edycja, usuwanie (z plikiem). Na żywo na ekranie, bez publikacji.
- `uploads.py` uogólniony (`save_image` dla logo i slajdów; slajd → JPG ≤ 1920×1080, ≤ 5 MB); Caddy 6 MB tylko na ścieżkach wgrywania.
- 4 testy (razem 60): kolejność i daty w API ekranu, odrzucenia bez śladu na dysku, kolejność tylko kompletna i własna, kasowanie pliku, limit 30; izolacja hoteli w pętli. E2E `e2e:logo` rozszerzony o slajdy.
### Nie zadziałało (i naprawione)
- Utworzenie slajdu zwracało 200 zamiast 201 (widok bez oznaczenia „tworzenie”) — wyszło w teście.
- Wyścigi w E2E (odczyt przed końcem wgrywania, przechwycony stary komunikat) — czekanie na konkretne komunikaty.
### Następne kroki
- Bez zmian: dane od usera (serwer, domena + tunel, `deploy/hotel.json`), potem `deploy/WDROZENIE.md` A i B.

## Sesja 2026-10-16 (cd.) — dane Hotelu Niedźwiadek
### Zrobiono
- Ze strony hotelniedzwiadek.pl: nazwa, sale (Kuleja ~250 m², Stylowa, Widokowa, Kameralna, Kominkowa, Tawerna Żeglarska + pojemności), restauracja i SPA; logo SVG → sprawdzone (bez skryptów) → PNG 1200 px (Inkscape) w `deploy/media/`.
- `deploy/hotel.json` dla Niedźwiadka: 12 sal, 6 typowych punktów z godzin ze slajdów TV, 2 robocze konta, lista `_do_potwierdzenia`.
- Typowy punkt dostał `guest_note` (Wymeldowanie: „Prosimy o zwolnienie pokoi do godz. 11:00”, jak na slajdach); migracja addytywna, test.
- Próba: `setup_hotel` na prawdziwym pliku + grupa testowa z typowych punktów + publikacja → ekran wygląda jak dzisiejsze slajdy hotelu („Sale: Kuleja, Stylowa, Widokowa, Kameralna”, „Restauracja Muzyczna”, logo).
### Do potwierdzenia z dyrektorem
- „Restauracja Muzyczna” (slajdy) vs „Restauracja Hotelu Niedźwiadek” (strona); standardowe godziny posiłków; prawdziwe loginy kont; czy sale z SPA/ogrodu są potrzebne.
### Następne kroki
- Serwer + domena + tunel od usera → `deploy/WDROZENIE.md` część A.

## Sesja 2026-10-16 (cd.) — produkcja etap 1 na proxmox-hp
### Zrobiono
- Komendy LXC (`deploy/PROXMOX-HP.md`, wzór brgollnau/NarrativeFramework); Konrad utworzył LXC 106 (192.168.1.54, Debian 13, Docker 29.9 overlayfs). Klucz `id_ed25519_hotelagenda` + alias `hotelagenda-prod` założone na laptopie, klucz wgrany przez Konrada.
- `push.sh` → `.env` z sekretami generowanymi na serwerze (etap LAN: `0.0.0.0:8090`, bez tunelu) → `deploy.sh` (60 testów OK na serwerze) → admin `konrad` → `setup_hotel` Niedźwiadka z linkami → `smoke.sh` przez LAN: wszystko OK → backup ręcznie + cron.
### Nie zadziałało (i naprawione)
- Krok 3 instrukcji: `VMID=<…>` na zsh = przekierowanie z pliku → błąd; klucz nie powstał na laptopie. Klucz i alias zrobione przez agenta, instrukcja poprawiona.
- Fontconfig „No writable cache directories” na read-only rootfs → `XDG_CACHE_HOME=/tmp`.
- Do serwera jechał folder `Materiały/` (slajdy klienta z cudzymi logo) → wykluczony w `push.sh`, usunięty z serwera.
### Następne kroki
- Domena + token tunelu → etap 2 (HTTPS przez Cloudflare), rezerwacja DHCP dla 106, wgranie slajdów hotelu, potwierdzenia dyrektora, potem część B w hotelu.

## Sesja 2026-10-16 (cd.) — produkcja etap 2: https://agenda.sudomie.pl
### Zrobiono
- Tunel Cloudflare z terminala (jak brgollnau): `cloudflared tunnel login` w kontenerze na LXC → cert pobrany przez przeglądarkę, przeniesiony na serwer, lokalnie `shred` → `tunnel create hotelagenda` + `route dns agenda.sudomie.pl`. Compose: serwis `tunnel` z pliku konfiguracyjnego (`deploy/cloudflared/`, wykluczony z rsync).
- `.env` → etap 2 (domena, `SECURE_COOKIES=1`, `SSL_REDIRECT=1`, port tylko 127.0.0.1); nowe linki ekranu/obsługi pod domeną; smoke HTTPS: wszystko OK (bez pętli, http→https, `Secure`).
### Nie zadziałało (i naprawione)
- Testy w kontenerze produkcyjnym (SSL_REDIRECT=1) → 36× 301; ustawienia SSL niezależne od środowiska w trybie testów. Próba generalna tego nie złapała, bo testy szły tam przed włączeniem SSL.
- `pkill -f` przez SSH zabił własną sesję (znana pułapka) — przy zatrzymywaniu loginu cloudflared.
- Callback `tunnel login` nie dotarł do serwera; cert trzeba przenieść ręcznie z Pobranych.
- Pierwsze żądanie zaraz po starcie tunelu: chwilowy błąd zdrowia; powtórka OK.
### Następne kroki
- Rezerwacja DHCP 192.168.1.54, slajdy hotelu, potwierdzenia dyrektora, część B w hotelu (TV, telefony, druk).

## Sesja 2026-10-16 (cd.) — przykładowe agendy z Materiałów (produkcja)
### Zrobiono
- Skrypt `deploy/przyklady/agendy_materialy.py` (przez serwisy panelu): wierna agenda Caritas 9–11.10 + „PRZYKŁAD” 16–18.10 (pt–nd jak oryginał) — oba z kartami zlecenia, punktem „tylko obsługa” (ustawienie sal, klucze), logo organizatora ze slajdu, publikacją i linkiem gościa. Ekran i telefon na produkcji sprawdzone zrzutami.
- `push.sh`: ochrona `deploy/media/logos|slides` przed `rsync --delete` (wykryte przy tej okazji; nic nie zginęło — wcześniej nie było wgranych plików).
### Nie zadziałało (i naprawione)
- „Przyjazd” pokazywał gościom „Recepcja” (sala z karty kluczy), a na slajdzie miejsca nie ma → karta w osobnym punkcie „tylko obsługa”, przyjazd bez sali, ponowna publikacja (stąd „zmiana” przy przyjeździe).
### Następne kroki
- Pytanie produktowe: czy sala z karty zlecenia ma być zawsze widoczna dla gości (dziś tak), czy potrzebny przełącznik „pokaż gościom”.
- Przed startem usunąć grupę PRZYKŁAD (admin).

## Sesja 2026-10-16 (cd.) — zasada „dodaj / zmień / usuń od MVP” i domknięcie dziur
### Zrobiono
- Zasada w `/home/konrad/Claude/CLAUDE.md` (wszystkie projekty) + pamięć: każda rzecz zarządzana przez klienta ma listę/dodaj/zmień/usuń w jego panelu od pierwszej wersji; audyt tabelą przed oddaniem.
- Audyt HotelAgenda → dziury: usuwanie grup (było tylko w adminie), sale (tylko dodawanie z formularza punktu), typowe punkty i konta (tylko `setup_hotel`), nazwa hotelu. Wszystkie domknięte: strona „Hotel” w panelu + usuwanie grupy.
- 6 testów (razem 66) z próbami mutacyjnymi (dostęp do kont tylko dyrektor, ochrona ostatniego dyrektora — obie wykryte), E2E `e2e:crud`.
### Zadziałało
- Konto usunięte = dezaktywowane (historia zmian zachowuje autora); ponowne dodanie tej samej osoby je przywraca — wyszło przy ponownym uruchomieniu E2E.
### Nie zadziałało (i naprawione)
- Pierwsza próba mutacyjna się nie wykonała (`sed` przerwał łańcuch `&&`) — powtórzona poprawnie, wykryta.
- E2E liczył wiersze przed odświeżeniem listy → czekanie na zniknięcie wiersza.
### Lekcja (dla wszystkich projektów)
- „Do zrobienia w adminie / skryptem” w odpowiedzi do usera = sygnał, że funkcja jest niegotowa. W tym projekcie padło przy usuwaniu grupy PRZYKŁAD — dopiero to wywołało audyt.

## Sesja 2026-10-16 (cd.) — Agenda hotelowa jako darmowe narzędzie (wzór fc.sudomie.pl)
### Zrobiono
- Backend: `POST /api/register/` (e-mail = login małymi literami, hotel z włączonymi wyjściami, zakładający = dyrektor, honeypot, limit 5/h na IP, CSRF ręcznie jak przy logowaniu), `TermsAcceptance` (insert-only: wersja + sha256 regulaminu + IP), regulamin jako plik `backend/agenda/data/regulamin.html` serwowany przez `/api/terms/`, `POST /api/me/password/`, `GET /api/hotels/<h>/export/` (JSON, bez tokenów linków), `DELETE /api/hotels/<h>/` z potwierdzeniem nazwą (dane + tabele `historical_*` + pliki logo/slajdów + anonimizacja kont bez innych hoteli, czyszczenie IP/UA w `LoginEvent` i IP w `TermsAcceptance`), komenda `retencja_danych --dry-run` (dopięta do nocnego `backup.sh` po zrzucie), `/api/public-config/` z `GA_MEASUREMENT_ID` (puste = brak tagu; format sprawdzany w settings). Docstringi rejestru czynności przy modelach. 12 nowych testów (razem 78).
- Frontend: `/` landing z działającym demo (TV z rotacją dni + telefon gościa na tych samych komponentach co produkcja, wybór kolorów), `/rejestracja`, `/regulamin`, baner zgody GA (Consent Mode v2, `localStorage cc`, „Ustawienia cookies” w stopce, odrzucenie kasuje `_ga*`) tylko na stronach publicznych. W panelu: „Moje hasło” (każdy), „Pobierz wszystkie dane” i „Usuń hotel…” (dyrektor), link „Załóż konto” przy logowaniu, podpowiedź o salach w pustej liście grup. `Guest.tsx` → `GuestView(hotel, group)`.
- CSP w Caddy rozszerzone o googletagmanager / google-analytics. DRF tylko JSON (bez browsable API).
- Polityka prywatności `sudomie.pl`: sekcja 4 `#agenda` + wiersze w tabelach celów, cookies, odbiorców — **lokalnie, nieopublikowana**. Kopia sprzed zmiany: `sudomie.pl/docs/polityka-prywatnosci.2026-10-04.bak.html`.
- E2E `npm run e2e:signup` — 11 sprawdzeń zielonych na lokalnym stosie.
### Zadziałało
- Paleta landingu = paleta panelu (Słownik Kolorów, połączenie 249) — książka sprawdzona, świadomie ta sama, żeby strona wyglądała jak narzędzie.
- Usuwanie „historii” liczone z tabel historycznych (grupy i punkty usunięte wcześniej też mają tam wiersze), nie z żywych obiektów.
### Nie zadziałało (i naprawione)
- Eksport otwierany linkiem dostawał HTML browsable API DRF (przeglądarka prosi o `text/html`) → globalnie tylko `JSONRenderer`.
- Test IP rejestracji: nagłówek szedł w ciele żądania; test throttlingu: nieudane próby też się liczą (zamierzone) → `cache.clear()` między przypadkami.
- `force_login` w testach też zapisuje `LoginEvent` — test anonimizacji liczy ≥ 2 i sprawdza, że stary login zniknął.
### Następne kroki
- User czyta regulamin (`/regulamin` lokalnie albo plik) i sekcję polityki → akceptacja → publikacja `sudomie.pl` + wdrożenie na agenda.sudomie.pl (`push.sh` → `deploy.sh` → `smoke.sh` → `e2e:signup <https://agenda.sudomie.pl>`).
- ID GA4 → `GA_MEASUREMENT_ID` w `.env` na serwerze + kontrola trackingu (Consent Mode: brak `_ga` przed zgodą, `gcs=G100`/`G111`).
- Reset hasła bez e-maila: dziś „dyrektor nada nowe / napisz do nas” (ograniczenie v1).

## Sesja 2026-10-16 (cd.) — wdrożenie darmowej wersji
### Zrobiono
- User zaakceptował regulamin i sekcję polityki. Backup bazy → push → deploy (78/78 w kontenerze) → smoke HTTPS OK → `e2e:signup` na produkcji 11/11 (hotel testowy założony i usunięty) → `retencja_danych --dry-run` OK.
### Nie zadziałało
- Deploy z sesji zablokował automat uprawnień (produkcja) — user uruchomił komendy sam przez `!`.
- Dwie komendy wklejone w jeden `!`: druga linia zaczynała się od `!`, co w powłoce neguje wynik `ssh` → `&&` pominął `scp`. Kopia polityki na GoDaddy powstała, nowa treść nie weszła.
### Następne kroki
- (zrobione 22:25) Polityka wgrana samym `scp`; `#agenda` na sudomie.pl sprawdzona, link z regulaminu trafia.
- ID GA4 → `.env` na serwerze + kontrola Consent Mode na produkcji.
- GA4 `G-9X4R75M9Q1` włączony na produkcji (env, bez snippetu z Google — ten nie ma Consent Mode). `e2e/tracking-check.mjs` 8/8. Lekcja: po zgodzie tylko na statystyki `gcs` = `G101`, nie `G111` (środkowa cyfra to `ad_storage`, którego nie udzielamy).

## Sesja 2026-10-28 — podlinkowanie sudomie
### Zrobiono
- Wdrożono stopkę publicznych stron z frontend/src/site/sudomie.ts; lista pochodzi z ../sudomie.pl/data/produkty.json. Zmieniono wyłącznie frontend web.
### Zadziałało
- Build, test slajdów i czasu, smoke 10/10, produkcja 390/1440 px OK.
### Nie zadziałało / ograniczenia
- Kompilator wykrył błędną nazwę stałej w przygotowanym komponencie; poprawiono przed wdrożeniem.
### Następne kroki
- Demo bez rejestracji pozostaje osobnym zadaniem [472](https://projekty.sudomie.pl/work_packages/472). Zadanie źródłowe: [473](https://projekty.sudomie.pl/work_packages/473).

## Sesja 2026-10-28 (demo bez rejestracji)
### Zrobiono
- „Wypróbuj demo — bez rejestracji” na stronie głównej (zadanie [472](https://projekty.sudomie.pl/work_packages/472)):
  odwiedzający dostaje własny Hotel Bursztynowa Polana na 24 h, zalogowany jako dyrektor; pasek demo otwiera ekran w holu,
  telefon gościa (obie grupy) i obsługę. Wzór z Grafiku (`grafik/demo.py`).
- Dane demo w jednym miejscu (`agenda/demo.py`), `seed_demo` z nich korzysta; usuwanie hotelu wydzielone do `erase_hotel`.
### Zadziałało
- Gotowe `seed_demo` z publikacjami i ogłoszeniem — piaskownica od razu pokazuje wszystkie trzy wyjścia z treścią.
- Testy: backend 83/83 (PostgreSQL), `e2e:demo` 5/5, `e2e:signup` 11/11 bez zmian.
### Nie zadziałało
- Przenoszenie kodu z komendy do modułu skryptem: wcięcie o poziom za głęboko i pozostałość starego bloku linków — złapane przy parsowaniu, poprawione.
- Ryzyko znalezione przed wdrożeniem: `seed_demo --reset` kasował po nazwie, więc usunąłby piaskownice — zawężone do `demo_until IS NULL`.
### Następne kroki
- Wdrożone 28.10 po zgodzie (backup bazy przed, `DEMO_MAX=200`): testy na serwerze 83/83, smoke OK, `e2e:demo` na produkcji 5/5.
- Test `test_terms_and_public_config_are_public` padał na serwerze niezależnie od demo (produkcja ma GA ID) — przypięte `GA_MEASUREMENT_ID=""` i `DEMO_MAX=0`.
- 28.10: projekt pod gitem, prywatne repo https://github.com/AltKorin/HotelAgenda; dane klienta wykluczone w `.gitignore`.
