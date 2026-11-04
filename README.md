# Wypad we dwoje

Apka (PWA) do wyboru i planowania weekendowego wyjazdu: porównanie kierunków i lotów z Krakowa, mapa z pinezkami (jedzenie, zwiedzanie, nocleg) z zapisem map offline oraz plan dnia.

Statyczna strona bez budowania: `index.html`, `app.js`, `data.js` (dane lotów), `sw.js` (tryb offline). Działa z GitHub Pages.

## Konta, wypady i testy

Logowanie loginem i hasłem działa na Supabase Auth (login zamienia się na e-mail `<login>@wypad.invalid`). W Supabase: **Authentication → Providers → Email → „Confirm email” musi być WYŁĄCZONE**, inaczej założenie konta kończy się komunikatem „wymaga potwierdzenia e-mail”.

- Testy: `node --test tests/` (bez instalowania czegokolwiek, wystarczy Node).
- Lista lotnisk Ryanair (`airports.json`) powstaje ze skryptu: `node scripts/airports.mjs`. Plik jest w repo, apka ładuje go statycznie i trzyma w cache offline.
- Baza: migracje w `supabase/migrations/`, sprawdzenia RLS w `supabase/tests/trips_rls.sql`. Stara tabela `wypad_items` i funkcje `wypad_pull` / `wypad_push` zostają do 30.11.2026 (potrzebne do przeniesienia listopadowego wyjazdu), potem do usunięcia.
- Lokalny podgląd: `python3 -m http.server 8791` i `http://localhost:8791/`.
