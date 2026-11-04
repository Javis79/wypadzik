/* Przeniesienie listopadowego wyjazdu sprzed kont (localStorage „wypad-v3”, głosy K = Krystian, Z = Zuzia) na wypad w koncie.
   Stary klucz zostaje nietknięty, dopóki nowy wypad nie zsynchronizuje się z serwerem; potem przechodzi pod „wypad-v3-old”.
   Telefon sparowany kodem („wypad-sync”) najpierw pobiera ostatni stan pary starym wypad_pull (klucz publishable, bez logowania). */
(() => {
  const G = window.WypadGroup;
  const V3 = "wypad-v3", OLD = "wypad-v3-old", PAIR = "wypad-sync", MINE = "wypad-legacy-trip";
  const TRIP = { title: "Wypad we dwoje", start: "2026-11-19", end: "2026-11-24", origin: "KRK" };
  const LETTERS = ["K", "Z"];
  const NAMES = { K: "Krystian", Z: "Zuzia" };
  const other = l => (l === "K" ? "Z" : "K");
  const get = k => { try { return localStorage.getItem(k); } catch { return null; } };
  const json = k => { try { return JSON.parse(get(k)); } catch { return null; } };
  const readOld = () => { const s = json(V3); return s && typeof s === "object" && Array.isArray(s.destinations) ? s : null; };
  const pending = () => !!readOld() && get(OLD) == null;
  const pair = () => { const p = json(PAIR); return p && typeof p === "object" && typeof p.room === "string" && p.room ? p : null; };

  // ---------- konwersja ----------
  // dane w kształcie SAMPLE_DATA dla „wypad-trip-<id>”: głosy mojej litery na konto, drugiej w legacy, wspólne tak w matched
  function convert(old, letter, userId) {
    const o = other(letter);
    const data = JSON.parse(JSON.stringify(old));
    const legacy = {}, matched = new Set(Array.isArray(data.matched) ? data.matched : []);
    let theirs = 0;
    data.version = 3;
    data.destinations = (data.destinations || []).filter(d => d && typeof d === "object").map(d => {
      const v = d.votes && typeof d.votes === "object" ? d.votes : {};
      const votes = {};
      const mine = G.cleanVote(v[letter]), them = G.cleanVote(v[o]);
      if (mine) votes[userId] = mine;
      if (them && G.safeId(d.id)) { (legacy[o] = legacy[o] || {})[d.id] = them; theirs++; }
      if (v.K === 1 && v.Z === 1 && G.safeId(d.id)) matched.add(d.id);
      return { ...d, votes, places: Array.isArray(d.places) ? d.places : [] };
    });
    data.matched = [...matched];
    data.legacy = legacy;
    return { data, items: data.destinations.length, legacyVotes: theirs };
  }

  // litery, które wciąż czekają na właściciela
  const letters = data => LETTERS.filter(l => data && data.legacy && data.legacy[l] && typeof data.legacy[l] === "object");

  // oczekujące głosy litery przechodzą na konto (nie nadpisują głosów oddanych już z konta), litera znika z legacy
  function claim(data, letter, userId) {
    const l = data && data.legacy && data.legacy[letter];
    if (!l) return data;
    for (const d of data.destinations || []) {
      const v = G.cleanVote(l[d.id]);
      d.votes = d.votes || {};
      if (v && !G.cleanVote(d.votes[userId])) d.votes[userId] = v;
    }
    delete data.legacy[letter];
    return data;
  }

  // ten wypad przeniósł już ktoś na drugim telefonie: dołącz głosy mojej litery z tego telefonu (pierwszeństwo przed legacy)
  function merge(data, old, letter, userId) {
    const c = convert(old, letter, userId).data;
    const mine = new Map(c.destinations.map(d => [d.id, d.votes[userId]]));
    for (const d of data.destinations || []) {
      const v = mine.get(d.id);
      d.votes = d.votes || {};
      if (v && !G.cleanVote(d.votes[userId])) d.votes[userId] = v;
    }
    claim(data, letter, userId);
    const have = new Set((data.destinations || []).map(d => d.id));
    data.matched = [...new Set([...(data.matched || []), ...c.matched.filter(id => have.has(id))])];
    return data;
  }

  // ---------- stan pary ze starego serwera ----------
  async function pullPair(room) {
    const r = await fetch(`${WypadAuth.URL}/rest/v1/rpc/wypad_pull`, {
      method: "POST",
      headers: { apikey: WypadAuth.KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ p_room: room, p_since: null }),
    });
    if (r.status === 404) return [];          // stare funkcje już usunięte: zostaje stan z telefonu
    if (!r.ok) throw new Error(`wypad_pull ${r.status}`);
    const rows = await r.json();
    return Array.isArray(rows) ? rows : [];
  }
  // jak dawne applyRemote: wpisy nowsze niż znane temu telefonowi, najpierw cfg, potem kierunki, potem głosy i miejsca
  function overlay(s, rows, ts) {
    ts = ts && typeof ts === "object" ? ts : {};
    const remote = {};
    for (const r of rows) {
      if (!r || typeof r.key !== "string") continue;
      if (ts[r.key] && r.updated_at <= ts[r.key]) continue;
      remote[r.key] = r.value;
    }
    const dest = id => s.destinations.find(d => d.id === id);
    const rank = k => k === "cfg" ? 0 : k.startsWith("d:") ? 1 : 2;
    Object.keys(remote).sort((a, b) => rank(a) - rank(b)).forEach(k => {
      const v = remote[k], parts = k.split(":");
      if (k === "cfg") { if (v && typeof v === "object") { s.budget = v.budget ?? s.budget; s.persons = v.persons ?? s.persons; } return; }
      if (parts.length !== (parts[0] === "d" ? 2 : 3)) return;
      const [t, rawId, x] = parts, id = G.safeId(rawId);
      if (!id) return;
      const d = dest(id);
      if (t === "d") {
        if (v === null) { s.destinations = s.destinations.filter(q => q.id !== id); return; }
        if (!v || typeof v !== "object" || v.id !== id) return;
        const { votes, places, ...rest } = v;
        if (d) Object.assign(d, rest); else s.destinations.push({ ...rest, votes: {}, places: [] });
        return;
      }
      if (!d) return;
      if (t === "v" && LETTERS.includes(x)) {
        d.votes = d.votes && typeof d.votes === "object" ? d.votes : {};
        const vote = G.cleanVote(v);
        if (vote) d.votes[x] = vote; else delete d.votes[x];
      }
      if (t === "p" && G.safeId(x)) {
        d.places = Array.isArray(d.places) ? d.places : [];
        const i = d.places.findIndex(q => q && q.id === x);
        if (v === null) { if (i >= 0) d.places.splice(i, 1); }
        else if (v && typeof v === "object") { if (i >= 0) Object.assign(d.places[i], v); else d.places.push(v); }
      }
    });
    return s;
  }

  // ---------- przeniesienie ----------
  const isTwin = t => t && t.title === TRIP.title && t.start === TRIP.start;
  // ten sam wypad przeniesiony już wcześniej (np. na drugim telefonie), ale nie nasza własna niedokończona próba
  const existing = () => (window.WypadTrips.list() || []).find(t => isTwin(t) && t.id !== get(MINE)) || null;

  let running = null;
  function run(letter, opts = {}) {
    if (running) return running;
    running = go(letter, opts).finally(() => { running = null; });
    return running;
  }
  async function go(letter, { into } = {}) {
    if (!LETTERS.includes(letter)) throw new Error("bad_letter");
    const raw = get(V3), user = window.WypadAuth.user;
    let s = null; try { s = JSON.parse(raw); } catch {}
    if (!s || !Array.isArray(s.destinations)) throw new Error("no_legacy");
    if (!user) throw new Error("not_signed_in");
    const p = pair();
    if (p) overlay(s, await pullPair(p.room), p.ts);
    let trip;
    if (into) {
      trip = into;
      window.openTrip(trip);
      if (!(await window.WypadSync.sync())) throw new Error("sync_failed");
      if (typeof window.editTrip !== "function" || !window.editTrip(data => merge(data, s, letter, user.id))) throw new Error("edit_failed");
    } else {
      const id = get(MINE);
      trip = id && ((await window.WypadTrips.refresh()) || []).find(t => t.id === id);
      if (!trip) {
        trip = await window.WypadTrips.create(TRIP);
        try { localStorage.setItem(MINE, trip.id); } catch {}
      }
      localStorage.setItem("wypad-trip-" + trip.id, JSON.stringify(convert(s, letter, user.id).data));
      window.openTrip(trip);
    }
    if (!(await window.WypadSync.sync())) throw new Error("sync_failed");
    // dopiero teraz: nowy wypad jest na serwerze
    localStorage.setItem(OLD, raw);
    localStorage.removeItem(V3);
    try { localStorage.removeItem(MINE); } catch {}
    return trip.id;
  }

  window.WypadLegacy = { pending, convert, claim, merge, overlay, letters, existing, run, NAMES };

  // ---------- pytanie po zalogowaniu (ekran #trips) ----------
  const dlg = document.getElementById("legacy");
  if (!dlg) return;
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toast = msg => { const t = document.getElementById("toast"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 3200); };
  let later = false, busy = false;
  const body = dlg.querySelector(".mv-body");

  function ask() {
    body.innerHTML = `<h2 id="mv-h">Stary wyjazd</h2>
      <p id="mv-q">Na tym telefonie jest wyjazd 19–24 listopada. Przenieść go na Twoje konto? Kim byłeś w nim?</p>
      ${pair() ? `<p class="muted">Jeśli macie dwa sparowane telefony, przenieś wyjazd tylko na jednym — druga osoba dołączy z zaproszenia.</p>` : ""}
      <p class="wz-ferr" id="mv-err" role="alert"></p>
      <div class="mv-actions">
        <button type="button" class="btn primary" data-mv="K">Krystian</button>
        <button type="button" class="btn primary" data-mv="Z">Zuzia</button>
        <button type="button" class="btn" data-mv="later">Nie teraz</button>
      </div>`;
    dlg.setAttribute("aria-describedby", "mv-q");
  }
  function offerTwin(letter, t) {
    body.innerHTML = `<h2 id="mv-h">Stary wyjazd</h2>
      <p id="mv-q">Masz już ten wypad na liście — dołączyć głosy do niego?</p>
      <p class="muted">${esc(t.title)}, ${esc(window.WypadTrips.formatRange ? window.WypadTrips.formatRange(t.start, t.end) : t.start)}. Głosy ${letter === "K" ? "Krystiana" : "Zuzi"} z tego telefonu trafią na Twoje konto.</p>
      <p class="wz-ferr" id="mv-err" role="alert"></p>
      <div class="mv-actions">
        <button type="button" class="btn primary" data-mv="into" data-l="${letter}">Dołącz głosy</button>
        <button type="button" class="btn" data-mv="new" data-l="${letter}">Załóż osobny</button>
        <button type="button" class="btn" data-mv="later">Nie teraz</button>
      </div>`;
    body.querySelector("[data-mv=into]").focus();
  }
  function setBusy(on, label) {
    busy = on;
    body.querySelectorAll("button").forEach(b => { b.disabled = on; });
    const e = body.querySelector("#mv-err");
    if (e) { e.classList.toggle("mv-wait", on); e.textContent = on ? label : ""; }
  }
  async function start(letter, into) {
    setBusy(true, "Przenoszę wyjazd…");
    try {
      await run(letter, { into });
      busy = false; dlg.close();
      toast("Wyjazd jest na Twoim koncie");
    } catch (e) {
      setBusy(false);
      const err = body.querySelector("#mv-err");
      if (err) err.textContent = navigator.onLine === false ? "Brak internetu. Wyjazd zostaje na telefonie, spróbuj później." : "Nie udało się przenieść. Wyjazd zostaje na telefonie, spróbuj jeszcze raz.";
    }
  }
  dlg.addEventListener("click", async e => {
    const b = e.target.closest("[data-mv]");
    if (!b || busy) return;
    const a = b.dataset.mv;
    if (a === "later") { later = true; dlg.close(); return; }
    if (a === "into") { const t = existing(); return start(b.dataset.l, t || undefined); }
    if (a === "new") return start(b.dataset.l);
    // wybrana litera: najpierw sprawdź, czy ten wypad nie jest już na liście (przeniesiony z drugiego telefonu)
    setBusy(true, "Sprawdzam listę wypadów…");
    try { await window.WypadTrips.refresh(); } catch {}
    setBusy(false);
    const t = existing();
    if (t) offerTwin(a, t); else start(a);
  });
  // Escape = „Nie teraz”; w trakcie przenoszenia okno zostaje
  dlg.addEventListener("cancel", e => { if (busy) e.preventDefault(); else later = true; });

  function maybeAsk() {
    if (later || dlg.open || !window.WypadAuth.user || !pending()) return;
    if (!document.documentElement.classList.contains("in-trips")) return;
    ask();
    dlg.showModal();
    body.querySelector("[data-mv=K]").focus();
  }
  window.WypadAuth.onChange(u => { if (u) setTimeout(maybeAsk, 0); else if (dlg.open) { busy = false; dlg.close(); } });
  window.WypadLegacy.ask = maybeAsk;
  setTimeout(maybeAsk, 0);
})();
