import test from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const now = () => Math.floor(Date.now() / 1000);
const sess = (over = {}) => ({
  access_token: "A1", refresh_token: "R1", expires_at: now() + 3600,
  user: { id: "u1", email: "zuzia@wypad.app", user_metadata: { login: "zuzia", name: "Zuzia" } }, ...over,
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
    fetch: async (u, o) => { const c = { u, fn: u.split("/rpc/")[1], body: o.body ? JSON.parse(o.body) : null, h: o.headers }; calls.push(c); return fetchImpl(c); },
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
