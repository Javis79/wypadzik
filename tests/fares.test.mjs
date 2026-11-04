import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { load, plain } from "./load.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/ryanair-roundtrip.json", import.meta.url), "utf8"));
const airportsJson = JSON.parse(fs.readFileSync(new URL("../airports.json", import.meta.url), "utf8"));
// airports.json zwraca prawdziwą listę, reszta (ceny) podaną treść
const route = (body, log = []) => async (u, o) => {
  log.push(u);
  return { ok: true, status: 200, json: async () => (u === "airports.json" ? airportsJson : body === "fixture" ? fixture : body) };
};
const okFetch = body => route(body);
const params = { origin: "KRK", outFrom: "2026-11-19", outTo: "2026-11-20", backFrom: "2026-11-22", backTo: "2026-11-24" };

test("parse: 57 ofert, pierwsza Newcastle", () => {
  const { WypadFares } = load(["fares.js"]);
  const offers = WypadFares.parse(fixture);
  assert.equal(offers.length, 57);
  assert.equal(offers[0].city, "Newcastle");
  assert.equal(offers[0].total, 170);
  assert.equal(offers[0].out.dep, "21:55");
  assert.equal(offers[0].out.day, "pt");
  assert.equal(offers[0].out.date, "2026-11-20");
});

test("groupByCity na prawdziwych danych scala lotniska miasta", () => {
  const { WypadFares } = load(["fares.js"]);
  const offers = WypadFares.parse(fixture, airportsJson);
  const g = WypadFares.groupByCity(offers);
  const city = n => g.find(x => x.city === n);
  assert.deepEqual(plain(city("Mediolan").offers.map(o => o.code).sort()), ["BGY", "MXP"]);
  const l = city("Londyn");
  assert.deepEqual(plain(l.offers.map(o => o.code).sort()), ["LTN", "STN"]);
  assert.equal(l.cheapest.total, Math.min(...l.offers.map(o => o.total)));
  assert.ok(city("Oslo").offers.some(o => o.code === "TRF"));
  const t = g.map(x => x.cheapest.total);
  assert.deepEqual(plain(t), [...t].sort((x, y) => x - y));
});

test("parse: pomija uszkodzone przeloty", () => {
  const { WypadFares } = load(["fares.js"]);
  const bad = { fares: [{ outbound: {}, inbound: {} }, { summary: {} }, fixture.fares[0]] };
  assert.equal(WypadFares.parse(bad).length, 1);
});

test("search: zły kształt cache jest ignorowany", async () => {
  const w = load(["fares.js"], { fetch: route("fixture") });
  w.localStorage.setItem("wypad-fares:KRK:2026-11-19:2026-11-20:2026-11-22:2026-11-24", JSON.stringify({ at: Date.now(), offers: "x" }));
  assert.equal((await w.WypadFares.search(params)).length, 57);
});

test("search: timeout po braku odpowiedzi", async () => {
  const fetch = (url, o) => url === "airports.json" ? route({})(url) : new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(new Error("aborted"))));
  const w = load(["fares.js"], { fetch });
  w.WypadFares._timeout = 20;
  await assert.rejects(() => w.WypadFares.search(params), /timeout/);
});

test("search: odpowiedź bez fares to []", async () => {
  const w = load(["fares.js"], { fetch: okFetch({}) });
  assert.deepEqual(plain(await w.WypadFares.search(params)), []);
});

test("search: cache 6 h i URL", async () => {
  const log = [];
  const w = load(["fares.js"], { fetch: route("fixture", log) });
  const calls = () => log.filter(u => u !== "airports.json").length;
  const url = () => log.find(u => u !== "airports.json");
  assert.equal((await w.WypadFares.search(params)).length, 57);
  assert.equal((await w.WypadFares.search(params)).length, 57);
  assert.equal(calls(), 1);
  assert.match(url(), /departureAirportIataCode=KRK/);
  assert.match(url(), /outboundDepartureDateFrom=2026-11-19/);
  assert.match(url(), /inboundDepartureDateTo=2026-11-24/);
  const key = "wypad-fares:KRK:2026-11-19:2026-11-20:2026-11-22:2026-11-24";
  const c = JSON.parse(w.localStorage.getItem(key));
  c.at -= 7 * 3600 * 1000;
  w.localStorage.setItem(key, JSON.stringify(c));
  await w.WypadFares.search(params);
  assert.equal(calls(), 2);
});

test("search: błąd HTTP rzuca", async () => {
  const w = load(["fares.js"], { fetch: async () => ({ ok: false, status: 500, json: async () => ({}) }) });
  await assert.rejects(() => w.WypadFares.search(params));
});

test("airports: pobiera airports.json", async () => {
  let u;
  const w = load(["fares.js"], { fetch: async x => { u = x; return { ok: true, json: async () => [{ code: "KRK" }] }; } });
  assert.equal((await w.WypadFares.airports()).length, 1);
  assert.equal(u, "airports.json");
});
