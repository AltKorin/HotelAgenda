---
data: 2026-10-16
stan: MVP (kroki 1–5 z PLAN.md §8) + przygotowanie wdrożenia
---

# Weryfikacja HotelAgenda

Co sprawdzone, czym i czego **nie** sprawdzono. Zasada (CLAUDE.md): najpierw testy tego, czego system
nie może zrobić.

## Automatycznie (powtarzalne)

| Obszar | Czym | Wynik 16.10 |
| --- | --- | --- |
| Backend: 78 testów | `manage.py test agenda core` (w tym rejestracja, hasło, eksport, usunięcie hotelu z historią i anonimizacją, retencja) (SQLite lokalnie, PostgreSQL w kontenerze — tam także 2 testy współbieżności) | zielone |
| Logika czasu i tekstów frontu | `npm run check` (DST 25.10, północ, zakładki, „za 25 min”, odmiana „punkty/punktów”, kolumny sal) | zielone |
| Panel end-to-end | `npm run e2e` (logowanie → punkt z kartą → publikacja → API ekranu ma punkt, brak menu z karty, 0 błędów konsoli) | zielone |
| Wgrywanie logo i slajdów end-to-end | `npm run e2e:logo` (plik 2,6 MB → polski komunikat, nie 413 z Caddy; logo hotelu od razu w API ekranu i serwowane jako PNG; logo organizatora → „nieopublikowane zmiany”; slajd 16:9 bez ostrzeżenia, kwadratowy z ostrzeżeniem o przycięciu, kolejność z panelu widoczna w API ekranu, usunięcie) | zielone |
| Dodaj / zmień / usuń end-to-end | `npm run e2e:crud` (sala: dodaj → zmień → usuń, sala w użyciu zablokowana z powodem; typowy punkt; konto pracownika z hasłem pokazanym raz, zmiana roli, nowe hasło, usunięcie i ponowne dodanie; grupa z potwierdzeniem skutku) | zielone |
| Darmowe narzędzie end-to-end | `npm run e2e:signup` (landing z demo bez poziomego scrolla na 390 px, zmiana kolorów demo, regulamin, rejestracja wymaga akceptacji, panel nowego hotelu jako dyrektor, zmiana hasła, eksport JSON, usunięcie hotelu po wpisaniu nazwy → e-mail już się nie loguje; 0 błędów konsoli i CSP) | zielone |
| Demo bez rejestracji (28.10) | `npm run e2e:demo` (przycisk na stronie → własny hotel w panelu → z paska demo ekran w holu, telefon gościa z ogłoszeniem, obsługa; 0 błędów JS) + `SandboxDemoTests` (osobny hotel na odwiedzającego, konto bez hasła, wgrywanie plików → 403, limit `DEMO_MAX` → 503, CSRF, flaga 0, wygasłe znikają z kontem, `seed_demo --reset` i superuser nie ruszają piaskownic); backend 83/83 na PostgreSQL | zielone |
| Wyjścia end-to-end | `npm run e2e:outputs` (telefon gościa, obsługa, 3 PDF-y: 200 + `%PDF`) | zielone |
| Karty QR | PDF → obraz 200 dpi → dekodowanie OpenCV: wszystkie 4 kody = dokładny link gościa | zgodne |
| Wdrożenie od zera | próba generalna wg `deploy/WDROZENIE.md` na osobnej instancji: `deploy.sh`, `setup_hotel`, `smoke.sh`, HTTPS za proxy (200 po 0 przekierowaniach, ciasteczka `Secure`), backup + odtworzenie 1:1 | przeszła |

## Audyt „dodaj / zmień / usuń” w panelu klienta (CLAUDE.md, 16.10.2026)

| Rzecz | Lista | Dodaj | Zmień | Usuń | Gdzie w panelu |
| --- | --- | --- | --- | --- | --- |
| Grupa | ✓ | ✓ | ✓ (dane, wygląd, logo organizatora) | ✓ (potwierdzenie: „razem z N punktami”, znika z ekranu i linków) | Grupy → grupa → Dane grupy |
| Punkt agendy + karty zlecenia | ✓ | ✓ (też z typowych) | ✓ | ✓ | edytor grupy |
| Sala / miejsce | ✓ (z liczbą użyć) | ✓ | ✓ nazwa | ✓ (w użyciu → komunikat z grupami, które blokują) | Hotel → Sale i miejsca |
| Typowy punkt | ✓ | ✓ | ✓ (wszystkie pola, z kartą) | ✓ (wstawione punkty zostają) | Hotel → Typowe punkty |
| Konto pracownika | ✓ | ✓ (hasło raz) | ✓ rola, nowe hasło | ✓ (nie siebie, nie ostatniego dyrektora; konto dezaktywowane, ponowne dodanie je przywraca) | Hotel → Konta (dyrektor) |
| Hotel (cały) | — | ✓ rejestracja na /rejestracja | ✓ nazwa | ✓ (wpisanie nazwy, lista skutków; dane, historia, pliki, anonimizacja kont) + pobranie danych JSON | /rejestracja; Hotel → Dane hotelu w Agendzie (dyrektor) |
| Własne hasło | — | — | ✓ (obecne + nowe) | — | Hotel → Moje hasło (każdy) |
| Logo hotelu / organizatora | ✓ | ✓ | ✓ | ✓ | Ekran i obsługa / Dane grupy |
| Slajd hotelu | ✓ | ✓ | ✓ (opis, daty, kolejność) | ✓ | Ekran i obsługa |
| Link gościa / ekranu / obsługi | ✓ | ✓ | nowy w miejsce starego | ✓ (unieważnienie) | Link dla gości / Ekran i obsługa |
| Publikacja | ✓ (historia w adminie) | „Opublikuj” | — (niezmienna z założenia) | — (usuwana razem z grupą) | pasek publikacji |

Celowo poza panelem klienta: włączenie ekranu/linków hotelu (`outputs_enabled`, feature flag — serwis), tworzenie hotelu (serwis).

## Najważniejsze granice (testy negatywne)

| Ryzyko | Jak pilnowane |
| --- | --- |
| Karta zlecenia (menu, ustawienie, liczba osób, odpowiedzialni, punkty „tylko obsługa”) trafia do gościa | znaczniki w każdym polu karty, szukane w surowej odpowiedzi `/api/g/`, `/api/ekran/`, podglądu i w HTML PDF gościa; dwie próby mutacyjne (pole karty w widoku gościa; PDF z widoku obsługi) — wykryte |
| Hotel X widzi lub zmienia hotel Y | każdy endpoint panelu (w tym PDF) w pętli → 404, dane Y bez zmian; obca sala w karcie odrzucona |
| Zły / unieważniony / wyłączony / przeterminowany link | identyczne 404 (nie da się zgadywać tokenów) |
| Szkic widoczny przed publikacją | edycje i ogłoszenie niewidoczne na ekranie/u gościa/obsługi do „Opublikuj” |
| Dwie osoby zapisują naraz | bramka wersji: 409; test równoległy na PostgreSQL; próba mutacyjna (`3.0 == 3`) — wykryta |
| Złe godziny | koniec ≤ początek, DST (02:30 29.03 nie istnieje), punkt poza dniami pobytu, > 24 h, strefa hotelu ≠ serwera |
| Wgrany plik to nie obraz / SVG ze skryptem / za duży / „bomba” pikseli | każdy plik otwierany i kodowany od nowa (logo → PNG, slajd → JPG ≤ 1920×1080; Pillow), losowa nazwa; testy: SVG, tekst udający PNG, GIF, za ciężki, 30 Mpx, odwrócone/złe daty slajdu → 400 i nic na dysku; kolejność slajdów musi wymienić każdy slajd hotelu raz (obcy → 400); usunięcie slajdu kasuje plik; limit 30 slajdów |
| Zarządzanie kontami przez kierownika / usunięcie ostatniego dyrektora / siebie / przejęcie aktywnego loginu innego hotelu | 404 dla kierownika na kontach i nazwie hotelu; 409 dla ostatniego dyrektora i siebie; próby mutacyjne obu zabezpieczeń wykryte |
| Złe dane wdrożeniowe | `setup_hotel` z błędnym plikiem nic nie zapisuje (8 przypadków) |

## Sprawdzone ręcznie (zrzuty, 16.10)

Ekran w holu (10 motywów kolorów × 31 par czcionek), panel (pulpit, edytor, szuflada punktu, podgląd,
wygląd, linki, telefon 390 px), telefon gościa, widok obsługi, 3 PDF-y (polskie znaki, A4, stopka).

## Nie sprawdzone — do zrobienia w hotelu (`deploy/WDROZENIE.md` część B)

- Prawdziwy telewizor i komputer przy nim (kiosk, uśpienie, zanik sieci na miejscu).
- Prawdziwe telefony (iPhone/Android) na Wi-Fi hotelu i LTE; skanowanie wydrukowanych kart QR.
- Drukarka hotelu (PDF A4: odprawa, karty, karty QR).
- Cloudflare Tunnel na prawdziwej domenie (w próbie proxy udawane nagłówkiem `X-Forwarded-Proto`).
- Praca dyrektora/kierowników na ich sprzęcie — czy formularz punktu jest dość szybki (dnd-kit dopiero gdy nie).
- Pola godzin: w testach headless widać AM/PM; w polskiej przeglądarce oczekiwane 24 h — potwierdzić.

## Znane ograniczenia (świadome, MVP)

Logo i slajdy tylko PNG/JPG/WebP (bez SVG), podmienione logotypy zostają na dysku (opublikowane migawki mogą je wskazywać), brak zarządzania kontami przez
dyrektora, brak powiadomień SMS/e-mail, plany osobiste gości poza MVP (`PLAN.md` §1), identyfikatory
motywów/czcionek walidowane tylko formatem (listy we froncie).
