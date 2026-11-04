/* Kreator nowego wypadu: Kiedy i skąd → Z kim → Dokąd tanio?
   Ostatni krok to siatka odbitek z prawdziwymi cenami Ryanaira (przelot w obie strony, za osobę).
   Wybrane kierunki lądują w localStorage pod „wypad-trip-<id>” w kształcie SAMPLE_DATA. */
(() => {
  const MON = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
  const NOMINATIM = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=";
  const GEO_GAP = 1100;   // Nominatim: najwyżej jedno zapytanie na sekundę
  const FAIL = "Nie udało się pobrać cen. Dodaj kierunki ręcznie, ceny możesz wpisać później.";

  // ---------- daty ----------
  const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
  const iso = dt => dt.toISOString().slice(0, 10);
  const addDays = (s, n) => { const p = parse(s); return iso(new Date(Date.UTC(p.y, p.m, p.d + n))); };
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const maxISO = (a, b) => (a > b ? a : b);

  function defaultTitle(start, end) {
    const a = parse(start), b = parse(end);
    if (!a && !b) return "Nowy wypad";
    if (!a || !b || start === end) { const x = a || b; return `Wypad ${x.d} ${MON[x.m]}`; }
    if (a.y === b.y && a.m === b.m) return `Wypad ${a.d}–${b.d} ${MON[a.m]}`;
    return `Wypad ${a.d} ${MON[a.m]} – ${b.d} ${MON[b.m]}`;
  }

  // [pole, komunikat] albo null; validateWhen zwraca sam komunikat
  function whenProblem(f, today) {
    if (!String(f.title || "").trim()) return ["title", "Dodaj tytuł"];
    if (!parse(f.start)) return ["start", "Wybierz daty wylotu i powrotu"];
    if (!parse(f.end)) return ["end", "Wybierz daty wylotu i powrotu"];
    if (today && f.start < today) return ["start", "Wylot nie może być w przeszłości"];
    if (f.end < f.start) return ["end", "Powrót musi być po wylocie"];
    if (!/^[A-Z]{3}$/.test(f.origin || "")) return ["origin", "Wybierz lotnisko z listy"];
    return null;
  }
  const validateWhen = (f, today) => (whenProblem(f, today) || [null, null])[1];

  // elastyczność ±N dni wokół wylotu i powrotu, ale nigdy przed dzisiaj
  function flexRange(start, end, outFlex = 0, backFlex = 0, today = todayISO()) {
    return {
      outFrom: maxISO(addDays(start, -outFlex), today), outTo: addDays(start, outFlex),
      backFrom: maxISO(addDays(end, -backFlex), today), backTo: addDays(end, backFlex),
    };
  }

  // ---------- kierunki ----------
  const km = (a, b) => {
    const r = x => x * Math.PI / 180, R = 6371;
    const dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  };

  function toDestination(co, geo, airports = []) {
    const by = new Map(airports.map(a => [a.code, a]));
    const offers = [co.cheapest, ...co.offers.filter(o => o !== co.cheapest).sort((x, y) => x.total - y.total)];
    const multi = new Set(offers.map(o => o.code)).size > 1;
    const leg = (l, code) => ({ day: l.day, dep: l.dep, arr: l.arr, price: l.price, note: multi ? code : "", date: l.date });
    const ap = by.get(co.cheapest.code);
    const at = geo || (ap ? { lat: ap.lat, lng: ap.lng } : { lat: null, lng: null });
    return window.makeDestination({
      name: co.city, country: co.country, lat: at.lat, lng: at.lng, tz: 0,
      wiki: (ap && ap.city) || co.city, airport: `${ap ? ap.name : co.city} (${co.cheapest.code})`,
      apKm: geo && ap ? Math.round(km(geo, ap)) : null,
      out: offers.map(o => leg(o.out, o.code)), back: offers.map(o => leg(o.back, o.code)),
      selOut: 0, selBack: 0,
    });
  }

  // kierunek z innego wypadu: miejsce zostaje, głosy, miejsca i loty (inne daty) znikają
  const copyOf = d => window.makeDestination({
    name: d.name, country: d.country, lat: d.lat, lng: d.lng, photo: d.photo || "", airport: d.airport || "",
    wiki: d.wiki || d.name, tz: d.tz || 0, apKm: d.apKm ?? null, apMin: d.apMin ?? null,
  });
  const readTrip = id => { try { const d = JSON.parse(localStorage.getItem("wypad-trip-" + id)); return d && Array.isArray(d.destinations) ? d : null; } catch { return null; } };
  function copySources(trips, currentId) {
    const out = [];
    for (const t of trips || []) {
      if (!t || t.id === currentId) continue;
      const d = readTrip(t.id);
      if (d && d.destinations.length) out.push({ id: t.id, title: t.title, destinations: d.destinations.map(copyOf) });
    }
    return out;
  }

  // zapis lokalny; istniejące kierunki (z głosami) zostają, nowe dopisują się po id
  function saveTrip(tripId, dests, persons) {
    const cur = readTrip(tripId) || { version: 3, budget: 0, persons: persons || 1, destinations: [] };
    const have = new Set(cur.destinations.map(d => d.id));
    for (const d of dests) if (!have.has(d.id)) { cur.destinations.push(d); have.add(d.id); }
    cur.version = 3;
    if (persons) cur.persons = persons;
    if (typeof cur.budget !== "number") cur.budget = 0;
    try { localStorage.setItem("wypad-trip-" + tripId, JSON.stringify(cur)); } catch {}
    return cur;
  }

  async function geocode(q) {
    if (navigator.onLine === false) return null;
    try {
      const r = await fetch(NOMINATIM + encodeURIComponent(q));
      if (!r.ok) return null;
      const j = await r.json();
      if (!j[0]) return null;
      const parts = String(j[0].display_name || "").split(",").map(s => s.trim()).filter(Boolean);
      return { lat: +j[0].lat, lng: +j[0].lon, name: parts[0] || q, country: parts.length > 1 ? parts[parts.length - 1] : "" };
    } catch { return null; }
  }

  const api = { validateWhen, defaultTitle, flexRange, toDestination, copySources, saveTrip, geocode, open: () => {} };
  window.WypadWizard = api;

  // ---------- ekran ----------
  const dlg = document.getElementById("wizard");
  if (!dlg) return;
  const $ = s => dlg.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ic = n => `<svg class="ic" aria-hidden="true"><use href="#i-${n}"/></svg>`;
  const zl = n => Math.round(n).toLocaleString("pl-PL") + " zł";
  const offline = () => navigator.onLine === false;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const toast = msg => { const t = document.getElementById("toast"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600); };
  const TITLES = ["Kiedy i skąd", "Z kim", "Dokąd tanio?"];

  let st;      // stan jednego otwarcia kreatora
  let airports = [];

  // błędy przy polu (jak na ekranie logowania)
  const setErr = (input, box, msg) => {
    const i = $(input), e = $(box);
    e.textContent = msg || "";
    if (msg) { i.setAttribute("aria-invalid", "true"); i.setAttribute("aria-describedby", e.id); }
    else { i.removeAttribute("aria-invalid"); i.removeAttribute("aria-describedby"); }
    return i;
  };
  const FIELD = { title: ["#wz-title", "#wz-e-title"], start: ["#wz-start", "#wz-e-dates"], end: ["#wz-end", "#wz-e-dates"], origin: ["#wz-origin", "#wz-e-origin"] };
  const clear1 = () => { Object.values(FIELD).forEach(([i, e]) => setErr(i, e, "")); $("#wz-e1").textContent = ""; };

  // ---------- krok 1: kiedy i skąd ----------
  const apLabel = a => `${a.metro || a.city} (${a.code})`;
  function setOrigin(code) {
    const a = airports.find(x => x.code === code);
    st.origin = a ? a.code : code;
    $("#wz-origin").value = a ? apLabel(a) : code;
  }
  const norm = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
  function apMatches(q) {
    const n = norm(q).trim();
    if (!n) return [];
    const hit = a => a.code.toLowerCase() === n ? 0 : norm(a.metro || a.city).startsWith(n) ? 1 : norm(`${a.name} ${a.city} ${a.country}`).includes(n) ? 2 : 9;
    return airports.map(a => [hit(a), a]).filter(x => x[0] < 9).sort((x, y) => x[0] - y[0] || x[1].name.localeCompare(y[1].name, "pl")).slice(0, 6).map(x => x[1]);
  }
  function suggest(input, list, items, render) {
    const ul = $(list), inp = $(input);
    ul.innerHTML = items.map((x, i) => `<li role="option" id="${ul.id}-${i}" data-i="${i}" tabindex="-1">${render(x)}</li>`).join("");
    ul.hidden = !items.length;
    inp.setAttribute("aria-expanded", String(!!items.length));
    ul._items = items;
  }
  const hideSuggest = list => { const ul = $(list); ul.hidden = true; ul.innerHTML = ""; $(`[aria-controls="${ul.id}"]`).setAttribute("aria-expanded", "false"); };

  function readWhen() {
    const fl = name => +(($(`input[name="${name}"]:checked`) || {}).value || 0);
    return { title: $("#wz-title").value.trim(), start: $("#wz-start").value, end: $("#wz-end").value, origin: st.origin, outFlex: fl("wz-fout"), backFlex: fl("wz-fback") };
  }
  function autoTitle() {
    if (st.titleTouched) return;
    const f = readWhen();
    $("#wz-title").value = f.start || f.end ? defaultTitle(f.start, f.end) : "";
  }

  async function submitWhen() {
    clear1();
    const f = readWhen();
    const p = whenProblem(f, todayISO());
    if (p) { setErr(...FIELD[p[0]], p[1]).focus(); return; }
    if (offline()) { $("#wz-e1").textContent = "Brak internetu: nowy wypad wymaga sieci"; return; }
    busy(true, "Zakładam wypad…");
    try {
      const fields = { title: f.title, start: f.start, end: f.end, origin: f.origin };
      st.trip = st.trip ? await WypadTrips.update(st.trip.id, fields) : await WypadTrips.create(fields);
      st.changed = true;
      Object.assign(st, { outFlex: f.outFlex, backFlex: f.backFlex });
      busy(false);
      go(2);
    } catch (e) {
      busy(false);
      $("#wz-e1").textContent = e.status == null ? "Brak internetu albo serwer nie odpowiada. Spróbuj jeszcze raz." : "Nie udało się założyć wypadu. Spróbuj jeszcze raz.";
    }
  }

  // ---------- krok 2: z kim ----------
  function renderPeople() {
    const me = WypadAuth.user && WypadAuth.user.id;
    $("#wz-people").innerHTML = st.members.map(m =>
      `<span class="wz-person"><b>${esc(m.name || m.login)}</b><small>${m.id === me ? "Ty" : esc(m.login)}</small></span>`).join("");
  }
  let findT = 0, findGen = 0;
  function findPeople() {
    clearTimeout(findT);
    const q = $("#wz-login").value.trim().toLowerCase();
    if (q.length < 2 || offline()) { hideSuggest("#wz-pp-list"); return; }
    const my = ++findGen;
    findT = setTimeout(async () => {
      let l = [];
      try { l = await WypadTrips.findProfiles(q); } catch {}
      if (my !== findGen) return;
      const have = new Set(st.members.map(m => m.id));
      suggest("#wz-login", "#wz-pp-list", (l || []).filter(p => !have.has(p.id)).slice(0, 6),
        p => `<b>${esc(p.name || p.login)}</b> <span>${esc(p.login)}</span>`);
    }, 250);
  }
  async function addPerson(login) {
    login = String(login || "").trim().toLowerCase();
    setErr("#wz-login", "#wz-e-login", "");
    hideSuggest("#wz-pp-list");
    if (!login) { setErr("#wz-login", "#wz-e-login", "Wpisz login").focus(); return; }
    if (st.members.some(m => m.login === login)) { setErr("#wz-login", "#wz-e-login", "Ta osoba już jest w wypadzie").focus(); return; }
    if (offline()) { setErr("#wz-login", "#wz-e-login", "Brak internetu: dodawanie osób wymaga sieci"); return; }
    const b = $("#wz-add"); b.disabled = true;
    try {
      const p = await WypadTrips.addMember(st.trip.id, login);
      st.members.push({ id: p.id, login: p.login, name: p.name });
      st.changed = true;
      $("#wz-login").value = "";
      renderPeople();
      toast(`${p.name || p.login} w wypadzie`);
    } catch (e) {
      setErr("#wz-login", "#wz-e-login", e.code === "no_such_login" ? "Nie ma takiego loginu" : e.status == null ? "Brak internetu: dodawanie osób wymaga sieci" : "Nie udało się dodać osoby").focus();
    }
    b.disabled = false;
  }
  async function invite() {
    const b = $("#wz-invite"); b.disabled = true;
    try {
      const url = await WypadTrips.invite(st.trip.id);
      const text = `Dołącz do wypadu „${st.trip.title}”`;
      if (navigator.share) { try { await navigator.share({ title: st.trip.title, text, url }); } catch {} }
      else { await navigator.clipboard.writeText(url); toast("Link skopiowany"); }
    } catch { toast(offline() ? "Brak internetu: link wymaga sieci" : "Nie udało się utworzyć linku"); }
    b.disabled = false;
  }

  // ---------- krok 3: dokąd tanio? ----------
  const picked = () => st.cities.filter(c => st.sel.has(c.key)).length + st.extra.length;
  function count() {
    const n = picked();
    $("#wz-status").textContent = `Wybrane: ${n}`;
    $("#wz-next").disabled = !n || st.busy;
  }
  function visible() {
    return st.cities.filter(c => c.cheapest.total <= st.max && (!st.country || c.country === st.country));
  }
  const cardHTML = c => {
    const o = c.cheapest, on = st.sel.has(c.key);
    const codes = [...new Set(c.offers.map(x => x.code))].join(" · ");
    return `<button type="button" class="dest wz-c" data-key="${esc(c.key)}" aria-pressed="${on}"
        aria-label="${esc(`${c.city}, ${c.country}: ${zl(o.total)} za osobę tam i z powrotem, wylot ${o.out.day} ${o.out.dep}, powrót ${o.back.day} ${o.back.dep}`)}">
      <div class="thumb"><span class="wz-code">${esc(codes)}</span><span class="wz-pick">${ic("check")}</span></div>
      <div class="dchin">
        <div class="head"><h3>${esc(c.city)}</h3><span class="total">${zl(o.total)}<small>tam i z powrotem</small></span></div>
        <div class="sub">${esc(c.country)}</div>
        <div class="wz-fl" aria-hidden="true">${esc(o.out.day)} ${esc(o.out.dep)} → ${esc(o.back.day)} ${esc(o.back.dep)}</div>
      </div>
    </button>`;
  };
  function renderGrid(animate) {
    const grid = $("#wz-grid");
    const draw = () => {
      const l = visible();
      grid.innerHTML = l.map(cardHTML).join("");
      $("#wz-none").hidden = !!l.length || !st.cities.length;
    };
    if (animate && window.Motion) Motion.flip(grid, ".wz-c", "key", draw); else draw();
    count();
  }
  function renderExtra() {
    $("#wz-extra-wrap").hidden = !st.extra.length;
    $("#wz-extra").innerHTML = st.extra.map((d, i) => `<div class="dest wz-c wz-x" data-key="${esc(d.id)}">
      <div class="dchin"><div class="head"><h3>${esc(d.name)}</h3>
        <button type="button" class="wz-rm" data-rm="${i}" aria-label="Usuń ${esc(d.name)}">${ic("x")}</button></div>
        <div class="sub">${esc(d.country || "")}${d.airport ? " · " + esc(d.airport) : ""}</div>
        <div class="wz-fl muted">${d._copy ? "z poprzedniego wypadu" : "cenę wpiszecie później"}</div></div></div>`).join("");
    count();
  }
  function filtersUI() {
    const has = st.cities.length > 0;
    $("#wz-filters").hidden = $("#wz-note").hidden = !has;
    if (!has) return;
    const tot = st.cities.map(c => c.cheapest.total);
    const lo = Math.floor(Math.min(...tot) / 10) * 10, hi = Math.ceil(Math.max(...tot) / 10) * 10;
    const r = $("#wz-max");
    r.min = lo; r.max = hi; r.step = 10; r.value = hi; st.max = hi;
    $("#wz-max-v").textContent = zl(hi);
    const countries = [...new Set(st.cities.map(c => c.country))].sort((a, b) => a.localeCompare(b, "pl"));
    $("#wz-country").innerHTML = `<option value="">Wszystkie kraje</option>` + countries.map(c => `<option>${esc(c)}</option>`).join("");
    st.country = "";
  }
  function copyUI() {
    const src = copySources(WypadTrips.list(), st.trip.id);
    st.copySrc = src;
    $("#wz-copy-b").disabled = !src.length;
    $("#wz-copy-hint").hidden = !!src.length;
    $("#wz-copy-sel").innerHTML = src.map((s, i) => `<option value="${i}">${esc(s.title)} (${s.destinations.length})</option>`).join("");
  }

  async function loadFares() {
    const my = st.gen;
    st.cities = []; st.sel = new Set();
    $("#wz-e3").hidden = true;
    $("#wz-grid").innerHTML = "";
    filtersUI(); copyUI(); renderExtra();
    if (offline()) { failFares(); return; }
    $("#wz-load").hidden = false;
    try {
      const t = st.trip;
      const offers = await WypadFares.search({ origin: t.origin, ...flexRange(t.start, t.end, st.outFlex, st.backFlex) });
      if (my !== st.gen) return;
      st.cities = WypadFares.groupByCity(offers).map(c => ({ ...c, key: c.city.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "") }));
      $("#wz-load").hidden = true;
      if (!st.cities.length) { $("#wz-e3").textContent = "Brak lotów w tych dniach. Zmień daty albo dodaj kierunki ręcznie."; $("#wz-e3").hidden = false; }
      filtersUI();
      renderGrid(true);
    } catch {
      if (my !== st.gen) return;
      failFares();
    }
  }
  function failFares() {
    $("#wz-load").hidden = true;
    $("#wz-e3").textContent = FAIL;
    $("#wz-e3").hidden = false;
    renderGrid(false);
    openManual();
  }
  function openManual() {
    $("#wz-man").hidden = false;
    $("#wz-man-b").setAttribute("aria-expanded", "true");
  }

  async function addManual() {
    const q = $("#wz-man-in").value.trim();
    setErr("#wz-man-in", "#wz-e-man", "");
    if (offline()) { setErr("#wz-man-in", "#wz-e-man", "Bez internetu nie dodasz miasta"); return; }
    if (!q) { setErr("#wz-man-in", "#wz-e-man", "Wpisz nazwę miasta").focus(); return; }
    const b = $("#wz-man-go"); b.disabled = true; b.textContent = "Szukam…";
    const g = await geocode(q);
    b.disabled = false; b.textContent = "Dodaj";
    if (!g) { setErr("#wz-man-in", "#wz-e-man", offline() ? "Bez internetu nie dodasz miasta" : "Nie znalazłem takiego miasta").focus(); return; }
    const name = q.charAt(0).toUpperCase() + q.slice(1);
    const d = window.makeDestination({ name, country: g.country, lat: g.lat, lng: g.lng });
    if (dupe(d.id)) { setErr("#wz-man-in", "#wz-e-man", "To miasto już jest na liście").focus(); return; }
    st.extra.push(d);
    $("#wz-man-in").value = "";
    renderExtra();
  }
  const dupe = id => st.extra.some(x => x.id === id) || st.cities.some(c => c.key === id && st.sel.has(c.key));
  function addCopy() {
    const s = st.copySrc[+$("#wz-copy-sel").value];
    if (!s) return;
    let n = 0;
    for (const d of s.destinations) if (!dupe(d.id)) { st.extra.push(Object.assign(d, { _copy: true })); n++; }
    renderExtra();
    toast(n ? `Dodano ${n} z „${s.title}”` : "Te kierunki już są na liście");
  }

  async function finish() {
    if (st.busy) return;
    const chosen = st.cities.filter(c => st.sel.has(c.key));
    busy(true);
    const dests = [];
    for (let i = 0; i < chosen.length; i++) {
      $("#wz-status").textContent = `Szukam miast na mapie: ${i + 1} z ${chosen.length}`;
      if (i) await wait(GEO_GAP);
      const c = chosen[i];
      const g = await geocode(`${c.city}, ${c.country}`);
      dests.push(toDestination(c, g && { lat: g.lat, lng: g.lng }, airports));
    }
    for (const d of st.extra) { delete d._copy; dests.push(d); }
    saveTrip(st.trip.id, dests, Math.max(1, st.members.length));
    st.changed = true;
    busy(false);
    toast(`Wypad „${st.trip.title}”: ${dests.length} ${dests.length === 1 ? "kierunek" : dests.length < 5 ? "kierunki" : "kierunków"}`);
    close(true);
  }

  // ---------- nawigacja ----------
  function busy(on, msg) {
    st.busy = on;
    $("#wz-next").disabled = on;
    $("#wz-skip").disabled = on;
    $("#wz-back").disabled = on;
    if (on && msg) $("#wz-status").textContent = msg;
    if (!on) foot();
  }
  function foot() {
    const s = st.step;
    $("#wz-next").textContent = s === 3 ? "Gotowe" : "Dalej";
    $("#wz-skip").hidden = s !== 2;
    $("#wz-back").hidden = s === 1 || st.fixed;
    if (s === 3) count();
    else { $("#wz-status").textContent = `Krok ${s} z 3`; $("#wz-next").disabled = false; }
  }
  function go(n) {
    const from = st.step;
    st.step = n;
    [1, 2, 3].forEach(i => { $(`#wz-s${i}`).hidden = i !== n; });
    $("#wz-n").textContent = st.fixed ? "Dodaj kierunki" : `Krok ${n} z 3`;
    $("#wz-h").textContent = TITLES[n - 1];
    foot();
    $("#wz-body").scrollTop = 0;
    const sec = $(`#wz-s${n}`);
    if (from && window.Motion && !Motion.RM()) sec.animate([{ opacity: 0, transform: `translateX(${n > from ? 28 : -28}px)` }, { opacity: 1, transform: "none" }], { duration: 360, easing: Motion.EASE });
    if (n === 2) { renderPeople(); }
    if (n === 3) { st.gen++; loadFares(); }
  }

  function close(done) {
    if (!done && st.step === 3 && picked() && !confirm("Zamknąć kreator? Wybrane kierunki nie zostaną zapisane.")) return;
    st.gen++;
    dlg.close();
    const cb = st.opts.onDone || st.opts.onCreated;
    if (st.changed && st.trip && typeof cb === "function") cb(st.trip.id);
  }

  api.open = (opts = {}) => {
    const trip = opts.tripId ? (WypadTrips.list().find(t => t.id === opts.tripId) || null) : null;
    if (opts.tripId && !trip) { toast("Nie znalazłem tego wypadu"); return; }
    const me = WypadAuth.user;
    st = {
      opts, trip, fixed: !!trip, step: 0, gen: 0, busy: false, changed: false, titleTouched: false, origin: "KRK",
      outFlex: 0, backFlex: 0, members: trip && trip.members.length ? trip.members.slice() : me ? [{ id: me.id, login: me.login, name: me.name }] : [],
      cities: [], sel: new Set(), extra: [], max: Infinity, country: "", copySrc: [],
    };
    // krok 1 od nowa
    clear1();
    $("#wz-f1").reset();
    const t = todayISO();
    $("#wz-start").min = $("#wz-end").min = t;
    $("#wz-title").value = "";
    setOrigin("KRK");
    $("#wz-login").value = ""; setErr("#wz-login", "#wz-e-login", "");
    $("#wz-man").hidden = true; $("#wz-man-b").setAttribute("aria-expanded", "false"); $("#wz-man-in").value = ""; setErr("#wz-man-in", "#wz-e-man", "");
    $("#wz-copy").hidden = true; $("#wz-copy-b").setAttribute("aria-expanded", "false");
    WypadFares.airports().then(l => { airports = l; if (st.step === 1 && !$("#wz-origin").matches(":focus")) setOrigin(st.origin); }).catch(() => {});
    if (!dlg.open) dlg.showModal();
    go(trip ? 3 : 1);
    if (!trip) $("#wz-start").focus();
  };

  // ---------- zdarzenia ----------
  $("#wz-x").addEventListener("click", () => close(false));
  dlg.addEventListener("cancel", e => { e.preventDefault(); close(false); });
  $("#wz-back").addEventListener("click", () => { if (!st.busy && st.step > 1) go(st.step - 1); });
  $("#wz-skip").addEventListener("click", () => go(3));
  $("#wz-next").addEventListener("click", () => {
    if (st.busy) return;
    if (st.step === 1) submitWhen();
    else if (st.step === 2) go(3);
    else finish();
  });
  $("#wz-f1").addEventListener("submit", e => { e.preventDefault(); submitWhen(); });
  $("#wz-title").addEventListener("input", () => { st.titleTouched = true; setErr(...FIELD.title, ""); });
  ["#wz-start", "#wz-end"].forEach(s => $(s).addEventListener("change", () => {
    const a = $("#wz-start"), b = $("#wz-end");
    if (a.value) b.min = a.value;
    if (a.value && (!b.value || b.value < a.value)) b.value = addDays(a.value, 3);
    setErr(...FIELD.start, ""); setErr(...FIELD.end, "");
    autoTitle();
  }));
  // lotnisko: lista z wyszukiwaniem
  const ori = $("#wz-origin");
  ori.addEventListener("focus", () => ori.select());
  ori.addEventListener("input", () => { st.origin = ""; setErr(...FIELD.origin, ""); suggest("#wz-origin", "#wz-ap-list", apMatches(ori.value), a => `<b>${esc(a.metro || a.city)}</b> <span>${a.name !== (a.metro || a.city) ? esc(a.name) + " · " : ""}${esc(a.code)} · ${esc(a.country)}</span>`); });
  ori.addEventListener("blur", () => setTimeout(() => {
    hideSuggest("#wz-ap-list");
    if (!st.origin) { const m = apMatches(ori.value); if (m.length === 1 || (m[0] && m[0].code.toLowerCase() === norm(ori.value).trim())) setOrigin(m[0].code); }
  }, 150));
  const pickFrom = (list, fn) => {
    const ul = $(list);
    ul.addEventListener("mousedown", e => e.preventDefault());   // nie gubimy fokusu pola
    ul.addEventListener("click", e => { const li = e.target.closest("li"); if (li) fn(ul._items[+li.dataset.i]); });
  };
  pickFrom("#wz-ap-list", a => { setOrigin(a.code); hideSuggest("#wz-ap-list"); });
  const keys = (input, list, fn) => $(input).addEventListener("keydown", e => {
    const ul = $(list);
    if (ul.hidden) return;
    const lis = [...ul.children];
    let i = lis.findIndex(li => li.getAttribute("aria-selected") === "true");
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      i = e.key === "ArrowDown" ? Math.min(lis.length - 1, i + 1) : Math.max(0, i - 1);
      lis.forEach((li, k) => li.setAttribute("aria-selected", String(k === i)));
      $(input).setAttribute("aria-activedescendant", lis[i].id);
    } else if (e.key === "Enter" && i >= 0) { e.preventDefault(); fn(ul._items[i]); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hideSuggest(list); }
  });
  keys("#wz-origin", "#wz-ap-list", a => { setOrigin(a.code); hideSuggest("#wz-ap-list"); });
  // osoby
  $("#wz-login").addEventListener("input", () => { setErr("#wz-login", "#wz-e-login", ""); findPeople(); });
  $("#wz-login").addEventListener("blur", () => setTimeout(() => hideSuggest("#wz-pp-list"), 150));
  pickFrom("#wz-pp-list", p => addPerson(p.login));
  keys("#wz-login", "#wz-pp-list", p => addPerson(p.login));
  $("#wz-f2").addEventListener("submit", e => { e.preventDefault(); addPerson($("#wz-login").value); });
  $("#wz-invite").addEventListener("click", invite);
  // siatka
  $("#wz-grid").addEventListener("click", e => {
    const c = e.target.closest(".wz-c");
    if (!c) return;
    const k = c.dataset.key, on = !st.sel.has(k);
    if (on && st.extra.some(x => x.id === k)) { toast("To miasto już jest na liście"); return; }
    if (on) st.sel.add(k); else st.sel.delete(k);
    c.setAttribute("aria-pressed", String(on));
    count();
  });
  let raf = 0;
  $("#wz-max").addEventListener("input", e => {
    st.max = +e.target.value;
    $("#wz-max-v").textContent = zl(st.max);
    cancelAnimationFrame(raf); raf = requestAnimationFrame(() => renderGrid(true));
  });
  $("#wz-country").addEventListener("change", e => { st.country = e.target.value; renderGrid(true); });
  $("#wz-man-b").addEventListener("click", () => {
    const open = $("#wz-man").hidden;
    $("#wz-man").hidden = !open;
    $("#wz-man-b").setAttribute("aria-expanded", String(open));
    if (open) { if (offline()) setErr("#wz-man-in", "#wz-e-man", "Bez internetu nie dodasz miasta"); $("#wz-man-in").focus(); }
  });
  $("#wz-man").addEventListener("submit", e => { e.preventDefault(); addManual(); });
  $("#wz-man-in").addEventListener("input", () => setErr("#wz-man-in", "#wz-e-man", ""));
  $("#wz-copy-b").addEventListener("click", () => {
    const open = $("#wz-copy").hidden;
    $("#wz-copy").hidden = !open;
    $("#wz-copy-b").setAttribute("aria-expanded", String(open));
  });
  $("#wz-copy-go").addEventListener("click", addCopy);
  $("#wz-extra").addEventListener("click", e => {
    const b = e.target.closest("[data-rm]");
    if (!b) return;
    st.extra.splice(+b.dataset.rm, 1);
    renderExtra();
  });
})();
