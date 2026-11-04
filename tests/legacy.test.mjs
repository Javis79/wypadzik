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

test("merge: głosy z tego telefonu dołączone do istniejącego wypadu", () => {
  const { L } = setup();
  const theirs = L.convert(oldState(), "K", U1).data;   // wypad przeniesiony na drugim telefonie przez Krystiana
  theirs.destinations = theirs.destinations.filter(d => d.id !== "oslo");
  const mine = oldState();
  mine.destinations.find(d => d.id === "porto").votes = { Z: -1 };   // ten telefon wie co innego niż legacy
  L.merge(theirs, mine, "Z", U2);
  const d = id => theirs.destinations.find(x => x.id === id);
  assert.equal(d("porto").votes[U2], -1);
  assert.equal(d("sofia").votes[U2], -1);
  assert.equal(d("bari").votes[U2], 1);
  assert.equal(d("oslo"), undefined);
  assert.equal(theirs.legacy.Z, undefined);
  assert.deepEqual(plain(theirs.matched), ["bari"]);
});

test("run z istniejącym wypadem: bez create, edycja przez editTrip, potem zmiana nazwy", async () => {
  const list = [{ id: T2, title: "Wypad we dwoje", start: "2026-11-19", end: "2026-11-24", members: [] }];
  const { w, L, ls, calls } = setup({ list });
  const theirs = L.convert(oldState(), "K", "33333333-3333-3333-3333-333333333333").data;
  let edited = null;
  w.editTrip = fn => { fn(theirs); edited = theirs; return true; };
  assert.equal(await L.run("K", { into: list[0] }), T2);
  assert.equal(calls.create.length, 0);
  assert.deepEqual(plain(calls.opened), [T2]);
  assert.equal(calls.sync, 2);
  assert.equal(edited.destinations.find(d => d.id === "sofia").votes[U1], 1);
  assert.equal(ls.getItem("wypad-v3"), null);
  assert.ok(ls.getItem("wypad-v3-old"));
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
