/* Wypad we dwoje: porównywarka kierunków + mapa offline + plan dnia */
(() => {
  const KEY = "wypad-v2";
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
  if (!S || !Array.isArray(S.destinations) || S.version !== 2) S = structuredClone(window.SAMPLE_DATA);
  S.view = S.view || { sort: "cost", hideRejected: true, maxBack: "pon", onlyFav: false };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
  const dest = id => S.destinations.find(d => d.id === id);
  let currentDest = S.destinations[0]?.id;
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
    return ps.reduce((best, p) => pairCost(d, ...p) / (p[2] + 1) < pairCost(d, ...best) / (best[2] + 1) ? p : best);
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
    const hiddenRej = items.filter(x => x.d.rejected).length;
    if (v.hideRejected) items = items.filter(x => !x.d.rejected);
    if (v.onlyFav) items = items.filter(x => x.d.fav);
    const key = {
      cost: x => x.c ? x.c.total : 1e9,
      fav: x => -(rating(x.d) * 1000 + (x.d.fav ? 500 : 0)) + (x.c ? x.c.total / 100 : 999),
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
      const over = c.total > S.budget, pct = Math.min(100, c.total / (S.budget || 1) * 100);
      const ps = pairs(d);
      return `<article class="card dest ${d.fav ? "best" : ""} ${d.rejected ? "rej" : ""}" data-id="${d.id}">
        <div class="head" data-act="toggle">
          <div style="min-width:0"><h3 style="display:inline">${esc(d.name)}</h3>${d.fav ? '<span class="badge">❤</span>' : ""}
            <div class="muted">${esc(d.country)} · ~${d.temp ?? "?"}°C · ${c.n} ${c.n === 1 ? "noc" : c.n < 5 ? "noce" : "nocy"} · ${hoursThere(c)} h na miejscu</div></div>
          <div class="total ${over ? "over" : ""}">${zl(c.total)}</div>
        </div>
        <div class="flights">
          <span>🛫 ${esc(fmtFlight(c.o))} <b>${c.o.price} zł</b></span>
          <span>🛬 ${esc(fmtFlight(c.b))} <b>${c.b.price} zł</b></span>
        </div>
        <div class="bar"><i class="${over ? "over" : ""}" style="width:${pct}%"></i></div>
        ${open ? `
        ${ps.length > 1 ? `<label>Wariant lotów (${ps.length})<select data-act="pair">${ps.map(([i, j, n]) =>
          `<option value="${i},${j}" ${i === c.i && j === c.j ? "selected" : ""}>${esc(d.out[i].day)} ${esc(d.out[i].dep)} → ${esc(d.back[j].day)} ${esc(d.back[j].dep)} · ${n} n. · ${zl(pairCost(d, i, j, n))}</option>`).join("")}</select></label>` : ""}
        ${[c.o.note && "🛫 " + c.o.note, c.b.note && "🛬 " + c.b.note, d.note && "📝 " + d.note].filter(Boolean).map(n => `<div class="note">${esc(n)}</div>`).join("")}
        <div class="rows">
          <span class="k">✈ Loty</span><span class="muted">${S.persons} os. × ${c.o.price + c.b.price} zł</span><span class="v">${zl(c.flight)}</span>
          <span class="k">🛏 Nocleg</span><span class="muted">${esc(d.stay?.name || "")} ${zl(d.stay?.perNight || 0)}/noc${d.stay?.est ? " (szac.)" : ""}</span><span class="v">${zl(c.stay)}</span>
          <span class="k">🍝 Na miejscu</span><span class="muted">${zl(d.dailySpend || 0)}/dzień${d.est ? " (szac.)" : ""}</span><span class="v">${zl(c.spend)}</span>
          <span class="k">🚌 Dojazdy</span><span class="muted">lotnisko ↔ miasto${d.est ? " (szac.)" : ""}</span><span class="v">${zl(c.transfer)}</span>
          <span class="k">Zostaje</span><span></span><span class="v" style="color:${over ? "var(--warn)" : "var(--ok)"}">${zl(S.budget - c.total)}</span>
        </div>
        <div class="stars"><span>Krystian <b>${"★".repeat(d.ratingK || 0)}${"☆".repeat(5 - (d.ratingK || 0))}</b></span>
          <span>Zuzia <b>${"★".repeat(d.ratingZ || 0)}${"☆".repeat(5 - (d.ratingZ || 0))}</b></span>
          <span>📍 ${d.places?.length || 0} miejsc</span></div>
        ${d.pros || d.cons ? `<div class="pc"><ul class="p">${(d.pros || "").split(",").filter(s => s.trim()).map(p => `<li>${esc(p.trim())}</li>`).join("")}</ul><ul class="c">${(d.cons || "").split(",").filter(s => s.trim()).map(p => `<li>${esc(p.trim())}</li>`).join("")}</ul></div>` : ""}
        <div class="actions">
          <button class="btn small" data-act="edit">Edytuj / oceń</button>
          <button class="btn small" data-act="map">Mapa</button>
          <a class="btn small" href="https://www.google.com/travel/hotels/${encodeURIComponent(d.name)}" target="_blank" rel="noopener">Hotele ↗</a>
          ${d.stay?.link ? `<a class="btn small" href="${esc(d.stay.link)}" target="_blank" rel="noopener">Nasz nocleg ↗</a>` : ""}
        </div>` : ""}
        <div class="actions quick">
          <button class="btn small ${d.fav ? "on" : ""}" data-act="fav">${d.fav ? "❤ Ulubione" : "♡ Ulubione"}</button>
          <button class="btn small" data-act="rej">${d.rejected ? "↺ Przywróć" : "✕ Odrzuć"}</button>
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
    if (act === "map") { currentDest = id; return show("map"); }
    if (act === "fav") { d.fav = !d.fav; if (d.fav) d.rejected = false; save(); }
    if (act === "rej") { d.rejected = !d.rejected; if (d.rejected) d.fav = false; save(); toast(d.rejected ? `${d.name} odrzucone` : `${d.name} przywrócone`); }
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
      <div class="grid2">${rate("rk", "Ocena Krystiana", d.ratingK)}${rate("rz", "Ocena Zuzi", d.ratingZ)}</div>
      ${f("pros", "Plusy (po przecinku)", d.pros)}${f("cons", "Minusy (po przecinku)", d.cons)}
      <div class="grid2">${f("name", "Miasto", d.name, "text", "required")}${f("country", "Kraj", d.country)}</div>
      <fieldset><legend>✈ Loty (cena za osobę, jedna linia = jeden lot)</legend>
        <p class="muted">Format: <code>czw 07:20-09:30 68 uwaga</code>. Dni: czw 19.11, pt, sob, ndz, pon 23.11, wt.</p>
        <label>Wyloty z Krakowa<textarea name="out" rows="3">${esc(lines(d.out))}</textarea></label>
        <label>Powroty<textarea name="back" rows="3">${esc(lines(d.back))}</textarea></label></fieldset>
      <fieldset><legend>🛏 Nocleg</legend>
        <div class="grid2">${f("sname", "Nazwa", d.stay.name)}${f("snight", "Cena za noc za dwoje (zł)", d.stay.perNight, "number")}</div>
        ${f("slink", "Link", d.stay.link, "url")}</fieldset>
      <div class="grid2">${f("daily", "Wydatki na miejscu / dzień (dla dwojga)", d.dailySpend, "number")}${f("transfer", "Dojazdy lotnisko ↔ miasto", d.transferCost, "number")}</div>
      <div class="grid2">${f("temp", "Temp. w dzień (°C)", d.temp, "number")}${f("note", "Notatka", d.note)}</div>`,
      async v => {
        const out = parse(v.out), back = parse(v.back);
        if (out.includes(null) || back.includes(null)) { toast("Nie rozumiem którejś linii z lotami, popraw format"); return; }
        const nd = id ? d : { id: uid(), places: [] };
        const stayChanged = +v.snight !== +d.stay.perNight || v.sname !== (d.stay.name || "");
        const flightsChanged = JSON.stringify([out, back]) !== JSON.stringify([d.out, d.back]);
        const estChanged = +v.daily !== +d.dailySpend || +v.transfer !== +d.transferCost;
        Object.assign(nd, {
          name: v.name, country: v.country, dailySpend: +v.daily || 0, transferCost: +v.transfer || 0,
          ratingK: +v.rk, ratingZ: +v.rz, pros: v.pros, cons: v.cons, temp: v.temp === "" ? null : +v.temp, note: v.note,
          out, back, selOut: flightsChanged ? null : d.selOut, selBack: flightsChanged ? null : d.selBack,
          stay: { name: v.sname, perNight: +v.snight || 0, link: v.slink, est: stayChanged ? false : d.stay.est },
          est: estChanged ? false : d.est,
        });
        if (!id) S.destinations.push(nd);
        if (!nd.lat || (id && d._geoName !== v.name)) {
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

  // ---------- nawigacja ----------
  function show(view) {
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    if (view === "map") { initMap(); renderMap(); setTimeout(() => { map.invalidateSize(); focusDest(); }, 50); }
    if (view === "plan") renderPlan();
    if (view === "more") updateCacheInfo();
    if (view === "compare") renderCompare();
    setAdding(false);
  }
  document.querySelector(".tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) show(b.dataset.view); });
  function renderAll() { renderCompare(); renderMap(); renderPlan(); }

  function net() { const n = $("#net"); n.textContent = navigator.onLine ? "online" : "offline"; n.classList.toggle("off", !navigator.onLine); }
  addEventListener("online", net); addEventListener("offline", net); net();

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (navigator.storage?.persist) navigator.storage.persist();
  renderAll();
})();
