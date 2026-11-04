/* Synchronizacja jednego wypadu między telefonami przez Supabase.
   Każdy głos, kierunek i miejsce to osobny wpis, więc równoległe zmiany się nie nadpisują.
   Dostęp tylko przez funkcje trip_pull / trip_push z tokenem zalogowanego członka wypadu.
   Klucz w WypadAuth to publiczny klucz „publishable”, przeznaczony do kodu w przeglądarce. */
(() => {
  const URL_ = WypadAuth.URL, KEY = WypadAuth.KEY;
  const LS = "wypad-sync-";

  let trip = null;                       // id otwartego wypadu
  let st = null;                         // { shadow: {key: json}, ts: {key: iso}, last: iso }
  const loadState = id => {
    let o = null;
    try { o = JSON.parse(localStorage.getItem(LS + id)); } catch {}
    return { shadow: (o && o.shadow) || {}, ts: (o && o.ts) || {}, last: (o && o.last) || null };
  };
  const persist = () => { if (trip) try { localStorage.setItem(LS + trip, JSON.stringify(st)); } catch {} };
  // porównanie niezależne od kolejności pól (Postgres jsonb układa klucze po swojemu)
  const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const J = v => JSON.stringify(canon(v ?? null));

  let hooks = {}, ws = null, wsRef = 1, beat = null, retry = 0, pushT = null, retryT = null, expT = null, lastKick = 0, pollT = null, busy = false, again = false;
  const status = (s, extra) => { hooks.onStatus && hooks.onStatus(s, extra); };

  async function post(fn, body, token) {
    return fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  async function rpc(fn, body) {
    let r = await post(fn, body, await WypadAuth.token());
    if (r.status === 401) r = await post(fn, body, await WypadAuth.token({ force: true }));
    if (!r.ok) {
      let j = null;
      try { j = await r.json(); } catch {}
      const e = new Error((j && j.message) || `${fn} ${r.status}`);
      e.status = r.status;
      if (j && j.message === "not_member") e.notMember = true;
      throw e;
    }
    return r.json();
  }

  // ---------- wysyłanie: tylko to, co zmieniło się od ostatniej udanej wysyłki ----------
  function diff() {
    const items = hooks.snapshot(), out = {};
    for (const k in items) if (J(items[k]) !== st.shadow[k]) out[k] = items[k] ?? null;
    for (const k in st.shadow) if (!(k in items)) out[k] = null;
    return out;
  }
  async function push(s, id) {
    if (trip !== id || st !== s || !navigator.onLine) return;
    const out = diff(), keys = Object.keys(out);
    if (!keys.length) return;
    for (let i = 0; i < keys.length; i += 400) {
      const part = Object.fromEntries(keys.slice(i, i + 400).map(k => [k, out[k]]));
      const rows = await rpc("trip_push", { p_trip: id, p_items: part });
      if (st !== s) return;              // w trakcie wysyłki otwarto inny wypad
      rows.forEach(r => {
        if (part[r.key] === null) delete s.shadow[r.key]; else s.shadow[r.key] = J(part[r.key]);
        s.ts[r.key] = r.updated_at;
        if (!s.last || r.updated_at > s.last) s.last = r.updated_at;
      });
    }
    persist();
    send({ n: keys.length });
  }

  // ---------- pobieranie: wpisy nowsze niż te, które już znamy ----------
  async function pull(s, id) {
    if (trip !== id || st !== s || !navigator.onLine) return;
    // mały zapas czasu, bo wpisy z równoległych transakcji mogą mieć wcześniejszy znacznik
    const since = s.last ? new Date(new Date(s.last).getTime() - 15000).toISOString() : null;
    const rows = await rpc("trip_pull", { p_trip: id, p_since: since });
    if (st !== s) return;
    const remote = {};
    rows.forEach(r => {
      if (s.ts[r.key] && r.updated_at <= s.ts[r.key]) return;
      remote[r.key] = r.value;
      s.ts[r.key] = r.updated_at;
      if (r.value === null) delete s.shadow[r.key]; else s.shadow[r.key] = J(r.value);
      if (!s.last || r.updated_at > s.last) s.last = r.updated_at;
    });
    persist();
    if (Object.keys(remote).length) hooks.apply(remote);
  }

  // jedna synchronizacja naraz; jeśli coś przyjdzie w trakcie, powtórz raz na końcu
  async function sync() {
    if (!trip) return;
    if (busy) { again = true; return; }
    busy = true; status("busy");
    const id = trip, s = st;
    try { await pull(s, id); await push(s, id); if (st === s) status("ok", { at: new Date() }); }
    catch (e) {
      if (e.notMember && st === s) { close(); hooks.onGone && hooks.onGone(id); }
      else if (st === s) status(navigator.onLine ? "error" : "offline", { error: String(e.message || e) });
    }
    finally { busy = false; if (again) { again = false; sync(); } }
  }
  const schedule = () => { if (!trip) return; clearTimeout(pushT); pushT = setTimeout(sync, 500); };

  // ---------- na żywo: kanał Realtime wypadu; wiadomość = „zajrzyj, coś się zmieniło” ----------
  const topic = () => `realtime:trip-${trip}`;
  function send(payload) {
    if (ws?.readyState !== 1) return;
    ws.send(JSON.stringify({ topic: topic(), event: "broadcast", payload: { type: "broadcast", event: "sync", payload }, ref: String(++wsRef), join_ref: "1" }));
  }
  async function connect() {
    disconnect();
    if (!trip || !navigator.onLine || !("WebSocket" in window)) return;
    const id = trip;
    let token;
    try { token = await WypadAuth.token(); }
    catch (e) {
      if (e.code !== "not_signed_in" && trip === id && !ws) { clearTimeout(retryT); retryT = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++)); }
      return;
    }
    if (trip !== id || ws) return;       // w czasie czekania zmienił się wypad albo ktoś inny już połączył
    const sock = new WebSocket(`${URL_.replace("https", "wss")}/realtime/v1/websocket?apikey=${KEY}&vsn=1.0.0&access_token=${encodeURIComponent(token)}`);
    ws = sock;
    let hb = null;
    // token w URL ważny tylko do wygaśnięcia; odnów kanał zanim serwer go zamknie
    clearTimeout(expT);
    expT = setTimeout(kick, Math.max(5000, (tokenExp() - Math.floor(Date.now() / 1000) - 50) * 1000));
    if (expT && expT.unref) expT.unref();
    sock.onopen = () => {
      retry = 0;
      sock.send(JSON.stringify({ topic: topic(), event: "phx_join", payload: { config: { broadcast: { self: false }, presence: { key: "" }, private: false } }, ref: "1", join_ref: "1" }));
      hb = beat = setInterval(() => sock.readyState === 1 && sock.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++wsRef) })), 25000);
    };
    sock.onmessage = m => {
      try {
        const d = JSON.parse(m.data);
        if (d.event === "broadcast" && d.payload?.event === "sync") sync();
        else if (d.topic === topic() && (d.event === "phx_close" || d.event === "phx_error" || (d.event === "system" && d.payload?.status === "error"))) kick();
      } catch {}
    };
    sock.onclose = () => {
      clearInterval(hb);
      if (ws !== sock || trip !== id) return;
      ws = null;
      clearTimeout(retryT);
      retryT = setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
    };
  }
  // ponowne połączenie z nowym tokenem; nie częściej niż co 5 s, żeby błąd serwera nie robił pętli
  function kick() {
    if (!trip) return;
    disconnect();
    const wait = Date.now() - lastKick < 5000 ? 5000 : 0;
    lastKick = Date.now();
    retryT = setTimeout(connect, wait);
  }
  function tokenExp() {
    try { return JSON.parse(localStorage.getItem("wypad-auth")).expires_at || 0; } catch { return 0; }
  }
  function disconnect() { clearInterval(beat); clearTimeout(retryT); clearTimeout(expT); if (ws) { const s = ws; ws = null; try { s.close(); } catch {} } }

  // ---------- wypad ----------
  function close() {
    disconnect(); clearTimeout(pushT);
    trip = null; st = null; again = false;
    status("off");
  }
  function open(id) {
    if (trip === id) return sync();
    if (trip) close();
    trip = id; st = loadState(id); retry = 0;
    connect();
    return sync();
  }

  function init(h) { hooks = h; status("off"); }
  addEventListener("online", () => { if (trip) { connect(); sync(); } });
  addEventListener("offline", () => status("offline"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden && trip) { if (!ws) connect(); sync(); } });
  // zapas, gdyby kanał na żywo zgubił wiadomość
  pollT = setInterval(() => { if (trip && !document.hidden) sync(); }, 30000);
  if (pollT && pollT.unref) pollT.unref();

  window.WypadSync = {
    init, open, close, schedule, sync,
    get trip() { return trip; },
    get last() { return st ? st.last || null : null; },
  };
})();
