# Konta, wiele wypadów i „Dokąd tanio?” — etap 1

Data: 2026-11-04 · Status: do akceptacji

## Cel

Apka przestaje być jednym wyjazdem Krystiana i Zuzi, a staje się narzędziem do kolejnych wypadów z dowolną grupą. Każdy ma własne konto, widzi listę swoich wypadów i zakłada nowe kreatorem, w którym apka sama proponuje kierunki z tanimi lotami w wybranych terminach. Wnętrze wypadu (przesuwanie kart, Porównaj, mapa, plan) zostaje takie, jak jest.

Kolejne etapy z osobnymi specyfikacjami:
- **Etap 2:** opisy miejsc (Wikivoyage, Wikipedia) i atrakcje z OpenStreetMap w karcie kierunku; opcjonalnie inne linie przez Travelpayouts (darmowy klucz trzymany w funkcji Supabase).
- **Etap 3:** pamiętnik z wypadu.

## Ustalenia z rozmowy

| Kwestia | Decyzja |
|---|---|
| Wielkość grupy | Dowolna (2+ osób). Match, gdy wszyscy członkowie są na tak. |
| Konto | Login i hasło, bez e-maila. Brak odzyskiwania mailem; reset robi admin w panelu Supabase. |
| Rejestracja | Otwarta. Zaproszenie przez wpisanie loginu albo link-zaproszenie dla osoby bez konta. |
| Kierunki w nowym wypadzie | „Dokąd tanio?” z prawdziwych cen lotów; do tego ręczne dodanie miasta i kopiowanie z poprzedniego wypadu. |

## Założenia (do poprawienia, jeśli są złe)

- Wszyscy członkowie wypadu mają te same prawa (edycja, zapraszanie). Usunąć wypad może tylko jego twórca.
- Źródłem cen jest publiczny kalendarz Ryanaira (`services-api.ryanair.com/farfnd/v4`). Sprawdzone 2026-11-04: odpowiada z `Access-Control-Allow-Origin: *`, więc przeglądarka pyta go bezpośrednio; zapytanie KRK, wylot 19–20.11, powrót 22–24.11 dało 57 kierunków z ceną w PLN. To nieoficjalne źródło: tylko Ryanair, najtańszy lot na dzień, cena za osobę dorosłą. Wizz Air blokuje takie zapytania (403).
- Stack bez zmian: statyczne pliki na GitHub Pages, bez kroku budowania, jedyny serwer to darmowy Supabase `zyvjjqucfidnbzoevqlr`, w kodzie tylko publiczny klucz „publishable”.

## Architektura

### Dane w Supabase

- **Auth:** Supabase Auth, logowanie hasłem. Login `ala` zamienia się w adres `ala@wypad.app` niewidoczny dla użytkownika. W panelu Supabase wyłączone „Confirm email” (robi to Krystian). Login: 3–20 znaków `a–z 0–9 _ .`, unikalny, bez rozróżniania wielkości liter.
- **`profiles`** (`id` = `auth.users.id`, `login` unikalny, `name`): tworzony triggerem przy rejestracji z metadanych. Czytać mogą zalogowani (żeby znaleźć znajomego po loginie); edytować tylko swój.
- **`trips`** (`id` uuid, `title`, `start_date`, `end_date`, `origin` kod IATA, domyślnie `KRK`, `created_by`, `created_at`).
- **`trip_members`** (`trip_id`, `user_id`, `joined_at`; klucz złożony).
- **`trip_invites`** (`token` losowy, `trip_id`, `created_by`, `expires_at` +14 dni): link dla osoby bez konta.
- **`trip_items`** (`trip_id`, `key`, `value` jsonb, `updated_at`): to samo, co dziś `wypad_items`, tylko kluczem jest wypad zamiast kodu pary.
- **RLS:** wypad, jego członków i jego wpisy widzi i zmienia tylko członek (funkcja `is_member(trip_id)`). Funkcje: `create_trip(...)` dodaje twórcę jako członka; `add_member(trip_id, login)`; `accept_invite(token)`; `trip_push(trip_id, items)` i `trip_pull(trip_id, since)` z czasem serwera i zasadą „ostatni zapis wygrywa” na klucz, jak dziś.
- **Na żywo:** kanał Realtime `trip-<id>` z wiadomością „zajrzyj, coś się zmieniło”. Wiadomość nie niesie danych, więc otwarty kanał niczego nie ujawnia; dane idą tylko przez `trip_pull` z kontrolą członkostwa.

### Klucze wpisów wypadu

Bez zmian poza głosami: `cfg`, `d:<destId>`, `p:<destId>:<placeId>`, a głos to `v:<destId>:<userId>` zamiast `K`/`Z`.

### Kod w przeglądarce

Pliki z jednym zadaniem, ładowane jak dziś zwykłymi `<script>`:

- **`auth.js`**: rejestracja, logowanie, wylogowanie, odświeżanie sesji przez REST Supabase Auth (`/auth/v1/token`, `/auth/v1/signup`), bez biblioteki. Sesja w `localStorage`. Udostępnia `WypadAuth.user`, `WypadAuth.token()` i zdarzenie zmiany sesji.
- **`trips.js`**: lista wypadów, tworzenie, członkowie, zaproszenia. Lista trzymana w `localStorage`, żeby działała offline.
- **`sync.js`**: ten sam silnik co dziś (diff z cieniem, porcje po 400, pull z zapasem 15 s, kanał na żywo, ponawianie), ale zamiast kodu pary bierze `tripId` i token użytkownika. Cień i znaczniki osobno dla każdego wypadu.
- **`fares.js`**: zapytania do Ryanaira (`roundTripFares`, `oneWayFares`), zamiana na kierunki, pamięć podręczna 6 godzin.
- **`app.js`**: obecne widoki działające na danych aktywnego wypadu. `PEOPLE` z K/Z znika; osoby to członkowie wypadu z inicjałem i imieniem. Przełącznik „kto głosuje” znika, bo głosuje zalogowana osoba.
- Dane lokalne każdego wypadu pod osobnym kluczem: `wypad-trip-<id>`.

## Ekrany

Wszystko w świecie „Odbitek” z DESIGN.md (różowa obudowa, białe odbitki, granatowy marker, taśma przy matchu).

1. **Logowanie:** dwie zakładki, „Zaloguj” (login, hasło) i „Załóż konto” (login, imię, hasło ×2, min. 8 znaków). Błędy po polsku i przy polu: „Taki login już jest”, „Zły login albo hasło”, „Brak internetu: pierwsze logowanie wymaga sieci”.
2. **Moje wypady:** odbitki z tytułem, datami („19–24 lis 2026”), znacznikami członków i zdjęciem lidera (kierunek z największą liczbą głosów na tak). Nadchodzące u góry, minione niżej i wyszarzone. Przycisk „Nowy wypad”. Pusty stan: „Jeszcze żadnego wypadu. Zaplanujmy pierwszy.” Menu konta z imieniem i „Wyloguj”.
3. **Kreator, krok 1, „Kiedy i skąd”:** tytuł (podpowiedź z dat, np. „Wypad 19–24 lis”); zakres dni; lotnisko wylotu (lista lotnisk Ryanaira z wyszukiwaniem, domyślnie KRK); elastyczność wylotu i powrotu (dokładnie / ±1 dzień / ±2 dni).
4. **Kreator, krok 2, „Z kim”:** pole loginu z podpowiedziami (imię i login); dodane osoby jako znaczniki. „Wyślij link-zaproszenie” udostępnia link przez systemowe „Udostępnij”. Krok można pominąć.
5. **Kreator, krok 3, „Dokąd tanio?”:** siatka odbitek: miasto, kraj, cena tam i z powrotem za osobę, godziny lotów. Sortowanie od najtańszych, suwak „do X zł”, filtr kraju. Zaznaczenie dodaje kierunek do wypadu. Pod siatką „Dodaj miasto ręcznie” (wyszukiwanie przez Nominatim) i „Skopiuj z poprzedniego wypadu”. Jeśli Ryanair nie odpowiada: „Nie udało się pobrać cen. Dodaj kierunki ręcznie, ceny możesz wpisać później.” Przycisk „Gotowe” zakłada wypad.
6. **Wnętrze wypadu:** obecne zakładki. W nagłówku tytuł wypadu i strzałka powrotu do listy. W Więcej: „Wypad” (edycja tytułu i dat), „Osoby” (lista, dodawanie, link-zaproszenie, „Opuść wypad”, a u twórcy „Usuń wypad” z potwierdzeniem wpisaniem tytułu), „Dodaj kierunki” (znowu „Dokąd tanio?”); zostają „Kopia zapasowa”, „Zdjęcia miast”, „Mapy offline”. Sekcja parowania telefonów znika.

### Kierunek z „Dokąd tanio?”

Z odpowiedzi Ryanaira: miasto, kraj, kod lotniska, wylot (dzień, godziny, cena) i powrót (dzień, godziny, cena). Lot trafia do `out`/`back` w obecnym formacie i jest od razu zaznaczony jako wybrany wariant. Odpowiedź z cenami nie zawiera współrzędnych, a lista lotnisk Ryanaira (`/api/views/locate/5/airports/pl/active`, 221 lotnisk) nie pozwala na zapytania z przeglądarki (brak nagłówka CORS). Dlatego w repo leży plik `airports.json` z kodem, nazwą, miastem, krajem i współrzędnymi lotnisk, wygenerowany raz skryptem i odświeżany ręcznie. Służy też do listy lotnisk w kroku 1. Współrzędne miasta pochodzą z Nominatim (jak przy ręcznym dodawaniu), a odległość lotniska od centrum liczy się z obu punktów. Zdjęcie i pogoda dociągają się tak jak dziś. Przycisk „Odśwież ceny” w karcie kierunku pyta Ryanaira jeszcze raz.

### Głosowanie w grupie

- Match: wszyscy obecni członkowie dali „tak”. Dojście nowej osoby nie cofa wcześniejszego matcha.
- Znaczniki głosów pokazują inicjały wszystkich członków; przy 5+ osobach: pierwsze trzy i „+N”.
- Kiedy przy matchu dołącza ostatni głos, komunikat brzmi „<imię> też chce!”, a gdy było to więcej osób naraz, „Wszyscy chcą!”.

## Przeniesienie obecnego wyjazdu

Przy pierwszym zalogowaniu na telefonie, który ma stare dane (`wypad-v3` w `localStorage`):

1. Apka pyta: „Na tym telefonie jest wyjazd 19–24 listopada. Przenieść go na Twoje konto? Kim byłeś w nim: Krystian czy Zuzia?”
2. Tworzy wypad „Wypad we dwoje”, 19–24.11.2026, KRK, ze wszystkimi kierunkami, kosztami i miejscami. Głosy wybranej osoby przypisuje do konta, a głosy drugiej zapisuje jako „oczekujące” w `cfg.legacy`.
3. Gdy druga osoba dołączy (przez login albo link) i wskaże swoją literę, jej oczekujące głosy przechodzą na jej konto.
4. Stare dane zostają na telefonie pod `wypad-v3-old`, dopóki przeniesienie nie zsynchronizuje się z serwerem. Jeśli telefon był w parze z kodem, apka najpierw pobiera ostatni stan pary, żeby nic nie zginęło.

Po przeniesieniu tabela `wypad_items` i funkcje `wypad_pull`/`wypad_push` zostają do końca listopada 2026 i są usuwane osobną migracją.

## Błędy i tryb offline

- **Bez sieci:** lista wypadów i dane wypadu z pamięci; zmiany czekają w kolejce i wysyłają się po powrocie sieci (jak dziś). Kreator i dodawanie osób wymagają sieci, więc przycisk „Nowy wypad” jest wtedy nieaktywny z wyjaśnieniem.
- **Wygasła sesja:** odświeżanie tokenem; jeśli się nie uda, ekran logowania z zachowanymi danymi lokalnymi. Wysyłka zmian wznawia się po zalogowaniu.
- **Usunięcie z wypadu:** odmowa w `trip_pull` usuwa wypad z listy i pokazuje komunikat „Nie jesteś już w tym wypadzie”.
- **Ryanair:** przekroczony czas (8 s) lub błąd daje komunikat i ręczne dodawanie; zła struktura odpowiedzi też (bez awarii apki).
- **Service worker:** nowe pliki w SHELL, wersja `wypad-app-v11`; zapytania do Supabase i Ryanaira omijają pamięć podręczną.

## Testy

- **Baza:** SQL-owe sprawdzenia RLS. Obca osoba nie czyta ani nie pisze `trip_items`, nie dodaje się do cudzego wypadu, a `accept_invite` z wygasłym tokenem odmawia. Do tego `get_advisors` po migracji.
- **Przeglądarka:** dwa konta na dwóch źródłach (localhost i 127.0.0.1): rejestracja, nowy wypad z „Dokąd tanio?”, zaproszenie po loginie, głos na jednym, widoczny na drugim, match przy trzech osobach, praca offline, przeniesienie starych danych z kopii `wypad-v3`.
- **Telefon:** na prawdziwych telefonach testuje Krystian po wdrożeniu.

## Poza zakresem etapu 1

Pamiętnik, opisy miejsc i atrakcje z OSM, inne linie lotnicze, odzyskiwanie hasła mailem, role członków, powiadomienia push, czat.
