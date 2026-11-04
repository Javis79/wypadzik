/* Wnętrze wypadu: porównywarka kierunków + mapa offline + plan dnia, na danych aktywnego wypadu i jego grupy */
(() => {
  const FL = window.WypadFlights, G = window.WypadGroup;
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

  // ---------- stan: dane aktywnego wypadu w localStorage „wypad-trip-<id>” ----------
  let trip = null;                       // aktywny wypad (Trip z WypadTrips), null na liście
  let who = "";                          // głosuje zalogowana osoba: WypadAuth.user.id
  const tripKey = id => "wypad-trip-" + id;
  function normalize(s, persons) {
    if (!s || !Array.isArray(s.destinations) || s.version !== 3) s = { version: 3, budget: 0, persons: persons || 1, destinations: [] };
    s.view = s.view || { sort: "cost", hideRejected: true, maxBack: "", onlyFav: false };
    // stary limit powrotu jako dzień („pon”) zamienia się w datę
    if (s.view.maxBack && !/^\d{4}-/.test(s.view.maxBack)) s.view.maxBack = FL.legDate({ day: s.view.maxBack }) || "";
    if (!Array.isArray(s.matched)) s.matched = [];
    s.destinations.forEach(d => { d.votes = d.votes || {}; d.places = d.places || []; d.out = d.out || []; d.back = d.back || []; d.stay = d.stay || {}; });
    return s;
  }
  let S = normalize(null);
  const save = () => { if (!trip) return; try { localStorage.setItem(tripKey(trip.id), JSON.stringify(S)); } catch {} window.WypadSync?.schedule(); };
  const dest = id => S.destinations.find(d => d.id === id);
  let currentDest = null;
  const members = () => (trip && trip.members) || [];
  const origin = () => (trip && trip.origin) || "KRK";
  // głosy: 1 = w prawo (tak), -1 = w lewo (nie)
  const liked = d => Object.values(d.votes).includes(1);
  const isMatch = d => G.isMatch(d, members(), { matched: S.matched });
  const allYes = d => G.isMatch(d, members(), {});
  // nowy match zostaje w cfg.matched, żeby dołączenie kolejnej osoby go nie cofnęło
  const remember = d => { if (!S.matched.includes(d.id)) { S.matched.push(d.id); return true; } return false; };
  // cofnięty głos: kierunek przestaje być wspólny, jeśli nie wszyscy są już na tak
  const unmatch = d => { if (!allYes(d)) S.matched = S.matched.filter(x => x !== d.id); };
  const rejected = d => !liked(d) && Object.values(d.votes).includes(-1);
  // głosy dopisane markerem: inicjały członków (ja pierwszy), przy 5+ osobach trzy i „+N”
  const voteName = v => v === 1 ? "tak" : v === -1 ? "nie" : "jeszcze nie głosował(a)";
  const voteTags = d => {
    const t = G.voteTags(d, members(), who);
    return t.shown.map(x => `<span class="vt ${x.v === 1 ? "y" : x.v === -1 ? "n" : ""}" title="${esc(x.name)}: ${voteName(x.v)}">${esc(x.initial)}${x.v === 1 ? ic("check") : x.v === -1 ? ic("x") : " ?"}</span>`).join("")
      + (t.more ? `<span class="vt more" title="i jeszcze ${t.more} os.">+${t.more}</span>` : "");
  };
  // mój głos; zwraca true, gdy właśnie dzięki niemu wszyscy (wg znanej listy członków) są na tak
  function myVote(d, v) {
    const was = isMatch(d);
    d.votes[who] = v;
    return v === 1 && !was && allYes(d);
  }
  const catOn = new Set(Object.keys(CATS));

  function toast(msg, ms = 2200) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), ms);
  }

  // ---------- koszty ----------
  // dopuszczalne pary lotów: powrót co najmniej dzień po wylocie i nie później niż wybrany limit
  // (dowolne dni tygodnia: liczy się data odcinka, a bez niej dzień; flights.js)
  const pairs = d => FL.pairs(d, S.view.maxBack);
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
  // oceny członków: d.ratings[userId] = 1…5; stare ratingK/ratingZ tylko jako zapas
  const rating = d => {
    const r = Object.values(d.ratings || {}).filter(x => +x > 0);
    return r.length ? r.reduce((a, x) => a + +x, 0) / r.length : ((+d.ratingK || 0) + (+d.ratingZ || 0)) / 2;
  };
  // czas na miejscu w godzinach (przylot → wylot powrotny)
  function hoursThere(c) {
    const t = s => { const [h, m] = s.split(":").map(Number); return h + m / 60; };
    let arr = t(c.o.arr); if (arr < t(c.o.dep)) arr += 24;
    return Math.round(FL.gap(c.o, c.b) * 24 + t(c.b.dep) - arr);
  }
  // link do wyszukiwarki noclegów z datami z wybranego wariantu lotów (przylot po północy = nocleg od dnia wylotu)
  const isoDate = leg => FL.legDate(leg) || "";
  const dm = iso => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : "";
  const plusDays = (iso, n) => { const t = new Date(iso + "T12:00:00Z"); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  function stayLink(site, d, c) {
    const q = encodeURIComponent(`${d.name}, ${(d.country || "").replace(/\s*\(.*\)/, "")}`);
    const ci = isoDate(c.o), co = isoDate(c.b), n = +S.persons || 2;
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
  const fmtFlight = f => `${f.day} ${FL.short(f)} ${f.dep}–${f.arr}`;
  const legLabel = f => `${f.day} ${FL.short(f)}`.trim();

  // ---------- widok: porównanie ----------
  const SORTS = { cost: "Najtaniej", fav: "Oceny", time: "Najdłużej na miejscu", flight: "Najtańsze loty", warm: "Najcieplej" };
  function renderCompare() {
    $("#budget").value = S.budget; $("#persons").value = S.persons;
    const v = S.view;
    $("#sort").innerHTML = Object.entries(SORTS).map(([k, l]) => `<option value="${k}" ${k === v.sort ? "selected" : ""}>${l}</option>`).join("");
    // limit powrotu: daty powrotów ze wszystkich kierunków
    const lims = new Map();
    S.destinations.forEach(d => d.back.forEach(b => { const k = FL.legDate(b); if (k && !lims.has(k)) lims.set(k, legLabel(b)); }));
    if (v.maxBack && !lims.has(v.maxBack)) lims.set(v.maxBack, `${FL.dayOf(v.maxBack)} ${dm(v.maxBack)}`);
    $("#maxBack").innerHTML = `<option value="">bez limitu</option>` + [...lims].sort((a, b) => a[0].localeCompare(b[0])).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join("");
    $("#maxBack").value = v.maxBack || "";
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
    if (!items.length) { list.innerHTML = `<p class="muted">${S.destinations.length ? "Nic tu nie ma. Zmień filtry albo dodaj kierunek." : "Ten wypad nie ma jeszcze kierunków. Dodaj je w Więcej → Dodaj kierunki albo ręcznie niżej."}</p>`; return; }
    Motion.flip(list, ".dest", "id", () => list.innerHTML = items.map(({ d, c }) => {
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
          : `<div class="sub">Brak pary lotów${v.maxBack ? ` z powrotem do ${esc(dm(v.maxBack))}` : ""}.</div>`}
        </div>
      </article>`;
    }).join(""));
  }
  const nights = n => `${n} ${n === 1 ? "noc" : n < 5 ? "noce" : "nocy"}`;
  const stars = n => `<span class="st">${[1, 2, 3, 4, 5].map(i => ic("star", i <= (n || 0) ? "on" : "")).join("")}</span>`;
  // koszty i wariant lotów (w karcie szczegółów)
  function costHTML(d) {
    const c = cost(d);
    if (!c) return `<p class="muted">Brak pasującej pary lotów${S.view.maxBack ? ` przy powrocie najpóźniej ${esc(dm(S.view.maxBack))} (ustawienie w Porównaj)` : ""}.</p>`;
    const over = S.budget > 0 && c.total > S.budget, ps = pairs(d), missing = !d.stay?.perNight;
    return `${ps.length > 1 ? `<label>Wariant lotów (${ps.length})<select data-sh="pair">${ps.map(([i, j, n]) =>
        `<option value="${i},${j}" ${i === c.i && j === c.j ? "selected" : ""}>${esc(legLabel(d.out[i]))} ${esc(d.out[i].dep)} → ${esc(legLabel(d.back[j]))} ${esc(d.back[j].dep)} · ${n} n. · ${zl(pairCost(d, i, j, n))}</option>`).join("")}</select></label>` : ""}
      <div class="rows">
        <span class="k">${ic("out")}Loty</span><span class="muted">${S.persons} os. × ${c.o.price + c.b.price} zł</span><span class="v">${zl(c.flight)}</span>
        <span class="k">${ic("bed")}Nocleg</span><span class="muted">${missing ? "uzupełnij (Booking/Airbnb niżej)" : `${esc(d.stay?.name || "")} ${zl(d.stay.perNight)}/noc`}</span><span class="v">${zl(c.stay)}</span>
        <span class="k">${ic("food")}Na miejscu</span><span class="muted">${d.dailySpend ? zl(d.dailySpend) + "/dzień" : "uzupełnij"}</span><span class="v">${zl(c.spend)}</span>
        <span class="k">${ic("bus")}Dojazdy</span><span class="muted">${d.transferCost ? "lotnisko ↔ miasto" : "uzupełnij"}</span><span class="v">${zl(c.transfer)}</span>
        <span class="k sum">Razem</span><span class="muted">${nights(c.n)} · ${hoursThere(c)} h na miejscu</span><span class="v sum ${over ? "over" : ""}">${zl(c.total)}</span>
        ${S.budget > 0 ? `<span class="k">Zostaje z budżetu</span><span></span><span class="v ${over ? "over" : "ok"}">${zl(S.budget - c.total)}</span>` : ""}
      </div>
      <div class="stars">${members().map(m => `<span>${esc(m.name || m.login)} ${stars(d.ratings?.[m.id])}</span>`).join("")}<span>${ic("pin")} ${d.places?.length || 0} miejsc</span></div>
      ${d.pros || d.cons ? `<div class="pc"><ul class="p">${(d.pros || "").split(",").filter(s => s.trim()).map(p => `<li>${esc(p.trim())}</li>`).join("")}</ul><ul class="c">${(d.cons || "").split(",").filter(s => s.trim()).map(p => `<li>${esc(p.trim())}</li>`).join("")}</ul></div>` : ""}`;
  }
  $("#dest-list").addEventListener("click", e => {
    const el = e.target.closest(".dest"); if (el) openInfo(el.dataset.id, el.querySelector(".thumb"));
  });
  $("#dest-list").addEventListener("keydown", e => {
    const el = e.target.closest(".dest"); if (el && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openInfo(el.dataset.id, el.querySelector(".thumb")); }
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
    const lines = FL.lines, ref = (trip && trip.start) || "";
    openDialog(`<h2>${id ? esc(d.name) : "Nowy kierunek"}</h2>
      <fieldset><legend>Nocleg</legend>
        <div class="grid2">${f("sname", "Nazwa", d.stay.name)}${f("snight", "Cena za noc za wszystkich (zł)", d.stay.perNight || "", "number")}</div>
        ${f("slink", "Link do oferty", d.stay.link, "url")}</fieldset>
      <div class="grid2">${f("daily", "Wydatki na miejscu / dzień (dla wszystkich)", d.dailySpend || "", "number")}${f("transfer", "Dojazdy lotnisko ↔ miasto (razem)", d.transferCost || "", "number")}</div>
      <div class="grid2">${rate("rme", "Twoja ocena", d.ratings?.[who])}</div>
      ${f("pros", "Plusy (po przecinku)", d.pros)}${f("cons", "Minusy (po przecinku)", d.cons)}
      <fieldset><legend>Loty (cena za osobę, jedna linia = jeden lot, godziny lokalne)</legend>
        <p class="muted">Format: <code>pt 20.11 07:20-09:30 68 uwaga</code>. Bez daty wystarczy dzień tygodnia: <code>pt 07:20-09:30 68</code>.</p>
        <div class="grid2"><label>Wyloty z ${esc(origin())}<textarea name="out" rows="4">${esc(lines(d.out))}</textarea></label>
        <label>Powroty<textarea name="back" rows="4">${esc(lines(d.back))}</textarea></label></div></fieldset>
      <fieldset><legend>Miejsce</legend>
        <div class="grid2">${f("name", "Miasto", d.name, "text", "required")}${f("country", "Kraj", d.country)}
        ${f("airport", "Lotnisko", d.airport)}${f("apKm", "Km lotnisko → centrum", d.apKm ?? "", "number")}
        ${f("temp", "Temp. w dzień (°C)", d.temp ?? "", "number")}${f("tz", "Różnica czasu vs Polska (h)", d.tz ?? 0, "number")}</div>
        ${f("photo", "Własne zdjęcie (link, opcjonalnie)", d.photo, "url")}${f("note", "Notatka", d.note)}</fieldset>`,
      async v => {
        const out = FL.parse(v.out, ref), back = FL.parse(v.back, ref);
        if (out.includes(null) || back.includes(null)) { toast("Nie rozumiem którejś linii z lotami, popraw format"); return; }
        const nd = id ? d : { id: uid(), places: [], votes: {} };
        // porównanie w zapisie tekstowym: ten sam lot (z datą) to brak zmian, więc wybrany wariant zostaje
        const flightsChanged = lines(out) !== lines(d.out) || lines(back) !== lines(d.back);
        const ratings = { ...(d.ratings || {}) };
        if (+v.rme) ratings[who] = +v.rme; else delete ratings[who];
        const renamed = v.name !== d.name;
        Object.assign(nd, {
          name: v.name, country: v.country, dailySpend: +v.daily || 0, transferCost: +v.transfer || 0,
          ratings, pros: v.pros, cons: v.cons, temp: v.temp === "" ? null : +v.temp, note: v.note,
          airport: v.airport, apKm: v.apKm === "" ? null : +v.apKm, tz: +v.tz || 0, photo: v.photo,
          out: flightsChanged ? out : d.out, back: flightsChanged ? back : d.back,
          selOut: flightsChanged ? null : d.selOut, selBack: flightsChanged ? null : d.selBack,
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
        if (isNew) { p.id = uid(); d.places.push(p); dropId = p.id; }
        save(); renderMap(); renderPlan(); dropId = null;
        if (isNew && map && p.lat) map.panTo([p.lat, p.lng], { animate: !Motion.RM(), duration: .5 });
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

  let dropId = null;
  function pinIcon(cat, done, drop) {
    const c = CATS[cat] || CATS.other;
    return L.divIcon({ className: "", iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -28],
      html: `<div class="pin-wrap ${drop ? "drop" : ""}" style="--c:${c.color}"><span class="pin-ring"></span><div class="pin" style="background:${c.color};opacity:${done ? .5 : 1}"><svg><use href="#i-${c.icon}"/></svg></div><span class="pin-shadow"></span></div>` });
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
      const m = L.marker([p.lat, p.lng], { icon: pinIcon(p.cat, p.done, p.id === dropId) }).addTo(layer);
      m.bindPopup(`<b>${esc(p.name)}</b><br>${esc(p.note || "")}${p.link ? `<br><a href="${esc(p.link)}" target="_blank">Link</a>` : ""}
        <br><a href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}" target="_blank">Nawiguj</a>`);
      p._m = m;
    });
    $("#place-list").innerHTML = places.length ? places.map(p => `
      <div class="place ${p.done ? "done" : ""} ${p.id === dropId ? "fresh" : ""}" data-pid="${p.id}">
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
    const c = cost(d), days = c ? c.n + 1 : 3, d0 = c ? FL.legDate(c.o) : null;
    const dayName = i => { if (!d0) return ""; const x = plusDays(d0, i); return `${FL.dayOf(x)} ${dm(x)}`; };
    const fmt = p => `<div class="slot"><span class="t">${esc(p.time || "")}</span><span style="color:${(CATS[p.cat] || CATS.other).color}">${ic((CATS[p.cat] || CATS.other).icon)}</span><span class="n">${esc(p.name)}</span>${p.price ? `<span class="muted">${zl(p.price)}</span>` : "<span></span>"}</div>`;
    const by = n => d.places.filter(p => p.day === n).sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
    const unplanned = d.places.filter(p => !p.day);
    const spend = d.places.reduce((s, p) => s + (+p.price || 0), 0);
    $("#plan").innerHTML = `<p class="muted">Przypisz dzień i godzinę w edycji miejsca (zakładka Mapa). Zaplanowane wydatki: <b>${zl(spend)}</b></p>` +
      Array.from({ length: days }, (_, i) => `<div class="day"><h3>Dzień ${i + 1}<span>${dayName(i)}${c && i === 0 ? " · przylot " + c.o.arr : c && i === days - 1 ? " · wylot " + c.b.dep : ""}</span></h3>${by(i + 1).map(fmt).join("") || '<p class="empty">nic jeszcze</p>'}</div>`).join("") +
      (unplanned.length ? `<div class="day"><h3>Bez terminu</h3>${unplanned.map(fmt).join("")}</div>` : "");
  }
  $("#plan-dest").addEventListener("change", e => { currentDest = e.target.value; renderPlan(); });

  // ---------- eksport / import ----------
  const clean = () => JSON.stringify(S, (k, v) => (k === "_m" ? undefined : v), 2);
  $("#export").addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([clean()], { type: "application/json" }));
    const slug = String(trip?.title || "wypad").toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "wypad";
    a.download = `${slug}-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  });
  $("#share").addEventListener("click", async () => {
    const file = new File([clean()], "wypad.json", { type: "application/json" });
    if (navigator.canShare?.({ files: [file] })) { try { await navigator.share({ files: [file], title: trip?.title || "Wypad" }); } catch {} }
    else toast("Udostępnianie niedostępne, użyj Eksportuj");
  });
  $("#import").addEventListener("change", async e => {
    const file = e.target.files[0]; if (!file || !trip) { e.target.value = ""; return; }
    try {
      const j = JSON.parse(await file.text());
      if (!j || !Array.isArray(j.destinations)) throw 0;
      j.version = 3;
      S = normalize(j, members().length); currentDest = S.destinations[0]?.id; history = []; buildDeck(); save(); renderAll(); toast("Zaimportowano");
    } catch { toast("To nie jest plik z tej apki"); }
    e.target.value = "";
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
    if (!(img instanceof HTMLImageElement) || !img.dataset.photo) return;
    img.closest(".sw-photo,.sh-hero,.dest")?.classList.add("has-img");
    // odbitka „wywołuje się”, gdy pierwszy raz leży na wierzchu albo na stole w Porównaj
    if (img.closest(".sw-card:last-child")) Motion.develop(img, "sw:" + img.dataset.photo);
    else if (img.closest(".dest")) Motion.develop(img, "cmp:" + img.dataset.photo);
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
    const from = isoDate(c.o), to = isoDate(c.b);
    if (!from || !to || d.lat == null) return d._wx || null;
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
      const ly = s => `${+s.slice(0, 4) - 1}${s.slice(4)}`;
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
    if (!w) return `<p class="muted">Pogoda pobierze się, gdy będzie internet. Średnio ok. ${"${t}"}°C w dzień.</p>`;
    const dn = t => { if (w.kind === "archive") t = `${+t.slice(0, 4) + 1}${t.slice(4)}`; const dt = new Date(t + "T12:00"); return `${["ndz", "pon", "wt", "śr", "czw", "pt", "sob"][dt.getDay()]} ${t.slice(8, 10)}.${t.slice(5, 7)}`; };
    return `${w.kind === "archive" ? `<p class="muted">Prawdziwa prognoza pojawi się ok. 16 dni przed wyjazdem. Na razie: <b>jak było w tych dniach rok temu</b>.</p>` : `<p class="muted">Prognoza na Wasze dni (aktualizuje się przy otwarciu).</p>`}
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
  async function openInfo(id, from) {
    const d = dest(id), c = pairAny(d), inf = (window.CITY_INFO || {})[d.name] || {};
    const gm = q => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q + ", " + d.name)}`;
    const fl = (f, dir) => `<li><b>${esc(legLabel(f))}</b> ${esc(f.dep)}–${esc(f.arr)} · ${hm(flightMin(f, dir, d.tz || 0))} · <b>${f.price} zł</b>${f.note ? ` <span class="muted">(${esc(f.note)})</span>` : ""}</li>`;
    if (sheet.open) from = null;
    await Motion.vt(() => {
    sheet.innerHTML = `<div class="sh">
      <div class="sh-hero"><div class="gal" id="gal"><div class="gal-s" data-gi="0">${photoImg(d, "sh-img")}</div>
        ${(inf.see || []).map((x, k) => `<div class="gal-s" data-gi="${k + 1}"><img class="sh-img" alt="" data-att="${k}"><span class="gal-cap">${esc(x)}</span></div>`).join("")}</div>
        <button class="sh-x" data-sh="close" aria-label="Zamknij">${ic("x")}</button>
        <div class="gal-dots">${[0, ...(inf.see || [])].map((_, k) => `<i class="${k ? "" : "on"}"></i>`).join("")}</div></div>
      <div class="sh-title"><h2>${esc(d.name)}</h2><span>${esc(d.country)} · ~${d.temp ?? "?"}°C</span></div>
      <div class="sh-body">
        ${inf.about ? `<p class="sh-about">${esc(inf.about)}</p>` : ""}
        <h3>${ic("partly")}Pogoda ${c ? `${esc(legLabel(c.o))} – ${esc(legLabel(c.b))}` : ""}</h3>
        <div id="sh-wx"><p class="muted">Ładuję pogodę…</p></div>
        <h3>${ic("out")}Loty z ${esc(origin())} <span class="muted">cena za osobę</span></h3>
        <div class="sh-cols"><div><div class="muted">Tam</div><ul>${d.out.map(f => fl(f, "out")).join("")}</ul></div>
          <div><div class="muted">Powrót</div><ul>${d.back.map(f => fl(f, "back")).join("")}</ul></div></div>
        <h3>${ic("list")}Koszty dla ${S.persons === 2 ? "dwojga" : S.persons + " os."}</h3>
        <div class="sh-cost">${costHTML(d)}</div>
        ${c ? `<p class="sh-fact">${ic("clock")}<span>Najtańsza para: <b>${zl(c.flight)}</b> dla ${S.persons} os. · ${hoursThere(c)} h na miejscu</span></p>` : ""}
        ${d.airport ? `<p class="sh-fact">${ic("bus")}<span><b>${esc(d.airport)}</b>${d.apKm != null ? ` · ok. ${d.apKm} km do centrum` : ""}${d.apMin ? `${d.apKm != null ? "," : " ·"} ok. ${d.apMin} min` : ""}</span></p>` : ""}
        ${inf.see ? `<h3>${ic("sight")}Co zobaczyć</h3><div class="att">${inf.see.map((x, k) => `<div class="att-i"><button class="att-ph" data-sh="lb" data-k="${k + 1}"><img alt="" data-att="${k}"></button>
          <div><b>${esc(x)}</b><br><a href="${gm(x)}" target="_blank" rel="noopener">Pokaż na mapie ${ic("ext")}</a></div></div>`).join("")}</div>` : ""}
        ${inf.eat ? `<h3>${ic("food")}Czego spróbować</h3><ul class="sh-list">${inf.eat.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
        ${d.note ? `<p class="note">${esc(d.note)}</p>` : ""}
        <div class="actions">
          ${c ? `<a class="btn small" href="${stayLink("booking", d, c)}" target="_blank" rel="noopener">Booking ${ic("ext")}</a><a class="btn small" href="${stayLink("airbnb", d, c)}" target="_blank" rel="noopener">Airbnb ${ic("ext")}</a>` : ""}
          <a class="btn small" href="https://pl.wikipedia.org/wiki/${encodeURIComponent(d.name)}" target="_blank" rel="noopener">Wikipedia ${ic("ext")}</a>
          <button class="btn small" data-sh="fares">${ic("swap")}Odśwież ceny</button>
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
    if (!sheet.open) sheet.showModal();
    sheet.querySelector(".sh-body").scrollTop = 0;
    }, { from }).updateCallbackDone;
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
  // zamykanie: zdjęcie wraca na swoją odbitkę (w Porównaj albo na wierzch talii)
  function closeSheet() {
    const id = sheet.dataset.id;
    const tgt = $("#view-compare").classList.contains("active") ? $(`.dest[data-id="${id}"] .thumb`)
      : deck[0]?.id === id ? $("#deck .sw-card:last-child .sw-photo") : null;
    const t = Motion.vt(() => { sheet.close(); if (tgt) tgt.style.viewTransitionName = "hero"; });
    t.finished.finally(() => { if (tgt) tgt.style.viewTransitionName = ""; });
  }
  sheet.addEventListener("change", e => {
    if (e.target.dataset.sh !== "pair") return;
    const d = dest(sheet.dataset.id);
    [d.selOut, d.selBack] = e.target.value.split(",").map(Number);
    save(); sheet.querySelector(".sh-cost").innerHTML = costHTML(d); renderCompare();
  });
  sheet.addEventListener("click", e => {
    if (e.target === sheet) return closeSheet();
    const lbb = e.target.closest("[data-sh=lb]");
    if (lbb) { const d = dest(sheet.dataset.id); return openLb(d, (window.CITY_INFO || {})[d.name] || {}, +lbb.dataset.k); }
    const b = e.target.closest("[data-sh]"); if (!b) return;
    const id = sheet.dataset.id, d = dest(id), a = b.dataset.sh;
    if (a === "close") return closeSheet();
    if (a === "edit") { sheet.close(); return editDest(id); }
    if (a === "photo") return pickPhoto(id);
    if (a === "fares") return refreshFares(d, b);
    if (a === "map") { sheet.close(); currentDest = id; return show("map"); }
    if (a === "pair") return;
    sheet.close();
    const v = a === "yes" ? 1 : -1;
    if (deck[0]?.id === id && $("#view-swipe").classList.contains("active")) return fling(v);
    const fresh = myVote(d, v); deck = deck.filter(x => x.id !== id); save();
    if (fresh) confirmMatch(d);
    renderAll();
  });

  // ---------- widok: wybieranie w stylu „w prawo / w lewo” ----------
  let deck = [], history = [];
  const pairAny = d => {
    // najtańsza para niezależnie od limitu powrotu (żeby pokazać też kierunki z powrotem we wtorek)
    const c = cost(d); if (c) return c;
    const lim = S.view.maxBack; S.view.maxBack = ""; const c2 = cost(d); S.view.maxBack = lim; return c2;
  };
  function buildDeck() {
    const left = S.destinations.filter(d => !d.votes[who]);
    // kolejność losowa, ale stała w obrębie sesji
    deck = left.sort((a, b) => (hash(a.id + who) - hash(b.id + who)));
  }
  const hash = s => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
  function cardHTML(d) {
    const c = pairAny(d);
    const fl = (f, dir, icon) => `<tr><td>${ic(icon)}</td><td>${esc(legLabel(f))} · ${esc(f.dep)} → ${esc(f.arr)}</td><td class="dur">${hm(flightMin(f, dir, d.tz || 0)).replace(" min", "").replace(" h ", " h ")}</td><td class="pr">${f.price} zł</td></tr>`;
    const notes = c ? [c.o.note, c.b.note, d.note].filter(Boolean) : [d.note].filter(Boolean);
    const late = c && !FL.within(c.b, S.view.maxBack);
    return `<div class="sw-card" data-id="${d.id}">
      <div class="sw-photo"><span class="sw-fallback">brak zdjęcia</span>${photoImg(d, "sw-img")}
        <div class="votes">${voteTags(d)}</div>
        <button class="sw-i" data-info="${d.id}" aria-label="Szczegóły">${ic("info")}</button>
        <div class="stamp yes">jedziemy!</div><div class="stamp no">nie</div></div>
      <div class="chin">
        <div class="chin-h"><h2>${esc(d.name)}</h2><small>${esc(d.country)} · ~${d.temp ?? "?"}°C</small></div>
        ${c ? `<table class="fl">${fl(c.o, "out", "out")}${fl(c.b, "back", "in")}</table>
        <div class="facts">${hoursThere(c)} h na miejscu · ${c.n} ${c.n === 1 ? "noc" : c.n < 5 ? "noce" : "nocy"}${d.airport ? `<span class="opt"> · ${esc((d.airport.match(/\(([A-Z]{3})/) || [, "lotnisko"])[1])}${d.apKm != null ? ` ~${d.apKm} km do centrum` : ""}</span>` : ""}${pairs(d).length > 1 ? `<span class="opt"> · ${pairs(d).length} warianty</span>` : ""}${late ? ` · <span class="warn">powrót dopiero ${esc(legLabel(c.b))}</span>` : ""}</div>
        ${notes.map(n => `<div class="sw-note">${esc(n)}</div>`).join("")}
        <div class="plate"><span>loty dla ${S.persons === 2 ? "dwojga" : S.persons + " os."}</span><b>${zl(c.flight)}</b></div>` : `<p class="facts">Brak pasującej pary lotów.</p>`}
      </div>
    </div>`;
  }
  function renderSwipe() {
    const box = $("#deck");
    const matches = S.destinations.filter(isMatch);
    const n = S.destinations.length;
    $("#sw-count").textContent = !n ? "Brak kierunków" : deck.length ? `Odbitka ${n - deck.length + 1} z ${n}` : `Wszystkie ${n} przejrzane`;
    $("#swipe-status").innerHTML = matches.length ? `Wspólne: <b>${matches.map(d => esc(d.name)).join(", ")}</b>` : "Jeszcze nic wspólnego.";
    $("#sw-undo").disabled = !history.length;
    if (!deck.length) {
      $("#sw-info").disabled = true;
      const mine = S.destinations.filter(d => d.votes[who] === 1);
      box.innerHTML = !n ? `<div class="sw-empty">
        <h2>Pusto</h2>
        <p>Ten wypad nie ma jeszcze kierunków.</p>
        <button class="btn primary wide" data-go="add">Dokąd tanio?</button>
      </div>` : `<div class="sw-empty">
        <h2>Przejrzane!</h2>
        <p>Twoje na tak: <b>${mine.map(d => esc(d.name)).join(", ") || "nic"}</b></p>
        <p>Wspólne: <b>${matches.map(d => esc(d.name)).join(", ") || "jeszcze nic. Poczekajmy na głosy osób z wypadu."}</b></p>
        <button class="btn primary wide" data-go="fav">Porównaj te na tak</button>
        <button class="btn wide" data-go="reset">Przejrzyj jeszcze raz</button>
      </div>`;
      return;
    }
    box.innerHTML = deck.slice(0, 2).reverse().map(cardHTML).join("");
    $("#sw-info").disabled = false;
    attachDrag(box.lastElementChild);
  }
  function matchMoment(d, lead) {
    const c = pairAny(d);
    const ini = G.initials(members()), marks = ini.length >= 5 ? [...ini.slice(0, 3), `+${ini.length - 3}`] : ini;
    Motion.celebrate({ name: d.name, photo: imgFail.has(d.id) ? "" : photoOf(d), marks,
      line: `${lead || G.matchLine([])}${c ? ` · loty dla ${S.persons === 2 ? "dwojga" : S.persons + " os."} ${zl(c.flight)}` : ""}`,
      onCompare: () => { S.view.onlyFav = true; save(); show("compare"); } });
  }
  function vote(v) {
    const d = deck.shift(); if (!d) return;
    const fresh = myVote(d, v); history.push(d); save();
    renderSwipe();
    // następna odbitka prostuje się i wychodzi na wierzch
    const top = $("#deck").lastElementChild;
    if (top?.classList.contains("sw-card") && !Motion.RM())
      top.animate([{ transform: "rotate(-2.6deg) translate(-4px,6px) scale(.98)" }, { transform: "none" }], { duration: 380, easing: Motion.EASE });
    if (fresh) confirmMatch(d);
  }
  function fling(v) {
    const top = $("#deck").lastElementChild;
    if (!top || !top.classList.contains("sw-card")) return;
    const st = top.querySelector(v > 0 ? ".stamp.yes" : ".stamp.no"); if (st) st.style.opacity = 1;
    top.style.transition = "transform .34s cubic-bezier(.5,0,.75,0), opacity .34s ease-in";
    top.style.transform = `translate(${v * 135}%, -4%) rotate(${v * 22}deg)`;
    top.style.opacity = "0";
    setTimeout(() => vote(v), 260);
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
      if (Math.abs(dx) < 8) openInfo(el.dataset.id, el.querySelector(".sw-photo"));
    };
    el.addEventListener("pointerup", end); el.addEventListener("pointercancel", end);
  }
  $("#sw-yes").addEventListener("click", () => fling(1));
  $("#sw-info").addEventListener("click", () => deck[0] && openInfo(deck[0].id, $("#deck .sw-card:last-child .sw-photo")));
  $("#sw-no").addEventListener("click", () => fling(-1));
  $("#sw-undo").addEventListener("click", () => {
    const d = history.pop(); if (!d) return;
    delete d.votes[who]; unmatch(d); deck.unshift(d); save(); renderSwipe();
    const top = $("#deck").lastElementChild;
    if (top && !Motion.RM()) top.animate([{ transform: "translateX(-120%) rotate(-18deg)", opacity: 0 }, { transform: "none", opacity: 1 }], { duration: 420, easing: Motion.EASE });
  });
  $("#deck").addEventListener("click", e => {
    const g = e.target.closest("[data-go]"); if (!g) return;
    if (g.dataset.go === "fav") { S.view.onlyFav = true; S.view.hideRejected = true; save(); show("compare"); }
    if (g.dataset.go === "reset") { S.destinations.forEach(d => { delete d.votes[who]; unmatch(d); }); history = []; save(); buildDeck(); renderSwipe(); }
    if (g.dataset.go === "add") addDests();
  });
  addEventListener("keydown", e => {
    if (!$("#view-swipe").classList.contains("active") || dlg.open || sheet.open) return;
    if ((e.key === "ArrowUp" || e.key === "i") && deck[0]) openInfo(deck[0].id);
    if (e.key === "ArrowRight") fling(1);
    if (e.key === "ArrowLeft") fling(-1);
    if (e.key === "Backspace") $("#sw-undo").click();
  });

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
          <td>${c ? `<select class="cell" data-k="pair">${ps.map(([i, j, n]) => `<option value="${i},${j}" ${i === c.i && j === c.j ? "selected" : ""}>${esc(legLabel(d.out[i]))} ${esc(d.out[i].dep)} → ${esc(legLabel(d.back[j]))} ${esc(d.back[j].dep)} (${n} n.)</option>`).join("")}</select>` : '<span class="muted">brak pary lotów' + (S.view.maxBack ? " do " + esc(dm(S.view.maxBack)) : "") + "</span>"}</td>
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
  const ORDER = ["swipe", "compare", "table", "map", "plan", "more"];
  let current = null;
  function show(view) {
    // przejście między zakładkami: treść przesuwa się w stronę wybranej zakładki
    const dir = current && ORDER.indexOf(view) < ORDER.indexOf(current) ? "back" : "fwd";
    if (current && current !== view) return Motion.vt(() => showNow(view), { dir });
    showNow(view);
  }
  function showNow(view) {
    current = view;
    document.querySelectorAll(".view").forEach(v => v.classList.toggle("active", v.id === "view-" + view));
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.view === view));
    if (view === "map") { initMap(); renderMap(); setTimeout(() => { map.invalidateSize(); focusDest(); }, 50); }
    if (view === "plan") renderPlan();
    if (view === "more") { updateCacheInfo(); updatePhotoInfo(); renderTripPanel(); }
    if (view === "compare") renderCompare();
    if (view === "swipe") { if (!deck.length) buildDeck(); renderSwipe(); loadPhotos(); }
    if (view === "table") renderTable();
    try { localStorage.setItem("wypad-tab", view); } catch {}
    setAdding(false);
  }
  document.querySelector(".tabs").addEventListener("click", e => { const b = e.target.closest("button"); if (b) show(b.dataset.view); });
  function renderHead() {
    $("#trip-title").textContent = trip ? trip.title : "";
  }
  function renderAll() {
    renderHead();
    renderCompare(); renderMap(); renderPlan();
    if ($("#view-table").classList.contains("active")) renderTable();
    if ($("#view-swipe").classList.contains("active")) renderSwipe();
  }

  // ---------- wspólny wypad: synchronizacja z grupą (Supabase, sync.js) ----------
  // wspólne: budżet, osoby, wspólne kierunki (cfg.matched), kierunki (z kosztami i ocenami), głosy i miejsca; prywatne: filtry, zdjęcia w pamięci
  const shared = d => {
    const o = {};
    for (const [k, v] of Object.entries(d)) {
      if (k[0] === "_" || k === "votes" || k === "places") continue;
      if (k === "photo" && typeof v === "string" && v.startsWith("data:") && v.length > 150000) continue;
      o[k] = v;
    }
    return o;
  };
  function snapshot() {
    const it = { cfg: { budget: S.budget, persons: S.persons, matched: S.matched } };
    S.destinations.forEach(d => {
      it["d:" + d.id] = shared(d);
      Object.entries(d.votes || {}).forEach(([p, v]) => { if (v) it[`v:${d.id}:${p}`] = v; });
      (d.places || []).forEach(p => { const { _m, ...q } = p; it[`p:${d.id}:${p.id}`] = q; });
    });
    return it;
  }
  function applyRemote(remote) {
    if (!trip) return;
    const before = new Set(S.destinations.filter(isMatch).map(d => d.id));
    const yesBefore = new Map(S.destinations.map(d => [d.id, new Set(Object.keys(d.votes).filter(k => d.votes[k] === 1))]));
    const rank = k => k === "cfg" ? 0 : k.startsWith("d:") ? 1 : 2;
    let matched = null, stale = false;     // stale: głos od kogoś spoza znanej listy członków
    Object.keys(remote).sort((a, b) => rank(a) - rank(b)).forEach(k => {
      const v = remote[k], [t, id, x] = k.split(":");
      if (k === "cfg") { if (v) { S.budget = v.budget ?? S.budget; S.persons = v.persons ?? S.persons; if (Array.isArray(v.matched)) matched = v.matched; } return; }
      let d = dest(id);
      if (t === "d") {
        if (v === null) { S.destinations = S.destinations.filter(q => q.id !== id); deck = deck.filter(q => q.id !== id); return; }
        if (d) Object.assign(d, v); else S.destinations.push({ out: [], back: [], stay: {}, ...v, votes: {}, places: [] });
        return;
      }
      if (!d) return;
      if (t === "v") { if (v) d.votes[x] = v; else delete d.votes[x]; if (v && !members().some(m => m.id === x)) stale = true; }
      if (t === "p") {
        const i = d.places.findIndex(q => q.id === x);
        if (v === null) { if (i >= 0) d.places.splice(i, 1); }
        else if (i >= 0) Object.assign(d.places[i], v); else d.places.push(v);
      }
    });
    // wspólne kierunki: lista z serwera plus moje jeszcze niewysłane, jeśli wszyscy dalej są na tak
    if (matched) S.matched = [...new Set([...matched, ...S.matched.filter(id => { const d = dest(id); return d && allYes(d); })])];
    const fresh = S.destinations.filter(d => isMatch(d) && !before.has(d.id));
    try { localStorage.setItem(tripKey(trip.id), JSON.stringify(S)); } catch {}
    // głosy innych: kierunki, na które już zagłosowałem, nie wracają do talii; nowe kierunki dochodzą na koniec
    deck = deck.filter(d => dest(d.id) && !d.votes[who]);
    const inDeck = new Set(deck.map(d => d.id));
    S.destinations.forEach(d => { if (!d.votes[who] && !inDeck.has(d.id)) deck.push(d); });
    if (!currentDest || !dest(currentDest)) currentDest = S.destinations[0]?.id;
    renderAll();
    if ($("#view-swipe").classList.contains("active")) renderSwipe();
    if (!fresh.length) { if (stale) syncTrip(); return; }
    const d0 = fresh[0], was = yesBefore.get(d0.id) || new Set();
    const newly = members().filter(m => m.id !== who && d0.votes[m.id] === 1 && !was.has(m.id));
    const line = G.matchLine(newly);
    // telefon w kieszeni: pokaż match, gdy apka znów będzie na ekranie
    const show = () => { if (trip && dest(d0.id)) { if (S.matched.includes(d0.id)) matchMoment(d0, line); else confirmMatch(d0, line); } };
    if (!document.hidden) show();
    else document.addEventListener("visibilitychange", function once() { if (!document.hidden) { document.removeEventListener("visibilitychange", once); show(); } });
    fresh.filter(d => d !== d0 && !S.matched.includes(d.id)).forEach(d => confirmMatch(d, null, true));
  }
  // match policzony tutaj: najpierw świeża lista członków (ktoś mógł właśnie dołączyć), dopiero potem cfg.matched i oklaski
  async function confirmMatch(d, line, quiet) {
    const id = trip && trip.id;
    if (navigator.onLine) await syncTrip();
    if (!trip || trip.id !== id || !dest(d.id)) return;
    if (!allYes(d)) { renderAll(); return; }
    if (remember(d)) save();
    renderAll();
    if (!quiet) matchMoment(d, line);
  }
  let syncState = "off";
  function net() {
    const n = $("#net"), bad = !navigator.onLine || (syncState === "error");
    n.textContent = !navigator.onLine ? "offline" : bad ? "bez synchr." : "";
    n.classList.toggle("off", bad);
  }
  addEventListener("online", net); addEventListener("offline", net); net();

  // ---------- aktywny wypad: otwieranie z listy i powrót ----------
  const html = document.documentElement;
  function closeOverlays() {
    if (sheet.open) sheet.close();
    if (dlg.open) dlg.close();
    document.getElementById("match")?.remove();
    setAdding(false);
  }
  // członkowie i tytuł prosto z serwera (lista w trips.js trzyma je aktualne)
  async function syncTrip() {
    const id = trip && trip.id; if (!id) return;
    const l = await WypadTrips.refresh();
    const t = l.find(x => x.id === id);
    if (!trip || trip.id !== id || !t) return;
    trip = t;
    renderAll(); if (current === "more") renderTripPanel();
  }
  window.openTrip = t => {
    if (!t || !WypadAuth.user) return;
    closeOverlays();
    trip = t; who = WypadAuth.user.id;
    let s = null; try { s = JSON.parse(localStorage.getItem(tripKey(t.id))); } catch {}
    S = normalize(s, (t.members || []).length);
    currentDest = S.destinations[0]?.id; history = []; deck = [];
    html.classList.remove("in-trips");
    window.scrollTo(0, 0);
    buildDeck();
    let tab = "swipe"; try { tab = localStorage.getItem("wypad-tab") || "swipe"; } catch {}
    if (!ORDER.includes(tab) || tab === "more" || (tab === "table" && innerWidth < 760)) tab = "swipe";
    current = null;
    renderAll(); show(tab);
    WypadSync.open(t.id);
    syncTrip();
  };
  function leaveView() {
    closeOverlays();
    WypadSync.close();
    trip = null; who = ""; S = normalize(null); deck = []; history = []; currentDest = null;
  }
  function backToList() { leaveView(); window.WypadTripsScreen?.show(); }
  $("#back").addEventListener("click", backToList);
  // wypad zniknął z mojego konta (usunięty albo ktoś mnie wypisał)
  function forget(id) { try { localStorage.removeItem("wypad-sync-" + id); localStorage.removeItem(tripKey(id)); } catch {} }

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (navigator.storage?.persist) navigator.storage.persist();
  WypadSync.init({
    snapshot, apply: applyRemote,
    onStatus: st => { syncState = st; net(); },
    onGone: id => {
      try { localStorage.removeItem("wypad-sync-" + id); } catch {}
      toast("Nie jesteś już w tym wypadzie", 3200);
      if (trip && trip.id === id) backToList(); else WypadTrips.refresh();
    },
  });

  // ---------- Więcej: wypad, osoby, dodawanie kierunków ----------
  function renderTripPanel() {
    if (!trip) return;
    const t = trip;
    if (!$("#tp-form").contains(document.activeElement)) {
      $("#tp-title").value = t.title || ""; $("#tp-start").value = t.start || ""; $("#tp-end").value = t.end || "";
    }
    const ini = G.initials(t.members || []);
    $("#tp-people").innerHTML = (t.members || []).map((m, i) => `<li class="wz-person"><b>${esc(ini[i])}</b><span>${esc(m.name || m.login)}${m.id === who ? " (Ty)" : ""}</span><small>${esc(m.login)}${m.id === t.createdBy ? " · założył(a)" : ""}</small></li>`).join("");
    $("#tp-remove").hidden = t.createdBy !== who;
  }
  $("#tp-form").addEventListener("submit", async e => {
    e.preventDefault();
    if (!trip) return;
    const id = trip.id, err = $("#tp-err"), btn = $("#tp-save");
    const title = $("#tp-title").value.trim(), start = $("#tp-start").value || null, end = $("#tp-end").value || null;
    err.textContent = "";
    if (!title) { err.textContent = "Wpisz tytuł wypadu"; return $("#tp-title").focus(); }
    if (start && end && end < start) { err.textContent = "Koniec nie może być przed początkiem"; return $("#tp-end").focus(); }
    if (!navigator.onLine) { err.textContent = "Zmiana wypadu wymaga internetu"; return; }
    btn.disabled = true; btn.textContent = "Zapisuję…";
    try {
      await WypadTrips.update(id, { title, start, end, origin: trip.origin });
      await syncTrip(); toast("Zapisano");
    } catch { err.textContent = "Nie udało się zapisać. Spróbuj jeszcze raz."; }
    btn.disabled = false; btn.textContent = "Zapisz zmiany";
  });
  {
    const inp = $("#tp-login"), list = $("#tp-sugg"), err = $("#tp-e-login");
    let t = null, q = 0;
    const hide = () => { list.hidden = true; list.innerHTML = ""; inp.setAttribute("aria-expanded", "false"); };
    inp.addEventListener("input", () => {
      err.textContent = ""; clearTimeout(t);
      const v = inp.value.trim();
      if (v.length < 2 || !navigator.onLine) return hide();
      t = setTimeout(async () => {
        const my = ++q;
        let rows = [];
        try { rows = await WypadTrips.findProfiles(v); } catch {}
        if (my !== q || inp.value.trim() !== v) return;
        const have = new Set(members().map(m => m.id));
        rows = (rows || []).filter(p => !have.has(p.id));
        if (!rows.length) return hide();
        list.innerHTML = rows.map(p => `<li role="option" data-login="${esc(p.login)}"><b>${esc(p.name || p.login)}</b><span>${esc(p.login)}</span></li>`).join("");
        list.hidden = false; inp.setAttribute("aria-expanded", "true");
      }, 250);
    });
    list.addEventListener("mousedown", e => e.preventDefault());
    list.addEventListener("click", e => {
      const li = e.target.closest("[data-login]"); if (!li) return;
      inp.value = li.dataset.login; hide(); $("#tp-add-f").requestSubmit();
    });
    inp.addEventListener("blur", () => setTimeout(hide, 120));
    inp.addEventListener("keydown", e => { if (e.key === "Escape") hide(); });
    $("#tp-add-f").addEventListener("submit", async e => {
      e.preventDefault();
      if (!trip) return;
      const login = inp.value.trim().toLowerCase(), btn = $("#tp-add");
      hide(); err.textContent = "";
      if (!login) return;
      if (members().some(m => m.login === login)) { err.textContent = "Ta osoba już jest w wypadzie"; return; }
      if (!navigator.onLine) { err.textContent = "Dodawanie osób wymaga internetu"; return; }
      btn.disabled = true;
      try {
        const p = await WypadTrips.addMember(trip.id, login);
        inp.value = "";
        await syncTrip();
        toast(`Dodano: ${(p && (p.name || p.login)) || login}`);
      } catch (x) { err.textContent = x.code === "no_such_login" ? "Nie ma takiego loginu" : "Nie udało się dodać. Spróbuj jeszcze raz."; }
      btn.disabled = false;
    });
  }
  $("#tp-invite").addEventListener("click", async () => {
    if (!trip) return;
    if (!navigator.onLine) return toast("Link-zaproszenie wymaga internetu");
    const title = trip.title;
    let url;
    try { url = await WypadTrips.invite(trip.id); } catch { return toast("Nie udało się przygotować linku"); }
    if (navigator.share) {
      try { await navigator.share({ title, text: `Dołącz do wypadu „${title}”`, url }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); toast("Link skopiowany. Wyślij go osobom z wypadu", 3000); }
    catch { prompt("Skopiuj link i wyślij go osobom z wypadu:", url); }
  });
  $("#tp-leave").addEventListener("click", async () => {
    if (!trip) return;
    const id = trip.id;
    if (!confirm(`Opuścić wypad „${trip.title}”? Zniknie z Twojej listy, a Twoje głosy zostaną u reszty.`)) return;
    if (!navigator.onLine) return toast("Opuszczenie wypadu wymaga internetu");
    WypadSync.close();
    try { await WypadTrips.leave(id); }
    catch { if (trip && trip.id === id) WypadSync.open(id); return toast("Nie udało się opuścić wypadu. Spróbuj jeszcze raz."); }
    forget(id); backToList(); toast("Opuszczono wypad");
  });
  $("#tp-remove").addEventListener("click", async () => {
    if (!trip || trip.createdBy !== who) return;
    const id = trip.id, title = trip.title;
    const typed = prompt(`Usunięcie jest nieodwracalne: wypad zniknie u wszystkich osób. Wpisz tytuł „${title}”, żeby potwierdzić.`);
    if (typed === null) return;
    if (typed.trim() !== title.trim()) return toast("Tytuł się nie zgadza, wypad został");
    if (!navigator.onLine) return toast("Usunięcie wypadu wymaga internetu");
    WypadSync.close();
    try { await WypadTrips.remove(id); }
    catch { if (trip && trip.id === id) WypadSync.open(id); return toast("Nie udało się usunąć wypadu. Spróbuj jeszcze raz."); }
    forget(id); backToList(); toast("Wypad usunięty");
  });
  // „Dokąd tanio?” dla tego wypadu; kreator dopisuje kierunki do localStorage, potem wczytujemy je z powrotem
  function addDests() {
    if (!trip) return;
    if (!navigator.onLine) return toast("Dodawanie kierunków wymaga internetu");
    const id = trip.id;
    WypadWizard.open({ tripId: id, onDone: () => {
      if (!trip || trip.id !== id) return;
      let s = null; try { s = JSON.parse(localStorage.getItem(tripKey(id))); } catch {}
      if (!s) return;
      S = normalize(s, members().length);
      if (!currentDest || !dest(currentDest)) currentDest = S.destinations[0]?.id;
      history = []; buildDeck(); renderAll();
      WypadSync.schedule(); loadPhotos();
    } });
  }
  $("#tp-dests").addEventListener("click", addDests);

  // ---------- „Odśwież ceny”: Ryanair jeszcze raz dla dat wypadu i lotniska kierunku ----------
  const apCodes = d => [...new Set(String(d.airportCode || d.airport || "").match(/\b[A-Z]{3}\b/g) || [])];
  async function refreshFares(d, btn) {
    if (!trip || !d) return;
    if (!navigator.onLine) return toast("Odświeżenie cen wymaga internetu");
    const codes = apCodes(d);
    if (!codes.length) return toast("Brak kodu lotniska. Wpisz go w edycji, np. „Sofia (SOF)”", 3200);
    if (!trip.start || !trip.end) return toast("Ustaw daty wypadu w Więcej → Wypad", 3000);
    // zakres jak przy wyszukiwaniu: daty wypadu, poszerzone o daty lotów, które już są
    const span = (base, legs) => { const a = [base, ...legs.map(l => l.date).filter(Boolean)].sort(); return [a[0], a[a.length - 1]]; };
    const [outFrom, outTo] = span(trip.start, d.out), [backFrom, backTo] = span(trip.end, d.back);
    const id = d.id, label = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = `${ic("swap")}Sprawdzam…`;
    let offers;
    try { offers = await WypadFares.search({ origin: origin(), outFrom, outTo, backFrom, backTo }); }
    catch (e) { offers = null; toast(e && e.message === "timeout" ? "Ryanair nie odpowiada. Spróbuj później." : "Nie udało się pobrać cen. Spróbuj później.", 3000); }
    btn.disabled = false; btn.innerHTML = label;
    if (!offers) return;
    const cur = dest(id); if (!cur || !trip) return;
    const hit = offers.filter(o => codes.includes(o.code)).sort((a, b) => a.total - b.total);
    if (!hit.length) return toast("Ryanair nie ma teraz lotów do tego miasta w te dni", 3000);
    const multi = new Set(hit.map(o => o.code)).size > 1;
    const leg = (l, code) => ({ day: l.day, dep: l.dep, arr: l.arr, price: l.price, note: multi ? code : "", date: l.date });
    const uniq = arr => { const seen = new Set(); return arr.filter(l => { const k = `${l.date} ${l.dep} ${l.arr} ${l.note}`; if (seen.has(k)) return false; seen.add(k); return true; }); };
    const key = l => l ? `${l.date || l.day} ${l.dep} ${l.arr}` : "";
    const so = key(cur.out[cur.selOut]), sb = key(cur.back[cur.selBack]);
    const out = uniq(hit.map(o => leg(o.out, o.code))), back = uniq(hit.map(o => leg(o.back, o.code)));
    const oi = out.findIndex(l => key(l) === so), bi = back.findIndex(l => key(l) === sb);
    Object.assign(cur, { out, back, selOut: oi >= 0 ? oi : 0, selBack: bi >= 0 ? bi : 0 });
    save(); renderAll();
    toast(`Ceny odświeżone: od ${zl(hit[0].total)} za osobę w obie strony`, 3000);
    if (sheet.open && sheet.dataset.id === id) openInfo(id);
  }

  // ---------- konto: ekran logowania i wylogowanie ----------
  {
    let mode = "in", busy = false;
    const f = $("#lg-form"), err = $("#lg-err"), go = $("#lg-go");
    const FIELDS = { login: ["#lg-login", "#lg-e-login"], name: ["#lg-name", "#lg-e-name"], password: ["#lg-pass", "#lg-e-password"], pass2: ["#lg-pass2", "#lg-e-pass2"] };
    const clearErr = k => {
      const [i, e] = FIELDS[k].map(x => $(x));
      e.textContent = ""; i.removeAttribute("aria-invalid"); i.removeAttribute("aria-describedby");
    };
    const clearAll = () => { Object.keys(FIELDS).forEach(clearErr); err.textContent = ""; };
    const fieldErr = (k, msg) => {
      const [i, e] = FIELDS[k].map(x => $(x));
      e.textContent = msg; i.setAttribute("aria-invalid", "true"); i.setAttribute("aria-describedby", e.id); return i;
    };
    Object.keys(FIELDS).forEach(k => $(FIELDS[k][0]).addEventListener("input", () => { clearErr(k); err.textContent = ""; }));
    const label = () => mode === "in" ? "Zaloguj" : "Załóż konto";
    const setMode = m => {
      if (busy) return;
      mode = m;
      $("#lg-t-in").setAttribute("aria-selected", m === "in"); $("#lg-t-up").setAttribute("aria-selected", m === "up");
      $("#lg-name-row").hidden = $("#lg-pass2-row").hidden = m === "in";
      $("#lg-hint").hidden = m === "in";
      $("#lg-pass").autocomplete = m === "in" ? "current-password" : "new-password";
      go.textContent = label(); clearAll();
    };
    document.querySelectorAll("#login [data-mode]").forEach(b => b.addEventListener("click", () => setMode(b.dataset.mode)));
    f.addEventListener("submit", async e => {
      e.preventDefault();
      if (busy) return;
      const v = { login: $("#lg-login").value, name: $("#lg-name").value, password: $("#lg-pass").value };
      clearAll();
      if (mode === "up" && v.password !== $("#lg-pass2").value) { fieldErr("pass2", "Hasła się różnią").focus(); return; }
      busy = true; go.disabled = true; go.textContent = "Chwileczkę…";
      try {
        await (mode === "in" ? WypadAuth.signIn(v) : WypadAuth.signUp(v));
        $("#lg-pass").value = $("#lg-pass2").value = "";
      } catch (x) {
        const k = { login: "login", name: "name", password: "password" }[x.field];
        if (k) fieldErr(k, x.message).focus(); else err.textContent = x.message || "Coś poszło nie tak";
      }
      busy = false; go.disabled = false; go.textContent = label();
    });
    // wylogowanie (z listy wypadów): zamknij wypad i synchronizację, wróć do logowania
    WypadAuth.onChange(u => { if (!u) { leaveView(); setMode("in"); $("#lg-login").value = ""; } });
  }
  addEventListener("online", loadPhotos);
})();
