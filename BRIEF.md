# HotelAgenda — brief startowy

Nazwa robocza. Ustalenia z rozmowy z właścicielem projektu, 16.10.2026.

## Cel i kontekst

Budujemy narzędzie dla hotelu do układania i powtarzalnego prowadzenia agend grup: pobytów, konferencji, wyjazdów firmowych i podobnych wydarzeń. Mamy już klienta hotelowego z tym problemem; szczegóły jego procesu trzeba dopiero poznać. Nie zakładaj, że poniższe propozycje zostały uzgodnione z klientem.

Obietnica: **uczestnik wie, co, kiedy i gdzie ma robić, a hotel nie musi wielokrotnie przekazywać tych samych informacji**. Obsługa wie dodatkowo, co przygotować i kto za to odpowiada. Hotel jest pierwszym odbiorcą produktu; inne zastosowania grupowe mogą przyjść później.

## Proponowany zakres pierwszej wersji

- Panel hotelu: grupy/pobyty, uczestnicy lub podgrupy, miejsca i osoby odpowiedzialne.
- Agenda: punkty z datą, początkiem i końcem, miejscem, opisem oraz odbiorcami. Widok dzienny/lista jako podstawowy interfejs.
- Szablony: kopiowanie programu na kolejny pobyt, przesunięcie dat i dopasowanie grupy; konkretna agenda jest niezależna od późniejszych zmian szablonu.
- Rozdzielenie szkicu od publikacji; gość widzi wyłącznie informacje przeznaczone dla niego. Notatki i zadania wewnętrzne obsługi pozostają prywatne.
- Prosty widok mobilny „teraz / następnie / cały dzień”, dostępny przez link lub QR bez instalowania aplikacji. Zmiany mają być widoczne po ponownym pobraniu agendy; push/SMS/e-mail wymagają osobnej decyzji i integracji.
- Zadania obsługi powiązane z agendą: odpowiedzialny, termin, status wykonania.

Przykład demonstracyjny: dwudniowy pobyt grupy firmowej, dwie podgrupy, sale, posiłki i warsztaty. Recepcja zmienia salę warsztatu i publikuje zmianę. Właściwi goście widzą nowe miejsce, obsługa widzi zadanie przygotowania sali, a goście nie widzą notatek wewnętrznych.

## Baza open source, którą już mamy

Repozytorium źródłowe: `/home/konrad/Claude/NarrativeFramework-OSS`.
Wykorzystujemy **aplikację `web/`**, nie historyczne assety Unity. To działający warsztat RPG z wiki kampanii i indywidualnymi aktywnościami, wersja `0.3.0-alpha.2`.

Stack: Django/DRF, PostgreSQL, React/TypeScript/Vite, React Flow, Redis, Docker Compose i Caddy. Osobny serwis MCP udostępnia narzędzia zewnętrznym agentom. Serwer nie zawiera własnego modelu ani czatu AI.

| Istniejący element | Jak wykorzystać w produkcie hotelowym |
| --- | --- |
| Konta, członkostwo kampanii, zaproszenia i role | Fundament dostępu hotelu, koordynatorów i obsługi; zaprojektować nowe role domenowe i zakres hotelu. |
| Wiki: szkice, opublikowane migawki, wybrani odbiorcy, podgląd jako gracz | Publikacja instrukcji dla gości/podgrup i sprawdzenie, co zobaczy odbiorca. Filtrowanie na serwerze. |
| Kopiowanie wersjonowanych materiałów do przygód z informacją o pochodzeniu | Wzorzec szablon → niezależna agenda konkretnego pobytu. |
| Walidacja domenowa współdzielona przez API i MCP | Wspólne reguły dla edytora oraz ewentualnej automatyzacji agend. |
| Wersje, transakcje, konflikty zapisu, idempotencja | Ochrona zmian kilku pracowników i bezpieczne ponowienie operacji. |
| Dziennik aktywności, decyzje człowieka, audyt wiki | Wzorce historii operacji i zatwierdzania; obecny kod nie jest gotowym systemem zadań hotelowych. |
| PL/EN, Markdown, eksport JSON/Markdown, lokalne demo | Przydatne elementy interfejsu, przenoszenia danych i demonstracji. |
| Compose, konfiguracja, istniejące testy uprawnień i publikacji | Baza uruchomienia i weryfikacji nowej aplikacji. |

To adaptacja kodu i mechanizmów, nie samo przemianowanie RPG. Hotel, pobyt grupy, punkt agendy, zadanie i szablon potrzebują jawnego modelu domenowego. Nie wciskaj godzin i zadań w graf scen. React Flow może później służyć do zależności, jeśli klient rzeczywiście ich potrzebuje.

## Co trzeba dopisać lub zweryfikować

Obecny projekt nie ma gotowego kalendarza/agendy, wykrywania kolizji sal i osób, przesuwania dat szablonu, zadań hotelowych ani dostępu gościa przez QR. Zaproszenia wiki wymagają konta, a tokeny MCP gracza służą konkretnej rozgrywce — nie są gotowymi linkami do agendy.

Dostęp bez konta wymaga własnego, ograniczonego i unieważnialnego mechanizmu. Link grupowy i indywidualny dają różny zakres dostępu; nie pokazuj danych osobistych wszystkim posiadaczom wspólnego QR. Separację hoteli oraz role obsługi trzeba zaprojektować i przetestować; obecna separacja kampanii jest punktem wyjścia, nie dowodem gotowej wielohotelowości.

Powiadomienia, historia kolejnych publikacji i edycja na żywo nie są gotowymi funkcjami. Licznik wersji chroniący zapis nie zastępuje historii zmian. MCP/AI może później pomagać układać program, ale podstawowy przepływ hotelu i gościa powinien działać samodzielnie.

## Mapa kodu dla kolejnego agenta

Ścieżki względem repozytorium źródłowego:

- `README.pl.md`, `web/README.pl.md` — możliwości, uruchomienie i ograniczenia.
- `web/backend/stories/models.py`, `domain.py`, `wiki.py`, `wiki_sharing.py`, `campaign_access.py` — dane, walidacja, publikacje i dostęp.
- `web/backend/stories/wiki_views.py`, `views.py`, `play.py`, `mcp_server.py` — punkty wejścia i wzorce operacji.
- `web/frontend/src/CampaignWiki.tsx`, `WikiSharing.tsx`, `WorkshopHome.tsx`, `document.ts`, `i18n.ts` — istniejące widoki i struktury UI.
- `web/backend/stories/test_sharing.py`, `test_wiki.py`, `test_adversarial.py` — przykłady weryfikacji izolacji, publikacji i konfliktów.
- `web/compose.yaml`, `web/.env.example`, `CONTRIBUTING.md` — środowisko i rozwój.
- `web/docs/pl/campaign-wiki.md`, `web/docs/architecture.md`, `web/docs/verification.md` — kontrakty i dowody weryfikacji. Dokument architektury zawiera historyczne decyzje; aktualny kod i nowsze opisy mają znaczenie przy rozbieżnościach.

Kod i dokumentacja mają licencję MIT: zachowaj copyright i tekst licencji przy kopiowaniu. Przeczytaj też `BRANDING.md` i `THIRD_PARTY_NOTICES.md`; nowy produkt powinien mieć własną identyfikację. Nie kopiuj sekretów, `.env`, baz ani danych użytkowników.

## Zadanie dla kolejnego agenta

Pracuj w `/home/konrad/Claude/HotelAgenda`. Ten folder zawiera na razie brief, nie skopiowaną aplikację. Repozytorium RPG traktuj jako źródło; nie zmieniaj go przy pracy nad hotelem.

1. Przeczytaj wskazane pliki i zaproponuj najkrótszą adaptację `web/` do osobnego projektu, zachowując przydatne mechanizmy i testy. Nie przepisuj sprawdzonej infrastruktury od zera.
2. Ustal z właścicielem rzeczywisty przebieg obsługi grupy u klienta: kto układa agendę, kto publikuje zmiany, jak są dzieleni goście, jak dziś dostają informacje i czy program ma być wspólny czy osobisty. Doprecyzuj też zadania obsługi oraz oczekiwania wobec aktualizacji/powiadomień.
3. Przygotuj model danych i jeden działający przepływ: szablon → pobyt grupy → edycja → publikacja → mobilny widok gościa. Użyj fikcyjnych danych demonstracyjnych.
4. Zweryfikuj przede wszystkim brak wycieku notatek obsługi, izolację odbiorców i hoteli, konflikty zapisu oraz poprawność dat i godzin. Pokaż rezultat i nazwij pozostające ograniczenia.

Na start poza zakresem: PMS, rezerwacje pokoi, płatności, aplikacja natywna, rozbudowany CRM i automatyczna optymalizacja harmonogramu. To propozycja zawężenia MVP, do potwierdzenia na podstawie procesu klienta.
