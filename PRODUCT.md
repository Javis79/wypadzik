# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Installable PWA, phone-first, with a desktop layout (the Tabela view is desktop-only).

## Users

Small groups of friends and couples who plan short trips together: two people, three, or a few more. It began as a private tool for Krystian and Zuzia, and they are still its first users, but anyone can now make an account and run their own trips. Each person signs in with a login and a password, and the app knows who is voting from the account, not from a switch.

They use it in three situations:

- **Deciding together on phones.** Usually side by side, swiping through destinations, voting yes or no and comparing the options.
- **Filling in prices on a laptop.** Typing accommodation, daily spending and transfer costs into the desktop table.
- **On the trip, offline.** Walking around the chosen city with the map, saved places and the day plan, often with no signal.

## Product Purpose

The app helps a group pick a weekend destination and then plan the trip. It answers "where do we go?" by comparing real flight options (times, prices, how many hours they get there, the total cost for the group against their budget, and the weather). Once they've chosen, it answers "what do we do there?" with pins, a day plan and offline maps.

Success means everyone in the group agrees on a destination quickly (a "match") and can rely on the app in the city without a connection.

The app serves many trips. A new trip starts in a three-step wizard (dates and departure airport, who is coming, then "Dokąd tanio?"), where real Ryanair prices for those dates fill the list of destinations. The November trip (19–24.11.2026 from Kraków) was the first one, and a phone that still holds it can move it onto an account.

## Positioning

It's a private decision tool for a group of friends, not a travel portal. Flight prices come from Ryanair's public price calendar (cheapest fares for the chosen dates, one airline only), and the group's votes are what decides. Searching beyond that, booking and recommending are left to Booking, Airbnb and the airlines, which the app links to.

## Operating Context

- **Order of use:** log in → Moje wypady (pick or start a trip) → Wybierz (swipe to vote) → Porównaj (compare with budget, sorting and filters) → Tabela (enter costs on desktop) → Mapa (places by category, offline tiles) → Plan (day plan) → Więcej (data, photos, offline maps, reset).
- **Sharing:** each person uses their own phone and their own account. Whoever makes a trip adds the others by login (in the wizard or later under Więcej → Osoby) or sends an invite link, which adds whoever opens it after signing in and expires after 14 days. Votes, costs, ratings and places sync live between everyone in the trip. The `.json` export stays as a backup.
- **Booking happens elsewhere:** links to Booking and Airbnb carry the dates of the chosen flight pair.
- **Real situations:** sitting on the couch deciding together, at a laptop typing in prices, and walking a foreign city without signal.

## Capabilities and Constraints

**What it does now**
- Destinations hold outbound and return flight options. Prices are zł per person, one way. The group picks a flight pair, and costs are worked out per person and for the whole group.
- Each person votes on each destination. A **match** means everyone in the trip voted yes.
- The comparison shows total cost, hours spent there, airport transfer, time zone and expected temperature, and can be sorted by cost, ratings, time there, flight price or warmth.
- The detail card shows weather (Open-Meteo), a short city description, main sights and local food (`info.js`), and a photo gallery.
- The map has place categories Jedzenie, Zwiedzanie, Nocleg and Inne, plus geocoding, "where am I", and tile download for offline use.
- Places can be turned into a day plan.

**Technical constraints (confirmed)**
- No build step. Plain static HTML, CSS and JS, deployed on GitHub Pages, with Leaflet bundled in `vendor/`.
- Data lives on each device in `localStorage` and syncs between the people in a trip through Supabase (project `zyvjjqucfidnbzoevqlr`), which is still the only server. Accounts use Supabase Auth with a login and a password (the login becomes `<login>@wypad.app` behind the scenes, so "Confirm email" must stay off); there are no e-mails and no password reset yet. The tables are `profiles`, `trips`, `trip_members`, `trip_items` (one row per vote, destination, rating or place) and `trip_invites`, all behind row-level security so only members of a trip can read or write it. The live "something changed" signal goes over Realtime. The app keeps working offline, queues changes and sends them when it is back online. The client uses the public publishable key; the code is in `auth.js`, `trips.js` and `sync.js`, and the SQL is in `supabase/migrations/`.
- The old pair-code model (the `wypad_items` table and the `wypad_pull` / `wypad_push` functions) is kept only so a phone that still holds the November trip can pull it once. It is to be removed after 30.11.2026.
- The interface is in Polish only.
- Only free data sources: OSM tiles and Nominatim, Wikipedia and Openverse photos, Open-Meteo, Ryanair's unofficial `farfnd` price calendar (called straight from the browser, no key, and it can change or disappear without notice), and a static `airports.json` of Ryanair airports (rebuilt by `scripts/airports.mjs`). No paid APIs and no API keys.
- Everything must work offline through the service worker (`sw.js`), and maps can be saved in advance.

**Terminology:** wypad (a trip), kierunek (destination), wariant lotów (flight pair), match, nocleg, dojazd, plan dnia, mapa offline, zaproszenie (invite).

**Open decisions**
- Whether to add other airlines than Ryanair, and password reset by e-mail (both are out of the first stage).

## Brand Commitments

- The name is **"Wypad we dwoje"** (short form "Wypad"). The tone is informal and warm and speaks to the group ("jedziemy", "wpisujcie", "zaplanujmy pierwszy").
- The name is a leftover from when it was only for two. It stays for now, but wording should work for any group size ("wszyscy", not "oboje"), and a group is still friends, never strangers.

## Evidence on Hand

- Real flight options for 29 destinations from Kraków for 19–24.11.2026 (`data.js`, the sample data and the source of the old November trip). New trips get live Ryanair prices for their own dates. Airports and distances are marked as approximate (~).
- Descriptions, sights and food for each city (`info.js`).
- App icons: `icon.svg`, `icon-192.png`, `icon-512.png`.
- Nothing else exists, and nothing should be invented: no prices beyond what is in `data.js` (accommodation costs are deliberately blank) and no reviews or ratings from outside sources.

## Product Principles

1. **The decision belongs to everyone in the trip.** Every comparison comes back to one question: do we all want this, and does it fit our budget?
2. **Real numbers before nice ones.** Costs, times and the hours they get there are shown honestly. Approximations are marked, and empty values stay visibly empty.
3. **It works without signal.** Anything needed in the city has to work offline.
4. **One clear path from choosing to the trip.** Swipe, compare, then plan, without detours.
5. **Simple to keep running.** Static files and free sources. The one server is the free Supabase project for accounts and syncing, and new features shouldn't need any other server or secret key.

## Accessibility & Inclusion

No specific needs have been stated. The basics still apply: it's used one-handed on a phone and outdoors in daylight, so touch targets must be comfortable to hit and text must stay legible.
