# Konta, wiele wypadów i „Dokąd tanio?” — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Cel:** Konta z loginem i hasłem, lista wypadów, kreator z cenami lotów Ryanaira i głosowanie w dowolnej grupie, z przeniesieniem obecnego wyjazdu.

**Architektura:** Supabase Auth i tabele `trips`, `trip_members`, `trip_invites`, `trip_items` zamknięte przez RLS na członkostwo. Przeglądarka rozmawia z Supabase przez REST bez biblioteki. Obecny silnik synchronizacji per klucz zostaje, ale jest kluczowany wypadem i tokenem użytkownika. Nowe pliki o jednym zadaniu (`auth.js`, `trips.js`, `fares.js`, `wizard.js`) ładowane zwykłymi `<script>` przed `app.js`.

**Stack:** HTML/CSS/JS bez kroku budowania, GitHub Pages, Supabase (`zyvjjqucfidnbzoevqlr`), Ryanair `farfnd/v4`, testy logiki `node --test` (Node 26), testy RLS przez SQL (narzędzie Supabase `execute_sql`), testy UI w podglądzie „wypad” (port 8791).

**Spec:** `docs/superpowers/specs/2026-11-04-konta-i-wypady-design.md`

## Global Constraints

- Bez kroku budowania i bez bibliotek npm w apce; jedyny serwer to Supabase `zyvjjqucfidnbzoevqlr`, w kodzie tylko klucz `sb_publishable_EVB-jO0lqjj_hB49t7M7fA_wNh42fWX`.
- Cały tekst w UI po polsku; wygląd według DESIGN.md („Odbitki”), ikony z istniejącego sprite’a SVG, bez emoji.
- Login: 3–20 znaków `a–z 0–9 _ .`, przed sprawdzeniem `trim()` i `toLowerCase()`; e-mail techniczny `<login>@wypad.invalid`; hasło min. 8 znaków.
- Klucze wpisów: `cfg`, `d:<destId>`, `p:<destId>:<placeId>`, `v:<destId>:<userId>`.
- Dane lokalne wypadu: `wypad-trip-<tripId>`; stary wyjazd: `wypad-v3` → po przeniesieniu `wypad-v3-old`.
- Ryanair: limit czasu 8 s, pamięć 6 h, waluta PLN, rynek `pl-pl`, 1 dorosły.
- Service worker `wypad-app-v11`; zapytania do `supabase.co` i `ryanair.com` omijają cache.
- Nigdy nie commitować `.impeccable/surfaces/`, `.impeccable/mocks/`, `.agents/`, `.claude/skills/`, `.claude/agents/`, `.codex/`, `.claude/settings.local.json`.
- Commit i push tylko na prośbę Krystiana; zmiany na gałęzi `feature/konta-wypady`.

## Review Focus

1. **Login z wielkimi literami lub spacją** („Zuzia ”): rejestracja i logowanie traktują to jako `zuzia`; wyszukiwanie znajomego też. Test: Task 3 `normalizeLogin`.
2. **To samo miasto z dwóch lotnisk** (Mediolan BGY i MXP, Londyn STN i LTN): w „Dokąd tanio?” jedna odbitka na miasto z najtańszą parą lotów, pozostałe lotniska jako warianty lotu. Test: Task 6 `groupByCity`.
3. **Nowa osoba dołącza po matchu:** match, który już był, nie znika. Test: Task 8 `isMatch` z `cfg.matched`.
4. **Token wygasa w trakcie synchronizacji:** odpowiedź 401 daje jedno odświeżenie tokenu i ponowienie, bez utraty zmian. Test: Task 4 `rpc` z podstawionym `fetch`.
5. **Koniec przed początkiem** albo daty w przeszłości w kreatorze: „Dalej” jest nieaktywne z komunikatem „Powrót musi być po wylocie”. Test: Task 7 `validateWhen`.

---

### Task 1: Baza: tabele, RLS i funkcje

**Files:**
- Create: `supabase/migrations/20261104_trips.sql` (kopia tego, co idzie przez `apply_migration`, żeby było w repo)
- Create: `supabase/tests/trips_rls.sql`

**Interfaces:**
- Produces (RPC przez `/rest/v1/rpc/<name>`, wywołane z tokenem użytkownika):
  - `create_trip(p_title text, p_start date, p_end date, p_origin text) returns trips`
  - `add_member(p_trip uuid, p_login text) returns profiles` (błąd `no_such_login`, gdy brak)
  - `create_invite(p_trip uuid) returns text` (token 24 znaki, ważny 14 dni)
  - `accept_invite(p_token text) returns uuid` (id wypadu; błąd `invite_expired`)
  - `update_trip(p_trip uuid, p_title text, p_start date, p_end date, p_origin text) returns trips` (każdy członek)
  - `leave_trip(p_trip uuid) returns void`; `delete_trip(p_trip uuid) returns void` (tylko `created_by`)
  - `trip_push(p_trip uuid, p_items jsonb) returns table(key text, updated_at timestamptz)`
  - `trip_pull(p_trip uuid, p_since timestamptz) returns table(key text, value jsonb, updated_at timestamptz)`
  - `my_trips() returns table(id, title, start_date, end_date, origin, created_by, members jsonb)` (`members`: `[{id, login, name}]`)
  - `find_profiles(p_q text) returns setof profiles` (prefiks loginu lub imienia, max 8)
- Tabela `profiles(id uuid pk → auth.users, login text unique, name text)`, wypełniana triggerem `on auth.users insert` z `raw_user_meta_data->>'login'` i `'name'`.

- [ ] **Step 1: Napisz `supabase/tests/trips_rls.sql`.** Tworzy dwóch użytkowników testowych w `auth.users` (logins `t_ala`, `t_ola`), symuluje ich przez `set local role authenticated; set local request.jwt.claims = '{"sub":"<id>"}'` i sprawdza `assert`ami w bloku `do $$`:
  - `t_ala` tworzy wypad i `my_trips()` zwraca go z 1 członkiem;
  - `t_ola` nie widzi go w `my_trips()`, a `trip_pull` i `trip_push` dają błąd `not_member`;
  - po `add_member(trip, 'T_Ola ')` `t_ola` widzi wypad (login normalizowany w SQL `lower(trim())`);
  - `accept_invite` z tokenem po `expires_at` daje `invite_expired`;
  - `delete_trip` przez `t_ola` daje `not_owner`.
  
  Na końcu `rollback`.
- [ ] **Step 2: Uruchom przez `execute_sql`.** Oczekiwane: błąd, bo funkcje nie istnieją.
- [ ] **Step 3: Napisz migrację i zastosuj ją przez `apply_migration` (nazwa `trips`).**
  - RLS włączone na wszystkich pięciu tabelach.
  - Polityki `select` na `trips` i `trip_members` przez `is_member(trip_id)` (SECURITY DEFINER, `stable`).
  - `trip_items` i `trip_invites` bez polityk: tylko przez funkcje, każda zaczyna od `if not is_member(p_trip) then raise exception 'not_member'`.
  - `trip_push` i `trip_pull` na wzór `wypad_push` i `wypad_pull` (`clock_timestamp()`, `#variable_conflict use_column`).
  - `execute` funkcji tylko dla `authenticated` (odebrane `anon` i `public`).
  - `profiles`: `select` dla `authenticated`, `update` własnego wiersza.
- [ ] **Step 4: Uruchom test ponownie.** Oczekiwane: brak wyjątku. Potem `get_advisors` (security); dopuszczalne tylko ostrzeżenia o celowym SECURITY DEFINER.
- [ ] **Step 5: Krystian wyłącza „Confirm email”** (Authentication → Sign In / Providers → Email). Sprawdź: `curl` POST `/auth/v1/signup` z `t_probe@wypad.invalid` zwraca `access_token`. Usuń `t_probe` przez `execute_sql`.
- [ ] **Step 6: Commit** `supabase/` z wiadomością „Baza wypadów: konta, członkowie, zaproszenia, RLS”.

### Task 2: Testy logiki w Node

**Files:**
- Create: `tests/load.mjs`, `tests/smoke.test.mjs`

**Interfaces:**
- Produces: `load(files: string[], extra?: object) => window`. Uruchamia pliki apki w `vm` z udawanym `window`, `localStorage` (Map), `fetch` (z `extra`), `crypto`, `addEventListener` i `document` z `addEventListener`/`hidden`. Zwraca obiekt `window`.

- [ ] **Step 1: Test `smoke`:** `load(["motion.js"]).Motion.EASE === "cubic-bezier(.16,1,.3,1)"`.
- [ ] **Step 2: Implementuj `load`.** `node --test tests/` daje PASS.
- [ ] **Step 3: Commit** „Testy logiki w Node”.

### Task 3: Konto (`auth.js`) i ekran logowania

**Files:**
- Create: `auth.js`, `tests/auth.test.mjs`
- Modify: `index.html` (sekcja `#login` przed `main`, skrypt `auth.js` po `motion.js`), `styles.css` (ekran logowania)

**Interfaces:**
- Produces `window.WypadAuth`:
  - `normalizeLogin(s): string | null` (`null`, gdy nie spełnia reguł),
  - `signUp({login, name, password}): Promise<User>`, `signIn({login, password}): Promise<User>`, `signOut(): void`,
  - `token(): Promise<string>` (odświeża, gdy do wygaśnięcia zostało < 60 s; przy błędzie odświeżenia `signOut` i zdarzenie),
  - `user: {id, login, name} | null`, `onChange(fn)`.
  - Stałe `URL_` i `KEY` przeniesione z `sync.js`, wystawione jako `WypadAuth.URL` i `WypadAuth.KEY`.
- Sesja w `localStorage` pod `wypad-auth`: `{access_token, refresh_token, expires_at, user}`.
- Błędy (`Error.message` po polsku, takie same w UI):
  - `user_already_exists` → „Taki login już jest”,
  - `invalid_credentials` → „Zły login albo hasło”,
  - offline → „Brak internetu: pierwsze logowanie wymaga sieci”.

- [ ] **Step 1: Testy:**
  - `normalizeLogin(" Zuzia ") === "zuzia"`, `normalizeLogin("ab") === null`, `normalizeLogin("ala ma") === null`;
  - `signIn` z `fetch` zwracającym 400 `{error_code:"invalid_credentials"}` rzuca „Zły login albo hasło”;
  - `token()` przy `expires_at` za 30 s woła `/auth/v1/token?grant_type=refresh_token` i zwraca nowy token.
- [ ] **Step 2: `node --test tests/auth.test.mjs`.** Oczekiwane: FAIL (brak pliku).
- [ ] **Step 3: Implementuj `auth.js`.** `signUp` wysyła `data: {login, name}` jako metadane.
- [ ] **Step 4: Testy dają PASS.**
- [ ] **Step 5: Ekran `#login`** z zakładkami „Zaloguj” i „Załóż konto”, polami ze spec, błędem przy polu i przyciskiem w stanie ładowania. Na start apki: bez `WypadAuth.user` widoczny tylko `#login`. Sprawdź w podglądzie: rejestracja konta `t_k` działa, po przeładowaniu sesja trwa.
- [ ] **Step 6: Commit** „Konta: logowanie loginem i hasłem”.

### Task 4: Synchronizacja per wypad (`sync.js`)

**Files:**
- Modify: `sync.js` (całość), `tests/sync.test.mjs` (nowy)

**Interfaces:**
- Consumes: `WypadAuth.token()`, `WypadAuth.URL`, `WypadAuth.KEY`.
- Produces `window.WypadSync`:
  - `init({snapshot, apply, onStatus, onGone})`, `open(tripId)`, `close()`, `schedule()`, `sync()`,
  - `get trip`, `get last`.
  - `onGone(tripId)` wołane, gdy `trip_pull` zwraca `not_member`.
- Stan lokalny `wypad-sync-<tripId>`: `{shadow, ts, last}`. Kanał `realtime:trip-<tripId>`, w URL WebSocketu `apikey` i `access_token`.
- `rpc(fn, body)`: nagłówki `apikey` i `Authorization: Bearer <token>`; przy 401 jedno `WypadAuth.token()` z wymuszonym odświeżeniem i ponowienie.

- [ ] **Step 1: Testy:**
  - `push` wysyła tylko zmienione klucze (cień w formie kanonicznej, jak dziś);
  - 401, a potem 200, daje 2 wywołania `trip_push` i 1 odświeżenie tokenu (Review Focus 4);
  - błąd `not_member` woła `onGone(tripId)`;
  - `open(b)` po `open(a)` nie miesza cienia `a` i `b`.
- [ ] **Step 2: FAIL.**
- [ ] **Step 3: Przerób `sync.js`.** Usuń `newRoom`, `join`, `leave` i kod pary. Logika diff, push, pull, kanału i ponawiania zostaje.
- [ ] **Step 4: PASS.**
- [ ] **Step 5: Commit** „Synchronizacja per wypad z tokenem użytkownika”.

### Task 5: Moje wypady (`trips.js`) i ekran listy

**Files:**
- Create: `trips.js`, `tests/trips.test.mjs`
- Modify: `index.html` (sekcja `#trips`), `styles.css`

**Interfaces:**
- Consumes: `WypadAuth`, RPC z Task 1.
- Produces `window.WypadTrips`:
  - `list(): Trip[]` (z pamięci `wypad-trips`), `refresh(): Promise<Trip[]>`, `create({title, start, end, origin}): Promise<Trip>`, `update(tripId, {title, start, end, origin}): Promise<Trip>`,
  - `addMember(tripId, login)`, `invite(tripId): Promise<string>` (pełny link `<origin><path>#zaproszenie=<token>`), `acceptFromHash(): Promise<string|null>`,
  - `leave(tripId)`, `remove(tripId)`, `findProfiles(q)`, `formatRange(start, end): string`, `split(trips, today): {upcoming, past}`.
- `Trip = {id, title, start, end, origin, createdBy, members: [{id, login, name}]}`.

- [ ] **Step 1: Testy:**
  - `formatRange("2026-11-19","2026-11-24") === "19–24 lis 2026"`, `formatRange("2026-12-30","2027-01-02") === "30 gru 2026 – 2 sty 2027"`;
  - `split` z `today = "2026-11-25"` daje listopadowy wypad w `past`;
  - `refresh` offline (fetch rzuca) zwraca listę z pamięci.
- [ ] **Step 2: FAIL. Step 3: implementuj. Step 4: PASS.**
- [ ] **Step 5: Ekran `#trips`:**
  - odbitki z tytułem, `formatRange`, znacznikami inicjałów i zdjęciem lidera (z `wypad-trip-<id>`);
  - minione wyszarzone pod nagłówkiem „Minione”;
  - pusty stan „Jeszcze żadnego wypadu. Zaplanujmy pierwszy.”;
  - „Nowy wypad” nieaktywny offline z podpisem „Nowy wypad wymaga internetu”;
  - menu konta z imieniem i „Wyloguj”.
  
  Kliknięcie odbitki otwiera wypad (Task 8; do tego czasu `console.log`).
- [ ] **Step 6: Sprawdź w podglądzie:** konto `t_k` tworzy wypad przez konsolę `WypadTrips.create`, a ten pojawia się na liście; po wyłączeniu sieci lista zostaje.
- [ ] **Step 7: Commit** „Lista wypadów”.

### Task 6: Lotniska i ceny (`airports.json`, `fares.js`)

**Files:**
- Create: `scripts/airports.mjs`, `airports.json`, `fares.js`, `tests/fares.test.mjs`, `tests/fixtures/ryanair-roundtrip.json` (kopia odpowiedzi z KRK 19–20.11 → 22–24.11)

**Interfaces:**
- `scripts/airports.mjs`: pobiera `https://www.ryanair.com/api/views/locate/5/airports/pl/active` i zapisuje `airports.json` jako `[{code, name, city, country, countryCode, lat, lng}]` posortowane po `city`.
- Produces `window.WypadFares`:
  - `airports(): Promise<Airport[]>` (fetch `airports.json`),
  - `search({origin, outFrom, outTo, backFrom, backTo}): Promise<Offer[]>` (cache `wypad-fares:<parametry>` na 6 h, limit 8 s przez `AbortController`),
  - `parse(json): Offer[]`, `groupByCity(offers): CityOffer[]`.
- `Offer = {code, city, country, countryCode, out: {day, dep, arr, price, date}, back: {…}, total}`. `day`, `dep`, `arr` w formacie dzisiejszych lotów (`"czw"`, `"06:05"`), żeby trafiły wprost do `d.out` i `d.back`.
- `CityOffer = {city, country, countryCode, cheapest: Offer, offers: Offer[]}` posortowane rosnąco po `cheapest.total`.

- [ ] **Step 1: Testy na fixturze:**
  - `parse` zwraca 57 ofert, pierwsza Newcastle `total === 170`, `out.dep === "21:55"`, `out.day === "pt"`;
  - `groupByCity` scala dwa lotniska jednego miasta (sztuczny wpis MXP i BGY → jedna pozycja „Mediolan”, `offers.length === 2`, `cheapest` tańsza);
  - `search` przy `fetch` niezwracającym odpowiedzi przez 8 s rzuca `Error("timeout")`;
  - `search` z odpowiedzią `{}` zwraca `[]`.
- [ ] **Step 2: FAIL. Step 3: uruchom `node scripts/airports.mjs` (powinno być ~221 lotnisk), implementuj `fares.js`. Step 4: PASS.**
- [ ] **Step 5: Commit** „Lotniska i ceny lotów z Ryanaira”.

### Task 7: Kreator nowego wypadu (`wizard.js`)

**Files:**
- Create: `wizard.js`, `tests/wizard.test.mjs`
- Modify: `index.html` (`<dialog id="wizard">`), `styles.css`

**Interfaces:**
- Consumes: `WypadTrips.create/addMember/invite/findProfiles/list`, `WypadFares.airports/search/groupByCity`, `Motion.flip`. Ręczne dodanie miasta: `geocode(q)` przeniesione z `app.js` do `wizard.js` jako `WypadWizard.geocode` (Nominatim, jak dziś).
- Produces `window.WypadWizard`:
  - `open({tripId?, onDone})`: bez `tripId` tworzy wypad; z `tripId` od razu krok 3 dla istniejącego wypadu;
  - `validateWhen({title, start, end, origin}): string | null` (komunikat błędu lub `null`);
  - `defaultTitle(start, end): string` („Wypad 19–24 lis”);
  - `toDestination(cityOffer, geo): Destination` (format `D()` z `data.js`, z `selOut` i `selBack` ustawionymi na lot z oferty).
- Elastyczność ±N dni rozszerza `outFrom`/`outTo` i `backFrom`/`backTo`.

- [ ] **Step 1: Testy:**
  - `validateWhen({start:"2026-11-24", end:"2026-11-19", …}) === "Powrót musi być po wylocie"`;
  - pusty tytuł daje „Dodaj tytuł”;
  - `defaultTitle("2026-11-19","2026-11-24") === "Wypad 19–24 lis"`;
  - `toDestination` z ofertą Sofii ustawia `out[0].price`, `selOut === 0` i `id === "sofia"`.
- [ ] **Step 2: FAIL. Step 3: implementuj. Step 4: PASS.**
- [ ] **Step 5: UI trzech kroków według spec** (Kiedy i skąd → Z kim → Dokąd tanio?):
  - siatka odbitek z ceną, suwak „do X zł”, filtr kraju, zaznaczanie;
  - „Dodaj miasto ręcznie”, „Skopiuj z poprzedniego wypadu”;
  - komunikat przy błędzie Ryanaira dokładnie jak w spec;
  - „Gotowe” zapisuje kierunki do `wypad-trip-<id>` i woła `onDone(tripId)`.
- [ ] **Step 6: Sprawdź w podglądzie:**
  - KRK 19–24.11 pokazuje kierunki, a zaznaczenie trzech i „Gotowe” tworzy wypad z trzema kierunkami;
  - zablokowanie `ryanair.com` (np. `fetch` podmieniony w konsoli) pokazuje komunikat i ręczne dodawanie.
- [ ] **Step 7: Commit** „Kreator wypadu z «Dokąd tanio?»”.

### Task 8: Wnętrze wypadu na danych grupy (`app.js`)

**Files:**
- Modify: `app.js`, `index.html` (nagłówek: tytuł wypadu i powrót; Więcej: „Wypad”, „Osoby”, „Dodaj kierunki”, bez „Razem na dwóch telefonach”), `styles.css`, `data.js` (`D` eksportowane jako `window.makeDestination`)
- Create: `group.js`, `tests/group.test.mjs`

**Interfaces:**
- Produces `window.WypadGroup` (czyste funkcje):
  - `isMatch(dest, members, cfg): boolean`. Prawda, gdy wszyscy członkowie mają `votes[id] === 1` albo `dest.id` jest w `cfg.matched`.
  - `voteTags(dest, members, meId): {shown: [{id, initial, v, name}], more: number}` (3 pokazane przy 5+ osobach).
  - `matchLine(newlyYes: Member[]): string`. „Zuzia też chce!” albo „Wszyscy chcą!” przy 2+.
  - `initials(members)`: unikalne inicjały, np. „K”, „Ka” przy dwóch na K.
- `app.js`:
  - `openTrip(trip)` ładuje `wypad-trip-<id>` (albo pusty stan z `trip`) i woła `WypadSync.open(id)`;
  - `who` = `WypadAuth.user.id`, `PEOPLE` i `#who` usunięte;
  - przy nowym matchu dopisuje `dest.id` do `cfg.matched`;
  - sekcja Więcej → „Wypad” edytuje przez `WypadTrips.update`; karta kierunku ma „Odśwież ceny” (`WypadFares.search` dla dat wypadu i kodu lotniska kierunku, aktualizacja `out`/`back`);
  - `onGone` pokazuje toast „Nie jesteś już w tym wypadzie” i wraca do listy.

- [ ] **Step 1: Testy `group`:**
  - 3 członków, 2 na tak daje brak matcha, a 3 na tak daje match;
  - `cfg.matched` z `"sofia"` i nowy członek bez głosu nadal daje match (Review Focus 3);
  - 6 członków daje `shown.length === 3` i `more === 3`;
  - `matchLine([{name:"Zuzia"}]) === "Zuzia też chce!"`.
- [ ] **Step 2: FAIL. Step 3: implementuj `group.js` i przepnij `app.js`.** Wszystkie miejsca `PEOPLE`, `votes.K/Z`, `setWho`, parowania i `joinFromLink` zastąp. Teksty z imieniem drugiej osoby („Zuzi”, „Krystianowi”) zamień na neutralne („Wyślij link osobom z wypadu”). Step 4: PASS.
- [ ] **Step 5: Sprawdź w podglądzie:**
  - dwa konta na dwóch źródłach (localhost i 127.0.0.1) i trzecie dodane loginem;
  - głos na jednym widać na drugim w kilka sekund;
  - match dopiero po trzecim „tak”, z napisem „<imię> też chce!”;
  - „Opuść wypad” na trzecim koncie usuwa wypad z jego listy.
- [ ] **Step 6: Commit** „Wnętrze wypadu dla dowolnej grupy”.

### Task 9: Przeniesienie obecnego wyjazdu

**Files:**
- Create: `legacy.js`, `tests/legacy.test.mjs`

**Interfaces:**
- Consumes: `WypadTrips.create`, `WypadSync`, stary format `wypad-v3` i `wypad-sync` (`{room}`), stare RPC `wypad_pull` (wołane kluczem publishable, bez logowania).
- Produces `window.WypadLegacy`:
  - `pending(): boolean` (jest `wypad-v3`, nie ma `wypad-v3-old`),
  - `convert(oldState, myLetter, userId): {data, items, legacyVotes}`. Głosy `myLetter` dostają klucz `userId`; głosy drugiej litery trafiają do `cfg.legacy = {K|Z: {destId: vote}}`.
  - `run(myLetter): Promise<tripId>`. Jeśli `wypad-sync.room`, najpierw `wypad_pull` i nałożenie stanu pary. Potem `create` z tytułem „Wypad we dwoje”, 2026-11-19…2026-11-24, KRK, zapis, `WypadSync.sync()`, a po sukcesie zmiana nazwy `wypad-v3` → `wypad-v3-old`.
  - `claim(tripData, letter, userId)`: przenosi `cfg.legacy[letter]` na `v:<destId>:<userId>` i czyści wpis.

- [ ] **Step 1: Testy:**
  - `convert` z głosami `{K:1, Z:-1}` na „sofia” daje `d.votes[userId] === 1` i `cfg.legacy.Z.sofia === -1`;
  - `claim("Z", u2)` daje `votes[u2] === -1` i brak `cfg.legacy.Z`;
  - `run` przy błędzie `create` nie zmienia nazwy `wypad-v3`.
- [ ] **Step 2: FAIL. Step 3: implementuj.** Dialog po zalogowaniu („Na tym telefonie jest wyjazd 19–24 listopada…”, przyciski „Krystian”, „Zuzia”, „Nie teraz”). W „Osoby” zaproszona osoba widzi „Byłaś/eś w starym wyjeździe? Krystian / Zuzia”, gdy `cfg.legacy` ma niewzięte litery. Step 4: PASS.
- [ ] **Step 5: Sprawdź w podglądzie:**
  - wstrzyknięty `wypad-v3` z obecnego `SAMPLE_DATA` i głosami K/Z;
  - po przeniesieniu jako Krystian wypad ma 29 kierunków i głosy K;
  - drugie konto po zaproszeniu wybiera Zuzię i ma jej głosy.
- [ ] **Step 6: Commit** „Przeniesienie listopadowego wyjazdu na konta”.

### Task 10: Offline, dokumentacja i próba całości

**Files:**
- Modify: `sw.js` (SHELL + `auth.js`, `trips.js`, `fares.js`, `wizard.js`, `group.js`, `legacy.js`, `airports.json`; `APP = "wypad-app-v11"`; omijanie `ryanair.com`), `PRODUCT.md` (konta, wypady, Ryanair), `DESIGN.md` (ekrany logowania, listy, kreatora), `README.md`
- Modify: pamięć `~/.claude/projects/-Users-krystianbajerski-wypadzik/memory/wypad-supabase-sync.md` (nowy model: konta i `trip_items`; stare RPC do usunięcia po 30.11.2026)

- [ ] **Step 1: `node --test tests/`.** Wszystko PASS.
- [ ] **Step 2: Próba całości w podglądzie** według sekcji „Testy” w spec, łącznie z trybem offline (DevTools offline: lista, głos w kolejce, wysyłka po powrocie sieci) i brakiem błędów w konsoli.
- [ ] **Step 3: Usuń testowych użytkowników i wypady** (`t_%`) przez `execute_sql`.
- [ ] **Step 4: Commit** „Offline i dokumentacja dla kont i wypadów”. Merge i push dopiero na prośbę Krystiana.
