import test from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const U1 = "11111111-1111-1111-1111-111111111111", U2 = "22222222-2222-2222-2222-222222222222";
const T1 = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa", T2 = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const res = (status, body) => ({ ok: status < 400, status, json: async () => body });

const oldState = () => ({
  version: 3, budget: 3000, persons: 2,
  destinations: [
    { id: "sofia", name: "Sofia", out: [], back: [], votes: { K: 1, Z: -1 }, places: [{ id: "p1", name: "Aleksandr Newski", cat: "sight" }] },
    { id: "bari", name: "Bari", out: [], back: [], votes: { K: 1, Z: 1 }, places: [] },
    { id: "porto", name: "Porto", out: [], back: [], votes: { Z: 1 }, places: [] },
    { id: "oslo", name: "Oslo", out: [], back: [], votes: {}, places: [], ratingK: 4 },
  ],
});

function setup({ fetch, create, list = [], syncOk = true, user = { id: U1, login: "krystian" }, v3 = oldState(), pair } = {}) {
  const calls = { create: [], opened: [], sync: 0, fetch: [] };
  const w = load(["group.js", "legacy.js"], {
    WypadAuth: { URL: "https://x.supabase.co", KEY: "pk_test", user, onChange() {} },
    WypadTrips: {
      create: async f => { calls.create.push(f); if (create) return create(f); const t = { id: T1, title: f.title, start: f.start, end: f.end, origin: f.origin, members: [] }; list.push(t); return t; },
      list: () => list, refresh: async () => list,
    },
    WypadSync: { sync: async () => { calls.sync++; return typeof syncOk === "function" ? syncOk() : syncOk; } },
    openTrip: t => calls.opened.push(t.id),
    fetch: async (u, o) => { const c = { u, fn: u.split("/rpc/")[1], body: JSON.parse(o.body), h: o.headers }; calls.fetch.push(c); return fetch ? fetch(c) : res(500, {}); },
  });
  if (v3) w.localStorage.setItem("wypad-v3", JSON.stringify(v3));
  if (pair) w.localStorage.setItem("wypad-sync", JSON.stringify(pair));
  return { w, L: w.WypadLegacy, calls, ls: w.localStorage };
}

test("pending: jest wypad-v3 i nie ma wypad-v3-old", () => {
  const { L, ls } = setup();
  assert.equal(L.pending(), true);
  ls.setItem("wypad-v3-old", "{}");
  assert.equal(L.pending(), false);
  assert.equal(setup({ v3: null }).L.pending(), false);
  const bad = setup({ v3: null }); bad.ls.setItem("wypad-v3", "nie json");
  assert.equal(bad.L.pending(), false);
});

test("convert: głosy K na konto, Z do cfg.legacy, reszta kierunku bez zmian", () => {
  const { L } = setup();
  const { data, items, legacyVotes } = L.convert(oldState(), "K", U1);
  const sofia = data.destinations.find(d => d.id === "sofia");
  assert.equal(sofia.votes[U1], 1);
  assert.equal(sofia.votes.K, undefined);
  assert.equal(data.legacy.Z.sofia, -1);
  assert.equal(data.legacy.K, undefined);
  assert.deepEqual(plain(sofia.places), [{ id: "p1", name: "Aleksandr Newski", cat: "sight" }]);
  assert.equal(data.destinations.find(d => d.id === "oslo").ratingK, 4);
  assert.deepEqual(plain(data.destinations.find(d => d.id === "porto").votes), {});
  assert.equal(data.budget, 3000);
  assert.equal(data.persons, 2);
  assert.equal(data.version, 3);
  assert.equal(items, 4);
  assert.equal(legacyVotes, 3);
});

test("convert: cfg.matched z kierunków, na które K i Z były na tak", () => {
  const { L } = setup();
  assert.deepEqual(plain(L.convert(oldState(), "Z", U2).data.matched), ["bari"]);
  const z = L.convert(oldState(), "Z", U2).data;
  assert.equal(z.destinations.find(d => d.id === "porto").votes[U2], 1);
  assert.deepEqual(plain(z.legacy), { K: { sofia: 1, bari: 1 } });
});

test("convert na SAMPLE_DATA: 29 kierunków", () => {
  const w = load(["data.js"]);
  const s = JSON.parse(JSON.stringify(w.SAMPLE_DATA));
  s.destinations[0].votes = { K: 1, Z: 1 };
  const { L } = setup();
  const { data } = L.convert(s, "K", U1);
  assert.equal(data.destinations.length, 29);
  assert.deepEqual(plain(data.matched), [s.destinations[0].id]);
});

test("claim: oczekujące głosy litery przechodzą na konto i litera znika", () => {
  const { L } = setup();
  const { data } = L.convert(oldState(), "K", U1);
  L.claim(data, "Z", U2);
  assert.equal(data.destinations.find(d => d.id === "sofia").votes[U2], -1);
  assert.equal(data.destinations.find(d => d.id === "porto").votes[U2], 1);
  assert.equal(data.destinations.find(d => d.id === "sofia").votes[U1], 1);
  assert.equal(data.legacy.Z, undefined);
  assert.deepEqual(plain(data.legacy), {});
  assert.deepEqual(plain(L.letters(data)), []);
});

test("claim nie nadpisuje głosów oddanych już z konta", () => {
  const { L } = setup();
  const { data } = L.convert(oldState(), "K", U1);
  data.destinations.find(d => d.id === "sofia").votes[U2] = 1;
  L.claim(data, "Z", U2);
  assert.equal(data.destinations.find(d => d.id === "sofia").votes[U2], 1);
});

test("run: błąd create nie zmienia nazwy wypad-v3", async () => {
  const { L, ls, calls } = setup({ create: async () => { throw new Error("offline"); } });
  const before = ls.getItem("wypad-v3");
  await assert.rejects(L.run("K"), /offline/);
  assert.equal(ls.getItem("wypad-v3"), before);
  assert.equal(ls.getItem("wypad-v3-old"), null);
  assert.equal(calls.opened.length, 0);
  assert.equal(L.pending(), true);
});

test("run: zapis, otwarcie, synchronizacja, a dopiero potem wypad-v3 → wypad-v3-old", async () => {
  const { L, ls, calls } = setup();
  const raw = ls.getItem("wypad-v3");
  const id = await L.run("K");
  assert.equal(id, T1);
  assert.deepEqual(plain(calls.create), [{ title: "Wypad we dwoje", start: "2026-11-19", end: "2026-11-24", origin: "KRK" }]);
  assert.deepEqual(plain(calls.opened), [T1]);
  assert.equal(calls.sync, 1);
  const data = JSON.parse(ls.getItem("wypad-trip-" + T1));
  assert.equal(data.destinations.length, 4);
  assert.equal(data.destinations[0].votes[U1], 1);
  assert.equal(ls.getItem("wypad-v3"), null);
  assert.equal(ls.getItem("wypad-v3-old"), raw);
  assert.equal(ls.getItem("wypad-legacy-trip"), null);
  assert.equal(L.pending(), false);
});

test("run: nieudana synchronizacja zostawia wypad-v3, a ponowienie używa tego samego wypadu", async () => {
  let ok = false;
  const list = [];
  const { L, ls, calls } = setup({ list, syncOk: () => ok });
  await assert.rejects(L.run("K"), /sync/);
  assert.ok(ls.getItem("wypad-v3"));
  assert.equal(ls.getItem("wypad-v3-old"), null);
  assert.equal(ls.getItem("wypad-legacy-trip"), T1);
  assert.equal(calls.create.length, 1);
  ok = true;
  assert.equal(await L.run("K"), T1);
  assert.equal(calls.create.length, 1);
  assert.deepEqual(plain(calls.opened), [T1, T1]);
  assert.equal(ls.getItem("wypad-v3"), null);
  assert.ok(ls.getItem("wypad-v3-old"));
});

test("run nie rusza wypad-sync", async () => {
  const pair = { room: "abcdefghijklmnop1234", shadow: { x: "1" }, ts: {}, last: null };
  const { L, ls } = setup({ pair, fetch: () => res(200, []) });
  await L.run("K");
  assert.deepEqual(JSON.parse(ls.getItem("wypad-sync")), pair);
});

test("para: wypad_pull z kluczem publishable nakłada stan pary, z tombstone", async () => {
  const rows = [
    { key: "cfg", value: { budget: 4200, persons: 2 }, updated_at: "2026-10-02T10:00:00Z" },
    { key: "v:sofia:Z", value: 1, updated_at: "2026-10-02T10:00:00Z" },
    { key: "v:bari:Z", value: null, updated_at: "2026-10-02T10:00:00Z" },
    { key: "v:oslo:K", value: -1, updated_at: "2026-10-02T10:00:00Z" },
    { key: "d:malta", value: { id: "malta", name: "Malta", out: [], back: [] }, updated_at: "2026-10-02T10:00:00Z" },
    { key: "v:malta:Z", value: 1, updated_at: "2026-10-02T10:00:00Z" },
    { key: "d:porto", value: null, updated_at: "2026-10-02T10:00:00Z" },
    { key: "p:sofia:p1", value: null, updated_at: "2026-10-02T10:00:00Z" },
    { key: "p:bari:p2", value: { id: "p2", name: "Bazylika", cat: "sight" }, updated_at: "2026-10-02T10:00:00Z" },
    { key: "d:oslo", value: { id: "oslo", name: "Oslo (stare)" }, updated_at: "2026-09-01T10:00:00Z" },
    { key: "v:x:y:z", value: 1, updated_at: "2026-10-02T10:00:00Z" },
  ];
  const pair = { room: "abcdefghijklmnop1234", shadow: {}, ts: { "d:oslo": "2026-09-05T10:00:00Z" }, last: "2026-09-05T10:00:00Z" };
  const { L, ls, calls } = setup({ pair, fetch: c => res(200, c.fn === "wypad_pull" ? rows : []) });
  await L.run("K");
  const pull = calls.fetch.find(c => c.fn === "wypad_pull");
  assert.deepEqual(plain(pull.body), { p_room: "abcdefghijklmnop1234", p_since: null });
  assert.equal(pull.u, "https://x.supabase.co/rest/v1/rpc/wypad_pull");
  assert.equal(pull.h.apikey, "pk_test");
  assert.equal(pull.h.Authorization, undefined);
  const data = JSON.parse(ls.getItem("wypad-trip-" + T1));
  const d = id => data.destinations.find(x => x.id === id);
  assert.equal(data.budget, 4200);
  assert.equal(data.legacy.Z.sofia, 1);
  assert.equal(data.legacy.Z.bari, undefined);
  assert.equal(d("oslo").votes[U1], -1);
  assert.equal(d("oslo").name, "Oslo");          // wpis starszy niż znany: pominięty
  assert.equal(d("malta").name, "Malta");
  assert.equal(data.legacy.Z.malta, 1);
  assert.equal(d("porto"), undefined);
  assert.deepEqual(plain(d("sofia").places), []);
  assert.equal(d("bari").places[0].name, "Bazylika");
  assert.deepEqual(plain(data.matched), ["sofia"]); // bari: Z cofnęła tak po stronie pary; sofia: Z dała tak
  assert.ok(ls.getItem("wypad-v3-old"));
});

test("para: błąd wypad_pull przerywa przeniesienie, nic się nie tworzy", async () => {
  const pair = { room: "abcdefghijklmnop1234" };
  const { L, ls, calls } = setup({ pair, fetch: () => res(503, {}) });
  await assert.rejects(L.run("K"));
  assert.equal(calls.create.length, 0);
  assert.ok(ls.getItem("wypad-v3"));
});

test("existing: wypad „Wypad we dwoje” od 2026-11-19 na liście, ale nie nasz wcześniejszy", () => {
  const list = [{ id: T2, title: "Wypad we dwoje", start: "2026-11-19", end: "2026-11-24", members: [] }];
  const { L, ls } = setup({ list });
  assert.equal(L.existing().id, T2);
  ls.setItem("wypad-legacy-trip", T2);
  assert.equal(L.existing(), null);
  assert.equal(setup({ list: [{ id: T2, title: "Inny", start: "2026-11-19" }] }).L.existing(), null);
});

test("merge: głosy z tego telefonu dołączone do istniejącego wypadu, brakujące kierunki dochodzą w całości", () => {
  const { L } = setup();
  const theirs = L.convert(oldState(), "K", U1).data;   // wypad przeniesiony na drugim telefonie przez Krystiana
  theirs.destinations = theirs.destinations.filter(d => d.id !== "oslo");
  theirs.destinations.find(d => d.id === "sofia").name = "Sofia (zmieniona)";
  const mine = oldState();
  mine.destinations.find(d => d.id === "porto").votes = { Z: -1 };   // ten telefon wie co innego niż legacy
  mine.destinations.find(d => d.id === "oslo").votes = { K: 1, Z: 1 };
  L.merge(theirs, mine, "Z", U2);
  const d = id => theirs.destinations.find(x => x.id === id);
  assert.equal(d("porto").votes[U2], -1);
  assert.equal(d("sofia").votes[U2], -1);
  assert.equal(d("sofia").name, "Sofia (zmieniona)");   // kierunek z wypadu zostaje taki, jaki jest
  assert.equal(d("bari").votes[U2], 1);
  assert.equal(d("oslo").ratingK, 4);                    // brakujący kierunek dochodzi w całości
  assert.equal(d("oslo").votes[U2], 1);
  assert.equal(theirs.legacy.K.oslo, 1);                 // głos drugiej litery z dodanego kierunku czeka w legacy
  assert.equal(theirs.legacy.Z, undefined);
  assert.deepEqual(plain(theirs.matched).sort(), ["bari", "oslo"]);
  assert.equal(L.covers(theirs, mine), true);
});

test("merge do pustego wypadu (zgubiona odpowiedź create_trip): wszystkie kierunki z miejscami i głosami", () => {
  const { L } = setup();
  const empty = { version: 3, budget: 0, persons: 1, destinations: [] };
  assert.equal(L.covers(empty, oldState()), false);
  L.merge(empty, oldState(), "K", U1);
  assert.deepEqual(plain(empty.destinations.map(d => d.id)), ["sofia", "bari", "porto", "oslo"]);
  assert.equal(empty.destinations[0].places[0].name, "Aleksandr Newski");
  assert.equal(empty.destinations[0].votes[U1], 1);
  assert.deepEqual(plain(empty.legacy), { Z: { sofia: -1, bari: 1, porto: 1 } });
  assert.deepEqual(plain(empty.matched), ["bari"]);
  assert.equal(empty.budget, 3000);
  assert.equal(empty.persons, 2);
  assert.equal(L.covers(empty, oldState()), true);
});

test("run z istniejącym wypadem bez edycji danych (brak editTrip): wypad-v3 zostaje", async () => {
  const list = [{ id: T2, title: "Wypad we dwoje", start: "2026-11-19", end: "2026-11-24", members: [] }];
  const { L, ls } = setup({ list });
  await assert.rejects(L.run("K", { into: list[0] }), /merge_failed/);
  assert.ok(ls.getItem("wypad-v3"));
  assert.equal(ls.getItem("wypad-v3-old"), null);
});

test("run: zawieszona synchronizacja kończy się po limicie czasu, wypad-v3 zostaje", async () => {
  const { L, ls } = setup({ syncOk: () => new Promise(() => {}) });
  await assert.rejects(L.run("K", { timeout: 30 }), /sync_failed/);
  assert.ok(ls.getItem("wypad-v3"));
});

test("run: zawieszony wypad_pull przerwany po limicie czasu", async () => {
  const pair = { room: "abcdefghijklmnop1234" };
  let aborted = false;
  const { L, ls, calls, w } = setup({ pair });
  w.fetch = (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => { aborted = true; rej(new Error("aborted")); }));
  await assert.rejects(L.run("K", { timeout: 30 }));
  assert.equal(aborted, true);
  assert.equal(calls.create.length, 0);
  assert.ok(ls.getItem("wypad-v3"));
});

// ---------- prawdziwe sync.js + rdzeń app.js z group.js (normalize, toItems, applyItems) na udawanym serwerze ----------
const now = () => Math.floor(Date.now() / 1000);
function server() {
  const rows = new Map(), pushes = [];
  let clock = 0;
  const at = () => new Date(Date.UTC(2026, 10, 4, 12) + (++clock) * 1000).toISOString();
  return {
    rows, pushes, down: false,
    write(key, value) { rows.set(key, { value, updated_at: at() }); },
    async fetch(u, o) {
      const fn = u.split("/rpc/")[1], body = JSON.parse(o.body);
      if (this.down) return res(503, { message: "down" });
      if (fn === "trip_push") {
        pushes.push(body.p_items);
        return res(200, Object.entries(body.p_items).map(([key, value]) => { this.write(key, value); return { key, updated_at: rows.get(key).updated_at }; }));
      }
      if (fn === "trip_pull") return res(200, [...rows].filter(([, r]) => !body.p_since || r.updated_at > body.p_since).map(([key, r]) => ({ key, value: r.value, updated_at: r.updated_at })));
      if (fn === "wypad_pull") return res(200, []);
      return res(404, {});
    },
  };
}
function phone(srv, { user = U1, list = [], v3 = oldState(), autoRename = true } = {}) {
  const w0 = load([]);
  w0.localStorage.setItem("wypad-auth", JSON.stringify({ access_token: "A", refresh_token: "R", expires_at: now() + 3600, user: { id: user, email: "x@wypad.app", user_metadata: { login: "x" } } }));
  if (v3) w0.localStorage.setItem("wypad-v3", JSON.stringify(v3));
  const created = [];
  const w = load(["auth.js", "group.js", "sync.js", "legacy.js"], {
    localStorage: w0.localStorage,
    WypadTrips: {
      create: async f => { const t = { id: T1, title: f.title, start: f.start, end: f.end, origin: f.origin, members: [] }; created.push(t); list.push(t); return t; },
      list: () => list, refresh: async () => list,
    },
    fetch: (u, o) => srv.fetch(u, o),
  });
  const G = w.WypadGroup, ls = w.localStorage;
  const app = { S: null, id: null };
  const persist = () => ls.setItem("wypad-trip-" + app.id, JSON.stringify(app.S));
  w.WypadSync.init({
    snapshot: () => G.toItems(app.S),
    apply: r => { const { matched } = G.applyItems(app.S, r, []); if (matched) app.S.matched = [...new Set([...matched, ...app.S.matched])]; persist(); },
    onStatus: st => { if (autoRename && st === "ok" && w.navigator.onLine) w.WypadLegacy.synced(w.WypadSync.trip); },
    onGone() {},
  });
  w.openTrip = t => { app.id = t.id; let s = null; try { s = JSON.parse(ls.getItem("wypad-trip-" + t.id)); } catch {} app.S = G.normalize(s, 1); w.WypadSync.open(t.id); };
  w.editTrip = fn => { fn(app.S); app.S = G.normalize(app.S, 1); persist(); return true; };
  return { w, L: w.WypadLegacy, ls, app, created, list, G };
}
const nulls = pushes => pushes.flatMap(p => Object.keys(p).filter(k => p[k] === null));

test("w obie strony: convert → normalize → toItems → trip_push → trip_pull → applyItems zachowuje legacy i matched", async () => {
  const srv = server();
  const a = phone(srv);
  assert.equal(await a.L.run("K"), T1);
  a.w.WypadSync.close();
  assert.deepEqual(plain(srv.rows.get("cfg").value.legacy), { Z: { sofia: -1, bari: 1, porto: 1 } });
  const b = phone(srv, { user: U2, v3: null, list: [...a.list] });
  b.w.openTrip(a.list[0]);
  assert.equal(await b.w.WypadSync.sync(), true);
  assert.deepEqual(plain(b.app.S.legacy), { Z: { sofia: -1, bari: 1, porto: 1 } });
  assert.deepEqual(plain(b.app.S.matched), ["bari"]);
  assert.equal(b.app.S.destinations.length, 4);
  assert.equal(b.app.S.destinations.find(d => d.id === "sofia").places[0].name, "Aleksandr Newski");
  b.w.editTrip(s => b.L.claim(s, "Z", U2));
  assert.equal(await b.w.WypadSync.sync(), true);
  b.w.WypadSync.close();
  assert.deepEqual(plain(srv.rows.get("cfg").value.legacy), {});
  assert.equal(srv.rows.get(`v:porto:${U2}`).value, 1);
  assert.deepEqual(nulls(srv.pushes), []);
});

test("ponowienie po nieudanej synchronizacji nie nadpisuje kopii i nie wysyła usunięć nowszych wpisów", async () => {
  const srv = server();
  const p = phone(srv, { autoRename: false });     // stara ścieżka bez automatycznego końca: tu liczy się samo ponowienie
  srv.down = true;
  await assert.rejects(p.L.run("K"), /sync_failed/);
  assert.equal(p.ls.getItem("wypad-legacy-trip"), T1);
  assert.equal(p.ls.getItem("wypad-legacy-written"), T1);
  // „Nie teraz”, dalsze używanie wypadu: nowy głos i miejsce wysłane w tle, a na serwerze pojawia się przejęcie Zuzi
  srv.down = false;
  p.w.editTrip(s => {
    s.destinations.find(d => d.id === "oslo").votes[U1] = -1;
    s.destinations.find(d => d.id === "bari").places.push({ id: "p7", name: "Nowe miejsce", cat: "food" });
  });
  srv.write(`v:porto:${U2}`, 1);
  srv.write("cfg", { budget: 3000, persons: 2, matched: ["bari"], legacy: {} });
  assert.equal(await p.w.WypadSync.sync(), true);
  const shadow = JSON.parse(p.ls.getItem("wypad-sync-" + T1)).shadow;
  assert.ok(shadow[`v:oslo:${U1}`] && shadow["p:bari:p7"] && shadow[`v:porto:${U2}`]);
  assert.ok(p.ls.getItem("wypad-v3"));
  const before = srv.pushes.length;
  assert.equal(await p.L.run("K"), T1);
  p.w.WypadSync.close();
  assert.equal(p.created.length, 1);
  assert.deepEqual(nulls(srv.pushes.slice(before)), []);
  assert.equal(srv.rows.get(`v:oslo:${U1}`).value, -1);
  assert.equal(srv.rows.get("p:bari:p7").value.name, "Nowe miejsce");
  assert.deepEqual(plain(srv.rows.get("cfg").value.legacy), {});
  const local = JSON.parse(p.ls.getItem("wypad-trip-" + T1));
  assert.equal(local.destinations.find(d => d.id === "porto").votes[U2], 1);
  assert.equal(p.ls.getItem("wypad-v3"), null);
  assert.ok(p.ls.getItem("wypad-v3-old"));
  assert.equal(p.ls.getItem("wypad-legacy-trip"), null);
  assert.equal(p.ls.getItem("wypad-legacy-written"), null);
});

test("po nieudanym przeniesieniu pierwsza udana synchronizacja wypadu sama kończy przeniesienie", async () => {
  const srv = server();
  const p = phone(srv);
  srv.down = true;
  await assert.rejects(p.L.run("K"));
  assert.equal(p.L.pending(), true);
  srv.down = false;
  assert.equal(await p.w.WypadSync.sync(), true);
  p.w.WypadSync.close();
  assert.equal(p.L.pending(), false);
  assert.ok(p.ls.getItem("wypad-v3-old"));
  assert.equal(srv.rows.get("d:oslo").value.ratingK, 4);
});

test("dołączenie do pustego bliźniaka: wszystkie kierunki na serwerze przed zmianą nazwy", async () => {
  const srv = server();
  const twin = { id: T2, title: "Wypad we dwoje", start: "2026-11-19", end: "2026-11-24", members: [] };
  const p = phone(srv, { list: [twin] });
  assert.equal(p.L.existing().id, T2);
  assert.equal(await p.L.run("K", { into: twin }), T2);
  p.w.WypadSync.close();
  assert.equal(p.created.length, 0);
  for (const id of ["sofia", "bari", "porto", "oslo"]) assert.ok(srv.rows.get("d:" + id), id);
  assert.equal(srv.rows.get(`v:sofia:${U1}`).value, 1);
  assert.equal(srv.rows.get("p:sofia:p1").value.name, "Aleksandr Newski");
  assert.deepEqual(plain(srv.rows.get("cfg").value.legacy), { Z: { sofia: -1, bari: 1, porto: 1 } });
  assert.ok(p.ls.getItem("wypad-v3-old"));
});

test("dołączenie do częściowego bliźniaka: brakujące kierunki dochodzą, istniejące zostają", async () => {
  const srv = server();
  const U3 = "33333333-3333-3333-3333-333333333333";
  srv.write("d:sofia", { id: "sofia", name: "Sofia (z wypadu)", out: [], back: [] });
  srv.write(`v:sofia:${U3}`, 1);
  const twin = { id: T2, title: "Wypad we dwoje", start: "2026-11-19", end: "2026-11-24", members: [] };
  const p = phone(srv, { list: [twin] });
  assert.equal(await p.L.run("K", { into: twin }), T2);
  p.w.WypadSync.close();
  assert.equal(srv.rows.get("d:sofia").value.name, "Sofia (z wypadu)");
  assert.equal(srv.rows.get(`v:sofia:${U3}`).value, 1);
  assert.equal(srv.rows.get(`v:sofia:${U1}`).value, 1);
  for (const id of ["bari", "porto", "oslo"]) assert.ok(srv.rows.get("d:" + id), id);
  assert.deepEqual(nulls(srv.pushes), []);
  assert.ok(p.ls.getItem("wypad-v3-old"));
});

test("cleanCfg: legacy przechodzi przez sito i wraca w obie strony", () => {
  const g = load(["group.js"]).WypadGroup;
  const legacy = { K: { sofia: 1, bari: -1 }, Z: { porto: 1 } };
  const c = g.cleanCfg({ budget: 1, persons: 2, matched: [], legacy });
  assert.deepEqual(plain(c.legacy), legacy);
  assert.deepEqual(plain(g.cleanCfg(JSON.parse(JSON.stringify(c))).legacy), legacy);
  assert.deepEqual(plain(g.cleanCfg({ legacy: { K: { sofia: 2, "a b": 1, ok: -1 }, X: { a: 1 }, Z: "x" } }).legacy), { K: { ok: -1 } });
  assert.deepEqual(plain(g.cleanCfg({ legacy: {} }).legacy), {});
  assert.equal("legacy" in g.cleanCfg({ budget: 1 }), false);
  assert.equal("legacy" in g.cleanCfg({ legacy: [1] }), false);
});

// ---------- okno pytania: udawany DOM (dialog, klasa in-trips, MutationObserver, sessionStorage) ----------
function dialogSetup(session) {
  const observers = [];
  const classes = new Set(["in-trips"]);
  const btn = mv => ({ dataset: { mv }, disabled: false, focus() {}, closest: () => btn(mv) });
  const body = { innerHTML: "", querySelector: s => ({ focus() {}, textContent: "", classList: { toggle() {} } }), querySelectorAll: () => [] };
  const listeners = {};
  const dlg = {
    open: false, shown: 0,
    querySelector: () => body,
    setAttribute() {},
    showModal() { this.open = true; this.shown++; },
    close() { this.open = false; },
    addEventListener(t, fn) { listeners[t] = fn; },
  };
  const root = { classList: { contains: c => classes.has(c), add: c => classes.add(c), remove: c => classes.delete(c) } };
  const store = new Map();
  const sessionStorage = session || { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
  const w = load(["group.js", "legacy.js"], {
    document: { hidden: false, addEventListener() {}, removeEventListener() {}, documentElement: root, getElementById: id => (id === "legacy" ? dlg : null) },
    MutationObserver: class { constructor(fn) { observers.push(fn); } observe() {} },
    sessionStorage,
    WypadAuth: { URL: "https://x.supabase.co", KEY: "pk", user: { id: U1 }, onChange() {} },
    WypadTrips: { list: () => [], refresh: async () => [] },
  });
  w.localStorage.setItem("wypad-v3", JSON.stringify(oldState()));
  const tick = () => new Promise(r => setTimeout(r, 5));
  const leave = () => { classes.delete("in-trips"); observers.forEach(f => f()); };
  const enter = () => { classes.add("in-trips"); observers.forEach(f => f()); };
  return { w, dlg, listeners, tick, leave, enter, store };
}

test("okno: każde wejście na listę pyta znowu, dopóki nikt nie wybrał „Nie teraz”", async () => {
  const { w, dlg, tick, leave, enter } = dialogSetup();
  w.WypadLegacy.ask();
  assert.equal(dlg.shown, 1);
  dlg.close();                                   // zamknięte bez decyzji (np. wylogowanie)
  leave(); enter(); await tick();
  assert.equal(dlg.shown, 2);
});

test("okno: po „Nie teraz” ponowne wejście na listę nie otwiera pytania do końca sesji", async () => {
  const { w, dlg, listeners, tick, leave, enter, store } = dialogSetup();
  w.WypadLegacy.ask();
  assert.equal(dlg.shown, 1);
  await listeners.click({ target: { closest: () => ({ dataset: { mv: "later" } }) } });
  assert.equal(dlg.open, false);
  leave(); enter(); await tick();
  w.WypadLegacy.ask();
  assert.equal(dlg.shown, 1);
  assert.ok([...store.keys()].length);           // zapisane w sessionStorage
});

test("okno: Escape liczy się jak „Nie teraz”, także bez działającego sessionStorage", async () => {
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } };
  const { w, dlg, listeners, tick, leave, enter } = dialogSetup(broken);
  w.WypadLegacy.ask();
  listeners.cancel({ preventDefault() {} });
  dlg.close();
  leave(); enter(); await tick();
  assert.equal(dlg.shown, 1);
});
