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
  const persistFor = (id, s) => { try { localStorage.setItem(LS + id, JSON.stringify(s)); } catch {} };
  const persist = () => { if (trip) persistFor(trip, st); };
  // porównanie niezależne od kolejności pól (Postgres jsonb układa klucze po swojemu)
  const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const J = v => JSON.stringify(canon(v ?? null));

  let hooks = {}, ws = null, wsRef = 1, beat = null, retry = 0, pushT = null, retryT = null, expT = null, lastKick = 0, pollT = null, busy = false, again = false;
  const status = (s, extra) => { hooks.onStatus && hooks.onStatus(s, extra); };

  async function post(fn, body, token, signal) {
    return fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: { apikey: KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), signal,
    });
  }
  // tok: token pobrany wcześniej (ostatnia wysyłka przy zamykaniu wypadu); limit czasu na całe zapytanie z odpowiedzią,
  // żeby zawieszone połączenie nie blokowało synchronizacji na zawsze
  async function rpc(fn, body, tok) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), api._timeout);
    try {
      let r = await post(fn, body, tok || await WypadAuth.token(), ctl.signal);
      if (r.status === 401) r = await post(fn, body, await WypadAuth.token({ force: true }), ctl.signal);
      if (!r.ok) {
        let j = null;
        try { j = await r.json(); } catch {}
        const e = new Error((j && j.message) || `${fn} ${r.status}`);
        e.status = r.status;
        if (j && j.message === "not_member") e.notMember = true;
        throw e;
      }
      return await r.json();
    } catch (e) {
      if (ctl.signal.aborted) { const t = new Error(`${fn} timeout`); t.timeout = true; throw t; }
      throw e;
    } finally { clearTimeout(timer); }
  }

  // ---------- wysyłanie: tylko to, co zmieniło się od ostatniej udanej wysyłki ----------
  function diff(s = st, items = hooks.snapshot()) {
    const out = {};
    for (const k in items) if (J(items[k]) !== s.shadow[k]) out[k] = items[k] ?? null;
    for (const k in s.shadow) if (!(k in items)) out[k] = null;
    return out;
  }
  async function push(s, id) {
    if (trip !== id || st !== s || !navigator.onLine) return;
    const out = diff(), keys = Object.keys(out);
    if (!keys.length) return;
    for (let i = 0; i < keys.length; i += 400) {
      const part = Object.fromEntries(keys.slice(i, i + 400).map(k => [k, out[k]]));
      const rows = await rpc("trip_push", { p_trip: id, p_items: part });
      // zapisane na serwerze: zanotuj w stanie tego wypadu także po zamknięciu (ostatnia wysyłka czyta ten sam stan)
      rows.forEach(r => {
        if (part[r.key] === null) delete s.shadow[r.key]; else s.shadow[r.key] = J(part[r.key]);
        s.ts[r.key] = r.updated_at;
        if (!s.last || r.updated_at > s.last) s.last = r.updated_at;
      });
      if (st !== s) return;              // w trakcie wysyłki zamknięto wypad albo otwarto inny
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
    const remote = {}, fresh = rows.filter(r => !(s.ts[r.key] && r.updated_at <= s.ts[r.key]));
    if (!fresh.length) return;
    fresh.forEach(r => { remote[r.key] = r.value; });
    // cień i znaczniki dopiero po udanym zapisie u siebie: cień przed danymi lokalnymi wysłałby potem null albo cofnął cudze wpisy
    if (hooks.apply(remote) === false) { const e = new Error("local_save_failed"); e.local = true; throw e; }
    if (st !== s) return;
    fresh.forEach(r => {
      s.ts[r.key] = r.updated_at;
      if (r.value === null) delete s.shadow[r.key]; else s.shadow[r.key] = J(r.value);
      if (!s.last || r.updated_at > s.last) s.last = r.updated_at;
    });
    persist();
  }

  // jedna synchronizacja naraz; jeśli coś przyjdzie w trakcie, powtórz raz na końcu.
  // Zwraca true, gdy pobranie i wysyłka przeszły w sieci; wywołanie w trakcie czeka na tę powtórkę.
  let waiting = [], inflight = null;
  async function sync() {
    if (!trip) return false;
    if (busy) { again = true; return new Promise(r => waiting.push(r)); }
    busy = true; status("busy");
    const id = trip, s = st;
    let done; inflight = { s, p: new Promise(r => { done = r; }) };
    let ok = false;
    try { await pull(s, id); await push(s, id); if (st === s) { status("ok", { at: new Date() }); ok = navigator.onLine !== false; } }
    catch (e) {
      if (e.notMember && st === s) { close(false); hooks.onGone && hooks.onGone(id); }
      else if (st === s) status(navigator.onLine ? "error" : "offline", { error: String(e.message || e) });
    }
    finally {
      busy = false; done();
      const w = waiting; waiting = [];
      if (again && trip) { again = false; const next = sync(); w.forEach(r => next.then(r)); }
      else { again = false; w.forEach(r => r(ok)); }
    }
    return ok;
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
  // zamknięcie wypadu: niewysłane zmiany (czekająca wysyłka albo synchronizacja w toku) idą w tle ostatnią wysyłką.
  // Stan, wpisy i token są brane teraz, więc wysyłka nie dotyka następnego wypadu ani danych po wylogowaniu
  function close(final = true) {
    const id = trip, s = st;
    let items = null;
    if (final && id && s) try { items = hooks.snapshot(); } catch {}
    disconnect(); clearTimeout(pushT);
    trip = null; st = null; again = false;
    status("off");
    if (items && Object.keys(diff(s, items)).length) flush(id, s, items);
  }
  // ostatnia wysyłka jednego wypadu poza bieżącą synchronizacją: bez hooks.apply i statusu.
  // Wpisy, które w międzyczasie zmienił ktoś inny, zostają na następne otwarcie (wtedy pobranie je wczyta);
  // last się nie przesuwa, więc to pobranie ich nie pominie. Błąd sieci: zmiana zostaje lokalnie jak dotąd.
  function flush(id, s = loadState(id), items) {
    if (!id || !items || navigator.onLine === false) return Promise.resolve(false);
    const tok = WypadAuth.token();
    return (async () => {
      const t = await tok;
      if (inflight && inflight.s === s) await inflight.p;   // synchronizacja w toku najpierw zanotuje swoją wysyłkę
      const since = s.last ? new Date(new Date(s.last).getTime() - 15000).toISOString() : null;
      const rows = await rpc("trip_pull", { p_trip: id, p_since: since }, t);
      const out = diff(s, items);
      rows.forEach(r => { if (!(s.ts[r.key] && r.updated_at <= s.ts[r.key])) delete out[r.key]; });
      const keys = Object.keys(out);
      for (let i = 0; i < keys.length; i += 400) {
        const part = Object.fromEntries(keys.slice(i, i + 400).map(k => [k, out[k]]));
        const res = await rpc("trip_push", { p_trip: id, p_items: part }, t);
        res.forEach(r => {
          if (part[r.key] === null) delete s.shadow[r.key]; else s.shadow[r.key] = J(part[r.key]);
          s.ts[r.key] = r.updated_at;
        });
      }
      // wypad znów otwarty: ma własny stan z pamięci, nie nadpisuj go (powtórzy te same wartości)
      if (trip !== id) persistFor(id, s);
      return true;
    })().catch(() => false);
  }
  function open(id) {
    if (trip === id) return sync();
    if (trip) close(false);              // wpisy pod snapshot należą już do nowego wypadu; app.js zamyka stary wcześniej
    trip = id; st = loadState(id); retry = 0;
    connect();
    return sync();
  }

  function init(h) { hooks = h; status("off"); }
  // wpisy wypadu, który nie jest otwarty (np. świeżo założony w kreatorze): pobranie + wysyłka w tle
  const pushTrip = (id, items) => trip === id ? sync() : flush(id, undefined, items);
  addEventListener("online", () => { if (trip) { connect(); sync(); } });
  addEventListener("offline", () => status("offline"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden && trip) { if (!ws) connect(); sync(); } });
  // zapas, gdyby kanał na żywo zgubił wiadomość
  pollT = setInterval(() => { if (trip && !document.hidden) sync(); }, 30000);
  if (pollT && pollT.unref) pollT.unref();

  const api = window.WypadSync = {
    _timeout: 15000,
    init, open, close, schedule, sync, pushTrip,
    get trip() { return trip; },
    get last() { return st ? st.last || null : null; },
  };
})();
