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
    food:  { label: "Jedzenie",  icon: "🍝", color: "var(--food)" },
    sight: { label: "Zwiedzanie", icon: "🏛", color: "var(--sight)" },
    stay:  { label: "Nocleg",    icon: "🛏", color: "var(--stay)" },
    other: { label: "Inne",      icon: "★",  color: "var(--other)" },
  };
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
  const voteBadge = d => isMatch(d) ? '<span class="badge">❤ match</span>'
    : Object.entries(d.votes).filter(([, v]) => v).map(([p, v]) => `<span class="vote ${v > 0 ? "yes" : "no"}">${PEOPLE[p][0]}${v > 0 ? "❤" : "✕"}</span>`).join("");
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
      const open = openCards.has(d.id);
      if (!c) return `<article class="card dest rej" data-id="${d.id}"><div class="head"><div><h3>${esc(d.name)}</h3>
        <div class="muted">Brak pasującej pary lotów przy powrocie do ${esc(v.maxBack)}.</div></div></div>
        <div class="actions"><button class="btn small" data-act="edit">Edytuj</button></div></article>`;
      const over = S.budget > 0 && c.total > S.budget, pct = S.budget > 0 ? Math.min(100, c.total / S.budget * 100) : 0;
      const ps = pairs(d), missing = !d.stay?.perNight;
      return `<article class="card dest ${isMatch(d) ? "best" : ""} ${rejected(d) ? "rej" : ""}" data-id="${d.id}">
        <div class="head" data-act="toggle">
          <div style="min-width:0"><h3 style="display:inline">${esc(d.name)}</h3>${voteBadge(d)}
            <div class="muted">${esc(d.country)} · ~${d.temp ?? "?"}°C · ${c.n} ${c.n === 1 ? "noc" : c.n < 5 ? "noce" : "nocy"} · ${hoursThere(c)} h na miejscu</div></div>
          <div class="total ${over ? "over" : ""}">${zl(c.total)}${missing ? '<small>+ nocleg</small>' : ""}</div>
        </div>
        <div class="flights">
          <span>🛫 ${esc(fmtFlight(c.o))} · ${hm(flightMin(c.o, "out", d.tz || 0))} <b>${c.o.price} zł</b></span>
          <span>🛬 ${esc(fmtFlight(c.b))} · ${hm(flightMin(c.b, "back", d.tz || 0))} <b>${c.b.price} zł</b></span>
          ${d.airport ? `<span>🚌 ${esc(d.airport)} · ~${d.apKm} km do centrum</span>` : ""}
        </div>
        ${S.budget > 0 ? `<div class="bar"><i class="${over ? "over" : ""}" style="width:${pct}%"></i></div>` : ""}
        ${open ? `
        ${ps.length > 1 ? `<label>Wariant lotów (${ps.length})<select data-act="pair">${ps.map(([i, j, n]) =>
          `<option value="${i},${j}" ${i === c.i && j === c.j ? "selected" : ""}>${esc(d.out[i].day)} ${esc(d.out[i].dep)} → ${esc(d.back[j].day)} ${esc(d.back[j].dep)} · ${n} n. · ${zl(pairCost(d, i, j, n))}</option>`).join("")}</select></label>` : ""}
        ${[c.o.note && "🛫 " + c.o.note, c.b.note && "🛬 " + c.b.note, d.note && "📝 " + d.note].filter(Boolean).map(n => `<div class="note">${esc(n)}</div>`).join("")}
        <div class="rows">
          <span class="k">✈ Loty</span><span class="muted">${S.persons} os. × ${c.o.price + c.b.price} zł</span><span class="v">${zl(c.flight)}</span>
          <span class="k">🛏 Nocleg</span><span class="muted">${missing ? "uzupełnij (Booking/Airbnb niżej)" : `${esc(d.stay?.name || "")} ${zl(d.stay.perNight)}/noc`}</span><span class="v">${zl(c.stay)}</span>
          <span class="k">🍝 Na miejscu</span><span class="muted">${d.dailySpend ? zl(d.dailySpend) + "/dzień" : "uzupełnij"}</span><span class="v">${zl(c.spend)}</span>
          <span class="k">🚌 Dojazdy</span><span class="muted">${d.transferCost ? "lotnisko ↔ miasto" : "uzupełnij"}</span><span class="v">${zl(c.transfer)}</span>
          ${S.budget > 0 ? `<span class="k">Zostaje</span><span></span><span class="v" style="color:${over ? "var(--warn)" : "var(--ok)"}">${zl(S.budget - c.total)}</span>` : ""}
        </div>
        <div class="stars"><span>Krystian <b>${"★".repeat(d.ratingK || 0)}${"☆".repeat(5 - (d.ratingK || 0))}</b></span>
          <span>Zuzia <b>${"★".repeat(d.ratingZ || 0)}${"☆".repeat(5 - (d.ratingZ || 0))}</b></span>
          <span>📍 ${d.places?.length || 0} miejsc</span></div>
        ${d.pros || d.cons ? `<div class="pc"><ul class="p">${(d.pros || "").split(",").filter(s => s.trim()).map(p => `<li>${esc(p.trim())}</li>`).join("")}</ul><ul class="c">${(d.cons || "").split(",").filter(s => s.trim()).map(p => `<li>${esc(p.trim())}</li>`).join("")}</ul></div>` : ""}
        <div class="actions">
          <button class="btn small" data-act="info">ℹ Info i pogoda</button>
          <button class="btn small" data-act="edit">Edytuj / oceń</button>
          <button class="btn small" data-act="map">Mapa</button>
          <a class="btn small" href="${stayLink("booking", d, c)}" target="_blank" rel="noopener">Booking ↗</a>
          <a class="btn small" href="${stayLink("airbnb", d, c)}" target="_blank" rel="noopener">Airbnb ↗</a>
          ${d.stay?.link ? `<a class="btn small" href="${esc(d.stay.link)}" target="_blank" rel="noopener">Nasz nocleg ↗</a>` : ""}
        </div>` : ""}
        <div class="actions quick">
          <button class="btn small ${d.votes[who] === 1 ? "on" : ""}" data-act="fav">${d.votes[who] === 1 ? "❤" : "♡"} Tak (${PEOPLE[who]})</button>
          <button class="btn small ${d.votes[who] === -1 ? "on" : ""}" data-act="rej">✕ Nie</button>
          <button class="btn small" data-act="toggle">${open ? "Zwiń ▲" : "Szczegóły ▼"}</button>
        </div>
      </article>`;
    }).join("");
  }
  const openCards = new Set();
  $("#dest-list").addEventListener("click", e => {
    const b = e.target.closest("[data-act]"); if (!b || b.tagName === "SELECT") return;
    const id = b.closest(".dest").dataset.id, d = dest(id);
    const act = b.dataset.act;
    if (act === "toggle") openCards.has(id) ? openCards.delete(id) : openCards.add(id);
    if (act === "edit") return editDest(id);
    if (act === "info") return openInfo(id);
    if (act === "map") { currentDest = id; return show("map"); }
    if (act === "fav") { d.votes[who] = d.votes[who] === 1 ? 0 : 1; save(); }
    if (act === "rej") { d.votes[who] = d.votes[who] === -1 ? 0 : -1; save(); }
    renderCompare();
  });
  $("#dest-list").addEventListener("change", e => {
    if (e.target.dataset.act !== "pair") return;
    const d = dest(e.target.closest(".dest").dataset.id);
    [d.selOut, d.selBack] = e.target.value.split(",").map(Number);
    save(); renderCompare();
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
  const rate = (name, label, v) => `<label>${label}<select name="${name}">${[0,1,2,3,4,5].map(i => `<option ${i == v ? "selected" : ""} value="${i}">${i ? "★".repeat(i) : "—"}</option>`).join("")}</select></label>`;

  function editDest(id) {
    const d = id ? dest(id) : { out: [], back: [], stay: {}, places: [] };
    const lines = arr => arr.map(x => `${x.day} ${x.dep}-${x.arr} ${x.price}${x.note ? " " + x.note : ""}`).join("\n");
    const parse = txt => txt.split("\n").map(s => s.trim()).filter(Boolean).map(s => {
      const m = s.match(/^(czw|pt|sob|ndz|pon|wt)\s+(\d\d?[:.]\d\d)\s*-\s*(\d\d?[:.]\d\d)\s+(\d+)\s*(.*)$/i);
      return m ? { day: m[1].toLowerCase(), dep: m[2].replace(".", ":"), arr: m[3].replace(".", ":"), price: +m[4], note: m[5] } : null;
    });
    openDialog(`<h2>${id ? esc(d.name) : "Nowy kierunek"}</h2>
      <fieldset><legend>🛏 Nocleg</legend>
        <div class="grid2">${f("sname", "Nazwa", d.stay.name)}${f("snight", "Cena za noc za dwoje (zł)", d.stay.perNight || "", "number")}</div>
        ${f("slink", "Link do oferty", d.stay.link, "url")}</fieldset>
      <div class="grid2">${f("daily", "Wydatki na miejscu / dzień (dla dwojga)", d.dailySpend || "", "number")}${f("transfer", "Dojazdy lotnisko ↔ miasto (razem)", d.transferCost || "", "number")}</div>
      <div class="grid2">${rate("rk", "Ocena Krystiana", d.ratingK)}${rate("rz", "Ocena Zuzi", d.ratingZ)}</div>
      ${f("pros", "Plusy (po przecinku)", d.pros)}${f("cons", "Minusy (po przecinku)", d.cons)}
      <fieldset><legend>✈ Loty (cena za osobę, jedna linia = jeden lot, godziny lokalne)</legend>
        <p class="muted">Format: <code>czw 07:20-09:30 68 uwaga</code>. Dni: czw 19.11, pt, sob, ndz, pon 23.11, wt.</p>
        <div class="grid2"><label>Wyloty z Krakowa<textarea name="out" rows="4">${esc(lines(d.out))}</textarea></label>
        <label>Powroty<textarea name="back" rows="4">${esc(lines(d.back))}</textarea></label></div></fieldset>
      <fieldset><legend>📍 Miejsce</legend>
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
        if (renamed) { nd.wiki = v.name; nd._img = null; }
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
      <label>Kategoria<select name="cat">${Object.entries(CATS).map(([k, c]) => `<option value="${k}" ${k === p.cat ? "selected" : ""}>${c.icon} ${c.label}</option>`).join("")}</select></label>
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
    $("#add-place").textContent = on ? "✕ Anuluj" : "📍 Dodaj miejsce";
    if (on) toast("Stuknij w mapę, gdzie jest to miejsce");
  }
  $("#add-place").addEventListener("click", () => setAdding(!adding));
  $("#locate").addEventListener("click", () => {
    if (!navigator.geolocation) return toast("Brak GPS");
    navigator.geolocation.getCurrentPosition(pos => {
      const ll = [pos.coords.latitude, pos.coords.longitude];
      meMarker ? meMarker.setLatLng(ll) : (meMarker = L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#1971c2", fillOpacity: 1 }).addTo(map));
      map.setView(ll, 16);
    }, () => toast("Nie udało się pobrać lokalizacji"), { enableHighAccuracy: true, timeout: 10000 });
  });

  function pinIcon(cat, done) {
    const c = CATS[cat] || CATS.other;
    return L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -26],
      html: `<div class="pin" style="background:${c.color};opacity:${done ? .5 : 1}"><span>${c.icon}</span></div>` });
  }
  function renderMap() {
    const sel = $("#map-dest");
    sel.innerHTML = S.destinations.map(d => `<option value="${d.id}" ${d.id === currentDest ? "selected" : ""}>${esc(d.name)}</option>`).join("");
    $("#cat-filter").innerHTML = Object.entries(CATS).map(([k, c]) => `<button class="chip ${catOn.has(k) ? "on" : ""}" data-cat="${k}">${c.icon} ${c.label}</button>`).join("");
    if (!map) return;
    layer.clearLayers();
    const d = dest(currentDest); if (!d) return;
    const places = (d.places || []).filter(p => catOn.has(p.cat));
    places.forEach(p => {
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(p.cat, p.done) }).addTo(layer);
      m.bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.note || "")}${p.link ? `<br><a href="${esc(p.link)}" target="_blank">link ↗</a>` : ""}
        <br><a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank">Nawiguj ↗</a>`);
      p._m = m;
    });
    $("#place-list").innerHTML = places.length ? places.map(p => `
      <div class="place ${p.done ? "done" : ""}" data-pid="${p.id}">
        <span class="dot" style="background:${(CATS[p.cat] || CATS.other).color}"></span>
        <div class="body"><div class="name">${esc(p.name)}</div><div class="muted">${p.day ? `Dzień ${p.day} ${esc(p.time || "")} · ` : ""}${esc(p.note || "")}${p.price ? ` · ${zl(p.price)}` : ""}</div></div>
        <button class="btn small" data-act="edit">✎</button>
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
        done++; if (done % 10 === 0) btn.textContent = `⬇ ${done}…`;
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    btn.textContent = "⬇ Mapa offline";
    toast(fail ? `Zapisano, ${fail} kafelków się nie udało` : "Mapa zapisana, działa offline ✓", 3000);
    updateCacheInfo();
  });
  async function updateCacheInfo() {
    if (!("caches" in window)) return;
    const keys = await (await caches.open(TILE_CACHE)).keys();
    $("#cache-info").textContent = `Zapisane kafelki mapy: ${keys.length} (ok. ${Math.round(keys.length * 25 / 1024)} MB). Pobierasz je w zakładce Mapa przyciskiem „Mapa offline” dla widocznego obszaru.`;
  }
  $("#reload-photos").addEventListener("click", async () => {
    if (!navigator.onLine) return toast("Potrzebny internet");
    imgFail.clear(); await window.caches?.delete("img-v2");
    S.destinations.forEach(d => { d._img = ""; d._imgOrig = ""; });
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
    const fmt = p => `<div class="slot"><span class="t">${esc(p.time || "")}</span><span>${(CATS[p.cat] || CATS.other).icon}</span><span class="n">${esc(p.name)}</span>${p.price ? `<span class="muted">${zl(p.price)}</span>` : ""}</div>`;
    const by = n => d.places.filter(p => p.day === n).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    const unplanned = d.places.filter(p => !p.day);
    const spend = d.places.reduce((s, p) => s + (+p.price || 0), 0);
    $("#plan").innerHTML = `<p class="muted">Przypisz dzień i godzinę w edycji miejsca (zakładka Mapa). Zaplanowane wydatki: <b>${zl(spend)}</b></p>` +
      Array.from({ length: days }, (_, i) => `<div class="day"><h3>Dzień ${i + 1} · ${DAYS[d0 + i] || ""} ${DATES[d0 + i] || ""}${c && i === 0 ? " · przylot " + c.o.arr : c && i === days - 1 ? " · wylot " + c.b.dep : ""}</h3>${by(i + 1).map(fmt).join("") || '<p class="muted">Nic jeszcze.</p>'}</div>`).join("") +
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
      S = j; currentDest = S.destinations[0]?.id; save(); renderAll(); toast("Zaimportowano ✓");
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
  const photoOf = d => d.photo || d._img || "";
  let photoBusy = false;
  const imgFail = new Set();
  async function loadPhotos(force = false) {
    if (photoBusy || !navigator.onLine) return;
    const todo = S.destinations.filter(d => !d.photo && (force || !d._img));
    if (!todo.length) return;
    photoBusy = true;
    try {
      const titles = todo.map(d => d.wiki || d.name);
      const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1" +
        "&prop=pageimages&piprop=thumbnail|original&pithumbsize=960&pilimit=50&titles=" + encodeURIComponent(titles.join("|"));
      const j = await (await fetch(url)).json();
      // mapowanie tytułów po przekierowaniach i normalizacji
      const alias = {};
      [...(j.query?.normalized || []), ...(j.query?.redirects || [])].forEach(x => { alias[x.from] = x.to; });
      const resolve = t => { let k = t.replace(/_/g, " "); for (let i = 0; i < 3 && alias[k]; i++) k = alias[k]; return k; };
      const pages = {};
      Object.values(j.query?.pages || {}).forEach(pg => { pages[pg.title] = pg; });
      todo.forEach(d => {
        const pg = pages[resolve(d.wiki || d.name)];
        if (pg?.thumbnail?.source) { d._img = pg.thumbnail.source; d._imgOrig = pg.original?.source || ""; imgFail.delete(d.id); }
      });
      save();
    } catch (e) { console.warn("zdjęcia", e); }
    photoBusy = false;
    paintPhotos(); updatePhotoInfo();
  }
  function paintPhotos() {
    document.querySelectorAll("[data-photo]").forEach(img => {
      const d = dest(img.dataset.photo), src = photoOf(d);
      if (src && img.getAttribute("src") !== src && !imgFail.has(d.id)) img.src = src;
    });
  }
  // gdy miniatura się nie wczyta, spróbuj oryginału, a potem pokaż kolorowe tło
  document.addEventListener("error", e => {
    const img = e.target;
    if (!(img instanceof HTMLImageElement) || !img.dataset.photo) return;
    const d = dest(img.dataset.photo);
    if (d?._imgOrig && img.src !== d._imgOrig) { img.src = d._imgOrig; return; }
    imgFail.add(d?.id); img.removeAttribute("src"); img.classList.add("broken");
  }, true);
  const photoImg = (d, cls) => `<img class="${cls}" data-photo="${d.id}" alt="" draggable="false" ${photoOf(d) ? `src="${esc(photoOf(d))}"` : ""}>`;
  function updatePhotoInfo() {
    const el = $("#photo-info"); if (!el) return;
    const n = S.destinations.filter(d => photoOf(d)).length;
    el.textContent = `Zdjęcia: ${n} z ${S.destinations.length} miast ma adres zdjęcia${imgFail.size ? `, ${imgFail.size} nie chce się wczytać` : ""}.`;
  }

  // ---------- pogoda (Open-Meteo, bez klucza) ----------
  const WMO = c => c === 0 ? "☀️" : c <= 2 ? "🌤" : c === 3 ? "☁️" : c <= 48 ? "🌫" : c <= 67 ? "🌧" : c <= 77 ? "🌨" : c <= 82 ? "🌦" : "⛈";
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
      <div class="wx">${w.days.map(x => `<div class="wx-d"><span>${dn(x.t)}</span><span class="wx-i">${WMO(x.code)}</span><b>${Math.round(x.max)}°</b><span class="muted">${Math.round(x.min)}°</span><span class="muted">${w.kind === "archive" ? `${(x.mm ?? 0).toFixed(1)} mm` : `${x.rain ?? 0}% 💧`}</span></div>`).join("")}</div>`;
  }

  // ---------- karta szczegółów ----------
  const sheet = $("#sheet");
  async function openInfo(id) {
    const d = dest(id), c = pairAny(d), inf = (window.CITY_INFO || {})[d.name] || {};
    const gm = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + ", " + d.name)}`;
    const fl = (f, dir) => `<li><b>${esc(f.day)} ${DATES[dayIdx(f.day)] || ""}</b> ${esc(f.dep)}–${esc(f.arr)} · ${hm(flightMin(f, dir, d.tz || 0))} · <b>${f.price} zł</b>${f.note ? ` <span class="muted">(${esc(f.note)})</span>` : ""}</li>`;
    sheet.innerHTML = `<div class="sh">
      <div class="sh-hero">${photoImg(d, "sh-img")}<button class="sh-x" data-sh="close" aria-label="Zamknij">✕</button>
        <div class="sh-title"><h2>${esc(d.name)}</h2><span>${esc(d.country)}</span></div></div>
      <div class="sh-body">
        ${inf.about ? `<p class="sh-about">${esc(inf.about)}</p>` : ""}
        <h3>🌤 Pogoda ${c ? `${esc(c.o.day)} ${DATES[dayIdx(c.o.day)]} – ${esc(c.b.day)} ${DATES[dayIdx(c.b.day)]}` : ""}</h3>
        <div id="sh-wx"><p class="muted">Ładuję pogodę…</p></div>
        <h3>✈ Loty z Krakowa <span class="muted">(cena za osobę)</span></h3>
        <div class="sh-cols"><div><div class="muted">Tam</div><ul>${d.out.map(f => fl(f, "out")).join("")}</ul></div>
          <div><div class="muted">Powrót</div><ul>${d.back.map(f => fl(f, "back")).join("")}</ul></div></div>
        ${c ? `<p>Najtańsza para: <b>${zl(c.flight)}</b> dla ${S.persons} os. · ${hoursThere(c)} h na miejscu</p>` : ""}
        ${d.airport ? `<p>🚌 <b>${esc(d.airport)}</b> · ok. ${d.apKm} km do centrum${d.apMin ? `, ok. ${d.apMin} min` : ""}</p>` : ""}
        ${inf.see ? `<h3>🏛 Co zobaczyć</h3><ul class="sh-list">${inf.see.map(x => `<li><a href="${gm(x)}" target="_blank" rel="noopener">${esc(x)}</a></li>`).join("")}</ul>` : ""}
        ${inf.eat ? `<h3>🍝 Czego spróbować</h3><ul class="sh-list">${inf.eat.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${d.note ? `<p class="note">📝 ${esc(d.note)}</p>` : ""}
        <div class="actions">
          ${c ? `<a class="btn small" href="${stayLink("booking", d, c)}" target="_blank" rel="noopener">Booking ↗</a><a class="btn small" href="${stayLink("airbnb", d, c)}" target="_blank" rel="noopener">Airbnb ↗</a>` : ""}
          <a class="btn small" href="https://pl.wikipedia.org/wiki/${encodeURIComponent(d.name)}" target="_blank" rel="noopener">Wikipedia ↗</a>
          <button class="btn small" data-sh="edit">✎ Edytuj</button>
        </div>
      </div>
      <div class="sh-vote">
        <button class="btn ${d.votes[who] === -1 ? "on" : ""}" data-sh="no">✕ Nie</button>
        <button class="btn primary" data-sh="yes">❤ Tak, jedziemy</button>
      </div></div>`;
    sheet.dataset.id = id;
    sheet.showModal();
    sheet.querySelector(".sh-body").scrollTop = 0;
    const w = c ? await loadWeather(d, c) : null;
    const box = $("#sh-wx"); if (box && sheet.dataset.id === id) box.innerHTML = weatherHTML(w).replace("${t}", d.temp ?? "?");
  }
  sheet.addEventListener("click", e => {
    if (e.target === sheet) return sheet.close();
    const b = e.target.closest("[data-sh]"); if (!b) return;
    const id = sheet.dataset.id, d = dest(id), a = b.dataset.sh;
    if (a === "close") return sheet.close();
    if (a === "edit") { sheet.close(); return editDest(id); }
    sheet.close();
    const v = a === "yes" ? 1 : -1;
    if (deck[0]?.id === id && $("#view-swipe").classList.contains("active")) return fling(v);
    d.votes[who] = v; deck = deck.filter(x => x.id !== id); save();
    if (v === 1 && isMatch(d)) toast(`❤ Match! Oboje chcecie: ${d.name}`, 3000);
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
    const fl = (f, dir, label) => `<div class="sw-row"><span>${label}</span><b>${esc(f.day)} ${DATES[dayIdx(f.day)] || ""} · ${esc(f.dep)}–${esc(f.arr)}</b><span>${hm(flightMin(f, dir, d.tz || 0))}</span><b class="pr">${f.price} zł</b></div>`;
    const notes = c ? [c.o.note, c.b.note, d.note].filter(Boolean) : [d.note].filter(Boolean);
    return `<div class="sw-card" data-id="${d.id}">
      <div class="sw-photo"><span class="sw-fallback">✈</span>${photoImg(d, "sw-img")}<button class="sw-i" data-info="${d.id}" aria-label="Szczegóły">i</button></div>
      <div class="stamp yes">TAK</div><div class="stamp no">NIE</div>
      <div class="sw-info">
        <h2>${esc(d.name)} <small>${esc(d.country)} · ~${d.temp ?? "?"}°C</small></h2>
        ${c ? `${fl(c.o, "out", "🛫 Tam")}${fl(c.b, "back", "🛬 Powrót")}
        <div class="sw-tags">
          <span>✈ Loty dla ${S.persons}: <b>${zl(c.flight)}</b></span>
          <span>⏱ ${hoursThere(c)} h na miejscu · ${c.n} ${c.n === 1 ? "noc" : c.n < 5 ? "noce" : "nocy"}</span>
          ${d.airport ? `<span>🚌 ${esc(d.airport)} · ~${d.apKm} km do centrum${d.apMin ? ` (~${d.apMin} min)` : ""}</span>` : ""}
          ${pairs(d).length > 1 ? `<span>🔀 ${pairs(d).length} warianty lotów</span>` : ""}
          <span class="tap">👆 stuknij po szczegóły</span>
          ${dayIdx(c.b.day) > dayIdx(S.view.maxBack) ? `<span class="warn">powrót dopiero ${esc(c.b.day)} ${DATES[dayIdx(c.b.day)]}</span>` : ""}
        </div>
        ${notes.map(n => `<div class="sw-note">📝 ${esc(n)}</div>`).join("")}` : `<p>Brak pasującej pary lotów.</p>`}
      </div>
    </div>`;
  }
  function renderSwipe() {
    $("#who-label").textContent = PEOPLE[who];
    const box = $("#deck");
    const matches = S.destinations.filter(isMatch);
    $("#swipe-status").innerHTML = `Zostało ${deck.length} z ${S.destinations.length} · ` +
      (matches.length ? `❤ Wspólne: <b>${matches.map(d => esc(d.name)).join(", ")}</b>` : "Brak wspólnych typów (jeszcze!)");
    $("#sw-undo").disabled = !history.length;
    if (!deck.length) {
      $("#sw-info").disabled = true;
      const mine = S.destinations.filter(d => d.votes[who] === 1);
      box.innerHTML = `<div class="sw-empty card">
        <h2>Przejrzane! 🎉</h2>
        <p>${esc(PEOPLE[who])} na tak: <b>${mine.map(d => esc(d.name)).join(", ") || "nic"}</b></p>
        <p>Wspólne: <b>${matches.map(d => esc(d.name)).join(", ") || "jeszcze nic. Niech druga osoba też przejrzy (przełącz u góry)."}</b></p>
        <button class="btn primary wide" data-go="fav">Porównaj ulubione</button>
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
    if (v === 1 && isMatch(d)) toast(`❤ Match! Oboje chcecie: ${d.name}`, 3000);
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
    history = []; buildDeck(); renderSwipe(); renderCompare();
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
          <td><b>${esc(d.name)}</b><div class="muted">${esc(d.country)} · ~${d.temp ?? "?"}°C</div></td>
          <td>${voteBadge(d) || '<span class="muted">—</span>'}</td>
          <td>${c ? `<select class="cell" data-k="pair">${ps.map(([i, j, n]) => `<option value="${i},${j}" ${i === c.i && j === c.j ? "selected" : ""}>${esc(d.out[i].day)} ${esc(d.out[i].dep)} → ${esc(d.back[j].day)} ${esc(d.back[j].dep)} (${n} n.)</option>`).join("")}</select>` : '<span class="muted">brak pary do ' + esc(S.view.maxBack) + "</span>"}</td>
          <td class="num">${c ? zl(c.flight) : "—"}</td>
          <td class="num">${inp("perNight", d.stay?.perNight)}</td>
          <td class="num">${inp("dailySpend", d.dailySpend)}</td>
          <td class="num">${inp("transferCost", d.transferCost)}</td>
          <td class="num"><b>${c ? zl(c.total) : "—"}</b></td>
          <td>${c ? `<a href="${stayLink("booking", d, c)}" target="_blank" rel="noopener">Booking</a> · <a href="${stayLink("airbnb", d, c)}" target="_blank" rel="noopener">Airbnb</a>` : ""}</td>
          <td><button class="btn small" data-act="edit">✎</button></td></tr>`;
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
  function renderAll() {
    renderCompare(); renderMap(); renderPlan();
    if ($("#view-table").classList.contains("active")) renderTable();
    if ($("#view-swipe").classList.contains("active")) renderSwipe();
  }

  function net() { const n = $("#net"); n.textContent = navigator.onLine ? "online" : "offline"; n.classList.toggle("off", !navigator.onLine); }
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
