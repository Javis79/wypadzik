---
name: Wypad we dwoje
description: A private trip-deciding PWA for two, laid out as instant-film prints with votes written on in marker.
colors:
  shell-pink: "#e98aa6"
  shell-ink: "#1d1a22"
  table-lilac: "#efe9ee"
  print-white: "#ffffff"
  sheet: "#ffffff"
  ink: "#1d1a22"
  ink-2: "#4f4854"
  muted: "#6a6270"
  rule: "#e6dee4"
  print-rule: "#ece5ea"
  field: "#f7f4f6"
  field-line: "#cbc1c9"
  photo-blank: "#d9d0d7"
  marker-navy: "#24318f"
  marker-green: "#1f8a4c"
  marker-red: "#d6332b"
  tape-pink: "#f3b8c9"
  plate-ink: "#1d1a22"
  cat-food: "#c2410c"
  cat-sight: "#24318f"
  cat-stay: "#b4376a"
  cat-other: "#5c6b2e"
  dark-table: "#17131a"
  dark-sheet: "#221c25"
  dark-print: "#f6f2f4"
  dark-ink: "#f3edf2"
  dark-muted: "#a99fa8"
  dark-rule: "#3a3139"
  dark-field: "#2b2430"
  dark-marker: "#9fb0ff"
  dark-yes: "#4cc27a"
  dark-no: "#ff6b5e"
  dark-tape: "#b85d7a"
typography:
  display-hand:
    fontFamily: "Shantell Sans, Archivo, system-ui, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.05
    letterSpacing: "-0.01em"
  wordmark:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    letterSpacing: "-0.015em"
    fontVariation: "'wdth' 78"
  headline:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "19px"
    fontWeight: 800
    lineHeight: 1.15
    letterSpacing: "-0.01em"
    fontVariation: "'wdth' 82"
  title:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "17px"
    fontWeight: 800
    lineHeight: 1.15
    fontVariation: "'wdth' 82"
  figure:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "24px"
    fontWeight: 800
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 80"
  body:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'tnum'"
  data:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    fontFeature: "'tnum'"
    fontVariation: "'wdth' 90"
  label:
    fontFamily: "Archivo, system-ui, -apple-system, Segoe UI, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    fontVariation: "'wdth' 90"
  hand-note:
    fontFamily: "Shantell Sans, Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.3
  vote-tag:
    fontFamily: "Shantell Sans, Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 700
    lineHeight: 1
  mono-entry:
    fontFamily: "ui-monospace, Menlo, monospace"
    fontSize: "13px"
    fontWeight: 400
rounded:
  none: "0"
  round: "50%"
spacing:
  xs: "4px"
  sm: "6px"
  md: "10px"
  lg: "16px"
  xl: "24px"
components:
  button:
    backgroundColor: "{colors.print-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
    height: "44px"
  button-hover:
    backgroundColor: "{colors.field}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.print-white}"
    rounded: "{rounded.none}"
    padding: "8px 14px"
    height: "44px"
  button-primary-hover:
    backgroundColor: "{colors.ink-2}"
  button-small:
    rounded: "{rounded.none}"
    padding: "6px 10px"
    height: "36px"
  vote-yes:
    backgroundColor: "{colors.shell-pink}"
    textColor: "{colors.shell-ink}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "54px"
  vote-no:
    backgroundColor: "{colors.print-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "0 20px"
    height: "54px"
  vote-square:
    textColor: "{colors.muted}"
    rounded: "{rounded.none}"
    size: "46px"
  input:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "9px 10px"
    height: "42px"
  chip:
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "6px 10px"
    height: "38px"
  chip-on:
    backgroundColor: "{colors.print-white}"
    textColor: "{colors.ink}"
  print-swipe:
    backgroundColor: "{colors.print-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "10px 10px 0"
  print-contact:
    backgroundColor: "{colors.print-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "6px 6px 0"
  total-plate:
    backgroundColor: "{colors.plate-ink}"
    textColor: "{colors.print-white}"
    typography: "{typography.figure}"
    rounded: "{rounded.none}"
    padding: "7px 10px"
  vote-tag:
    backgroundColor: "{colors.print-white}"
    textColor: "{colors.muted}"
    typography: "{typography.vote-tag}"
    rounded: "{rounded.none}"
    padding: "4px 7px 5px"
  voter-chip:
    textColor: "{colors.shell-ink}"
    rounded: "{rounded.round}"
    size: "32px"
  voter-chip-on:
    backgroundColor: "{colors.shell-ink}"
    textColor: "{colors.print-white}"
  camera-bar:
    backgroundColor: "{colors.shell-pink}"
    textColor: "{colors.shell-ink}"
    padding: "10px 16px"
  tab-bar:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.muted}"
    height: "64px"
  login-print:
    backgroundColor: "{colors.print-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    padding: "16px"
    width: "380px"
  wizard-footer:
    backgroundColor: "{colors.plate-ink}"
    textColor: "{colors.print-white}"
    padding: "10px 16px"
  detail-sheet:
    backgroundColor: "{colors.sheet}"
    textColor: "{colors.ink}"
    rounded: "{rounded.none}"
    width: "640px"
---

# Design System: Wypad we dwoje

## Overview

**Creative North Star: "Odbitki" (instant-film prints)**

Every destination is a print you hold. A photo sits inside a white paper frame, and its wider chin carries the honest numbers in a clean, condensed face: the two flights, hours there, nights, and one reversed ink plate with the flight total for two. Anything a person would write by hand goes on in marker: the city name, short notes, and the K and Z votes. The app is a camera body (a pink top bar with the wordmark and the two voter chips) and a table (a cool lilac-grey ground) where prints lie, are swiped away, or are spread out as a contact sheet.

Density is compact and phone-first. On a phone the whole screen is one column and the swipe print fills whatever height is left between the camera bar and the tab bar. On desktop (760px and up) the same parts sit in a column up to 1200px wide, the tab bar moves under the camera bar, and the contact sheet becomes a wider grid of 4:3 prints. The tone is playful through material (paper, tape, marker, a slight tilt) rather than through decoration. Every icon is a drawn 1.8px stroke symbol from one inline sprite, and there are no emoji.

The redesign explicitly replaced glassy photo cards with emoji chips on cream and orange. Nothing from that look (trip orange, system-font-only type, pill chips, rounded cards) carries forward.

**Key Characteristics:**
- The print is the unit: white paper frame, photo, chin with numbers, paper shadow.
- Two faces with strict jobs: Archivo (condensed widths, tabular figures) for every number and UI word, Shantell Sans only for handwriting.
- Navy marker is handwriting only; green and red markers are state only; pink is the camera body and the tape.
- Square corners on prints, buttons, fields and chips; circles only for person chips and controls floating over photos.
- Prints stay light paper in dark mode; only the table, sheets and chrome go dark.
- Drawn 1.8px stroke icons from the inline sprite; no emoji, no icon font.

## Colors

A pink camera body, a cool lilac table, white paper, and three marker inks, with everything else in a near-black plum ink.

### Primary
- **Camera Pink** (`shell-pink`): the camera bar behind the wordmark and voter chips, the Jedziemy vote button on the swipe screen, the active-tab underline in light mode, and the app icon ground. The same pink is used in both light and dark mode, so the bar reads as the same object in both; the browser theme-color matches it in both schemes.
- **Shell Ink** (`shell-ink`): text, chip outlines and the reversed offline pill on the pink bar, and the text on the pink Jedziemy button.

### Secondary
- **Navy Marker** (`marker-navy`): handwriting only. City names on prints, sheet and table, short notes, the "we dwoje" tail of the wordmark, links, the text caret, and the "you are here" map dot. In dark mode the marker on dark surfaces lightens to `dark-marker`; on prints and on the pink bar it stays navy. Navy on pink is 4.53:1.
- **Marker Green** (`marker-green`) and **Marker Red** (`marker-red`): state only. Yes and no votes, the "jedziemy!" and "nie" swipe stamps, within or over budget, pros and cons, late-return warnings, destructive buttons. Dark-mode sheet equivalents are `dark-yes` and `dark-no`.

### Tertiary
- **Tape Pink** (`tape-pink`, dark `dark-tape`): the match tape strip on a print, the input focus ring, text selection, and the active-tab underline in dark mode.
- **Category inks** (`cat-food`, `cat-sight`, `cat-stay`, `cat-other`): map pins, place dots, the icon of an active category chip, and plan slot icons. Nowhere else.

### Neutral
- **Lilac Table** (`table-lilac`, dark `dark-table`): the page ground prints lie on.
- **Print White** (`print-white`, dark `dark-print`): print paper, weather tiles, plan slots, the table wrap and attraction thumbnails.
- **Sheet** (`sheet`, dark `dark-sheet`): dialogs, the detail sheet, the filters strip, panels and the tab bar.
- **Ink / Ink 2 / Muted** (`ink`, `ink-2`, `muted`; dark `dark-ink`, `dark-muted`): text, secondary text, labels and inactive tabs.
- **Rule / Print Rule** (`rule`, `print-rule`; dark `dark-rule`): hairlines on sheets and inside prints.
- **Field / Field Line** (`field`, `field-line`; dark `dark-field`): hover fill, table input cells, dashed chip borders, scrollbars.
- **Photo Blank** (`photo-blank`): the placeholder behind a missing photo, with the city name written over it in hand.
- **Plate Ink** (`plate-ink`): the reversed total plate on a print. In dark mode the toast uses the light ink instead.

### Named Rules
**The Marker Rule.** Navy appears only where a person would write: names, notes, initials, links. Green and red mean yes, no, fits and doesn't fit, and nothing else.

**The Paper Stays Paper Rule.** Prints keep light paper and their fixed print inks (`ink`, `muted`, `print-rule`, `marker-navy`) in dark mode. Only the table, sheets and chrome go dark.

**The One Plate Rule.** Each screen has one reversed ink slab. On the swipe screen it is the flight total for two on the print's chin, so the Jedziemy button is pink, not ink.

## Typography

**Display Font:** Shantell Sans (with Archivo, system-ui), self-hosted variable 400-700
**Body Font:** Archivo (with system-ui, -apple-system, Segoe UI), self-hosted variable weight 400-800, width 62-100%
**Label/Mono Font:** ui-monospace, Menlo, used only for the flight-entry line format

**Character:** Archivo's condensed widths give dense, mechanical numbers and labels, like a camera's printed specs. Shantell Sans is the marker in a person's hand. The contrast between the two carries the whole world.

### Hierarchy
- **Display, hand** (Shantell 700, 30px swipe print / 32px sheet / 34px empty state / 19-23px contact print / 18px table, 1.05): city names and the empty-state heading, always in marker. Shrinks to 26px on phones shorter than 760px.
- **Wordmark** (Archivo 800, 24px, width 78%): "Wypad", followed by "we dwoje" in Shantell 700 19px navy. 21px and 16px under 380px.
- **Headline** (Archivo 800, 19px, width 82%, 1.15): panel headings in Więcej.
- **Title** (Archivo 800, 17px, width 82%): section heads in the detail sheet and plan day heads, with a drawn icon in muted.
- **Figure** (Archivo 800, 24px plate / 18-22px contact total / 18px cost sum, width 78-85%): totals. Every number uses tabular figures (set on body).
- **Body** (Archivo 400, 15px, 1.45): base text; the city description is capped at 62ch.
- **Data** (Archivo 400-800, 13-14px, width 90-92%): flight rows, facts, cost rows and table cells; the price column is right-aligned and 800.
- **Label** (Archivo 600, 13px muted; tabs 11.5px phone / 14px desktop, width 90%): form labels, chips, sub-lines.
- **Hand note** (Shantell 500, 14px, 1.3, marker): notes on prints and sheets, the "eat" list, empty plan days.
- **Vote tag** (Shantell 700, 14px / 12px on contact prints, 1): K and Z tags.
- **Mono entry** (ui-monospace 13px; code 12px): the flight textareas and the `code` sample of the line format, because the entry is a fixed-column data format. The photo diagnostics log uses it at 11px.

### Named Rules
**The Two Hands Rule.** Archivo for what the machine prints, Shantell for what a person writes. Never set a number, button or label in Shantell, and never set a city name in Archivo.

**The Tabular Rule.** Every number uses tabular figures, and compared numbers align right.

## Layout

Phones (up to 759px) use a fixed full-height column: the camera bar, a scrolling main area (10px 14px padding), and the tab bar (58px buttons) all in one flex column with the body set to 100dvh. On the swipe view the deck flexes to fill the remaining height, at most 420px wide, and the print sits inset 6px with 8px below. Under 760px of height, help text, optional facts and notes hide rather than shrinking the photo. Under 440px the swipe help line hides; under 380px the wordmark and vote buttons tighten.

Porównaj on phones is a 2-column contact sheet of square prints (16px row gap, 12px column gap). At 760px and up it becomes an auto-fill grid of prints at least 250px wide with 4:3 photos (26px / 20px gaps), and the flight rows appear in each chin. The filters are a full-bleed sheet strip on phones and a 4-column-plus-checkboxes bar on desktop.

At 760px and up, the camera bar and tab bar span the width with content aligned to a 1200px column, main padding becomes 20px 24px 48px, the tab bar sits under the camera bar with horizontal icon-and-label tabs (48px tall), and the desk-only Tabela tab appears. The detail sheet is full-screen on phones (max 640px wide) and a centred dialog up to 90vh on desktop.

Spacing follows a small step set (4, 6, 10, 16, 24px), with 8px and 12px used between controls.

## Elevation & Depth

Depth is physical paper: things you could pick up off the table (prints, plan slots, weather tiles, attraction thumbnails, the table wrap, desktop panels) cast a soft, plum-tinted paper shadow. Chrome and sheets are flat and separated by hairlines. Contact prints sit slightly tilted (-0.8deg, 0.6deg, 0 in a repeating 3-step pattern) and straighten and lift 2px on hover or focus. The next swipe print lies beneath the top one, rotated -2.6deg with its contents hidden.

### Shadow Vocabulary
- **Print lift** (`box-shadow: 0 10px 22px rgba(45,20,40,.20), 0 1px 2px rgba(0,0,0,.18)`; dark `0 12px 26px rgba(0,0,0,.55), 0 1px 2px rgba(0,0,0,.5)`): the top swipe print, a hovered contact print, dialogs.
- **Print rest** (`box-shadow: 0 2px 6px rgba(45,20,40,.14), 0 0 1px rgba(0,0,0,.2)`; dark `0 2px 8px rgba(0,0,0,.45)`): contact prints, slots, tiles, the map frame, the selected chip.
- **Tag** (`box-shadow: 0 1px 2px rgba(0,0,0,.25)`): vote tags and gallery captions stuck onto a photo.
- **Pin** (`box-shadow: 0 2px 5px rgba(0,0,0,.35)`): map pins.

### Named Rules
**The Held Object Rule.** Only objects you could hold get a shadow, and it is always a soft paper shadow, never a hard offset block. Bars, sheets, fields and buttons stay flat.

## Shapes

Corners are square (0) on prints, buttons, inputs, selects, chips, plates, tags, dialogs, popups and the tab bar. Circles (50%) are reserved for the K and Z voter chips and for controls that float over a photo (info, close, lightbox arrows, gallery dots). Map pins are teardrops (50% 50% 50% 0, rotated -45deg) with a 2px white edge. Controls carry a 2px ink border (1.5px on small buttons, map action buttons and table tags); inactive chips use a 1.5px dashed field-line border. The tape strip is a 70 by 18px rectangle (54 by 14px in the table) rotated -4deg at 90% opacity. Swipe stamps are 3px bordered labels rotated -10deg and 9deg.

## Components

### Buttons
Square, outlined and slightly condensed, like keys on a camera body.
- **Shape:** square corners (0), 2px ink border, minimum height 44px.
- **Default:** paper fill with ink text, Archivo 700 15px at width 88%, 8px 14px padding, drawn icon left with an 8px gap. Dark mode uses a transparent fill with light ink.
- **Primary:** ink fill with paper text (dark: light ink fill with table-dark text). Used for Zapisz in dialogs, Jedziemy in the detail sheet, and the first empty-state action.
- **Hover / Active / Focus:** hover fills with `field` (primary hover goes to `ink-2`); press moves 1px down (.12s); focus is a 2px ink outline offset 2px.
- **Small:** 36px, 6px 10px, 1.5px border, 14px text, 17px icons; used for sheet actions and row edit buttons.
- **Danger:** red text and a red border.

### Vote Buttons (swipe screen)
- **Nie:** 54px tall, 2px ink border, paper fill, Archivo 800 16px at width 85%, drawn cross icon.
- **Jedziemy:** the same shape in camera pink with ink text and an ink border (pink border in dark mode), with the check icon at 2.6 stroke.
- **Cofnij / Szczegóły:** 46px squares with a 1.5px field-line border and muted icons.

### Chips
- **Style:** square, 1.5px dashed field-line border, transparent, muted Archivo 600 13px, with a category icon, 38px tall.
- **State:** selected becomes a paper chip with a solid 1.5px ink border, print-rest shadow, and the icon in its category ink.

### Cards / Containers (the Print)
- **Corner Style:** square (0).
- **Background:** print white; contents use fixed print inks in both modes.
- **Shadow Strategy:** print lift on the top swipe print, print rest on contact prints (see Elevation & Depth).
- **Border:** none; the paper edge is the shadow.
- **Internal Padding:** swipe print 10px frame with a 10px 2px 12px chin; contact print 6px frame (9px on desktop) with an 8px 2px 10px chin.
- **Swipe print chin:** city in hand with country and temperature at right, a two-row flight table (drawn out/in icon, day and times, duration, bold right-aligned price), facts, an optional hand note, and the total plate.
- **Contact print:** square photo (4:3 on desktop), city in hand with the total at right ("+ nocleg" below when stay is missing), a country, nights and hours line, flight rows on desktop, and a 4px budget bar in green or red. Rejected prints drop to 50% opacity. Tapping or pressing Enter opens the detail sheet.

### Total Plate
The one reversed slab on a print: an ink bar (7px 10px) with a light 13px label at left ("loty dla dwojga") and the figure (Archivo 800 24px, width 80%) at right.

### Vote Tags
Paper tags written in Shantell 700 with the initial and a drawn check or cross, always in the top-right of the photo (8px inset, 6px on contact prints). Green for yes, red for no, muted with "?" while unvoted. In the table they lose the shadow and take a 1.5px rule border.

### Match Tape
When both voted yes, a strip of tape pink is stuck across the top edge of the contact print (centred, rotated -4deg), and across the city name in the table row.

### Inputs / Fields
- **Style:** 2px ink border, square, sheet fill, 9px 10px padding, 42px minimum; selects use a drawn chevron. Labels are muted 13px above the field.
- **Focus:** no outline; a 3px tape-pink ring (`box-shadow: 0 0 0 3px var(--tape)`).
- **Table cells:** 36px, field fill, field-line border, right-aligned numbers, print inks in both modes.

### Navigation
- **Camera bar:** sticky pink bar, wordmark left, offline pill and the K/Z voter chips right (32px ink-outlined circles; the active voter is filled ink with white text). Inside a trip the wordmark gives way to a back arrow and the trip title, and the voter is the signed-in person, so the chips do not appear.
- **Tab bar:** on phones a bottom bar on sheet with a top hairline, a 23px drawn icon over an 11.5px label, muted when inactive; the active tab is ink at 800 with a 3px pink bar along the top. On desktop it sits under the camera bar as horizontal tabs with the bar along the bottom.

### Detail Sheet
Opens from any print. A 280px photo gallery with scroll-snap, hand-written paper caption tags, dots and a round close button; a title row with the city in marker; then the description, weather tiles (small paper prints with drawn weather icons), flights out and back in two columns, the cost breakdown (icon, label, muted note and right-aligned value per row, with an ink-ruled Razem sum and "zostaje z budżetu" in green or red), facts, attractions as small framed thumbnails, the hand-written eat list and note, and small action buttons. A sticky vote bar at the bottom holds Nie (outline, inks in when chosen) and Jedziemy (primary) in a 1:2 split.

### Map Pins and Places
Teardrop pins in category ink with a white drawn icon; done places fade to 50%. Place rows have a square category dot, a bold name, muted meta and a small edit button. Plan slots are paper strips (time, category icon, name, price) on the table.

### Login (logowanie)
The one screen that has no camera bar: it is the whole shell in pink. A pink field fills the viewport and centres a column up to 380px wide, with the wordmark (40px, "we dwoje" in marker at 28px) set straight on the pink in shell ink. Below it lies a single white paper card (2px ink border, paper shadow) that stays light in dark mode.
- **Mode tabs:** two equal square tabs on top of the card, "Zaloguj" and "Załóż konto", 44px, 2px ink rules between them and under them. The active tab is white with a 3px pink bar along its bottom edge; the inactive one is rule-grey (`#e6dee4`) with ink-2 text.
- **Form:** 16px padding; labels in Archivo 700 14px, fields in the standard 2px ink square style at 16px text so iOS does not zoom. "Załóż konto" reveals two more fields (display name, repeated password). The submit is a full-width primary (ink) button, and a muted line under it states the login rule ("3–20 znaków, małe litery, cyfry, _ lub .").
- **Errors:** a field error is a bold 14px line in error red (`#b3261e`) under its field, and the field takes a red border. A form-level error is a red-bordered box on a pale red fill above the button. Nothing is colour-only: every error has words.
- **Gate:** while signed out, the camera bar, main area and tab bar are hidden by one `signed-out` class on the root element, set by a tiny inline script before first paint so the app never flashes.

### Moje wypady (trip list)
The first screen after login, and the way back from a trip (the arrow left of the trip title). It uses the camera bar, but with the account on the right: the person's name and a small outlined "Wyloguj" button that inverts to shell ink on hover. The tab bar is hidden here.
- **Header row:** "Moje wypady" in marker at 30px, and the primary "Nowy wypad" button on the right. Offline, that button is disabled and a muted line under it says "Nowy wypad wymaga internetu".
- **Trip print:** a contact print (see Cards / Containers) with a blank photo-blank field instead of a photo, because a trip is not a place. The initials of its members sit top-right as paper vote tags, the title is in marker, and a muted line gives the dates and the departure airport ("4–7 gru 2026 · z KRK"). The grid is 2 columns on phones, 3 from 640px and 4 from 960px, with the same tilt pattern as the contact sheet.
- **Past trips:** under a "Minione" marker heading the prints turn greyscale at 62% opacity. They stay tappable.
- **Empty state:** one white card with a 2px ink border and a hand-written line ("Jeszcze żadnego wypadu. Zaplanujmy pierwszy."), centred.
- **Inside a trip:** the camera bar swaps its voter chips for a back arrow and the trip title; the tab bar returns. The Więcej tab gains an "Osoby" panel: each member is a small paper tag with an initial in marker, a name and a login; below are a login field with suggestions, "Dodaj", "Wyślij link osobom z wypadu", and two danger buttons, "Opuść wypad" and (only for whoever created the trip) "Usuń wypad". Vote tags show the shortest initials that tell everyone in the trip apart.

### Kreator wypadu (Dokąd tanio?)
A full-screen dialog on phones and a centred dialog up to 860px tall on desktop, in three steps. Its bar is pink like the camera bar and holds a back arrow, the step ("Krok 1 z 3") over the step title in marker, and a close cross, all 44px targets. The footer is the plate: an ink slab with the status in Archivo 800 at left, and the actions at right as plate-outlined buttons plus one pink "Dalej" / "Gotowe". The pink button is disabled (35%) until the step is valid, and the status line says what is missing ("Wybierz daty wylotu i powrotu").
- **1. Kiedy i skąd:** two date fields side by side, a title that suggests itself from the dates (a placeholder, not a value), the departure airport as a combobox with a suggestion list (bold name, muted code and country, 44px rows), and two "dokładnie / ±1 dzień / ±2 dni" groups for how flexible each date is. These are the standard chips: selected is a white chip with a solid ink border, the rest dashed.
- **2. Z kim:** a login field with suggestions and "Dodaj"; people already added appear as paper tags with a small remove button. "Wyślij link-zaproszenie" shares an invite link. The step can be skipped.
- **3. Dokąd tanio?:** a full-bleed filter strip with a price slider ("do 1130 zł") and a country select, a one-line note ("Ceny za osobę, tam i z powrotem"), and a grid of prints (2 columns, 3 from 560px). Each print is a contact print whose photo area shows the airport code in condensed 26px Archivo on photo-blank, the city in marker, the round-trip price at right and the times below ("pt 22:05 → pon 09:55"). A 28px square tick box sits top-right; picking a print gives it a 3px ink outline and fills the box. Keyboard focus is a dashed marker-navy outline, apart from the solid selection. While prices load, a pulsing line says "Szukam tanich lotów…"; if there are none, the grid is replaced by a plain message. Below the grid are "Dodane przez was" (cities added by hand, with a remove button), "Dodaj miasto ręcznie" and "Skopiuj z poprzedniego wypadu".
- **Errors:** a step error is a box with a 2px red border on field fill; a field error is the bold red line used on the login.

### Stary wyjazd (migration dialog)
A small dialog (440px at most, 32px less than the viewport on phones) in the sheet style with no tab bar behind it, shown on the trip list when the phone still holds the November trip from before accounts. Its heading "Stary wyjazd" is in marker, followed by one or two plain lines and a 2-up row of buttons: "Krystian" and "Zuzia" (who the person was), then a full-width outlined "Nie teraz" that hides the question until the session ends. While moving the data the buttons give way to a muted "Przenoszę wyjazd…" line and the dialog cannot be dismissed. It opens with the same rise as the wizard (.32s), or a plain fade with reduced motion.

### Toast
A square plate-ink bar above the tab bar, 14px 600 text, fading in over .2s and rising with `cubic-bezier(.2,.8,.2,1)`.

### Motion
The prints behave like paper on a table, and that one idea carries all the motion. It lives in `motion.js`, which the shell caches for offline use. Arrivals ease with `cubic-bezier(.16,1,.3,1)`, and every exit is faster than its entrance.
- **Developing (signature):** the first time a photo lies on top of the deck or on the compare table in a session, it develops like instant film. It starts bleached, sepia and soft, then clears over 1.5s (2.4s inside the match).
- **Match (focal moment):** a white camera flash, then a shutter click synthesised with Web Audio (no audio files) and a short vibration where the phone supports it. The print slides out of a slot and settles at -3deg while it develops. Two pink tape strips slap onto its corners, and the city name writes itself in marker as a left-to-right clip reveal. The K ✓ and Z ✓ tags pop in. A one-off canvas burst of tape and paper scraps (about 2s) then stops itself. Tapping anywhere, pressing Escape or choosing an action dismisses it.
- **Swipe:** a flung print leaves with an accelerating ease and its marker stamp showing. The print beneath straightens up to take its place (380ms). Undo flies the print back in from the left.
- **Continuity:** tab changes use View Transitions. The pink bar and tab bar stay put while the content slides 40px toward the chosen tab. Opening a print's details grows its photo into the sheet's hero (shared element `hero`), and closing returns it to the print. Re-sorting or filtering Porównaj moves the prints to their new places with FLIP (520ms).
- **Map:** a new place's pin drops from above, squashes on landing and sends out a ring in its category colour. The map pans to it, and its row in the list flashes tape pink.
- **Reduced motion:** nothing travels. The developing becomes a 300ms fade, the match appears without the flash, sound or scraps, and View Transitions and the pin drop are off. Fades that confirm a state stay.

## Do's and Don'ts

### Do:
- **Do** put every destination on a print: photo in a white frame, numbers on the chin, paper shadow.
- **Do** write city names, notes, initials and votes in Shantell Sans with navy marker, and set everything else in Archivo with tabular figures.
- **Do** keep votes in the top-right corner of the photo as K and Z marker tags, and mark a match only with the pink tape strip.
- **Do** keep one reversed ink plate per screen; on the swipe screen that is the total for two, and Jedziemy is camera pink with ink text.
- **Do** keep prints light paper in dark mode, with the camera bar in the same pink (`#e98aa6`) and ink text in both modes.
- **Do** use drawn 1.8px stroke icons from the inline sprite (20px default, round caps and joins).
- **Do** use square corners and 2px ink borders on controls; save circles for person chips and controls over photos.
- **Do** hide secondary facts on short phones before shrinking the photo.

### Don't:
- **Don't** use emoji or an icon font for icons.
- **Don't** use navy marker for anything that isn't handwriting, or green and red for anything that isn't state.
- **Don't** add a second reversed ink slab next to the total plate on the swipe screen.
- **Don't** give bars, sheets, fields or buttons a shadow, and never use a hard offset shadow.
- **Don't** bring back the cream and trip-orange palette, pill chips or rounded cards.
- **Don't** use the category inks outside pins, place dots, active chip icons and plan slot icons.
- **Don't** use the monospace face for anything except the flight-entry line format and diagnostic logs.
