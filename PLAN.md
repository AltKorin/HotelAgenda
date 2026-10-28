---
status: draft-v2
data: 2026-10-16
zastępuje: v1 (plany osobiste) — odrzucone w sesji pytań 16.10
---

# HotelAgenda — plan MVP (v2)

Słownik: [[GLOSSARY]] — terminy pisane tu kursywą są w nim zdefiniowane. Brief: [[BRIEF]]. Materiały: `Materiały/Agenda_TV_*.jpg` (3 slajdy, które dziś hotel robi ręcznie).

## 0. Problem i obietnica

*Dyrektor* hotelu przygotowuje *agendę* *grupy* na podstawie *ustaleń* z *organizatorem* — dziś jako slajdy w programie do prezentacji, puszczane na *ekranie* w holu. *Obsługa* musi znać agendę „prawie na pamięć”, bo *goście* pytają ją o przebieg pobytu, a przy grupach organizowanych przez hotel nie ma żadnego opiekuna po stronie gości.

MVP: **jedno miejsce, w którym dyrektor wpisuje agendę raz, a z niej powstają: ekran, agenda w telefonie gościa, widok obsługi z kartami zlecenia i odprawa do druku.**

Zasada projektowa: *rozwiązujemy problemy, a nie dokładamy* — każda nowa rzecz musi wynikać z konkretnego problemu z procesu hotelu.

## 1. Ustalenia (sesja pytań 16.10.2026)

| # | Ustalenie |
| --- | --- |
| Kto | *Dyrektor* i *kierownicy* mają konta i te same uprawnienia do agend; dyrektor dodatkowo zarządza kontami kierowników. *Obsługa* nie ma kont. My (agencja) mamy konto administratora. |
| Grupa | Jedna grupa = jeden organizator (klient albo sam hotel) = jedna agenda. Co tydzień inna grupa, czasem kilka naraz. Grupa organizowana przez hotel to zwykła grupa z organizatorem „hotel”, nie osobny rodzaj. |
| Organizator | Nie korzysta z systemu. Ustalenia i akceptacja agendy — poza systemem; dyrektor tylko zaznacza „uzgodnione”. |
| Punkt agendy | Rodzaj z listy (plik danych), start/koniec + etykieta czasu (`od–do`, „do 11:00”, „ok. 15:00”), jedna lub kilka sal (*podgrupy*), *realizator* (hotel/organizator), widoczność „dla gości” / „tylko obsługa”, uwaga dla gości. |
| Karta zlecenia | Przy usługach hotelu, także w punktach organizatora: co zrobić, menu, ustawienie, liczba osób, godziny obsługi, niezbędne elementy, odpowiedzialny (zwykły tekst). Widzi ją cała obsługa — bez podziału na działy. |
| Powtarzalność | Katalog *typowych punktów hotelu* (śniadanie, przerwa kawowa…) z domyślną kartą — dodawane jednym kliknięciem. Bez szablonów całych agend. |
| Publikacja | Zmiany są szkicem do kliknięcia „Opublikuj”. Zmienione punkty oznaczone. *Ogłoszenie* nad agendą dla całej grupy. |
| Ekran | Jeden adres na hotel. Zwykły pokaz *slajdów*: każdy dzień każdej grupy obecnej w hotelu + *slajdy hotelu* (gotowe obrazy z okresem wyświetlania), 10–15 s na slajd. Przy braku internetu pokazuje ostatnią pobraną wersję, bez błędów. Rola wizytówki hotelu i organizatora (logotypy). |
| Gość | Link z QR na grupę (karta meldunkowa, pokój, ekran): tylko punkty „dla gości”, bez kart zlecenia, bez danych osobowych. |
| Obsługa | Wspólny link obsługi na hotel (unieważnialny): cała agenda wszystkich grup + karty zlecenia + „teraz / następnie”. Plus *odprawa* A4 na dzień. |
| Poza MVP | Plany osobiste i linki imienne, konta organizatora, SMS/e-mail/push, szablony całych agend, podział kart na działy, import rooming listy, PMS, rezerwacje, płatności. |

## 2. Model danych

Każdy rekord ma drogę do `Hotel`; każde zapytanie panelu przechodzi przez `hotel_access(user, hotel_id)` (obcy hotel → 404). Wzorzec ze źródła: `campaign_access.py`.

```
Hotel(name, timezone, logo, version)
HotelMember(hotel, user, role: dyrektor|kierownik)            ← superuser = agencja, poza tabelą
Space(hotel, name)                                            ← sala, restauracja, hol…

TypicalPoint(hotel, kind, title, start_time?, end_time?, spaces[], card defaults…)
                                                              ← katalog typowych punktów

Group(hotel, name, organizer_name, organizer_is_hotel, organizer_logo?,
      first_day, last_day, agreed: bool, announcement, version)

AgendaPoint(group, kind, title, starts_at, ends_at [aware, strefa hotelu],
            time_label: range|until|approx, realizer: hotel|organizer,
            visibility: guests|staff, guest_note)
Placement(point, space, subgroup_label?,                      ← punkt × sala = KARTA ZLECENIA
          todo, menu, setup, headcount, required_items[], responsible,
          service_from?, service_to?)

Publication(group, seq, guest_view JSON, staff_view JSON, actor, fingerprint, created_at)
                                                              ← append-only, materializowane przy „Opublikuj”
HotelSlide(hotel, image, show_from, show_to, order)
AccessLink(kind: guest|staff|screen, group? | hotel, digest, revoked, created_at)
```

Rodzaje punktów (`kind`) i to, które pola karty podpowiadają (posiłek → menu; szkolenie → ustawienie, sprzęt; impreza → DJ, nagłośnienie), siedzą w `agenda/data/point_kinds.json` — nie w kodzie.

Decyzje projektowe:

1. **Publikacja materializuje dwa widoki**: `guest_view` (jawnie wypisana, krótka lista pól: rodzaj, tytuł, czas + etykieta, nazwy sal, uwaga dla gości, ogłoszenie, logotypy) oraz `staff_view` (wszystko + karty zlecenia). Link gościa i ekran czytają **wyłącznie** `guest_view` ostatniej publikacji — nie ma ścieżki kodu, w której gość dostaje filtrowany obiekt obsługi.
2. **„Zmienione”** = porównanie z poprzednią publikacją tej grupy (po id punktu). Bez powiadomień.
3. **Konflikty zapisu**: `Group.version` + oczekiwana wersja → 409 („ktoś inny zmienił agendę, odśwież”). Dwie osoby z kierownictwa mogą edytować tę samą grupę — to realny przypadek.
4. **Idempotencja**: „Opublikuj” z tym samym `fingerprint` (wersja grupy) nie tworzy drugiej publikacji.
5. **Czas**: aware w strefie hotelu; slajd dnia = punkty, które w tej strefie zaczynają się danego dnia; punkt przez północ pokazany w dniu startu. DST testowane jawnie.
6. **Kolizje sal**: tylko ostrzeżenie w edytorze (przerwa kawowa w sali szkolenia to norma).
7. **Linki**: token `secrets.token_urlsafe(32)`, w bazie sha256, unieważnienie = nowy link. Link gościa wygasa po `last_day` + N dni (N w konfiguracji); linki obsługi i ekranu nie wygasają, tylko są unieważniane.

## 3. Wyjścia (wszystkie renderowane serwerowo)

| Wyjście | Adres | Zawartość | Odświeżanie |
| --- | --- | --- | --- |
| Ekran | `/ekran/<token>` | rotacja: dni wszystkich grup obecnych dziś w hotelu + slajdy hotelu; logo organizatora i hotelu, QR do linku gościa | pobiera nową wersję co ~60 s; przy błędzie sieci zostaje przy ostatniej |
| Gość | `/g/<token>` | agenda grupy dzień po dniu, „teraz / następnie”, ogłoszenie, oznaczenie zmian | przy otwarciu / odświeżeniu |
| Obsługa | `/o/<token>` | dziś w hotelu: wszystkie grupy, punkty (też „tylko obsługa”), karty zlecenia, „teraz / następnie” | przy otwarciu / odświeżeniu |
| Odprawa | `/o/<token>/odprawa/<data>` | jedna strona A4 na dzień, wszystkie grupy | wydruk z przeglądarki (CSS print) |
| Panel | `/panel/` (konto) | grupy, edytor agendy, karty zlecenia, typowe punkty, slajdy hotelu, linki/QR, podgląd „jak zobaczy gość” | — |

Ekran działa w przeglądarce na komputerze, który dziś puszcza pokaz slajdów (internet jest) — tryb pełnoekranowy, bez instalacji.

## 4. Adaptacja źródła `NarrativeFramework-OSS/web`

| Źródło | Decyzja |
| --- | --- |
| `transport.py`, `domain_errors.py`, `private_cache.py`, `registration.py`, `config/settings.py` | kopiuj, przytnij (CSRF, throttling, hasła ≥12, `SECURE_PROXY_SSL_HEADER` + `SECURE_SSL_REDIRECT` razem) |
| `campaign_access.py`, `wiki_sharing.py` (blokada wiersza, `expected()` wersji, zaproszenia z digestem) | adaptuj → `hotel_access`, zaproszenia kierowników |
| `test_sharing.py`, `test_adversarial.py` | portuj strukturę testów (izolacja, publikacja, współbieżność) |
| `compose.yaml` | zostaw db, migrate, api, web/Caddy; **wytnij** `redis`, `mcp` |
| graf scen, `play*.py`, `mcp_server.py`, wiki, React Flow, landing/blog | wytnij |
| marka „Narrative Framework” | nie przechodzi; zostaje `LICENSE` (MIT) + notka o pochodzeniu |

Standard projektów (CLAUDE.md): jazzmin jako panel serwisowy dla nas (nie dla hotelu), `django-simple-history` na `Group`, `AgendaPoint`, `Placement`, `HotelMember`; `LoginEvent` (login/logout/failed, IP z `X-Forwarded-For`); feature flaga per hotel dla linku gościa i ekranu.

## 5. Frontend: React wszędzie (decyzja 16.10)

Właściciel: wygląd i „feel” mają znaczenie już w MVP. Decyzja: **jedna aplikacja React + TypeScript + Vite (ze źródła) dla wszystkich wyjść** — panel, ekran, gość, obsługa, odprawa. Django/DRF tylko jako API JSON.

Dlaczego wszędzie, a nie tylko panel:
- **Ekran**: SPA odpytuje JSON i przy błędzie sieci po prostu dalej pokazuje to, co ma (plus kopia w `localStorage` na wypadek restartu przeglądarki). Strona renderowana serwerowo przy nieudanym przeładowaniu pokazałaby błąd przeglądarki na TV w holu.
- **Spójny wygląd**: jeden zestaw komponentów i tokenów kolorów dla panelu, ekranu i telefonu gościa.
- **Publikacja już jest JSON-em** (`guest_view`, `staff_view`) — API zwraca gotowy dokument, bez dodatkowej warstwy.
- Bezpieczeństwo bez zmian: endpoint gościa zwraca wyłącznie `guest_view`; w bundlu nie ma danych, tylko kod.

Biblioteki (każda za konkretny efekt):
- **Motion** — przejścia slajdów na ekranie, animacje zmian w agendzie gościa (oznaczenie „zmienione”), płynne przełączanie dni.
- **dnd-kit** — przeciąganie punktów po osi dnia w edytorze (zmiana godzin i sal).
- **shadcn/ui** (Radix + Tailwind, komponenty kopiowane do repo) — dopracowane formularze, okna, listy bez projektowania każdego elementu od zera.
- **qrcode** — QR do linku gościa na ekranie i na karcie meldunkowej.

Stan 16.10: **bez Tailwind/shadcn** — ekran i panel na czystym CSS z tokenami i natywnych elementach (`<dialog>`, `input type=time/date`, `select`). Mniej zależności, pełna kontrola wyglądu; dnd-kit jeszcze niepotrzebny (edycja godzin w formularzu). Ze źródła frontu skopiowano tylko konfigurację Vite/TS.

Paleta panelu: Słownik Kolorów, **połączenie 249 (s. 158)** — Ecru `#f5f0e6` (tło pracy), Dark Medici Blue `#1d3d4d` (tekst, główne akcje), Hay's Russet `#8a2f22` (wyłącznie „Opublikuj” i „nieopublikowane zmiany”), Olive Ocher `#c99a1c` (fokus, „uzgodniona”). Kroje: Young Serif (nagłówki, nazwy punktów) + Instrument Sans (interfejs). Tokeny w `frontend/src/panel/panel.css`.

## 6. Weryfikacja (negative-first)

- odpowiedzi `/g/` i `/ekran/` (surowe body) nie zawierają żadnego pola karty zlecenia ani punktu „tylko obsługa” — test z unikalnymi znacznikami w każdym polu karty;
- link gościa grupy A nie pokazuje niczego z grupy B; ekran hotelu X nie pokazuje grup hotelu Y;
- link obsługi hotelu X nie pokazuje hotelu Y; unieważniony/obcy/śmieciowy token → identyczne 404;
- kierownik hotelu X nie czyta/nie pisze w hotelu Y (każdy endpoint panelu, w pętli); kierownik nie zarządza kontami;
- szkic po publikacji nie zmienia `/g/`, `/o/`, `/ekran/`; ogłoszenie też dopiero po publikacji;
- dwa równoległe zapisy tej samej grupy → jeden 409; publish + edycja → jedna bramka wersji (PostgreSQL);
- daty: `koniec <= start`, puste/whitespace tytuły, punkt przez północ, DST, strefa hotelu ≠ strefa serwera, grupa jednodniowa, `last_day < first_day`;
- ekran: grupa przed przyjazdem/po wyjeździe nie jest w rotacji; slajd hotelu poza okresem nie jest w rotacji;
- idempotencja publikacji.

## 7. Demo (dane fikcyjne)

Fikcyjny hotel z 5 salami i restauracją. Dwie grupy w tym samym czasie:

1. **Szkolenie fundacji** (organizator: klient), 3 dni — struktura jak w materiałach: przyjazd („klucze wydaje organizator”), obiadokolacja, szkolenie w 4 salach (podgrupy, każda z kartą: ustawienie, liczba osób, sprzęt), przerwy kawowe w trakcie szkolenia, wymeldowanie „do 11:00”, wyjazd „ok. 15:00”.
2. **Weekend tematyczny** (organizator: hotel), goście indywidualni — kolacja z imprezą (DJ), punkt „tylko obsługa” 7:00 dostawa.

Scenariusz akceptacji: kierownik przenosi szkolenie podgrupy B do innej sali i dodaje ogłoszenie → publikuje → ekran i link gościa szkolenia pokazują nową salę i ogłoszenie, oznaczone jako zmiana; link gościa weekendu się nie zmienia; obsługa widzi zmienioną kartę zlecenia; żadne pole karty nie trafia do gościa. Własne fikcyjne logotypy — nie używamy znaków z materiałów.

## 8. Kolejność prac

1. ✅ Kopia szkieletu ze źródła + zielone testy infrastruktury (16.10).
1b. ✅ **Prototyp ekranu i widoku gościa na danych demo (generator demo)** — ekran gotowy pod `/ekran/demo` (16.10); widok gościa jeszcze nie.
2. ✅ Modele + serwisy (`hotel_access`, punkty, karty, typowe punkty, publikacja, „zmienione”) + testy z §6 (16.10; API panelu i publiczne `/api/ekran|g|o/<token>/`).
3. ✅ Panel: lista grup → edytor dnia → karta zlecenia → „Opublikuj” z podglądem gościa (16.10; + wygląd ekranu, link dla gości z QR, „Ekran i obsługa”).
4. ✅ Ekran (rotacja, odporność na brak sieci, slajdy hotelu) — razem z krokami 1b–2.
5. ✅ Link gościa + QR, link obsługi, odprawa A4 (16.10) — telefon gościa `/g/`, widok obsługi `/o/`, PDF do druku: agenda gościa (opublikowana / szkic dla organizatora), odprawa dnia, karta zlecenia punktu.
6. ✅ Seed demo + dokument weryfikacji z nazwanymi ograniczeniami (`docs/weryfikacja.md`, 16.10) + pakiet wdrożeniowy `deploy/` z próbą generalną.

## 9. Kolory i typografia — motywy do wyboru

Decyzja 16.10 (po ocenie prototypu: „wygląd jest słaby”): **10 motywów kolorystycznych i 10 par czcionek, wybieranych osobno** dla każdej grupy (`Group.theme`, `Group.fonts`). Każdy motyw proponuje parę czcionek (`themes.json` → `fonts`); `Group.fonts = null` oznacza „proponowane”, a dowolna inna para jest dozwolona. Dane: `frontend/src/screen/themes.json` (kolory) i `fonts.json` (pary krojów), nie w kodzie; nieznany id → wartość domyślna. Konfigurator: `/ekran/motywy?motyw=<id>&czcionki=<id>` (kolory → czcionki → podgląd → pełny ekran `/ekran/demo?motyw=…&czcionki=…`); ten sam komponent wejdzie do panelu.

Słownik Kolorów sprawdzony 16.10 (s. 58–61, 98–101, 123–126, 150–151, 158–161). Kolory z połączeń zaadaptowane pod TV (przyciemnione tła, rozjaśnione teksty dla kontrastu); każdy motyw ma: tło, tekst, kolor pomocniczy (godziny, linie), akcent (wyłącznie „teraz” i ogłoszenie), jasny pas logotypów.

**Czcionki (16.10, wersja 2):** pary z zestawienia Figmy (figma.com/resource-library/font-pairings, 39 par). Zostało **31** — każdy krój sprawdzony na glify ą ć ę ł ń ó ś ź ż (fontTools na plikach `@fontsource`). Odpadły: Fugaz One, Arvo (brak `latin-ext`) oraz Alice, Philosopher, Rufina, Sintony, Bubblegum Sans, DotGothic16 (mają `latin-ext` w metadanych, ale brak polskich liter). Kroje odręczne/ozdobne (Grand Hotel, Yellowtail, Poiret One, Stint Ultra Expanded, Chonburi, Ultra) mają `"titles": "text"` — zostają w nagłówkach, a wiersze agendy idą krojem tekstowym (czytelność z 3 m). Importy `@font-face` w `frontend/src/screen/fonts.css` (wygenerowane z listy par; przeglądarka pobiera tylko używane pliki).

| Motyw (id) | Nazwa | Słownik Kolorów | Proponowane czcionki (id w `fonts.json`) |
| --- | --- | --- | --- |
| `granat-bursztyn` | Granat i bursztyn | 241 (s. 150) | Playfair Display + Lato |
| `ecru-rdza` | Ecru i rdza (jasny) | 249 (s. 158) | Cinzel + Fauna One |
| `fiolet-cytryna` | Fiolet i cytryna | 145 (s. 100) | Yeseva One + Josefin Sans |
| `oliwka-zielen` | Oliwka i zieleń | 146 (s. 100) | Source Sans 3 + Alegreya |
| `mieta-wisnia` | Mięta i wiśnia (jasny) | 147 (s. 101) | Poiret One + Montserrat |
| `lazur-slonce` | Lazur i słońce | 148 (s. 101) | Syne + Inter |
| `braz-krem` | Brąz i krem | 192 (s. 123) | Abril Fatface + Lato |
| `turkus-grenadyna` | Turkus i grenadyna | 193 (s. 124) | Young Serif + Instrument Sans |
| `muszla-blekit` | Muszla i błękit (jasny) | 194 (s. 124) | Rethink Sans + Spectral |
| `granat-pomarancz` | Granat i pomarańcz | 141 (s. 98) | Oswald + Source Serif 4 |

Wartości hex są w `themes.json`. Logotypy zawsze na jasnym pasie (mogą mieć dowolne barwy); QR w ciemniejszym kolorze motywu. Panel (krok 3) dostanie osobną, spokojną paletę — do dobrania wtedy.
