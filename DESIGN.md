---
name: Wypad we dwoje
description: A practical trip-picking and planning PWA for two, with numbers first and the city photo as the reward.
colors:
  paper: "#faf7f2"
  card: "#ffffff"
  ink: "#1f1b16"
  muted: "#7a7268"
  line: "#e9e2d8"
  paper-dark: "#16130f"
  card-dark: "#221e19"
  ink-dark: "#f3ede4"
  muted-dark: "#a39a8e"
  line-dark: "#3a332b"
  trip-orange: "#e8590c"
  on-accent: "#ffffff"
  fits-green: "#2b8a3e"
  over-red: "#c92a2a"
  vote-yes: "#40c057"
  vote-no: "#fa5252"
  price-peach: "#ffd8a8"
  photo-dark: "#2a241d"
  cat-food: "#e8590c"
  cat-sight: "#1971c2"
  cat-stay: "#7048e8"
  cat-other: "#5c940d"
typography:
  display:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.1
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.4
  data:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
    fontFeature: "tnum"
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  micro:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  xs: "4px"
  sm: "8px"
  md: "10px"
  card: "14px"
  sheet: "18px"
  swipe: "20px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  2xl: "24px"
components:
  button:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "42px"
  button-primary:
    backgroundColor: "{colors.trip-orange}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
    height: "42px"
  button-danger:
    backgroundColor: "{colors.card}"
    textColor: "{colors.over-red}"
    rounded: "{rounded.md}"
    padding: "10px 12px"
  button-small:
    rounded: "{rounded.md}"
    padding: "4px 10px"
    height: "32px"
  vote-round:
    backgroundColor: "{colors.card}"
    rounded: "{rounded.pill}"
    size: "62px"
  vote-round-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    size: "46px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "14px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "9px 10px"
  chip:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "5px 11px"
  chip-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
  badge-match:
    backgroundColor: "{colors.fits-green}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.pill}"
    padding: "2px 7px"
  swipe-card:
    backgroundColor: "{colors.photo-dark}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.swipe}"
  tab-bar:
    backgroundColor: "{colors.card}"
    textColor: "{colors.muted}"
    height: "64px"
  tab-active:
    textColor: "{colors.trip-orange}"
  toast:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.pill}"
    padding: "10px 16px"
---

# Design System: Wypad we dwoje

## Overview

**Creative North Star: "Bilet i mapa" (Ticket and Map)**

Wypad reads like a well-filled-in boarding pass lying on a map: the facts that decide the trip come first and are easy to scan. Those facts are flight times, price per person, the total for two, hours in the city and the distance from the airport. The city photo is the reward for looking, not the argument. Even on the swipe card, where the photo fills the frame, the lower third is a dense data panel of flight rows with tabular figures and prices.

The surface is warm and quiet. Off-white paper (light) or a deep brown-black (dark) with white or brown cards, hairline beige borders and almost no shadow. There is one brand colour, a trip orange, which marks "us": the wordmark, the active tab, primary actions and links. Green and red are reserved for whether something fits: a match, within budget, over budget, yes or no. The type is the system font throughout, and hierarchy comes from weight and size rather than a second typeface.

Density is compact and phone-first. It's used one-handed, often next to the other person, and later outdoors. On desktop, the same parts spread into a centred column up to 1200px with a top tab bar and a cost table.

**Key Characteristics:**
- Numbers lead: prices, times and totals are bold and use tabular figures, and the label next to them is muted.
- A single brand accent (trip orange); green and red only for fit or no fit.
- Flat paper and cards with 1px beige hairlines. Depth is reserved for the photo-led swipe deck and the round vote buttons.
- Soft, friendly geometry: rounded 10–20px corners, pill-shaped chips, badges and toasts.
- Emoji serve as icons (tabs, categories, flight rows). There is no icon font.
- Light and dark mode follow `prefers-color-scheme`; only the neutrals change.

## Colors

A warm neutral paper base with one orange voice and a strict green/red pair for "does it fit".

### Primary
- **Trip Orange** (`trip-orange`): the brand. The "we dwoje" in the wordmark, the active tab (text on mobile, a 3px underline on desktop), primary buttons, links in place lists, the attractions list and the table, the dashed outline while adding a place on the map, and the app icon and `theme-color`. It also doubles as the Jedzenie category colour.

### Secondary
- **Fits Green** (`fits-green`): good fit. The "❤ match" badge, the outline and glow on the cheapest destination that fits the budget, the budget progress fill, pros, and the left edge marker on matched table rows.
- **Over-Budget Red** (`over-red`): bad fit or destructive. A total over budget, the over-budget bar, cons, danger buttons (reset, clear maps), the offline network pill and warning tags on the swipe card.

### Tertiary
- **Vote Yes / Vote No** (`vote-yes`, `vote-no`): brighter green and red, used only on the dark photo surfaces: the ✕ and ❤ glyphs on the round vote buttons and the rotated "stamp" that appears while dragging a card.
- **Price Peach** (`price-peach`): flight prices on the swipe card's dark overlay, where orange would not be readable.
- **Category pins**: Jedzenie (`cat-food`, the same as trip orange), Zwiedzanie (`cat-sight`, blue), Nocleg (`cat-stay`, violet) and Inne (`cat-other`, olive). Used only for map pins and the dots in place lists.

### Neutral
- **Paper** (`paper` / `paper-dark`): the page background. It is also the input background, so fields sit slightly recessed inside white cards.
- **Card** (`card` / `card-dark`): cards, dialogs, the mobile tab bar, the table and the vote buttons.
- **Ink** (`ink` / `ink-dark`): text. Inverted, it fills the selected chip and the toast.
- **Muted** (`muted` / `muted-dark`): labels, help text, secondary metadata and inactive tabs.
- **Line** (`line` / `line-dark`): every border and divider, the empty budget bar and the network pill background.
- **Photo Dark** (`photo-dark`): what the swipe card shows before its photo loads. If there's no photo, an orange-to-violet gradient (`trip-orange` → `cat-stay`) is shown with an emoji instead.

### Named Rules
**The Us-Or-Fit Rule.** Orange means "this is us / this is active". Green and red mean "this fits / this doesn't". Never use green or red for decoration, and never use orange to say something is good or bad.

**The Muted Label Rule.** Every number has a muted label beside it and the number itself is in ink. Don't colour a number unless it is over budget (red) or a price on a dark photo (peach).

## Typography

**Body Font:** the system UI stack (`system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`)
**Mono:** `ui-monospace, Menlo, monospace`, only in textareas and inline `code`

**Character:** native and neutral, so it feels like part of the phone. Hierarchy comes from bold weights and size jumps. There is no second typeface.

### Hierarchy
- **Display** (700, 28px, 1.1): the city name on the swipe card and in the detail sheet hero. It sits on a photo with a dark gradient, in white. It drops to 24px on phones and 22px on short phones.
- **Headline** (700, 22px): the destination total on comparison cards (`376 zł`), with a muted 11px "+ nocleg" line beneath it.
- **Title** (700, 20px, −0.02em): the wordmark in the header (17px under 400px wide). Card and dialog `h2` titles use the browser default bold.
- **Body** (400, 15px, 1.4): base text, the city description and day headings in the plan.
- **Data** (14px, tabular figures): flight rows, cost rows and table cells. Prices are bold.
- **Label** (13px): form labels, `.muted` help text, chips and small buttons.
- **Micro** (500, 11–12px): badges, vote markers, the network and person pills, and tab labels.

### Named Rules
**The Tabular Rule.** Anything that is compared in a column (prices, times, totals) uses `font-variant-numeric: tabular-nums` and aligns right.

## Layout

- **Phone (< 760px):** the whole screen is one column fixed to `100dvh`. There's a sticky header with the wordmark and the person and online pills, a scrolling `main` (10–14px padding), and a bottom tab bar (56px tall, six equal columns, emoji over label). The swipe view gives all leftover height to the card deck, with the vote buttons under it. Short screens (≤ 760px tall) hide the help line and extra tags so the photo stays visible.
- **Desktop (≥ 760px):** the tab bar moves under the header as a horizontal strip with an orange underline. Content is centred at a maximum width of 1200px with 24px gutters. Destination cards go into an auto-fill grid (`minmax(340px, 1fr)`), the budget filters sit in one row, the map grows to 62vh, dialogs widen to 820px and the desktop-only Tabela tab appears.
- **Rhythm:** a tight 4–16px scale. Stacked cards have 12px between them, cards have 14px padding, and button rows and chips have 6–8px gaps. Two-column form grids (`grid2`, the budget block) are the default pattern for fields.
- **Safe areas:** the header, tab bar, sheet close button and lightbox all respect `env(safe-area-inset-*)`, because it's installed as a standalone PWA on an iPhone.

## Elevation & Depth

The surface is flat. Cards, dialogs, the table and the tab bar separate from the paper with a 1px `line` border and a change in tone, not with shadows. Depth is used in only three places, and all three are physical: the swipe deck (a card you hold and throw), the round vote buttons you press, and map pins that sit above the map.

### Shadow Vocabulary
- **Swipe lift** (`box-shadow: 0 8px 24px rgba(0,0,0,.25)`): the top card in the deck. The card underneath is scaled to 0.96, moved down 10px and darkened to 85% brightness.
- **Button press** (`box-shadow: 0 2px 8px rgba(0,0,0,.12)`): the round vote buttons.
- **Pin** (`box-shadow: 0 1px 4px rgba(0,0,0,.4)`): map pins with a 2px white border.
- **Best-fit ring** (`box-shadow: 0 0 0 2px` fits-green at 25%): marks the best destination card. This is a state ring, not elevation.

### Named Rules
**The Paper-Flat Rule.** If it isn't something you physically hold, press or drop on a map, it gets a hairline border and no shadow.

## Shapes

Soft and friendly. Corners get rounder as the object gets more tangible: 4px on inline code, 8px on note boxes, 10px on buttons, inputs, plan slots and fieldsets, 12px on weather tiles, 14px on cards, the map and dialogs, 18px on the desktop detail sheet, and 20px on the swipe card. Anything small and label-like (chips, badges, vote markers, pills, the toast, the budget bar) is a full pill. Vote buttons are circles. Map pins are a teardrop: a rotated square with three rounded corners.

## Components

### Buttons
Soft, low-key and comfortable to tap.
- **Shape:** gently rounded (10px). Minimum height is 42px; small buttons are 32px.
- **Default:** card background, ink text and a 1px line border, with an inline icon and label (6px gap).
- **Primary:** trip orange fill and border with white text. Used for the main action in a view, such as "+ Dodaj kierunek" or saving in a dialog.
- **Danger:** default button with red text. Used for reset and clearing data.
- **Toggled (`.on`):** red border and text, for toggles like rejecting.
- **Wide:** full width with 8px above, used for stacked actions in the settings cards.
- No hover or focus styles are defined beyond the browser's own.

### Vote buttons (signature)
A row of circles under the swipe deck: ✕ (62px, vote-no glyph), ↺ undo and ℹ details (46px, muted), and ❤ (62px, vote-yes glyph). They have a card fill, a line border and the button-press shadow. Disabled ones drop to 35% opacity. They shrink to 56px and 42px on phones.

### Swipe card (signature)
The main object of the app. A 20px-radius card filling the deck, with the full-bleed city photo (or the orange-to-violet gradient). A gradient running from transparent to 82% black covers the lower part and carries the city name (display size), the country and temperature, two flight rows (day and times, flight duration, price in peach), and translucent pill tags with a slight blur (total for two, hours there, airport, number of flight pairs). Warning tags turn translucent red. While dragging, a rotated "TAK"/"NIE" stamp with a 4px border fades in. An italic serif "i" button in a dark translucent circle sits top right.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** card on paper, with a 1px line border and no shadow.
- **Internal Padding:** 14px. Stacked cards have 12px between them.
- **Destination card:** the city name in bold with a muted metadata line, and the headline total top right. Flight rows have bold prices, and a quick action row holds small buttons. The best fit gets a green border and ring, rejected cards drop to 55% opacity, and notes sit in a paper-coloured inset box (8px radius).

### Inputs / Fields
- **Style:** paper background inside the card, a 1px line border, a 10px radius and 9px × 10px padding. They're full width, with a muted 13px label above.
- **Checkboxes:** the label sits inline in ink at 14px.
- **Table cells:** compact right-aligned number inputs (90px wide).
- No focus style beyond the browser default.

### Chips
- **Style:** pill-shaped, with a card background, a 1px line border and 13px text, in a row that scrolls sideways.
- **Selected:** inverted to an ink fill with paper text. Used for the map category filter.

### Badges and status pills
- **Match badge:** an 11px white "❤ match" on a fits-green pill.
- **Vote markers:** outlined pills with the person's initial and ❤ or ✕, the glyph in green or red.
- **Header pills:** the person switcher (a pill with a 18% orange tint) and the network status (line-coloured, or red with white text when offline).

### Navigation
- **Mobile:** a fixed bottom bar with a card background and a top hairline. Each of the six equal tabs is an emoji (20px) above a 12px label. Inactive tabs are muted and the active one is orange.
- **Desktop:** a sticky horizontal strip on the paper background under the header. Tabs are sized to their content, with the emoji beside the label at 14px. The active tab gets orange text and a 3px orange underline.

### Detail sheet
A full-screen dialog on phones (rounded 18px and up to 90vh tall on desktop). At the top, a 260px hero gallery snaps sideways between photos, with dots and a caption pill. Below the hero, the city name in white on a dark gradient. The body scrolls and holds a horizontal strip of weather tiles (paper-coloured, 12px radius), an about paragraph, two columns for sights and food, and attraction rows with 84×64 thumbnails. A fixed vote bar at the bottom splits 1:2. Photos open in a near-black lightbox with translucent round controls.

### Toast
An ink-coloured pill floating above the tab bar with paper text at 14px. It fades over 0.2s.

## Do's and Don'ts

### Do:
- **Do** put the decision number (the total for two, the price per person, hours there) in bold ink with tabular figures and a muted label beside it.
- **Do** keep orange for "us and active": the wordmark, the active tab, primary buttons and links.
- **Do** use green only for a match, within budget or a pro, and red only for over budget, a no, a con, offline or something destructive.
- **Do** separate surfaces with the 1px `line` border and a change of tone; keep cards flat.
- **Do** use pills for anything small and label-like, and 10px corners for anything you tap or type into.
- **Do** redefine only the neutral tokens for dark mode; the accent and status colours stay the same.
- **Do** test every view at 375 × 812 and on a short phone (≤ 700px tall). Hiding secondary tags is better than shrinking the photo away.

### Don't:
- **Don't** add a second brand colour or use the category colours (blue, violet, olive) outside the map pins and place dots.
- **Don't** add shadows to cards, dialogs or bars; depth belongs to the swipe card, vote buttons and pins.
- **Don't** let the photo hide the numbers: on photo surfaces, data sits on a dark gradient in white or peach.
- **Don't** introduce a web font or an icon font; the system stack and emoji are the type and icons.
