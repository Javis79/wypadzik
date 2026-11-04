/* Moje wypady: lista wypadów użytkownika, tworzenie, zaproszenia i ekran #trips.
   Dostęp tylko przez funkcje RPC z tokenem zalogowanego konta. Lista leży też w localStorage („wypad-trips”),
   żeby działała bez sieci. Klucz w WypadAuth to publiczny klucz „publishable”, przeznaczony do przeglądarki. */
(() => {
  const URL_ = WypadAuth.URL, KEY = WypadAuth.KEY;
  const LS = "wypad-trips";          // lista każdego konta leży pod „wypad-trips:<id>”; stary globalny klucz ignorujemy
  const lsKey = () => WypadAuth.user ? `${LS}:${WypadAuth.user.id}` : null;
  const MON = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];

  const toTrip = r => ({ id: r.id, title: r.title, start: r.start_date, end: r.end_date, origin: r.origin, createdBy: r.created_by, members: r.members || [] });

  const readList = () => { const k = lsKey(); if (!k) return []; try { const l = JSON.parse(localStorage.getItem(k)); return Array.isArray(l) ? l : []; } catch { return []; } };
  const writeList = l => { const k = lsKey(); if (k) try { localStorage.setItem(k, JSON.stringify(l)); } catch {} };
  try { localStorage.removeItem(LS); } catch {}
  const upsert = t => { const l = readList(), i = l.findIndex(x => x.id === t.id); if (i >= 0) l[i] = t; else l.unshift(t); writeList(l); };
  const drop = id => writeList(readList().filter(t => t.id !== id));

  async function post(fn, body, token) {
    return fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  async function rpc(fn, body = {}) {
    let r = await post(fn, body, await WypadAuth.token());
    if (r.status === 401) r = await post(fn, body, await WypadAuth.token({ force: true }));
    if (!r.ok) {
      let j = null;
      try { j = await r.json(); } catch {}
      const e = new Error((j && j.message) || `${fn} ${r.status}`);
      e.code = (j && j.message) || String(r.status);
      e.status = r.status;
      throw e;
    }
    return r.status === 204 ? null : r.json();
  }

  // ---------- daty ----------
  const parse = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ""); return m ? { y: +m[1], m: +m[2] - 1, d: +m[3] } : null; };
  function formatRange(start, end) {
    const a = parse(start), b = parse(end);
    if (!a && !b) return "";
    if (!a || !b || (a.y === b.y && a.m === b.m && a.d === b.d)) { const x = a || b; return `${x.d} ${MON[x.m]} ${x.y}`; }
    if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MON[a.m]} ${a.y}`;
    if (a.y === b.y) return `${a.d} ${MON[a.m]} – ${b.d} ${MON[b.m]} ${a.y}`;
    return `${a.d} ${MON[a.m]} ${a.y} – ${b.d} ${MON[b.m]} ${b.y}`;
  }
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  // wypad trwa do końca ostatniego dnia; bez dat uznajemy go za nadchodzący
  function split(trips, now) {
    const upcoming = [], past = [];
    for (const t of trips) ((t.end || t.start || "9999") < now ? past : upcoming).push(t);
    const by = (x, y) => String(x.start || "9999").localeCompare(String(y.start || "9999"));
    return { upcoming: upcoming.sort(by), past: past.sort((x, y) => by(y, x)) };
  }

  // zdjęcie lidera z lokalnej kopii danych wypadu (nic nie pobieramy)
  function leaderPhoto(id) {
    let d; try { d = JSON.parse(localStorage.getItem("wypad-trip-" + id)); } catch { return null; }
    const list = d && Array.isArray(d.destinations) ? d.destinations : [];
    let best = null, n = 0;
    for (const x of list) {
      const c = Object.values(x.votes || {}).filter(v => v === 1).length;
      if (c > n) { best = x; n = c; }
    }
    return (best && best.photo) || null;
  }

  // ---------- API ----------
  const api = { formatRange, split, leaderPhoto, today };
  api.list = () => readList();
  api.refresh = async () => {
    try {
      const rows = await rpc("my_trips");
      const l = (rows || []).map(toTrip);
      writeList(l);
      return l;
    } catch { return readList(); }      // offline albo błąd serwera: zostaje to, co mamy
  };
  const fields = f => ({ p_title: f.title, p_start: f.start, p_end: f.end, p_origin: f.origin });
  api.create = async f => { const t = toTrip(await rpc("create_trip", fields(f))); upsert(t); return t; };
  api.update = async (id, f) => { const t = toTrip(await rpc("update_trip", { p_trip: id, ...fields(f) })); upsert(t); return t; };
  api.addMember = (id, login) => rpc("add_member", { p_trip: id, p_login: login });
  api.invite = async id => {
    const tok = await rpc("create_invite", { p_trip: id });
    return `${window.location.origin}${window.location.pathname}#zaproszenie=${tok}`;
  };
  api.acceptFromHash = async () => {
    const m = /^#zaproszenie=([^&]+)/.exec(window.location.hash || "");
    if (!m || !WypadAuth.user) return null;        // bez konta hash zostaje do czasu zalogowania
    const clear = () => { try { window.history.replaceState(null, "", window.location.pathname + (window.location.search || "")); } catch {} };
    try {
      let tok;
      try { tok = decodeURIComponent(m[1]); } catch { const e = new Error("invalid_invite"); e.code = "invalid_invite"; throw e; }
      const id = await rpc("accept_invite", { p_token: tok });
      clear();
      await api.refresh();
      return id;
    } catch (e) {
      // hash zostaje tylko przy błędzie sieci albo serwera (5xx); każdy inny błąd oznacza zaproszenie nie do użycia
      const transient = (e.status == null && e.code !== "invalid_invite") || e.status >= 500;
      if (!transient) clear();
      throw e;
    }
  };
  api.leave = async id => { await rpc("leave_trip", { p_trip: id }); drop(id); };
  api.remove = async id => { await rpc("delete_trip", { p_trip: id }); drop(id); };
  api.findProfiles = q => rpc("find_profiles", { p_q: q });

  window.WypadTrips = api;

  // ---------- ekran #trips ----------
  const root = document.getElementById("trips");
  if (!root) return;
  const $ = s => root.querySelector(s);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const html = document.documentElement;
  const toast = msg => { const t = document.getElementById("toast"); if (!t) return; t.textContent = msg; t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2600); };

  const card = (t, past) => {
    const photo = leaderPhoto(t.id);
    const tags = t.members.map(m => `<span class="vt" title="${esc(m.name || m.login)}">${esc((m.name || m.login || "?").trim().charAt(0).toUpperCase())}</span>`).join("");
    return `<button type="button" class="dest trip${past ? " past" : ""}${photo ? " has-img" : ""}" data-id="${esc(t.id)}">
      <div class="thumb">${photo ? `<img src="${esc(photo)}" alt="" draggable="false" onerror="this.remove()">` : ""}<div class="votes">${tags}</div></div>
      <div class="head"><h3>${esc(t.title)}</h3></div>
      <div class="sub">${esc(formatRange(t.start, t.end))}${t.origin ? ` · z ${esc(t.origin)}` : ""}</div>
    </button>`;
  };

  function render() {
    const u = WypadAuth.user;
    $("#tr-who").textContent = u ? (u.name || u.login) : "";
    const list = readList(), { upcoming, past } = split(list, today());
    $("#tr-empty").hidden = list.length > 0;
    $("#tr-up").innerHTML = upcoming.map(t => card(t, false)).join("");
    $("#tr-past-wrap").hidden = !past.length;
    $("#tr-past").innerHTML = past.map(t => card(t, true)).join("");
  }
  function net() {
    const off = navigator.onLine === false, b = $("#tr-new");
    b.disabled = off;
    $("#tr-offline").hidden = !off;
  }

  root.addEventListener("click", e => {
    const c = e.target.closest(".trip");
    if (c) {
      const t = readList().find(x => x.id === c.dataset.id);
      if (!t) return;
      if (typeof window.openTrip === "function") window.openTrip(t); else console.log("openTrip", t.id);
    }
  });
  $("#tr-new").addEventListener("click", () => {
    if (window.WypadWizard && window.WypadWizard.open) window.WypadWizard.open({ onCreated: () => { api.refresh().then(render); } });
    else toast("Kreator wkrótce");
  });
  $("#tr-out").addEventListener("click", () => { if (confirm("Wylogować z tego telefonu?")) WypadAuth.signOut(); });
  window.addEventListener("online", net);
  window.addEventListener("offline", net);

  let gen = 0;
  async function enter() {
    const my = ++gen;
    html.classList.add("in-trips");
    render(); net();
    await api.refresh();
    if (my !== gen) return;
    render();
    try {
      const id = await api.acceptFromHash();
      if (id && my === gen) { render(); toast("Dołączono do wypadu"); }
    } catch (e) {
      toast(e.code === "invite_expired" ? "Zaproszenie wygasło" : (e.status == null || e.status >= 500) && e.code !== "invalid_invite" ? "Nie udało się przyjąć zaproszenia, spróbuj z internetem" : "To zaproszenie nie działa");
    }
  }
  const sync = () => { if (WypadAuth.user) enter(); else { gen++; html.classList.remove("in-trips"); } };
  WypadAuth.onChange(sync);
  window.WypadTripsScreen = { show: () => { if (WypadAuth.user) enter(); }, render };
  sync();
})();
