/* Wypad we dwoje: porównywarka kierunków + mapa offline + plan dnia */
(() => {
  const KEY = "wypad-v3";
  const WHO_KEY = "wypad-who";
  const PEOPLE = { K: "Krystian", Z: "Zuzia" };
  const DAYS = ["czw", "pt", "sob", "ndz", "pon", "wt"];
  const DATES = ["19.11", "20.11", "21.11", "22.11", "23.11", "24.11"];
  const dayIdx = d => DAYS.indexOf(d);
  const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const TILE_CACHE = "tiles-v1";
  const CATS = {
    food:  { label: "Jedzenie",  icon: "food",  color: "var(--food)" },
    sight: { label: "Zwiedzanie", icon: "sight", color: "var(--sight)" },
    stay:  { label: "Nocleg",    icon: "bed",   color: "var(--stay)" },
    other: { label: "Inne",      icon: "star",  color: "var(--other)" },
  };
  // ikony z zestawu w index.html (rysowane, bez emoji)
  const ic = (name, cls = "") => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const zl = n => Math.round(n).toLocaleString("pl-PL") + " zł";
  const uid = () => Math.random().toString(36).slice(2, 9);

  // ---------- stan ----------
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)); } catch { S = null; }
  if (!S || !Array.isArray(S.destinations) || S.version !== 3) S = structuredClone(window.SAMPLE_DATA);
  S.view = S.view || { sort: "cost", hideRejected: true, maxBack: "pon", onlyFav: false };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
  const dest = id => S.destinations.find(d => d.id === id);
  let currentDest = S.destinations[0]?.id;
  let who; try { who = localStorage.getItem(WHO_KEY) || "K"; } catch { who = "K"; }
  S.destinations.forEach(d => { d.votes = d.votes || {}; });
  // głosy: 1 = w prawo (tak), -1 = w lewo (nie)
  const liked = d => Object.values(d.votes).includes(1);
  const isMatch = d => d.votes.K === 1 && d.votes.Z === 1;
  const rejected = d => !liked(d) && Object.values(d.votes).includes(-1);
  // głosy dopisane markerem: zawsze K, potem Z, w tym samym miejscu odbitki
  const voteTags = d => Object.keys(PEOPLE).map(p => {
    const v = d.votes[p];
    return `<span class="vt ${v === 1 ? "y" : v === -1 ? "n" : ""}" title="${PEOPLE[p]}: ${v === 1 ? "tak" : v === -1 ? "nie" : "jeszcze nie głosował(a)"}">${p}${v === 1 ? ic("check") : v === -1 ? ic("x") : " ?"}</span>`;
  }).join("");
  const catOn = new Set(Object.keys(CATS));

  function toast(msg, ms = 2200) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), ms);
  }

  // ---------- koszty ----------
  // dopuszczalne pary lotów: powrót co najmniej dzień po wylocie i nie później niż wybrany limit
  function pairs(d) {
    const lim = dayIdx(S.view.maxBack);
    const out = [];
    d.out.forEach((o, i) => d.back.forEach((b, j) => {
      const n = dayIdx(b.day) - dayIdx(o.day);
      if (n >= 1 && dayIdx(b.day) <= lim) out.push([i, j, n]);
    }));
    return out;
  }
  function pairCost(d, i, j, n) {
    const p = +S.persons || 2;
    const flight = (d.out[i].price + d.back[j].price) * p;
    return flight + (+d.stay?.perNight || 0) * n + (+d.dailySpend || 0) * (n + 1) + (+d.transferCost || 0);
  }
  // wybrany wariant; jeśli brak, najtańszy w przeliczeniu na dzień na miejscu (żeby nie faworyzować krótkich wypadów)
  function chosen(d) {
    const ps = pairs(d);
    if (!ps.length) return null;
    const sel = ps.find(([i, j]) => i === d.selOut && j === d.selBack);
    if (sel) return sel;
    const fc = ([i, j]) => d.out[i].price + d.back[j].price;
    return ps.reduce((best, p) => fc(p) < fc(best) || (fc(p) === fc(best) && p[2] > best[2]) ? p : best);
  }
  function cost(d) {
    const c = chosen(d);
    if (!c) return null;
    const [i, j, n] = c, p = +S.persons || 2;
    const flight = (d.out[i].price + d.back[j].price) * p;
    const stay = (+d.stay?.perNight || 0) * n;
    const spend = (+d.dailySpend || 0) * (n + 1);
    const transfer = +d.transferCost || 0;
    return { i, j, n, o: d.out[i], b: d.back[j], flight, stay, spend, transfer, total: flight + stay + spend + transfer };
  }
  const rating = d => ((+d.ratingK || 0) + (+d.ratingZ || 0)) / 2;
  // czas na miejscu w godzinach (przylot → wylot powrotny)
  function hoursThere(c) {
    const t = s => { const [h, m] = s.split(":").map(Number); return h + m / 60; };
    let arr = t(c.o.arr); if (arr < t(c.o.dep)) arr += 24;
    return Math.round((dayIdx(c.b.day) - dayIdx(c.o.day)) * 24 + t(c.b.dep) - arr);
  }
  // link do wyszukiwarki noclegów z datami z wybranego wariantu lotów (przylot po północy = nocleg od dnia wylotu)
  const isoDate = day => `2026-11-${DATES[dayIdx(day)].slice(0, 2)}`;
  function stayLink(site, d, c) {
    const q = encodeURIComponent(`${d.name}, ${d.country.replace(/\s*\(.*\)/, "")}`);
    const ci = isoDate(c.o.day), co = isoDate(c.b.day), n = +S.persons || 2;
    return site === "booking"
      ? `https://www.booking.com/searchresults.pl.html?ss=${q}&checkin=${ci}&checkout=${co}&group_adults=${n}&no_rooms=1&group_children=0&order=price`
      : `https://www.airbnb.pl/s/${q}/homes?checkin=${ci}&checkout=${co}&adults=${n}`;
  }
  // czas lotu w minutach z uwzględnieniem strefy czasowej (godziny na kartkach są lokalne)
  const mins = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  function flightMin(f, dir, tz) {
    let m = mins(f.arr) - mins(f.dep) + (dir === "out" ? -tz : tz) * 60;
    while (m < 0) m += 1440;
    return m;
  }
  const hm = m => `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`;
  const fmtFlight = f => `${f.day} ${DATES[dayIdx(f.day)] || ""} ${f.dep}–${f.arr}`;

  // ---------- widok: porównanie ----------
  const SORTS = { cost: "Najtaniej", fav: "Oceny", time: "Najdłużej na miejscu", flight: "Najtańsze loty", warm: "Najcieplej" };
  function renderCompare() {
    $("#budget").value = S.budget; $("#persons").value = S.persons;
    const v = S.view;
    $("#sort").innerHTML = Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${k === v.sort ? "selected" : ""}>${l}</option>`).join("");
    $("#maxBack").value = v.maxBack;
    $("#hideRej").checked = v.hideRejected; $("#onlyFav").checked = v.onlyFav;
    const list = $("#dest-list");
    let items = S.destinations.map(d => ({ d, c: cost(d) }));
    const hiddenRej = items.filter(x => rejected(x.d)).length;
    if (v.hideRejected) items = items.filter(x => !rejected(x.d));
    if (v.onlyFav) items = items.filter(x => liked(x.d));
    const key = {
      cost: x => x.c ? x.c.total : 1e9,
      fav: x => -(rating(x.d) * 1000 + (isMatch(x.d) ? 600 : liked(x.d) ? 300 : 0)) + (x.c ? x.c.total / 100 : 999),
      time: x => x.c ? -hoursThere(x.c) : 1e9,
      flight: x => x.c ? x.c.flight : 1e9,
      warm: x => -(x.d.temp || 0),
    }[v.sort];
    items.sort((a, b) => key(a) - key(b));
    $("#summary").textContent = `${items.length} kierunków` + (v.hideRejected && hiddenRej ? ` · ${hiddenRej} odrzuconych ukrytych` : "");
    if (!items.length) { list.innerHTML = `<p class="muted">Nic tu nie ma. Zmień filtry albo dodaj kierunek.</p>`; return; }
    list.innerHTML = items.map(({ d, c }) => {
      const over = c && S.budget > 0 && c.total > S.budget, pct = c && S.budget > 0 ? Math.min(100, c.total / S.budget * 100) : 0;
      return `<article class="dest ${isMatch(d) ? "best" : ""} ${rejected(d) || !c ? "rej" : ""}" data-id="${d.id}" tabindex="0" role="button" aria-label="${esc(d.name)}: szczegóły i koszty">
        <div class="thumb"><span class="sw-fallback">${esc(d.name)}</span>${photoImg(d, "")}<div class="votes">${voteTags(d)}</div></div>
        <div class="dchin">
          <div class="head"><h3>${esc(d.name)}</h3>${c ? `<div class="total ${over ? "over" : ""}">${zl(c.total)}${!d.stay?.perNight ? "<small>+ nocleg</small>" : ""}</div>` : ""}</div>
          ${c ? `<div class="sub">${esc(d.country)} · ${nights(c.n)} · ${hoursThere(c)} h</div>
          <div class="flights">
            <span>${ic("out")}${esc(fmtFlight(c.o))}<b>${c.o.price} zł</b></span>
            <span>${ic("in")}${esc(fmtFlight(c.b))}<b>${c.b.price} zł</b></span>
          </div>
          ${S.budget > 0 ? `<div class="bar"><i class="${over ? "over" : ""}" style="width:${pct}%"></i></div>` : ""}`
          : `<div class="sub">Brak pary lotów z powrotem do ${esc(v.maxBack)}.</div>`}
        </div>
      </article>`;
    }).join("");
  }
  const nights = n => `${n} ${n === 1 ? "noc" : n < 5 ? "noce" : "nocy"}`;
  const stars = n => `<span class="st">${[1, 2, 3, 4, 5].map(i => ic("star", i <= (n || 0) ? "on" : "")).join("")}</span>`;
  // koszty i wariant lotów (w karcie szczegółów)
  function costHTML(d) {
    const c = cost(d);
    if (!c) return `<p class="muted">Brak pasującej pary lotów przy powrocie najpóźniej ${esc(S.view.maxBack)} (ustawienie w Porównaj).</p>`;
    const over = S.budget > 0 && c.total > S.budget, ps = pairs(d), missing = !d.stay?.perNight;
    return `${ps.length > 1 ? `<label>Wariant lotów (${ps.length})<select data-sh="pair">${ps.map(([i, j, n]) =>
        `<option value="${i},${j}" ${i === c.i && j === c.j ? "selected" : ""}>${esc(d.out[i].day)} ${esc(d.out[i].dep)} → ${esc(d.back[j].day)} ${esc(d.back[j].dep)} · ${n} n. · ${zl(pairCost(d, i, j, n))}</option>`).join("")}</select></label>` : ""}
      <div class="rows">
        <span class="k">${ic("out")}Loty</span><span class="muted">${S.persons} os. × ${c.o.price + c.b.price} zł</span><span class="v">${zl(c.flight)}</span>
        <span class="k">${ic("bed")}Nocleg</span><span class="muted">${missing ? "uzupełnij (Booking/Airbnb niżej)" : `${esc(d.stay?.name || "")} ${zl(d.stay.perNight)}/noc`}</span><span class="v">${zl(c.stay)}</span>
        <span class="k">${ic("food")}Na miejscu</span><span class="muted">${d.dailySpend ? zl(d.dailySpend) + "/dzień" : "uzupełnij"}</span><span class="v">${zl(c.spend)}</span>
        <span class="k">${ic("bus")}Dojazdy</span><span class="muted">${d.transferCost ? "lotnisko ↔ miasto" : "uzupełnij"}</span><span class="v">${zl(c.transfer)}</span>
        <span class="k sum">Razem</span><span class="muted">${nights(c.n)} · ${hoursThere(c)} h na miejscu</span><span class="v sum ${over ? "over" : ""}">${zl(c.total)}</span>
        ${S.budget > 0 ? `<span class="k">Zostaje z budżetu</span><span></span><span class="v ${over ? "over" : "ok"}">${zl(S.budget - c.total)}</span>` : ""}
      </div>
      <div class="stars"><span>Krystian ${stars(d.ratingK)}</span><span>Zuzia ${stars(d.ratingZ)}</span><span>${ic("pin")} ${d.places?.length || 0} miejsc</span></div>
      ${d.pros || d.cons ? `<div class="pc"><ul class="p">${(d.pros || "").split(",").filter(s => s.trim()).map(p => `<li>${esc(p.trim())}</li>`).join("")}</ul><ul class="c">${(d.cons || "").split(",").filter(s => s.trim()).map(p => `<li>${esc(p.trim())}</li>`).join("")}</ul></div>` : ""}`;
  }
  $("#dest-list").addEventListener("click", e => {
    const el = e.target.closest(".dest"); if (el) openInfo(el.dataset.id);
  });
  $("#dest-list").addEventListener("keydown", e => {
    const el = e.target.closest(".dest"); if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openInfo(el.dataset.id); }
  });
  $("#budget").addEventListener("change", e => { S.budget = +e.target.value || 0; save(); renderCompare(); });
  $("#persons").addEventListener("change", e => { S.persons = Math.max(1, +e.target.value || 1); save(); renderCompare(); });
  $("#sort").addEventListener("change", e => { S.view.sort = e.target.value; save(); renderCompare(); });
  $("#maxBack").addEventListener("change", e => { S.view.maxBack = e.target.value; save(); renderCompare(); });
  $("#hideRej").addEventListener("change", e => { S.view.hideRejected = e.target.checked; save(); renderCompare(); });
  $("#onlyFav").addEventListener("change", e => { S.view.onlyFav = e.target.checked; save(); renderCompare(); });
  $("#add-dest").addEventListener("click", () => editDest(null));

  // ---------- dialogi ----------
  const dlg = $("#dlg"), form = $("#dlg-form");
  function openDialog(html, onSave, onDelete) {
    form.innerHTML = html + `<div class="dlg-actions">
      ${onDelete ? '<button class="btn danger" value="del" style="margin-right:auto">Usuń</button>' : ""}
      <button class="btn" value="cancel" formnovalidate>Anuluj</button>
      <button class="btn primary" value="ok">Zapisz</button></div>`;
    dlg.returnValue = "";
    dlg.showModal();
    dlg.onclose = () => {
      if (dlg.returnValue === "ok") onSave(Object.fromEntries(new FormData(form)));
      if (dlg.returnValue === "del" && confirm("Na pewno usunąć?")) onDelete();
    };
  }
  const f = (name, label, val = "", type = "text", extra = "") =>
    `<label>${label}<input name="${name}" type="${type}" value="${esc(val)}" ${type === "number" ? 'inputmode="decimal" step="any"' : ""} ${extra}></label>`;
  const rate = (name, label, v) => `<label>${label}<select name="${name}">${[0,1,2,3,4,5].map(i => `<option ${i == v ? "selected" : ""} value="${i}">${i ? i + " / 5" : "—"}</option>`).join("")}</select></label>`;

  function editDest(id) {
    const d = id ? dest(id) : { out: [], back: [], stay: {}, places: [] };
    const lines = arr => arr.map(x => `${x.day} ${x.dep}-${x.arr} ${x.price}${x.note ? " " + x.note : ""}`).join("\n");
    const parse = txt => txt.split("\n").map(s => s.trim()).filter(Boolean).map(s => {
      const m = s.match(/^(czw|pt|sob|ndz|pon|wt)\s+(\d\d?[:.]\d\d)\s*-\s*(\d\d?[:.]\d\d)\s+(\d+)\s*(.*)$/i);
      return m ? { day: m[1].toLowerCase(), dep: m[2].replace(".", ":"), arr: m[3].replace(".", ":"), price: +m[4], note: m[5] } : null;
    });
    openDialog(`<h2>${id ? esc(d.name) : "Nowy kierunek"}</h2>
      <fieldset><legend>Nocleg</legend>
        <div class="grid2">${f("sname", "Nazwa", d.stay.name)}${f("snight", "Cena za noc za dwoje (zł)", d.stay.perNight || "", "number")}</div>
        ${f("slink", "Link do oferty", d.stay.link, "url")}</fieldset>
      <div class="grid2">${f("daily", "Wydatki na miejscu / dzień (dla dwojga)", d.dailySpend || "", "number")}${f("transfer", "Dojazdy lotnisko ↔ miasto (razem)", d.transferCost || "", "number")}</div>
      <div class="grid2">${rate("rk", "Ocena Krystiana", d.ratingK)}${rate("rz", "Ocena Zuzi", d.ratingZ)}</div>
      ${f("pros", "Plusy (po przecinku)", d.pros)}${f("cons", "Minusy (po przecinku)", d.cons)}
      <fieldset><legend>Loty (cena za osobę, jedna linia = jeden lot, godziny lokalne)</legend>
        <p class="muted">Format: <code>czw 07:20-09:30 68 uwaga</code>. Dni: czw 19.11, pt, sob, ndz, pon 23.11, wt.</p>
        <div class="grid2"><label>Wyloty z Krakowa<textarea name="out" rows="4">${esc(lines(d.out))}</textarea></label>
        <label>Powroty<textarea name="back" rows="4">${esc(lines(d.back))}</textarea></label></div></fieldset>
      <fieldset><legend>Miejsce</legend>
        <div class="grid2">${f("name", "Miasto", d.name, "text", "required")}${f("country", "Kraj", d.country)}
        ${f("airport", "Lotnisko", d.airport)}${f("apKm", "Km lotnisko → centrum", d.apKm ?? "", "number")}
        ${f("temp", "Temp. w dzień (°C)", d.temp ?? "", "number")}${f("tz", "Różnica czasu vs Polska (h)", d.tz ?? 0, "number")}</div>
        ${f("photo", "Własne zdjęcie (link, opcjonalnie)", d.photo, "url")}${f("note", "Notatka", d.note)}</fieldset>`,
      async v => {
        const out = parse(v.out), back = parse(v.back);
        if (out.includes(null) || back.includes(null)) { toast("Nie rozumiem którejś linii z lotami, popraw format"); return; }
        const nd = id ? d : { id: uid(), places: [], votes: {} };
        const flightsChanged = JSON.stringify([out, back]) !== JSON.stringify([d.out, d.back]);
        const renamed = v.name !== d.name;
        Object.assign(nd, {
          name: v.name, country: v.country, dailySpend: +v.daily || 0, transferCost: +v.transfer || 0,
          ratingK: +v.rk, ratingZ: +v.rz, pros: v.pros, cons: v.cons, temp: v.temp === "" ? null : +v.temp, note: v.note,
          airport: v.airport, apKm: v.apKm === "" ? null : +v.apKm, tz: +v.tz || 0, photo: v.photo,
          out, back, selOut: flightsChanged ? null : d.selOut, selBack: flightsChanged ? null : d.selBack,
          stay: { name: v.sname, perNight: +v.snight || 0, link: v.slink },
        });
        if (renamed) { nd.wiki = v.name; nd._srcs = []; }
        if (!id) S.destinations.push(nd);
        if (!nd.lat || renamed) {
          const g = await geocode(`${v.name} ${v.country}`);
          if (g) { nd.lat = g.lat; nd.lng = g.lng; nd._geoName = v.name; }
        }
        save(); renderAll();
      },
      id ? () => { S.destinations = S.destinations.filter(x => x.id !== id); save(); renderAll(); } : null);
  }

  function editPlace(destId, place, latlng) {
    const d = dest(destId), isNew = !place;
    const p = place || { cat: "food", lat: latlng?.lat, lng: latlng?.lng };
    const c = cost(d), days = c ? c.n + 1 : 3;
    openDialog(`<h2>${isNew ? "Nowe miejsce" : "Edytuj miejsce"}</h2>
      ${f("name", "Nazwa", p.name, "text", "required")}
      <label>Kategoria<select name="cat">${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${k === p.cat ? "selected" : ""}>${c.label}</option>`).join("")}</select></label>
      ${f("note", "Notatka", p.note)}
      <div class="grid2">${f("price", "Szac. koszt (zł)", p.price, "number")}${f("link", "Link", p.link, "url")}</div>
      <div class="grid2"><label>Dzień<select name="day"><option value="">—</option>${Array.from({ length: days }, (_, i) => `<option ${p.day == i + 1 ? "selected" : ""} value="${i + 1}">Dzień ${i + 1}</option>`).join("")}</select></label>
      ${f("time", "Godzina", p.time, "time")}</div>
      <label style="display:flex;gap:8px;align-items:center"><input type="checkbox" name="done" ${p.done ? "checked" : ""} style="width:auto"> Zaliczone</label>`,
      v => {
        Object.assign(p, { name: v.name, cat: v.cat, note: v.note, price: +v.price || 0, link: v.link, day: v.day ? +v.day : null, time: v.time, done: !!v.done });
        if (isNew) { p.id = uid(); d.places.push(p); }
        save(); renderMap(); renderPlan();
      },
      isNew ? null : () => { d.places = d.places.filter(x => x !== p); save(); renderMap(); renderPlan(); });
  }

  async function geocode(q) {
    if (!navigator.onLine) return null;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`);
      const j = await r.json();
      return j[0] ? { lat: +j[0].lat, lng: +j[0].lon } : null;
    } catch { return null; }
  }

  // ---------- widok: mapa ----------
  let map, layer, adding = false, meMarker;
  function initMap() {
    if (map) return;
    map = L.map("map", { zoomControl: true }).setView([50, 15], 4);
    L.tileLayer(TILE_URL, { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    layer = L.layerGroup().addTo(map);
    map.on("click", e => {
      if (!adding) return;
      setAdding(false);
      editPlace(currentDest, null, e.latlng);
    });
  }
  function setAdding(on) {
    adding = on; document.body.classList.toggle("adding", on);
    $("#add-place").innerHTML = on ? `${ic("x")}<span>Anuluj</span>` : `${ic("pin")}<span>Dodaj miejsce</span>`;
    if (on) toast("Stuknij w mapę, gdzie jest to miejsce");
  }
  $("#add-place").addEventListener("click", () => setAdding(!adding));
  $("#locate").addEventListener("click", () => {
    if (!navigator.geolocation) return toast("Brak GPS");
    navigator.geolocation.getCurrentPosition(pos => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      meMarker ? meMarker.setLatLng(ll) : (meMarker = L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#24318f", fillOpacity: 1 }).addTo(map));
      map.setView(ll, 16);
    }, () => toast("Nie udało się pobrać lokalizacji"), { enableHighAccuracy: true, timeout: 10000 });
  });

  function pinIcon(cat, done) {
    const c = CATS[cat] || CATS.other;
    return L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
      html: `<div class="pin" style="background:${c.color};opacity:${done ? .5 : 1}"><svg><use href="#i-${c.icon}"/></svg></div>` });
  }
  function renderMap() {
    const sel = $("#map-dest");
    sel.innerHTML = S.destinations.map(d => `<option value="${d.id}" ${d.id === currentDest ? "selected" : ""}>${esc(d.name)}</option>`).join("");
    $("#cat-filter").innerHTML = Object.entries(CATS).map(([k, c]) => `<button class="chip ${catOn.has(k) ? "on" : ""}" data-cat="${k}" style="--c:${c.color}" aria-pressed="${catOn.has(k)}">${ic(c.icon)}${c.label}</button>`).join("");
    if (!map) return;
    layer.clearLayers();
    const d = dest(currentDest); if (!d) return;
    const places = (d.places || []).filter(p => catOn.has(p.cat));
    places.forEach(p => {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(p.cat, p.done) }).addTo(layer);
      m.bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.note || "")}${p.link ? `<br><a href="${esc(p.link)}" target="_blank">Link</a>` : ""}
        <br><a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank">Nawiguj</a>`);
      p._m = m;
    });
    $("#place-list").innerHTML = places.length ? places.map(p => `
      <div class="place ${p.done ? "done" : ""}" data-pid="${p.id}">
        <span class="dot" style="background:${(CATS[p.cat] || CATS.other).color}">${ic((CATS[p.cat] || CATS.other).icon)}</span>
        <div class="body"><div class="name">${esc(p.name)}</div><div class="muted">${p.day ? `Dzień ${p.day} ${esc(p.time || "")} · ` : ""}${esc(p.note || "")}${p.price ? ` · ${zl(p.price)}` : ""}</div></div>
        <button class="btn small" data-act="edit" aria-label="Edytuj">${ic("edit")}</button>
      </div>`).join("") : `<p class="muted">Brak miejsc. Kliknij „Dodaj miejsce” i stuknij w mapę.</p>`;
  }
  function focusDest() {
    const d = dest(currentDest); if (!d || !map) return;
    const pts = (d.places || []).map(p => [p.lat, p.lng]);
    if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30], maxZoom: 15 });
    else if (d.lat) map.setView([d.lat, d.lng], 13);
  }
  $("#map-dest").addEventListener("change", e => { currentDest = e.target.value; renderMap(); focusDest(); });
  $("#cat-filter").addEventListener("click", e => {
    const c = e.target.closest("[data-cat]"); if (!c) return;
    catOn.has(c.dataset.cat) ? catOn.delete(c.dataset.cat) : catOn.add(c.dataset.cat); renderMap();
  });
  $("#place-list").addEventListener("click", e => {
    const row = e.target.closest(".place"); if (!row) return;
    const p = dest(currentDest).places.find(x => x.id === row.dataset.pid);
    if (e.target.closest("[data-act=edit]")) return editPlace(currentDest, p);
    map.setView([p.lat, p.lng], 16); p._m?.openPopup(); window.scrollTo({ top: 0, behavior: "smooth" });
  });

  // ---------- mapa offline ----------
  const lon2x = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
  const lat2y = (lat, z) => Math.floor((1 - Math.log(Math.tan(lat * Math.PI / 180) + 1 / Math.cos(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z);
  function tilesFor(bounds, zMin, zMax) {
    const out = [];
    for (let z = zMin; z <= zMax; z++) {
      const x0 = lon2x(bounds.getWest(), z), x1 = lon2x(bounds.getEast(), z);
      const y0 = lat2y(bounds.getNorth(), z), y1 = lat2y(bounds.getSouth(), z);
      for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++)
        out.push(TILE_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y));
    }
    return out;
  }
  $("#offline-dl").addEventListener("click", async () => {
    if (!("caches" in window)) return toast("Ta przeglądarka nie obsługuje zapisu offline");
    if (!navigator.onLine) return toast("Potrzebny internet (najlepiej wifi)");
    const b = map.getBounds(), z = map.getZoom();
    if (z < 11) return toast("Przybliż mapę do miasta, które chcesz zapisać");
    const urls = [...tilesFor(b, Math.max(8, z - 4), z - 1), ...tilesFor(b, z, Math.min(17, z + 3))];
    if (urls.length > 4000) return toast(`Za duży obszar (${urls.length} kafelków). Przybliż mapę.`);
    if (!confirm(`Pobrać ${urls.length} kafelków (ok. ${Math.round(urls.length * 25 / 1024)} MB) dla widocznego obszaru?`)) return;
    const cache = await caches.open(TILE_CACHE);
    let done = 0, fail = 0;
    const btn = $("#offline-dl");
    const worker = async () => {
      while (urls.length) {
        const u = urls.shift();
        try { if (!(await cache.match(u))) { const r = await fetch(u, { mode: "cors" }); if (r.ok) await cache.put(u, r); else fail++; } }
        catch { fail++; }
        done++; if (done % 10 === 0) btn.innerHTML = `${ic("down")}<span>${done}…</span>`;
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    btn.innerHTML = `${ic("down")}<span>Mapa offline</span>`;
    toast(fail ? `Zapisano, ${fail} kafelków się nie udało` : "Mapa zapisana, działa offline", 3000);
    updateCacheInfo();
  });
  async function updateCacheInfo() {
    if (!("caches" in window)) return;
    const keys = await (await caches.open(TILE_CACHE)).keys();
    $("#cache-info").textContent = `Zapisane kafelki mapy: ${keys.length} (ok. ${Math.round(keys.length * 25 / 1024)} MB). Pobierasz je w zakładce Mapa przyciskiem „Mapa offline” dla widocznego obszaru.`;
  }
  $("#reload-photos").addEventListener("click", async () => {
    if (!navigator.onLine) return toast("Potrzebny internet");
    imgFail.clear(); photoLog.length = 0; await window.caches?.delete("img-v2");
    S.destinations.forEach(d => { d._srcs = []; d._si = 0; d._ovTried = false; });
    await loadPhotos(true); toast("Zdjęcia odświeżone");
  });
  $("#clear-tiles").addEventListener("click", async () => {
    if (!confirm("Usunąć wszystkie zapisane mapy?")) return;
    await caches.delete(TILE_CACHE); updateCacheInfo(); toast("Wyczyszczone");
  });

  // ---------- widok: plan ----------
  function renderPlan() {
    const sel = $("#plan-dest");
    sel.innerHTML = S.destinations.map(d => `<option value="${d.id}" ${d.id === currentDest ? "selected" : ""}>${esc(d.name)}</option>`).join("");
    const d = dest(currentDest); if (!d) return ($("#plan").innerHTML = "");
    const c = cost(d), days = c ? c.n + 1 : 3, d0 = c ? dayIdx(c.o.day) : 0;
    const fmt = p => `<div class="slot"><span class="t">${esc(p.time || "")}</span><span style="color:${(CATS[p.cat] || CATS.other).color}">${ic((CATS[p.cat] || CATS.other).icon)}</span><span class="n">${esc(p.name)}</span>${p.price ? `<span class="muted">${zl(p.price)}</span>` : "<span></span>"}</div>`;
    const by = n => d.places.filter(p => p.day === n).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    const unplanned = d.places.filter(p => !p.day);
    const spend = d.places.reduce((s, p) => s + (+p.price || 0), 0);
    $("#plan").innerHTML = `<p class="muted">Przypisz dzień i godzinę w edycji miejsca (zakładka Mapa). Zaplanowane wydatki: <b>${zl(spend)}</b></p>` +
      Array.from({ length: days }, (_, i) => `<div class="day"><h3>Dzień ${i + 1}<span>${DAYS[d0 + i] || ""} ${DATES[d0 + i] || ""}${c && i === 0 ? " · przylot " + c.o.arr : c && i === days - 1 ? " · wylot " + c.b.dep : ""}</span></h3>${by(i + 1).map(fmt).join("") || '<p class="empty">nic jeszcze</p>'}</div>`).join("") +
      (unplanned.length ? `<div class="day"><h3>Bez terminu</h3>${unplanned.map(fmt).join("")}</div>` : "");
  }
  $("#plan-dest").addEventListener("change", e => { currentDest = e.target.value; renderPlan(); });

  // ---------- eksport / import ----------
  const clean = () => JSON.stringify(S, (k, v) => (k === "_m" ? undefined : v), 2);
  $("#export").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([clean()], { type: "application/json" }));
    a.download = `wypad-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  });
  $("#share").addEventListener("click", async () => {
    const file = new File([clean()], "wypad.json", { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: "Nasz wypad" }); } catch {} }
    else toast("Udostępnianie niedostępne, użyj Eksportuj");
  });
  $("#import").addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      if (!Array.isArray(j.destinations)) throw 0;
      S = j; currentDest = S.destinations[0]?.id; save(); renderAll(); toast("Zaimportowano");
    } catch { toast("To nie jest plik z tej apki"); }
    e.target.value = "";
  });
  $("#reset").addEventListener("click", () => {
    if (!confirm("Zastąpić wszystko przykładowymi danymi?")) return;
    S = structuredClone(window.SAMPLE_DATA); currentDest = S.destinations[0]?.id; save(); renderAll();
  });

  // ---------- zdjęcia z Wikipedii (po pobraniu zostają w cache, więc działają też offline) ----------
  // Jedno zapytanie do API Wikipedii o zdjęcia wszystkich miast. Rozmiar 960 px, bo Wikimedia
  // odrzuca miniatury w niestandardowych rozmiarach.
  // Kolejne źródła: miniatura z Wikipedii → zdjęcie z Openverse (otwarte zdjęcia, m.in. z Flickra) → kolorowe tło.
  // Przy każdej porażce zapisujemy powód, widać go w „Więcej” i na samej karcie.
  const photoOf = d => d.photo || (d._srcs || [])[d._si || 0] || "";
  let photoBusy = false;
  const imgFail = new Set(), photoLog = [];
  const plog = (msg) => { photoLog.push(new Date().toLocaleTimeString("pl-PL") + " " + msg); if (photoLog.length > 40) photoLog.shift(); updatePhotoInfo(); };
  const EN = { Bukareszt: "Bucharest", Cypr: "Larnaca", "Gran Canaria": "Las Palmas", Katania: "Catania", Kopenhaga: "Copenhagen",
    Lizbona: "Lisbon", Madryt: "Madrid", Mediolan: "Milan", Pafos: "Paphos", Piza: "Pisa", Rzym: "Rome", Saloniki: "Thessaloniki",
    Sevilla: "Seville", Sztokholm: "Stockholm", Walencja: "Valencia", Wenecja: "Venice", Bolonia: "Bologna", Malta: "Valletta" };
  async function openverse(d) {
    if (d._ovTried) return false;
    d._ovTried = true;
    try {
      const q = `${EN[d.name] || d.name} city`;
      const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=5&aspect_ratio=wide&mature=false`);
      if (!r.ok) { plog(`Openverse ${d.name}: HTTP ${r.status}`); return false; }
      const j = await r.json();
      const hit = (j.results || []).find(x => x.url);
      if (!hit) { plog(`Openverse ${d.name}: brak wyników`); return false; }
      d._srcs = [...(d._srcs || []), hit.url, hit.thumbnail].filter(Boolean);
      return true;
    } catch (e) { plog(`Openverse ${d.name}: ${e.message}`); return false; }
  }
  async function loadPhotos(force = false) {
    if (photoBusy || !navigator.onLine) return;
    const todo = S.destinations.filter(d => !d.photo && (force || !(d._srcs || []).length));
    if (!todo.length) return;
    photoBusy = true;
    try {
      const titles = todo.map(d => d.wiki || d.name);
      const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1" +
        "&prop=pageimages&piprop=thumbnail&pithumbsize=1024&pilimit=50&titles=" + encodeURIComponent(titles.join("|"));
      const r = await fetch(url);
      if (!r.ok) throw new Error("HTTP " + r.status);
      const j = await r.json();
      const alias = {};
      [...(j.query?.normalized || []), ...(j.query?.redirects || [])].forEach(x => { alias[x.from] = x.to; });
      const resolve = t => { let k = t.replace(/_/g, " "); for (let i = 0; i < 3 && alias[k]; i++) k = alias[k]; return k; };
      const pages = {};
      Object.values(j.query?.pages || {}).forEach(pg => { pages[pg.title] = pg; });
      let n = 0;
      todo.forEach(d => {
        const src = pages[resolve(d.wiki || d.name)]?.thumbnail?.source;
        d._srcs = src ? [src] : []; d._si = 0; d._ovTried = false; imgFail.delete(d.id);
        if (src) n++;
      });
      plog(`Wikipedia: ${n}/${todo.length} adresów zdjęć`);
    } catch (e) {
      plog(`Wikipedia nie odpowiada: ${e.message}`);
      todo.forEach(d => { d._srcs = []; d._si = 0; d._ovTried = false; });
    }
    for (const d of todo) if (!d._srcs.length) await openverse(d);
    save();
    photoBusy = false;
    paintPhotos(); updatePhotoInfo();
  }
  function paintPhotos() {
    document.querySelectorAll("img[data-photo]").forEach(img => {
      const d = dest(img.dataset.photo), src = photoOf(d);
      if (src && img.getAttribute("src") !== src && !imgFail.has(d.id)) { img.classList.remove("broken"); img.src = src; }
    });
  }
  // gdy zdjęcie się nie wczyta: następne źródło, potem Openverse, na końcu kolorowe tło z opisem błędu
  document.addEventListener("error", async e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.photo) return;
    const d = dest(img.dataset.photo); if (!d) return;
    if (d.photo && img.getAttribute("src") === d.photo) { plog(`${d.name}: własne zdjęcie nie działa`); }
    else {
      plog(`${d.name}: nie wczytało się ${String(img.getAttribute("src")).slice(0, 60)}…`);
      d._si = (d._si || 0) + 1;
      if (d._si >= (d._srcs || []).length) await openverse(d);
      if (d._si < (d._srcs || []).length) { save(); img.src = photoOf(d); return; }
    }
    imgFail.add(d.id); img.removeAttribute("src"); img.classList.add("broken"); updatePhotoInfo();
  }, true);
  document.addEventListener("load", e => {
    const img = e.target;
    if (img instanceof HTMLImageElement && img.dataset.photo) img.closest(".sw-photo,.sh-hero,.dest")?.classList.add("has-img");
  }, true);
  const photoImg = (d, cls) => `<img class="${cls}" data-photo="${d.id}" alt="" draggable="false" ${photoOf(d) && !imgFail.has(d.id) ? `src="${esc(photoOf(d))}"` : ""}>`;
  function updatePhotoInfo() {
    const el = $("#photo-info"); if (!el) return;
    const n = S.destinations.filter(d => photoOf(d) && !imgFail.has(d.id)).length;
    el.innerHTML = `Zdjęcia: ${n} z ${S.destinations.length} miast${imgFail.size ? `, ${imgFail.size} nie chce się wczytać` : ""}.` +
      (photoLog.length ? `<details><summary>Szczegóły (do wysłania Claude'owi)</summary><pre class="plog">${esc(photoLog.join("\n"))}</pre></details>` : "");
  }
  // własne zdjęcie z galerii telefonu (zmniejszone do 960 px, zapisane w apce)
  function pickPhoto(id) {
    const inp = document.createElement("input");
    inp.type = "file"; inp.accept = "image/*";
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      const bmp = await createImageBitmap(file);
      const k = Math.min(1, 960 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      const d = dest(id); d.photo = cv.toDataURL("image/jpeg", 0.75); imgFail.delete(id);
      save(); toast("Zdjęcie ustawione"); renderSwipe(); if (sheet.open) openInfo(id);
    };
    inp.click();
  }

  // ---------- pogoda (Open-Meteo, bez klucza) ----------
  const WMO = c => ic(c === 0 ? "sun" : c <= 2 ? "partly" : c === 3 ? "cloud" : c <= 48 ? "fog" : c <= 67 ? "rain" : c <= 77 ? "snow" : c <= 82 ? "rain" : "storm");
  async function loadWeather(d, c) {
    const from = isoDate(c.o.day), to = isoDate(c.b.day);
    const key = `${from}_${to}`;
    const w = d._wx;
    if (w && w.key === key && (w.kind === "archive" ? Date.now() - w.at < 864e5 : Date.now() - w.at < 6 * 36e5)) return w;
    if (!navigator.onLine) return w || null;
    const q = `latitude=${d.lat}&longitude=${d.lng}&timezone=auto`;
    try {
      const r = await fetch(`https://api.open-meteo.com/v1/forecast?${q}&start_date=${from}&end_date=${to}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max`);
      const j = await r.json();
      if (r.ok && j.daily?.time?.length) {
        d._wx = { key, kind: "forecast", at: Date.now(), days: j.daily.time.map((t, i) => ({ t, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], rain: j.daily.precipitation_probability_max[i] })) };
        save(); return d._wx;
      }
    } catch {}
    // prognoza jeszcze niedostępna: jak było w tych samych dniach rok temu
    try {
      const ly = s => s.replace("2026", "2025");
      const r = await fetch(`https://archive-api.open-meteo.com/v1/archive?${q}&start_date=${ly(from)}&end_date=${ly(to)}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum`);
      const j = await r.json();
      if (r.ok && j.daily?.time?.length) {
        d._wx = { key, kind: "archive", at: Date.now(), days: j.daily.time.map((t, i) => ({ t, code: j.daily.weather_code[i], max: j.daily.temperature_2m_max[i], min: j.daily.temperature_2m_min[i], mm: j.daily.precipitation_sum[i] })) };
        save(); return d._wx;
      }
    } catch {}
    return w || null;
  }
  function weatherHTML(w) {
    if (!w) return `<p class="muted">Pogoda pobierze się, gdy będzie internet. Średnio w listopadzie ok. ${"${t}"}°C w dzień.</p>`;
    const dn = t => { t = t.replace(/^2025/, "2026"); const dt = new Date(t + "T12:00"); return `${["ndz", "pon", "wt", "śr", "czw", "pt", "sob"][dt.getDay()]} ${t.slice(8, 10)}.${t.slice(5, 7)}`; };
    return `${w.kind === "archive" ? `<p class="muted">Prawdziwa prognoza pojawi się ok. 16 dni przed wyjazdem, czyli lada dzień. Na razie: <b>jak było w tych dniach rok temu</b>.</p>` : `<p class="muted">Prognoza na Wasze dni (aktualizuje się przy otwarciu).</p>`}
      <div class="wx">${w.days.map(x => `<div class="wx-d"><span>${dn(x.t)}</span>${WMO(x.code)}<b>${Math.round(x.max)}°</b><span class="muted">${Math.round(x.min)}°</span><span class="muted">${w.kind === "archive" ? `${(x.mm ?? 0).toFixed(1)} mm` : `deszcz ${x.rain ?? 0}%`}</span></div>`).join("")}</div>`;
  }

  // ---------- zdjęcia atrakcji (wyszukiwanie w polskiej Wikipedii, zapas: Openverse) ----------
  async function attractionPhoto(d, name) {
    d._att = d._att || {};
    if (d._att[name] !== undefined) return d._att[name];
    if (!navigator.onLine) return "";
    const clean = name.replace(/^Wycieczka:\s*/, "").replace(/\s*\(.*?\)\s*/g, " ").split(" lub ")[0].trim();
    let src = "";
    try {
      const u = "https://pl.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrlimit=3" +
        "&prop=pageimages&piprop=thumbnail&pithumbsize=800&gsrsearch=" + encodeURIComponent(`${clean} ${name.startsWith("Wycieczka") ? "" : d.name}`);
      const j = await (await fetch(u)).json();
      const pages = Object.values(j.query?.pages || {}).sort((a, b) => a.index - b.index);
      src = pages.find(p => p.thumbnail?.source && !/\.svg/i.test(p.thumbnail.source))?.thumbnail.source || "";
    } catch {}
    if (!src) try {
      const r = await fetch(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(`${clean} ${EN[d.name] || d.name}`)}&page_size=3&mature=false`);
      const j = await r.json();
      src = (j.results || [])[0]?.url || "";
    } catch {}
    d._att[name] = src; save();
    return src;
  }
  // podgląd zdjęcia na cały ekran (przesuwanie palcem / strzałkami)
  const lb = { list: [], i: 0 };
  function lightbox(list, i) {
    lb.list = list; lb.i = i;
    let el = $("#lightbox");
    if (!el) {
      el = document.createElement("div"); el.id = "lightbox";
      el.innerHTML = `<img alt=""><div class="lb-cap"></div><button class="lb-x" aria-label="Zamknij">${ic("x")}</button><button class="lb-p" aria-label="Poprzednie">${ic("left")}</button><button class="lb-n" aria-label="Następne">${ic("right")}</button>`;
      document.body.appendChild(el);
      el.addEventListener("click", e => {
        if (e.target.closest(".lb-p")) return lbGo(-1);
        if (e.target.closest(".lb-n")) return lbGo(1);
        el.classList.remove("open");
      });
      let x0 = null;
      el.addEventListener("touchstart", e => { x0 = e.touches[0].clientX; }, { passive: true });
      el.addEventListener("touchend", e => { if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 50) { e.preventDefault(); lbGo(dx < 0 ? 1 : -1); } });
      addEventListener("keydown", e => { if (!el.classList.contains("open")) return; if (e.key === "ArrowRight") lbGo(1); if (e.key === "ArrowLeft") lbGo(-1); if (e.key === "Escape") el.classList.remove("open"); });
    }
    lbGo(0); el.classList.add("open");
  }
  function lbGo(step) {
    lb.i = (lb.i + step + lb.list.length) % lb.list.length;
    const el = $("#lightbox"), it = lb.list[lb.i];
    el.querySelector("img").src = it.src; el.querySelector(".lb-cap").textContent = `${it.cap} · ${lb.i + 1}/${lb.list.length}`;
  }

  // ---------- karta szczegółów ----------
  const sheet = $("#sheet");
  async function openInfo(id) {
    const d = dest(id), c = pairAny(d), inf = (window.CITY_INFO || {})[d.name] || {};
    const gm = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + ", " + d.name)}`;
    const fl = (f, dir) => `<li><b>${esc(f.day)} ${DATES[dayIdx(f.day)] || ""}</b> ${esc(f.dep)}–${esc(f.arr)} · ${hm(flightMin(f, dir, d.tz || 0))} · <b>${f.price} zł</b>${f.note ? ` <span class="muted">(${esc(f.note)})</span>` : ""}</li>`;
    sheet.innerHTML = `<div class="sh">
      <div class="sh-hero"><div class="gal" id="gal"><div class="gal-s" data-gi="0">${photoImg(d, "sh-img")}</div>
        ${(inf.see || []).map((x, k) => `<div class="gal-s" data-gi="${k + 1}"><img class="sh-img" alt="" data-att="${k}"><span class="gal-cap">${esc(x)}</span></div>`).join("")}</div>
        <button class="sh-x" data-sh="close" aria-label="Zamknij">${ic("x")}</button>
        <div class="gal-dots">${[0, ...(inf.see || [])].map((_, k) => `<i class="${k ? "" : "on"}"></i>`).join("")}</div></div>
      <div class="sh-title"><h2>${esc(d.name)}</h2><span>${esc(d.country)} · ~${d.temp ?? "?"}°C</span></div>
      <div class="sh-body">
        ${inf.about ? `<p class="sh-about">${esc(inf.about)}</p>` : ""}
        <h3>${ic("partly")}Pogoda ${c ? `${esc(c.o.day)} ${DATES[dayIdx(c.o.day)]} – ${esc(c.b.day)} ${DATES[dayIdx(c.b.day)]}` : ""}</h3>
        <div id="sh-wx"><p class="muted">Ładuję pogodę…</p></div>
        <h3>${ic("out")}Loty z Krakowa <span class="muted">cena za osobę</span></h3>
        <div class="sh-cols"><div><div class="muted">Tam</div><ul>${d.out.map(f => fl(f, "out")).join("")}</ul></div>
          <div><div class="muted">Powrót</div><ul>${d.back.map(f => fl(f, "back")).join("")}</ul></div></div>
        <h3>${ic("list")}Koszty dla ${S.persons === 2 ? "dwojga" : S.persons + " os."}</h3>
        <div class="sh-cost">${costHTML(d)}</div>
        ${c ? `<p class="sh-fact">${ic("clock")}<span>Najtańsza para: <b>${zl(c.flight)}</b> dla ${S.persons} os. · ${hoursThere(c)} h na miejscu</span></p>` : ""}
        ${d.airport ? `<p class="sh-fact">${ic("bus")}<span><b>${esc(d.airport)}</b> · ok. ${d.apKm} km do centrum${d.apMin ? `, ok. ${d.apMin} min` : ""}</span></p>` : ""}
        ${inf.see ? `<h3>${ic("sight")}Co zobaczyć</h3><div class="att">${inf.see.map((x, k) => `<div class="att-i"><button class="att-ph" data-sh="lb" data-k="${k + 1}"><img alt="" data-att="${k}"></button>
          <div><b>${esc(x)}</b><br><a href="${gm(x)}" target="_blank" rel="noopener">Pokaż na mapie ${ic("ext")}</a></div></div>`).join("")}</div>` : ""}
        ${inf.eat ? `<h3>${ic("food")}Czego spróbować</h3><ul class="sh-list">${inf.eat.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${d.note ? `<p class="note">${esc(d.note)}</p>` : ""}
        <div class="actions">
          ${c ? `<a class="btn small" href="${stayLink("booking", d, c)}" target="_blank" rel="noopener">Booking ${ic("ext")}</a><a class="btn small" href="${stayLink("airbnb", d, c)}" target="_blank" rel="noopener">Airbnb ${ic("ext")}</a>` : ""}
          <a class="btn small" href="https://pl.wikipedia.org/wiki/${encodeURIComponent(d.name)}" target="_blank" rel="noopener">Wikipedia ${ic("ext")}</a>
          <button class="btn small" data-sh="photo">${ic("camera")}Własne zdjęcie</button>
          <button class="btn small" data-sh="edit">${ic("edit")}Edytuj</button>
          <button class="btn small" data-sh="map">${ic("map")}Mapa</button>
        </div>
      </div>
      <div class="sh-vote">
        <button class="btn ${d.votes[who] === -1 ? "on" : ""}" data-sh="no">${ic("x")}Nie</button>
        <button class="btn primary" data-sh="yes">${ic("check")}Jedziemy</button>
      </div></div>`;
    sheet.dataset.id = id;
    sheet.showModal();
    sheet.querySelector(".sh-body").scrollTop = 0;
    const gal = $("#gal");
    gal.addEventListener("scroll", () => {
      const k = Math.round(gal.scrollLeft / gal.clientWidth);
      sheet.querySelectorAll(".gal-dots i").forEach((dot, n) => dot.classList.toggle("on", n === k));
    }, { passive: true });
    gal.addEventListener("click", e => { const sl = e.target.closest(".gal-s"); if (sl) openLb(d, inf, +sl.dataset.gi); });
    (inf.see || []).forEach(async (x, k) => {
      const src = await attractionPhoto(d, x);
      sheet.querySelectorAll(`img[data-att="${k}"]`).forEach(img => {
        if (sheet.dataset.id !== id) return;
        if (src) img.src = src; else (img.closest(".gal-s") || img.closest(".att-ph"))?.remove();
      });
    });
    const w = c ? await loadWeather(d, c) : null;
    const box = $("#sh-wx"); if (box && sheet.dataset.id === id) box.innerHTML = weatherHTML(w).replace("${t}", d.temp ?? "?");
  }
  function openLb(d, inf, start) {
    const list = [{ src: photoOf(d), cap: d.name }, ...(inf.see || []).map(x => ({ src: d._att?.[x] || "", cap: x }))];
    const ok = list.map((x, k) => ({ ...x, k })).filter(x => x.src);
    if (!ok.length) return;
    lightbox(ok, Math.max(0, ok.findIndex(x => x.k === start)));
  }
  sheet.addEventListener("change", e => {
    if (e.target.dataset.sh !== "pair") return;
    const d = dest(sheet.dataset.id);
    [d.selOut, d.selBack] = e.target.value.split(",").map(Number);
    save(); sheet.querySelector(".sh-cost").innerHTML = costHTML(d); renderCompare();
  });
  sheet.addEventListener("click", e => {
    if (e.target === sheet) return sheet.close();
    const lbb = e.target.closest("[data-sh=lb]");
    if (lbb) { const d = dest(sheet.dataset.id); return openLb(d, (window.CITY_INFO || {})[d.name] || {}, +lbb.dataset.k); }
    const b = e.target.closest("[data-sh]"); if (!b) return;
    const id = sheet.dataset.id, d = dest(id), a = b.dataset.sh;
    if (a === "close") return sheet.close();
    if (a === "edit") { sheet.close(); return editDest(id); }
    if (a === "photo") return pickPhoto(id);
    if (a === "map") { sheet.close(); currentDest = id; return show("map"); }
    if (a === "pair") return;
    sheet.close();
    const v = a === "yes" ? 1 : -1;
    if (deck[0]?.id === id && $("#view-swipe").classList.contains("active")) return fling(v);
    d.votes[who] = v; deck = deck.filter(x => x.id !== id); save();
    if (v === 1 && isMatch(d)) toast(`Match! Oboje chcecie: ${d.name}`, 3000);
    renderAll();
  });

  // ---------- widok: wybieranie w stylu „w prawo / w lewo” ----------
  let deck = [], history = [];
  const pairAny = d => {
    // najtańsza para niezależnie od limitu powrotu (żeby pokazać też kierunki z powrotem we wtorek)
    const c = cost(d); if (c) return c;
    const lim = S.view.maxBack; S.view.maxBack = "wt"; const c2 = cost(d); S.view.maxBack = lim; return c2;
  };
  function buildDeck() {
    const left = S.destinations.filter(d => !d.votes[who]);
    // kolejność losowa, ale stała w obrębie sesji
    deck = left.sort((a, b) => (hash(a.id + who) - hash(b.id + who)));
  }
  const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  function cardHTML(d) {
    const c = pairAny(d);
    const fl = (f, dir, icon) => `<tr><td>${ic(icon)}</td><td>${esc(f.day)} ${DATES[dayIdx(f.day)] || ""} · ${esc(f.dep)} → ${esc(f.arr)}</td><td class="dur">${hm(flightMin(f, dir, d.tz || 0)).replace(" min", "").replace(" h ", " h ")}</td><td class="pr">${f.price} zł</td></tr>`;
    const notes = c ? [c.o.note, c.b.note, d.note].filter(Boolean) : [d.note].filter(Boolean);
    const late = c && dayIdx(c.b.day) > dayIdx(S.view.maxBack);
    return `<div class="sw-card" data-id="${d.id}">
      <div class="sw-photo"><span class="sw-fallback">brak zdjęcia</span>${photoImg(d, "sw-img")}
        <div class="votes">${voteTags(d)}</div>
        <button class="sw-i" data-info="${d.id}" aria-label="Szczegóły">${ic("info")}</button>
        <div class="stamp yes">jedziemy!</div><div class="stamp no">nie</div></div>
      <div class="chin">
        <div class="chin-h"><h2>${esc(d.name)}</h2><small>${esc(d.country)} · ~${d.temp ?? "?"}°C</small></div>
        ${c ? `<table class="fl">${fl(c.o, "out", "out")}${fl(c.b, "back", "in")}</table>
        <div class="facts">${hoursThere(c)} h na miejscu · ${c.n} ${c.n === 1 ? "noc" : c.n < 5 ? "noce" : "nocy"}${d.airport ? `<span class="opt"> · ${esc((d.airport.match(/\(([A-Z]{3})/) || [, "lotnisko"])[1])} ~${d.apKm} km do centrum</span>` : ""}${pairs(d).length > 1 ? `<span class="opt"> · ${pairs(d).length} warianty</span>` : ""}${late ? ` · <span class="warn">powrót dopiero ${esc(c.b.day)} ${DATES[dayIdx(c.b.day)]}</span>` : ""}</div>
        ${notes.map(n => `<div class="sw-note">${esc(n)}</div>`).join("")}
        <div class="plate"><span>loty dla ${S.persons === 2 ? "dwojga" : S.persons + " os."}</span><b>${zl(c.flight)}</b></div>` : `<p class="facts">Brak pasującej pary lotów.</p>`}
      </div>
    </div>`;
  }
  function renderSwipe() {
    const box = $("#deck");
    const matches = S.destinations.filter(isMatch);
    const n = S.destinations.length;
    $("#sw-count").textContent = deck.length ? `Odbitka ${n - deck.length + 1} z ${n}` : `Wszystkie ${n} przejrzane`;
    $("#swipe-status").innerHTML = matches.length ? `Wspólne: <b>${matches.map(d => esc(d.name)).join(", ")}</b>` : "Jeszcze nic wspólnego.";
    $("#sw-undo").disabled = !history.length;
    if (!deck.length) {
      $("#sw-info").disabled = true;
      const mine = S.destinations.filter(d => d.votes[who] === 1);
      box.innerHTML = `<div class="sw-empty">
        <h2>Przejrzane!</h2>
        <p>${esc(PEOPLE[who])} na tak: <b>${mine.map(d => esc(d.name)).join(", ") || "nic"}</b></p>
        <p>Wspólne: <b>${matches.map(d => esc(d.name)).join(", ") || "jeszcze nic. Niech druga osoba też przejrzy (przełącz u góry)."}</b></p>
        <button class="btn primary wide" data-go="fav">Porównaj te na tak</button>
        <button class="btn wide" data-go="reset">Przejrzyj jeszcze raz (${esc(PEOPLE[who])})</button>
      </div>`;
      return;
    }
    box.innerHTML = deck.slice(0, 2).reverse().map(cardHTML).join("");
    $("#sw-info").disabled = false;
    attachDrag(box.lastElementChild);
  }
  function vote(v) {
    const d = deck.shift(); if (!d) return;
    d.votes[who] = v; history.push(d); save();
    if (v === 1 && isMatch(d)) toast(`Match! Oboje chcecie: ${d.name}`, 3000);
    renderSwipe();
  }
  function fling(v) {
    const top = $("#deck").lastElementChild;
    if (!top || !top.classList.contains("sw-card")) return;
    top.style.transition = "transform .3s ease, opacity .3s";
    top.style.transform = `translateX(${v * 130}%) rotate(${v * 25}deg)`;
    top.style.opacity = "0";
    setTimeout(() => vote(v), 250);
  }
  function attachDrag(el) {
    if (!el || !el.classList.contains("sw-card")) return;
    let x0 = null, y0 = 0, dx = 0;
    const yes = el.querySelector(".stamp.yes"), no = el.querySelector(".stamp.no");
    el.addEventListener("pointerdown", e => { x0 = e.clientX; y0 = e.clientY; dx = 0; el.setPointerCapture(e.pointerId); el.style.transition = "none"; });
    el.addEventListener("pointermove", e => {
      if (x0 === null) return;
      dx = e.clientX - x0;
      el.style.transform = `translateX(${dx}px) rotate(${dx / 18}deg)`;
      yes.style.opacity = Math.max(0, Math.min(1, dx / 100));
      no.style.opacity = Math.max(0, Math.min(1, -dx / 100));
    });
    const end = () => {
      if (x0 === null) return; x0 = null;
      if (Math.abs(dx) > 100) return fling(dx > 0 ? 1 : -1);
      el.style.transition = "transform .2s"; el.style.transform = ""; yes.style.opacity = no.style.opacity = 0;
      if (Math.abs(dx) < 8) openInfo(el.dataset.id);
    };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  }
  $("#sw-yes").addEventListener("click", () => fling(1));
  $("#sw-info").addEventListener("click", () => deck[0] && openInfo(deck[0].id));
  $("#sw-no").addEventListener("click", () => fling(-1));
  $("#sw-undo").addEventListener("click", () => {
    const d = history.pop(); if (!d) return;
    delete d.votes[who]; deck.unshift(d); save(); renderSwipe();
  });
  $("#deck").addEventListener("click", e => {
    const g = e.target.closest("[data-go]"); if (!g) return;
    if (g.dataset.go === "fav") { S.view.onlyFav = true; S.view.hideRejected = true; save(); show("compare"); }
    if (g.dataset.go === "reset") { S.destinations.forEach(d => delete d.votes[who]); history = []; save(); buildDeck(); renderSwipe(); }
  });
  addEventListener("keydown", e => {
    if (!$("#view-swipe").classList.contains("active") || dlg.open || sheet.open) return;
    if ((e.key === "ArrowUp" || e.key === "i") && deck[0]) openInfo(deck[0].id);
    if (e.key === "ArrowRight") fling(1);
    if (e.key === "ArrowLeft") fling(-1);
    if (e.key === "Backspace") $("#sw-undo").click();
  });
  function setWho(p) {
    who = p; try { localStorage.setItem(WHO_KEY, p); } catch {}
    history = []; buildDeck(); renderWho(); renderSwipe(); renderCompare();
    toast(`Teraz wybiera: ${PEOPLE[p]}`);
  }
  $("#who").addEventListener("click", () => setWho(who === "K" ? "Z" : "K"));

  // ---------- widok: tabela (wygodna na komputerze) ----------
  function renderTable() {
    const rows = [...S.destinations].sort((a, b) => (cost(a)?.total ?? 1e9) - (cost(b)?.total ?? 1e9));
    $("#table").innerHTML = `<table class="tbl"><thead><tr>
      <th>Miasto</th><th>Głosy</th><th>Wariant lotów</th><th class="num">Loty (${S.persons} os.)</th>
      <th class="num">Nocleg / noc</th><th class="num">Wydatki / dzień</th><th class="num">Dojazdy</th><th class="num">Razem</th><th>Szukaj noclegu</th><th></th></tr></thead><tbody>
      ${rows.map(d => {
        const c = cost(d), ps = pairs(d);
        const inp = (k, v) => `<input class="cell" data-k="${k}" type="number" inputmode="decimal" min="0" step="10" value="${v || ""}" placeholder="—">`;
        return `<tr data-id="${d.id}" class="${rejected(d) ? "rej" : ""} ${isMatch(d) ? "match" : ""}">
          <td><span class="city">${esc(d.name)}</span><div class="muted">${esc(d.country)} · ~${d.temp ?? "?"}°C</div></td>
          <td>${voteTags(d)}</td>
          <td>${c ? `<select class="cell" data-k="pair">${ps.map(([i, j, n]) => `<option value="${i},${j}" ${i === c.i && j === c.j ? "selected" : ""}>${esc(d.out[i].day)} ${esc(d.out[i].dep)} → ${esc(d.back[j].day)} ${esc(d.back[j].dep)} (${n} n.)</option>`).join("")}</select>` : '<span class="muted">brak pary do ' + esc(S.view.maxBack) + "</span>"}</td>
          <td class="num">${c ? zl(c.flight) : "—"}</td>
          <td class="num">${inp("perNight", d.stay?.perNight)}</td>
          <td class="num">${inp("dailySpend", d.dailySpend)}</td>
          <td class="num">${inp("transferCost", d.transferCost)}</td>
          <td class="num"><b>${c ? zl(c.total) : "—"}</b></td>
          <td>${c ? `<a href="${stayLink("booking", d, c)}" target="_blank" rel="noopener">Booking</a> · <a href="${stayLink("airbnb", d, c)}" target="_blank" rel="noopener">Airbnb</a>` : ""}</td>
          <td><button class="btn small" data-act="edit" aria-label="Edytuj">${ic("edit")}</button></td></tr>`;
      }).join("")}</tbody></table>`;
  }
  $("#table").addEventListener("change", e => {
    const el = e.target.closest(".cell"); if (!el) return;
    const d = dest(el.closest("tr").dataset.id), k = el.dataset.k;
    if (k === "pair") [d.selOut, d.selBack] = el.value.split(",").map(Number);
    else if (k === "perNight") d.stay.perNight = +el.value || 0;
    else d[k] = +el.value || 0;
    save(); renderTable();
  });
  $("#table").addEventListener("click", e => {
    if (e.target.closest("[data-act=edit]")) editDest(e.target.closest("tr").dataset.id);
  });

  // ---------- nawigacja ----------
  function show(view) {
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    if (view === "map") { initMap(); renderMap(); setTimeout(() => { map.invalidateSize(); focusDest(); }, 50); }
    if (view === "plan") renderPlan();
    if (view === "more") { updateCacheInfo(); updatePhotoInfo(); }
    if (view === "compare") renderCompare();
    if (view === "swipe") { if (!deck.length) buildDeck(); renderSwipe(); loadPhotos(); }
    if (view === "table") renderTable();
    try { localStorage.setItem("wypad-tab", view); } catch {}
    setAdding(false);
  }
  document.querySelector(".tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) show(b.dataset.view); });
  function renderWho() {
    $("#who-label").textContent = `Głosuje: ${PEOPLE[who]}`;
    document.querySelectorAll("#who b").forEach(b => b.classList.toggle("on", b.dataset.p === who));
  }
  function renderAll() {
    renderWho();
    renderCompare(); renderMap(); renderPlan();
    if ($("#view-table").classList.contains("active")) renderTable();
    if ($("#view-swipe").classList.contains("active")) renderSwipe();
  }

  function net() { const n = $("#net"); n.textContent = navigator.onLine ? "" : "offline"; n.classList.toggle("off", !navigator.onLine); }
  addEventListener("online", net); addEventListener("offline", net); net();

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (navigator.storage?.persist) navigator.storage.persist();
  buildDeck();
  renderAll();
  let startTab = "swipe"; try { startTab = localStorage.getItem("wypad-tab") || "swipe"; } catch {}
  if (startTab === "table" && innerWidth < 760) startTab = "compare";
  show(startTab);
  addEventListener("online", loadPhotos);
})();
