/* Synchronizacja dwóch telefonów przez Supabase.
   Każdy głos, kierunek i miejsce to osobny wpis, więc równoległe zmiany się nie nadpisują.
   Tabela jest zamknięta; dostęp tylko przez funkcje wypad_pull / wypad_push z tajnym kodem pary.
   Klucz poniżej to publiczny klucz „publishable”, przeznaczony do kodu w przeglądarce. */
(() => {
  const URL_ = WypadAuth.URL, KEY = WypadAuth.KEY;
  const LS = "wypad-sync";

  const load = () => { try { return JSON.parse(localStorage.getItem(LS)) || {}; } catch { return {}; } };
  let st = load();                       // { room, shadow: {key: json}, ts: {key: iso}, last: iso }
  const persist = () => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch {} };
  // porównanie niezależne od kolejności pól (Postgres jsonb układa klucze po swojemu)
  const canon = v => Array.isArray(v) ? v.map(canon) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v;
  const J = v => JSON.stringify(canon(v ?? null));

  let hooks = {}, ws = null, wsRef = 1, beat = null, retry = 0, pushT = null, pollT = null, busy = false, again = false;
  const status = (s, extra) => { hooks.onStatus && hooks.onStatus(s, extra); };

  async function rpc(fn, body) {
    const r = await fetch(`${URL_}/rest/v1/rpc/${fn}`, {
      method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`${fn} ${r.status}`);
    return r.json();
  }

  // ---------- wysyłanie: tylko to, co zmieniło się od ostatniej udanej wysyłki ----------
  function diff() {
    const items = hooks.snapshot(), out = {};
    for (const k in items) if (J(items[k]) !== st.shadow[k]) out[k] = items[k] ?? null;
    for (const k in st.shadow) if (!(k in items)) out[k] = null;
    return out;
  }
  async function push() {
    if (!st.room || !navigator.onLine) return;
    const out = diff(), keys = Object.keys(out);
    if (!keys.length) return;
    for (let i = 0; i < keys.length; i += 400) {
      const part = Object.fromEntries(keys.slice(i, i + 400).map(k => [k, out[k]]));
      const rows = await rpc("wypad_push", { p_room: st.room, p_items: part });
      rows.forEach(r => {
        if (part[r.key] === null) delete st.shadow[r.key]; else st.shadow[r.key] = J(part[r.key]);
        st.ts[r.key] = r.updated_at;
        if (!st.last || r.updated_at > st.last) st.last = r.updated_at;
      });
    }
    persist();
    send({ n: keys.length });
  }

  // ---------- pobieranie: wpisy nowsze niż te, które już znamy ----------
  async function pull() {
    if (!st.room || !navigator.onLine) return;
    // mały zapas czasu, bo wpisy z równoległych transakcji mogą mieć wcześniejszy znacznik
    const since = st.last ? new Date(new Date(st.last).getTime() - 15000).toISOString() : null;
    const rows = await rpc("wypad_pull", { p_room: st.room, p_since: since });
    const remote = {};
    rows.forEach(r => {
      if (st.ts[r.key] && r.updated_at <= st.ts[r.key]) return;
      remote[r.key] = r.value;
      st.ts[r.key] = r.updated_at;
      if (r.value === null) delete st.shadow[r.key]; else st.shadow[r.key] = J(r.value);
      if (!st.last || r.updated_at > st.last) st.last = r.updated_at;
    });
    persist();
    if (Object.keys(remote).length) hooks.apply(remote);
  }

  // jedna synchronizacja naraz; jeśli coś przyjdzie w trakcie, powtórz raz na końcu
  async function sync() {
    if (!st.room) return;
    if (busy) { again = true; return; }
    busy = true; status("busy");
    try { await pull(); await push(); status("ok", { at: new Date() }); }
    catch (e) { status(navigator.onLine ? "error" : "offline", { error: String(e.message || e) }); }
    finally { busy = false; if (again) { again = false; sync(); } }
  }
  const schedule = () => { if (!st.room) return; clearTimeout(pushT); pushT = setTimeout(sync, 500); };

  // ---------- na żywo: kanał Realtime z kodem pary; wiadomość = „zajrzyj, coś się zmieniło” ----------
  const topic = () => `realtime:wypad-${st.room}`;
  function send(payload) {
    if (ws?.readyState !== 1) return;
    ws.send(JSON.stringify({ topic: topic(), event: "broadcast", payload: { type: "broadcast", event: "sync", payload }, ref: String(++wsRef), join_ref: "1" }));
  }
  function connect() {
    disconnect();
    if (!st.room || !navigator.onLine || !("WebSocket" in window)) return;
    const sock = new WebSocket(`${URL_.replace("https", "wss")}/realtime/v1/websocket?apikey=${KEY}&vsn=1.0.0`);
    ws = sock;
    sock.onopen = () => {
      retry = 0;
      sock.send(JSON.stringify({ topic: topic(), event: "phx_join", payload: { config: { broadcast: { self: false }, presence: { key: "" }, private: false } }, ref: "1", join_ref: "1" }));
      beat = setInterval(() => sock.readyState === 1 && sock.send(JSON.stringify({ topic: "phoenix", event: "heartbeat", payload: {}, ref: String(++wsRef) })), 25000);
    };
    sock.onmessage = m => {
      try { const d = JSON.parse(m.data); if (d.event === "broadcast" && d.payload?.event === "sync") sync(); } catch {}
    };
    sock.onclose = () => {
      clearInterval(beat);
      if (ws !== sock || !st.room) return;
      ws = null;
      setTimeout(connect, Math.min(30000, 1000 * 2 ** retry++));
    };
  }
  function disconnect() { clearInterval(beat); if (ws) { const s = ws; ws = null; try { s.close(); } catch {} } }

  // ---------- para ----------
  function newRoom() {
    const a = "abcdefghjkmnpqrstuvwxyz23456789", b = crypto.getRandomValues(new Uint8Array(20));
    return [...b].map(x => a[x % a.length]).join("");
  }
  async function join(room) {
    st = { room, shadow: {}, ts: {}, last: null }; persist();
    connect();
    await sync();
  }
  function leave() { disconnect(); st = {}; persist(); status("off"); }

  function init(h) {
    hooks = h;
    if (!st.room) { status("off"); return; }
    connect(); sync();
  }
  addEventListener("online", () => { connect(); sync(); });
  addEventListener("offline", () => status("offline"));
  document.addEventListener("visibilitychange", () => { if (!document.hidden && st.room) { if (!ws) connect(); sync(); } });
  // zapas, gdyby kanał na żywo zgubił wiadomość
  pollT = setInterval(() => { if (st.room && !document.hidden) sync(); }, 30000);

  window.WypadSync = {
    init, schedule, sync, join, leave, newRoom,
    get room() { return st.room || null; },
    get last() { return st.last || null; },
  };
})();
