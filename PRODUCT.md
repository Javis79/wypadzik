# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Installable PWA, phone-first, with a desktop layout (the Tabela view is desktop-only).

## Users

Two people: Krystian and Zuzia, a couple who plan short trips together. Nobody else uses it. The app knows both of them by name (`PEOPLE` in `app.js`), and each person switches who is voting with the 👤 button.

They use it in three situations:

- **Deciding together on phones.** Usually side by side, swiping through destinations, voting yes or no and comparing the options.
- **Filling in prices on a laptop.** Typing accommodation, daily spending and transfer costs into the desktop table.
- **On the trip, offline.** Walking around the chosen city with the map, saved places and the day plan, often with no signal.

## Product Purpose

The app helps the two of them pick a weekend destination and then plan the trip. It answers "where do we go?" by comparing real flight options from Kraków (times, prices, how many hours they get there, the total cost for two against their budget, and the weather). Once they've chosen, it answers "what do we do there?" with pins, a day plan and offline maps.

Success means both of them agree on a destination quickly (a "match") and can rely on the app in the city without a connection.

The first trip is 19–24.11.2026 from Kraków. The app should also serve their **future trips**, so the dates, the list of flights and the departure city will need to be replaceable rather than staying hard-coded. Making that happen is an open product decision.

## Positioning

It's a private decision tool for exactly two people, not a travel portal. Its flight data is copied by hand from their own searches (data.js says it was transcribed from Krystian's notes), and two-person voting is what decides. Searching, booking and recommending are left to Booking, Airbnb and the airlines, which the app links to.

## Operating Context

- **Order of use:** Wybierz (swipe to vote) → Porównaj (compare with budget, sorting and filters) → Tabela (enter costs on desktop) → Mapa (places by category, offline tiles) → Plan (day plan) → Więcej (data, photos, offline maps, reset).
- **Sharing:** there is no server. One person exports a `.json` file (or shares it) and the other imports it.
- **Booking happens elsewhere:** links to Booking and Airbnb carry the dates of the chosen flight pair.
- **Real situations:** sitting on the couch deciding together, at a laptop typing in prices, and walking a foreign city without signal.

## Capabilities and Constraints

**What it does now**
- Destinations hold outbound and return flight options. Prices are zł per person, one way. The two people pick a flight pair, and costs are worked out per person and for two.
- Each person votes on each destination. A **match** means both voted yes.
- The comparison shows total cost, hours spent there, airport transfer, time zone and expected temperature, and can be sorted by cost, ratings, time there, flight price or warmth.
- The detail card shows weather (Open-Meteo), a short city description, main sights and local food (`info.js`), and a photo gallery.
- The map has place categories Jedzenie, Zwiedzanie, Nocleg and Inne, plus geocoding, "where am I", and tile download for offline use.
- Places can be turned into a day plan.

**Technical constraints (confirmed)**
- No build step. Plain static HTML, CSS and JS, deployed on GitHub Pages, with Leaflet bundled in `vendor/`.
- Data stays on the device in `localStorage`. There is no backend and no account, and sync is JSON export and import.
- The interface is in Polish only.
- Only free data sources: OSM tiles and Nominatim, Wikipedia and Openverse photos, and Open-Meteo. No paid APIs and no API keys.
- Everything must work offline through the service worker (`sw.js`), and maps can be saved in advance.

**Terminology:** kierunek (destination), wariant lotów (flight pair), match, nocleg, dojazd, plan dnia, mapa offline.

**Open decisions**
- How a new trip gets set up (dates, departure city, flight list) without editing `data.js`.

## Brand Commitments

- The name is **"Wypad we dwoje"** (short form "Wypad"). The tone is informal and warm and speaks to both of them ("jedziemy", "wpisujcie", "u Zuzi").
- The app is about the two of them, so wording and features assume a couple, never a group or a stranger.

## Evidence on Hand

- Real flight options for 29 destinations from Kraków for 19–24.11.2026 (`data.js`). Airports and distances are marked as approximate (~).
- Descriptions, sights and food for each city (`info.js`).
- App icons: `icon.svg`, `icon-192.png`, `icon-512.png`.
- Nothing else exists, and nothing should be invented: no prices beyond what is in `data.js` (accommodation costs are deliberately blank) and no reviews or ratings from outside sources.

## Product Principles

1. **The decision belongs to both of them.** Every comparison comes back to one question: do we both want this, and does it fit our budget?
2. **Real numbers before nice ones.** Costs, times and the hours they get there are shown honestly. Approximations are marked, and empty values stay visibly empty.
3. **It works without signal.** Anything needed in the city has to work offline.
4. **One clear path from choosing to the trip.** Swipe, compare, then plan, without detours.
5. **Simple to keep running.** Static files, free sources, data on the device. New features can't need a server or keys.

## Accessibility & Inclusion

No specific needs have been stated. The basics still apply: it's used one-handed on a phone and outdoors in daylight, so touch targets must be comfortable to hit and text must stay legible.
