import test from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const G = () => load(["group.js"]).WypadGroup;
const F = () => load(["flights.js"]).WypadFlights;
const M3 = [{ id: "k", name: "Krystian" }, { id: "z", name: "Zuzia" }, { id: "x", name: "Ola" }];

// ---------- głosowanie w grupie ----------
test("isMatch: 3 członków, 2 na tak to brak matcha, 3 na tak to match", () => {
  const g = G();
  const d = { id: "sofia", votes: { k: 1, z: 1 } };
  assert.equal(g.isMatch(d, M3, {}), false);
  d.votes.x = 1;
  assert.equal(g.isMatch(d, M3, {}), true);
});

test("isMatch: jedno „nie” albo brak członków to brak matcha", () => {
  const g = G();
  assert.equal(g.isMatch({ id: "a", votes: { k: 1, z: -1, x: 1 } }, M3, {}), false);
  assert.equal(g.isMatch({ id: "a", votes: {} }, [], {}), false);
  assert.equal(g.isMatch({ id: "a", votes: { k: 1 } }, M3, undefined), false);
});

test("isMatch: cfg.matched z „sofia” i nowy członek bez głosu nadal daje match", () => {
  const g = G();
  const d = { id: "sofia", votes: { k: 1, z: 1 } };
  const four = [...M3, { id: "n", name: "Nowy" }];
  assert.equal(g.isMatch(d, four, { matched: ["sofia"] }), true);
  assert.equal(g.isMatch({ id: "bari", votes: {} }, four, { matched: ["sofia"] }), false);
});

test("voteTags: 6 członków daje 3 pokazane i +3", () => {
  const g = G();
  const six = ["Ania", "Bartek", "Celina", "Darek", "Ewa", "Filip"].map((name, i) => ({ id: "u" + i, name }));
  const t = g.voteTags({ id: "a", votes: { u0: 1, u4: -1 } }, six, "u4");
  assert.equal(t.shown.length, 3);
  assert.equal(t.more, 3);
  // ja na początku, potem reszta w kolejności z wypadu
  assert.deepEqual(plain(t.shown[0]), { id: "u4", initial: "E", v: -1, name: "Ewa" });
  assert.deepEqual(plain(t.shown.map(x => x.id)), ["u4", "u0", "u1"]);
});

test("voteTags: do 4 osób pokazuje wszystkich, bez +N", () => {
  const g = G();
  const t = g.voteTags({ id: "a", votes: { z: 1 } }, M3, "k");
  assert.equal(t.more, 0);
  assert.deepEqual(plain(t.shown.map(x => [x.initial, x.v])), [["K", 0], ["Z", 1], ["O", 0]]);
  const four = [...M3, { id: "n", name: "Nina" }];
  assert.equal(g.voteTags({ id: "a", votes: {} }, four, "k").shown.length, 4);
});

test("matchLine: jedna osoba z imieniem, dwie i więcej to „Wszyscy chcą!”", () => {
  const g = G();
  assert.equal(g.matchLine([{ name: "Zuzia" }]), "Zuzia też chce!");
  assert.equal(g.matchLine([{ name: "Zuzia" }, { name: "Ola" }]), "Wszyscy chcą!");
  assert.equal(g.matchLine([{ login: "ola_k" }]), "ola_k też chce!");
});

test("initials: unikalne, drugi na K dostaje dwie litery", () => {
  const g = G();
  assert.deepEqual(plain(g.initials([{ name: "Krystian" }, { name: "Kasia" }, { name: "Zuzia" }])), ["K", "Ka", "Z"]);
  const same = plain(g.initials([{ name: "Ola" }, { name: "Ola" }]));
  assert.notEqual(same[0], same[1]);
  assert.deepEqual(plain(g.initials([{ name: "", login: "ala" }])), ["A"]);
});

// ---------- loty: dowolne dni tygodnia i daty ----------
test("pairs: loty z datą w dowolne dni, powrót co najmniej dzień po wylocie", () => {
  const f = F();
  const d = {
    out: [{ day: "śr", dep: "06:00", arr: "08:00", price: 100, date: "2026-12-02" }, { day: "pt", dep: "06:00", arr: "08:00", price: 90, date: "2026-12-04" }],
    back: [{ day: "pt", dep: "20:00", arr: "22:00", price: 80, date: "2026-12-04" }, { day: "pon", dep: "20:00", arr: "22:00", price: 70, date: "2026-12-07" }],
  };
  assert.deepEqual(plain(f.pairs(d, "")), [[0, 0, 2], [0, 1, 5], [1, 1, 3]]);
  // limit powrotu jako data
  assert.deepEqual(plain(f.pairs(d, "2026-12-05")), [[0, 0, 2]]);
});

test("pairs: przejście przez koniec miesiąca i roku", () => {
  const f = F();
  const d = { out: [{ day: "pon", dep: "06:00", arr: "08:00", price: 1, date: "2026-12-28" }], back: [{ day: "sob", dep: "06:00", arr: "08:00", price: 1, date: "2027-01-02" }] };
  assert.deepEqual(plain(f.pairs(d, "")), [[0, 0, 5]]);
});

test("pairs: stare loty bez daty (czw…wt) jak dotąd, z limitem dnia", () => {
  const f = F();
  const d = {
    out: [{ day: "czw", dep: "07:05", arr: "09:00", price: 83 }, { day: "pt", dep: "11:30", arr: "13:25", price: 149 }],
    back: [{ day: "ndz", dep: "08:35", arr: "10:30", price: 441 }, { day: "wt", dep: "09:25", arr: "11:20", price: 375 }],
  };
  assert.deepEqual(plain(f.pairs(d, "pon")), [[0, 0, 3], [1, 0, 2]]);
  assert.deepEqual(plain(f.pairs(d, "")), [[0, 0, 3], [0, 1, 5], [1, 0, 2], [1, 1, 4]]);
});

test("gap i legDate: data ma pierwszeństwo, stare dni mapują się na listopad 2026", () => {
  const f = F();
  assert.equal(f.gap({ day: "sob", date: "2026-12-05" }, { day: "wt", date: "2026-12-08" }), 3);
  assert.equal(f.gap({ day: "czw" }, { day: "wt" }), 5);
  assert.equal(f.gap({ day: "śr" }, { day: "pt" }), 2);
  assert.equal(f.legDate({ day: "pon", date: "2026-12-07" }), "2026-12-07");
  assert.equal(f.legDate({ day: "pon" }), "2026-11-23");
  assert.equal(f.legDate({ day: "śr" }), null);
  assert.equal(f.short({ day: "pon", date: "2026-12-07" }), "07.12");
  assert.equal(f.short({ day: "czw" }), "19.11");
});

test("lines/parse: data przechodzi w obie strony bez zmian", () => {
  const f = F();
  const legs = [
    { day: "śr", dep: "06:05", arr: "09:25", price: 114, note: "", date: "2026-12-02" },
    { day: "pon", dep: "21:10", arr: "00:05", price: 789, note: "SOF", date: "2027-01-04" },
    { day: "czw", dep: "07:05", arr: "09:00", price: 83, note: "promo" },
  ];
  const txt = f.lines(legs);
  assert.equal(txt.split("\n")[0], "śr 02.12 06:05-09:25 114");
  const back = f.parse(txt, "2026-12-01");
  assert.deepEqual(plain(back), plain(legs).map(l => ({ ...l })));
  assert.equal(f.lines(back), txt);
});

test("parse: dzień z daty, rok najbliższy początkowi wypadu, złe linie to null", () => {
  const f = F();
  const [a] = f.parse("02.01 6.05-9.25 50", "2026-12-30");
  assert.deepEqual(plain(a), { day: "sob", dep: "6:05", arr: "9:25", price: 50, note: "", date: "2027-01-02" });
  assert.deepEqual(plain(f.parse("sr 06:00-08:00 10", "2026-12-01")), [{ day: "śr", dep: "06:00", arr: "08:00", price: 10, note: "" }]);
  assert.deepEqual(plain(f.parse("jutro 06:00-08:00 10\n\n", "2026-12-01")), [null]);
});
