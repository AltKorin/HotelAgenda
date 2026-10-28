---
status: gotowe-do-wdrozenia
data: 2026-10-16
proba-generalna: 2026-10-16 (lokalnie, od zera — wszystkie kroki poniżej przeszły)
---

# Wdrożenie HotelAgenda — jednym podejściem, na miejscu w hotelu

Cel: przyjechać do hotelu z działającym serwerem i wyjść z działającym ekranem w holu, telefonami
gości, widokiem obsługi i wydrukowanymi kartami QR. Część A robisz **przed wyjazdem** (z domu),
część B **w hotelu**. Rollback w każdej chwili: sekcja C.

## Co trzeba mieć (zbierz przed częścią A)

| Co | Skąd | Status |
| --- | --- | --- |
| LXC `hotelagenda` na **proxmox-hp** + alias SSH `hotelagenda-prod` — komendy: `deploy/PROXMOX-HP.md` | Ty | ☐ |
| Domena, np. `agenda.<hotel>.pl`, w Cloudflare | Ty / hotel | ☐ |
| Tunel Cloudflare (Zero Trust → Networks → Tunnels) + jego token | Ty | ☐ |
| Dane hotelu w `deploy/hotel.json` — **przygotowane 16.10** ze strony hotelu i slajdów TV; dyrektor potwierdza listę `_do_potwierdzenia` (nazwa restauracji, godziny posiłków, prawdziwe loginy kont) | dyrektor | ◐ |
| Logo hotelu — **gotowe** (`deploy/media/logo-niedzwiadek.png`, z SVG ze strony). Slajdy hotelu (1920×1080, do 5 MB) wgrywa się w panelu | hotel / Ty | ◐ |
| Agenda pierwszej prawdziwej grupy (najbliższy przyjazd) — żeby test w hotelu był na prawdziwych danych | dyrektor | ☐ |

## A. Przed wyjazdem (z domu, ok. 1 h)

1. **Dane hotelu:** `cp backend/agenda/data/hotel.example.json deploy/hotel.json`, uzupełnij. Logo hotelu, logotypy organizatorów i slajdy hotelu wgrywa się w panelu — pola `logo` i `slides` w JSON można pominąć.
2. **Serwer:** LXC na proxmox-hp wg `deploy/PROXMOX-HP.md` (Debian 13, nesting+keyctl, Docker z oficjalnego repo, overlay2, `/opt/hotelagenda`).
3. **Kod na serwer:** `deploy/push.sh <użytkownik>@<serwer>:/opt/hotelagenda` (rsync; `.env`, bazy i `node_modules` nie jadą).
4. **`.env` na serwerze:** `cp deploy/env.production.example .env`, wygeneruj sekrety (`python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`), wpisz domenę i `TUNNEL_TOKEN`, `chmod 600 .env`.
   - Zostaw razem `SSL_REDIRECT=1` i `TRUSTED_PROXY_CIDRS=private_ranges` (Django ma zawsze `SECURE_PROXY_SSL_HEADER`) — CLAUDE.md: bez tego pętla przekierowań. Sprawdzone w próbie: 200 po 0 przekierowaniach.
5. **Cloudflare:** w tunelu Public Hostname `agenda.<hotel>.pl` → `http://web:80`. Włącz *Always Use HTTPS*.
6. **Start:** `deploy/deploy.sh` — odmówi, jeśli w `.env` zostały wartości z szablonu albo `DEBUG≠0`; buduje, ustawia właściciela `deploy/media` (uid 1000, zapis logotypów), czeka na zdrowe API, `check --deploy`, 56 testów na PostgreSQL.
7. **Konto agencji (admin):**
   ```
   docker compose exec -T -e DJANGO_SUPERUSER_PASSWORD='<silne-hasło>' api python manage.py createsuperuser --noinput --username konrad --email ""
   ```
   (bez TTY zwykłe `createsuperuser` nie działa). Nie używaj lokalnego `Konrad666`.
8. **Hotel:** `docker compose exec -T api python manage.py setup_hotel - --enable-outputs --links --base-url https://agenda.<hotel>.pl < deploy/hotel.json`
   - wypisuje **raz**: hasła kont dyrektora/kierowników oraz linki ekranu i obsługi → zapisz w menedżerze haseł; nie wysyłaj mailem.
   - można uruchamiać ponownie po poprawkach w JSON (bez duplikatów; hasła zostają, chyba że `--reset-passwords`).
9. **Test z zewnątrz:** `deploy/smoke.sh https://agenda.<hotel>.pl <token-ekranu>` → „Wszystko OK.” (zdrowie, brak pętli, http→https, ciasteczka `Secure`, CSP, zły token = 404, dane ekranu).
10. **Logo, slajdy i pierwsza grupa:** zaloguj się, *Ekran i obsługa* → *Logo hotelu* i *Slajdy hotelu na ekranie* (wgraj, ustaw kolejność). Jako dyrektor wprowadź najbliższą grupę (albo zrób to z dyrektorem przez telefon), *Opublikuj*. Utwórz *Link dla gości* i pobierz *Karty z kodem QR (PDF)*.
11. **Backup:** cron `15 3 * * * /opt/hotelagenda/deploy/backup.sh >> /opt/hotelagenda/deploy/backups/backup.log 2>&1`. Uruchom raz ręcznie — próba odtworzenia 1:1 przeszła 16.10.
12. **Wydruki do zabrania:** karty QR grupy (PDF, 4 na A4), odprawa na dzień wizyty (PDF), ta lista.

## B. W hotelu (ok. 1–2 h)

1. **Ekran w holu** (komputer przy TV, który dziś puszcza slajdy):
   - Chrome/Edge → link ekranu (`/ekran/…`) → F11. Najlepiej skrót z trybem kiosku: `chrome --kiosk https://agenda.<hotel>.pl/ekran/<token>`, dodany do autostartu.
   - Wyłącz uśpienie i wygaszacz ekranu; aktualizacje systemu poza godzinami pracy.
   - Sprawdź: dni grup się zmieniają co ~12 s, logo hotelu i organizatora, QR w rogu, slajd hotelu.
   - **Test braku internetu:** wyjmij kabel/wyłącz Wi-Fi na 2 min → ekran dalej pokazuje agendę, bez błędu; po powrocie sieci sam się odświeża.
2. **Telefony gości:** zeskanuj QR z karty dwoma różnymi telefonami (Android + iPhone), na Wi-Fi hotelu i na LTE → agenda w wyglądzie grupy, „Teraz / Następnie”, PDF się pobiera.
3. **Obsługa:** link obsługi (`/o/…`) na tablecie/telefonie recepcji → „Teraz w hotelu”, karty zlecenia, *Odprawa na ten dzień (PDF)* drukuje się na drukarce hotelu.
4. **Dyrektor i kierownicy:** dyrektor zakłada konta kierowników w *Hotel → Konta* (hasło pokazuje się raz); każdy loguje się na swoim urządzeniu i przechodzi jedną zmianę:
   *zmiana sali w punkcie → Podgląd dla gości → Opublikuj* → w ciągu minuty widać ją na TV i w telefonie, z oznaczeniem „zmiana”.
5. **Karty QR:** wydrukuj, rozłóż w pokojach / na recepcji. Link gościa działa do 3 dni po wyjeździe grupy.
6. **Przykłady:** usuń grupę „PRZYKŁAD — szkolenie (wg agendy Caritas)” w panelu: grupa → *Dane grupy* → *Usuń grupę*. Grupa „Szkolenie — Lighthouse…” (9–11.10) może zostać jako wzór.
7. **Na koniec:** `deploy/smoke.sh` jeszcze raz, `deploy/backup.sh` ręcznie, zapisz w `SUMMARY.md` co wyszło na miejscu.

## C. Gdy coś pójdzie nie tak

| Objaw | Co zrobić |
| --- | --- |
| Na ekranie lub u gości coś, czego nie powinno być | `/admin/` → Hotel → odznacz *outputs enabled*: wszystkie linki od razu 404 (feature flag). Panel dalej działa. |
| Zła publikacja | popraw w panelu i *Opublikuj* ponownie (każda publikacja jest zapisana; poprzednie widać w `/admin/` → Publications). |
| Link wyciekł (np. link obsługi do gościa) | Panel → *Ekran i obsługa* → *Utwórz nowy link* (stary przestaje działać) albo `setup_hotel … --links`. |
| Serwer nie wstaje | `docker compose logs --tail 100 api`; wróć do slajdów w programie do prezentacji (komputer przy TV ma je dalej). |
| Utrata danych | najpierw sprawdź dump jak w próbie: `createdb proba_restore` + `pg_restore -d proba_restore` + porównanie liczby rekordów (przećwiczone). Dopiero potem nadpisanie bazy (nieprzećwiczone — robić spokojnie, z backupem bieżącego stanu), przy zatrzymanym API: `docker compose stop api && docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --no-owner' < plik.dump && docker compose start api` |

## Znane ograniczenia na dzień wdrożenia

- Logotypy i slajdy wgrywa hotel w panelu; SVG nie jest przyjmowane (bezpieczeństwo) — logo jako PNG, slajd jako JPG/PNG.
- Konta, sale i typowe punkty: `setup_hotel` tylko na start — potem dyrektor/kierownicy zarządzają nimi w panelu (*Hotel*).
- Brak powiadomień SMS/e-mail — zmiany widać po odświeżeniu (ekran i telefony robią to same co minutę).
- Jedna instancja na hosta: `compose.yaml` ma `name: hotelagenda`; druga kopia na tym samym hoście wymaga `COMPOSE_PROJECT_NAME` w jej `.env` (wyszło w próbie generalnej).
