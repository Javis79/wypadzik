import test from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const now = () => Math.floor(Date.now() / 1000);
const sess = (over = {}) => ({
  access_token: "A1", refresh_token: "R1", expires_at: now() + 3600,
  user: { id: "u1", email: "zuzia@wypad.invalid", user_metadata: { login: "zuzia", name: "Zuzia" } }, ...over,
});
const res = (status, body) => ({ ok: status < 400, status, json: async () => body });
const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222";

class FakeWS {
  static all = [];
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; FakeWS.all.push(this); }
  send(m) { this.sent.push(JSON.parse(m)); }
  close() { this.readyState = 3; }
}

function setup(fetchImpl) {
  FakeWS.all = [];
  const w0 = load([]);
  w0.localStorage.setItem("wypad-auth", JSON.stringify(sess()));
  const calls = [];
  const w = load(["auth.js", "sync.js"], {
    localStorage: w0.localStorage, WebSocket: FakeWS,
    fetch: async (u, o) => { const c = { u, fn: u.split("/rpc/")[1], body: o.body ? JSON.parse(o.body) : null, h: o.headers, signal: o.signal }; calls.push(c); return fetchImpl(c); },
  });
  return { w, calls, S: w.WypadSync };
}
const hooks = (items, extra = {}) => ({ snapshot: () => items, apply() {}, onStatus() {}, onGone() {}, ...extra });
const ok = c => res(200, c.fn === "trip_push" ? Object.keys(c.body.p_items).map(key => ({ key, updated_at: "2026-01-01T00:00:00Z" })) : []);

test("push wysyła tylko zmienione klucze", async () => {
  const items = { a: { x: 1, y: 2 }, b: 1 };
  const { calls, S } = setup(ok);
  S.init(hooks(items));
  await S.open(A);
  const first = calls.filter(c => c.fn === "trip_push");
  assert.deepEqual(plain(Object.keys(first[0].body.p_items)).sort(), ["a", "b"]);
  assert.equal(first[0].body.p_trip, A);
  assert.equal(first[0].h.Authorization, "Bearer A1");
  items.a = { y: 2, x: 1 };      // inna kolejność pól, ta sama treść
  items.b = 2;
  await S.sync();
  const pushes = calls.filter(c => c.fn === "trip_push");
  assert.deepEqual(plain(Object.keys(pushes[1].body.p_items)), ["b"]);
  delete items.a;
  await S.sync();
  const last = calls.filter(c => c.fn === "trip_push").pop();
  assert.deepEqual(plain(last.body.p_items), { a: null });
  S.close();
});

test("401, a potem 200: dwa trip_push i jedno wymuszone odświeżenie", async () => {
  let pushes = 0;
  const { calls, S } = setup(c => {
    if (c.u.includes("/auth/v1/token")) return res(200, sess({ access_token: "A2", refresh_token: "R2" }));
    if (c.fn === "trip_push" && ++pushes === 1) return res(401, { message: "JWT expired" });
    return ok(c);
  });
  S.init(hooks({ k: 1 }));
  await S.open(A);
  const push = calls.filter(c => c.fn === "trip_push");
  assert.equal(push.length, 2);
  assert.equal(push[0].h.Authorization, "Bearer A1");
  assert.equal(push[1].h.Authorization, "Bearer A2");
  assert.equal(calls.filter(c => c.u.includes("grant_type=refresh_token")).length, 1);
  S.close();
});

test("not_member woła onGone i zamyka wypad", async () => {
  const gone = [];
  const { S } = setup(() => res(400, { code: "P0001", message: "not_member" }));
  S.init(hooks({ k: 1 }, { onGone: id => gone.push(id) }));
  await S.open(A);
  assert.deepEqual(gone, [A]);
  assert.equal(S.trip, null);
});

test("open(b) po open(a) nie miesza cieni", async () => {
  const items = { k: 1 };
  const { calls, S, w } = setup(ok);
  S.init(hooks(items));
  await S.open(A);
  await S.open(B);
  const pushes = calls.filter(c => c.fn === "trip_push");
  assert.deepEqual(pushes.map(c => c.body.p_trip), [A, B]);   // B wysłał k, mimo że A już je znał
  assert.equal(S.trip, B);
  assert.ok(JSON.parse(w.localStorage.getItem("wypad-sync-" + A)).shadow.k);
  assert.ok(JSON.parse(w.localStorage.getItem("wypad-sync-" + B)).shadow.k);
  await S.open(A);
  assert.equal(calls.filter(c => c.fn === "trip_push").length, 2);   // A nic nowego do wysłania
  S.close();
});

test("kanał Realtime: temat i access_token w URL; stary klucz wypad-sync zostaje", async () => {
  const { S, w } = setup(ok);
  w.localStorage.setItem("wypad-sync", '{"room":"x"}');
  S.init(hooks({}));
  S.open(A);
  for (let i = 0; i < 5 && !FakeWS.all.length; i++) await new Promise(r => setTimeout(r, 0));
  const ws = FakeWS.all[0];
  assert.match(ws.url, /apikey=sb_publishable_.*&vsn=1\.0\.0&access_token=A1$/);
  ws.readyState = 1; ws.onopen();
  assert.equal(ws.sent[0].topic, "realtime:trip-" + A);
  assert.equal(ws.sent[0].event, "phx_join");
  assert.equal(w.localStorage.getItem("wypad-sync"), '{"room":"x"}');
  S.close();
});

test("pull stosuje zdalne wpisy i pomija znane", async () => {
  const applied = [];
  const { S } = setup(c => c.fn === "trip_pull"
    ? res(200, [{ key: "r", value: { v: 1 }, updated_at: "2026-02-01T00:00:00Z" }]) : ok(c));
  const items = {};
  S.init(hooks(items, { apply: r => { applied.push(plain(r)); Object.assign(items, r); } }));
  await S.open(A); await S.sync();
  assert.deepEqual(applied, [{ r: { v: 1 } }]);
  assert.equal(S.last, "2026-02-01T00:00:00Z");
  S.close();
});

const tick = async () => { for (let i = 0; i < 6; i++) await new Promise(r => setTimeout(r, 0)); };

test("phx_error / system error na naszym temacie otwiera nowy kanał ze świeżym tokenem", async () => {
  const { S, w } = setup(c => c.u.includes("grant_type=refresh_token") ? res(200, sess({ access_token: "A2", refresh_token: "R2" })) : ok(c));
  S.init(hooks({}));
  await S.open(A); await tick();
  assert.equal(FakeWS.all.length, 1);
  await w.WypadAuth.token({ force: true });
  FakeWS.all[0].onmessage({ data: JSON.stringify({ topic: "realtime:trip-" + B, event: "phx_error", payload: {} }) });   // cudzy temat: ignoruj
  await tick();
  assert.equal(FakeWS.all.length, 1);
  FakeWS.all[0].onmessage({ data: JSON.stringify({ topic: "realtime:trip-" + A, event: "system", payload: { status: "error", message: "Token has expired" } }) });
  await tick();
  assert.equal(FakeWS.all.length, 2);
  assert.match(FakeWS.all[1].url, /access_token=A2$/);
  FakeWS.all[1].onmessage({ data: JSON.stringify({ topic: "realtime:trip-" + A, event: "phx_close", payload: {} }) });
  S.close();
});

test("kanał odnawia się przed wygaśnięciem tokenu", async () => {
  const timers = [];
  const { S, w } = setup(c => c.u.includes("grant_type=refresh_token") ? res(200, sess({ access_token: "A2", refresh_token: "R2" })) : ok(c));
  w.localStorage.setItem("wypad-auth", JSON.stringify(sess({ expires_at: now() + 120 })));
  const w2 = load(["auth.js", "sync.js"], {
    localStorage: w.localStorage, WebSocket: FakeWS,
    setTimeout: (f, ms) => { timers.push({ f, ms }); return setTimeout(f, 1e6).unref(); },
    fetch: async u => u.includes("grant_type=refresh_token") ? res(200, sess({ access_token: "A2", refresh_token: "R2" })) : res(200, []),
  });
  FakeWS.all = [];
  w2.WypadSync.init(hooks({}));
  await w2.WypadSync.open(A); await tick();
  const t = timers.find(x => x.ms > 60000 && x.ms < 80000);
  assert.ok(t, "brak zegara odnowienia");
  t.f();
  timers.filter(x => x.ms === 0).pop().f(); await tick();
  assert.equal(FakeWS.all.length, 2);
  w2.WypadSync.close();
});

test("błąd tokenu przy łączeniu nie zatrzymuje ponawiania", async () => {
  const timers = [];
  FakeWS.all = [];
  const w0 = load([]);
  w0.localStorage.setItem("wypad-auth", JSON.stringify(sess({ expires_at: now() + 10 })));
  let fail = true;
  const w = load(["auth.js", "sync.js"], {
    localStorage: w0.localStorage, WebSocket: FakeWS,
    setTimeout: (f, ms) => { timers.push({ f, ms }); return setTimeout(f, 1e6).unref(); },
    fetch: async u => { if (u.includes("grant_type=refresh_token")) { if (fail) throw new Error("net"); return res(200, sess({ access_token: "A2" })); } return res(200, []); },
  });
  w.WypadSync.init(hooks({}));
  await w.WypadSync.open(A); await tick();
  assert.equal(FakeWS.all.length, 0);
  const t = timers.find(x => x.ms === 1000);
  assert.ok(t, "brak ponowienia");
  fail = false; t.f(); await tick();
  assert.equal(FakeWS.all.length, 1);
  w.WypadSync.close();
});

test("zamknięcie starego gniazda nie zatrzymuje heartbeatu nowego", async () => {
  FakeWS.all = [];
  const w0 = load([]);
  w0.localStorage.setItem("wypad-auth", JSON.stringify(sess()));
  const cleared = [], started = [];
  const w = load(["auth.js", "sync.js"], {
    localStorage: w0.localStorage, WebSocket: FakeWS,
    setInterval: () => { const h = { id: started.length }; started.push(h); return h; },
    clearInterval: h => { cleared.push(h); },
    fetch: async () => res(200, []),
  });
  const S = w.WypadSync;
  S.init(hooks({}));
  await S.open(A); await tick();
  const old = FakeWS.all[0]; old.readyState = 1; old.onopen();
  S.close(); await S.open(B); await tick();
  const fresh = FakeWS.all[1]; fresh.readyState = 1; fresh.onopen();
  const freshBeat = started[started.length - 1];
  cleared.length = 0;
  old.onclose();
  assert.ok(!cleared.includes(freshBeat), "stary onclose skasował heartbeat nowego gniazda");
  S.close();
});

test("sync wypadu A nie wysyła B przed jego pobraniem", async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const { calls, S } = setup(async c => {
    if (c.fn === "trip_pull" && c.body.p_trip === A) { await gate; return res(200, []); }
    return ok(c);
  });
  S.init(hooks({ k: 1 }));
  const pa = S.open(A);
  await tick();
  const pb = S.open(B);
  release();
  await Promise.all([pa, pb]); await tick();
  const seq = calls.filter(c => c.fn).map(c => c.fn + ":" + c.body.p_trip);
  assert.ok(!seq.includes("trip_push:" + A), "A nie powinien wysłać po zmianie wypadu");
  assert.ok(seq.indexOf("trip_pull:" + B) < seq.indexOf("trip_push:" + B));
  S.close();
});

test("sync zwraca true po udanej wysyłce, a wywołanie w trakcie czeka na powtórkę", async () => {
  let fail = false;
  const items = { a: 1 };
  const { S } = setup(c => fail ? res(500, { message: "boom" }) : ok(c));
  S.init(hooks(items));
  const first = S.open(A), second = S.sync();
  assert.equal(await first, true);
  assert.equal(await second, true);
  fail = true; items.a = 2;
  assert.equal(await S.sync(), false);
  S.close();
  assert.equal(await S.sync(), false);
});

test("oczekujący na sync dostaje false, gdy wypad zamknięto w trakcie", async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const { S } = setup(async c => { await gate; return ok(c); });
  S.init(hooks({ a: 1 }));
  const first = S.open(A), waiter = S.sync();
  S.close();
  release();
  assert.equal(await first, false);
  assert.equal(await waiter, false);
});

test("pierwszy przebieg pada, powtórka w kolejce się udaje: oczekujący dostaje true", async () => {
  let n = 0;
  const { S } = setup(c => (c.fn === "trip_pull" && ++n === 1 ? res(500, { message: "boom" }) : ok(c)));
  S.init(hooks({ a: 1 }));
  const first = S.open(A), waiter = S.sync();
  assert.equal(await first, false);
  assert.equal(await waiter, true);
  S.close();
});

// ---------- poprawki końcowe: nieudany zapis lokalny, ostatnia wysyłka przy zamknięciu, limit czasu ----------
const settle = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 0)); };

test("apply zwraca false (brak miejsca): cień bez zmian, bez wysyłki, potem żadnych null", async () => {
  const items = { a: 1 };
  let full = true;
  const { calls, S, w } = setup(c => c.fn === "trip_pull"
    ? res(200, [{ key: "r", value: { v: 1 }, updated_at: "2026-02-01T00:00:00Z" }]) : ok(c));
  const st = [];
  S.init(hooks(items, { apply: r => { if (full) return false; Object.assign(items, plain(r)); }, onStatus: s => st.push(s) }));
  assert.equal(await S.open(A), false);
  assert.equal(st[st.length - 1], "error");
  assert.equal(calls.filter(c => c.fn === "trip_push").length, 0);
  assert.equal(w.localStorage.getItem("wypad-sync-" + A), null);    // cień nie wyprzedził danych lokalnych
  assert.equal(S.last, null);
  full = false;
  assert.equal(await S.sync(), true);
  const pushed = calls.filter(c => c.fn === "trip_push").map(c => plain(c.body.p_items));
  assert.deepEqual(pushed, [{ a: 1 }]);
  assert.ok(JSON.parse(w.localStorage.getItem("wypad-sync-" + A)).shadow.r);
  S.close();
});

test("zmiana i od razu close(): ostatnia wysyłka w tle z tym kluczem", async () => {
  const items = { a: 1 };
  const { calls, S, w } = setup(ok);
  const st = [];
  S.init(hooks(items, { onStatus: s => st.push(s) }));
  await S.open(A);
  items.v = 1; S.schedule();                 // głos, a po chwili (przed 500 ms) powrót do listy
  S.close();
  await settle();
  const last = calls.filter(c => c.fn === "trip_push").pop();
  assert.equal(last.body.p_trip, A);
  assert.deepEqual(plain(last.body.p_items), { v: 1 });
  assert.ok(JSON.parse(w.localStorage.getItem("wypad-sync-" + A)).shadow.v);
  assert.equal(st[st.length - 1], "off");    // wysyłka w tle nie zmienia statusu
});

test("close() w trakcie synchronizacji: zmiana i tak wysłana", async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const items = { a: 1 };
  let n = 0;
  const { calls, S } = setup(async c => { if (c.fn === "trip_push" && ++n === 2) await gate; return ok(c); });
  S.init(hooks(items));
  await S.open(A);
  items.b = 1;
  const running = S.sync();
  await settle(5);
  items.b = 2;                                // zmiana w trakcie wysyłki b=1
  S.close();
  release();
  await running; await settle();
  const pushes = calls.filter(c => c.fn === "trip_push").map(c => plain(c.body.p_items));
  assert.deepEqual(pushes.pop(), { b: 2 });
});

test("ostatnia wysyłka A po open(B) nie dotyka B", async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const itemsA = { a: 1 }, itemsB = { b: 1 };
  let cur = itemsA;
  const applied = [];
  const { calls, S, w } = setup(async c => {
    // drugie pobranie A (ostatnia wysyłka) czeka, aż otworzymy B, i przynosi cudzy wpis
    if (c.fn === "trip_pull" && c.body.p_trip === A && calls.filter(x => x.fn === "trip_pull" && x.body.p_trip === A).length === 2) {
      await gate; return res(200, [{ key: "zdalny", value: 1, updated_at: "2030-01-01T00:00:00Z" }]);
    }
    return ok(c);
  });
  S.init(hooks(null, { snapshot: () => cur, apply: r => { applied.push(plain(r)); } }));
  await S.open(A);
  applied.length = 0;
  itemsA.x = 1;
  S.close();                                  // ostatnia wysyłka A czeka na pobranie
  cur = itemsB;
  await S.open(B);
  const bState = w.localStorage.getItem("wypad-sync-" + B);
  release(); await settle();
  const forA = calls.filter(c => c.fn === "trip_push" && c.body.p_trip === A).pop();
  assert.deepEqual(plain(forA.body.p_items), { x: 1 });
  assert.ok(!("b" in forA.body.p_items));
  assert.equal(w.localStorage.getItem("wypad-sync-" + B), bState);
  assert.deepEqual(applied, []);              // cudzy wpis z A nie trafił do otwartego B
  assert.equal(S.trip, B);
  const pushesB = calls.filter(c => c.fn === "trip_push" && c.body.p_trip === B).map(c => plain(c.body.p_items));
  assert.deepEqual(pushesB, [{ b: 1 }]);
  // cudzy wpis A nie oznaczony jako znany (ani cień, ani last): następne otwarcie A go wczyta
  const sa = JSON.parse(w.localStorage.getItem("wypad-sync-" + A));
  assert.ok(sa.shadow.x && !("zdalny" in sa.shadow) && !sa.ts.zdalny);
  assert.ok(sa.last < "2030-01-01T00:00:00Z");
  S.close();
});

test("pushTrip: wpisy nieotwartego wypadu od razu na serwer", async () => {
  const { calls, S, w } = setup(ok);
  S.init(hooks({}));
  assert.equal(await S.pushTrip(B, { cfg: { budget: 0 }, "d:sofia": { id: "sofia" } }), true);
  const p = calls.filter(c => c.fn === "trip_push");
  assert.equal(p.length, 1);
  assert.equal(p[0].body.p_trip, B);
  assert.deepEqual(plain(Object.keys(p[0].body.p_items)).sort(), ["cfg", "d:sofia"]);
  assert.ok(JSON.parse(w.localStorage.getItem("wypad-sync-" + B)).shadow["d:sofia"]);
  assert.equal(S.trip, null);
});

test("rpc: zawieszone zapytanie przerwane po limicie czasu, status error, sync znów możliwy", async () => {
  let hang = true;
  const { S } = setup(c => hang
    ? new Promise((_, rej) => c.signal.addEventListener("abort", () => rej(new Error("aborted"))))
    : ok(c));
  S._timeout = 20;
  const st = [];
  S.init(hooks({ a: 1 }, { onStatus: (s, x) => st.push([s, x && x.error]) }));
  assert.equal(await S.open(A), false);
  assert.deepEqual(st[st.length - 1], ["error", "trip_pull timeout"]);
  hang = false;
  assert.equal(await S.sync(), true);
  S.close();
});
