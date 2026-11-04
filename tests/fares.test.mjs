import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { load, plain } from "./load.mjs";

const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/ryanair-roundtrip.json", import.meta.url), "utf8"));
const okFetch = body => async () => ({ ok: true, status: 200, json: async () => body });
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

test("groupByCity scala lotniska jednego miasta", () => {
  const { WypadFares } = load(["fares.js"]);
  const mk = (code, total) => ({ code, city: "Mediolan", country: "Włochy", countryCode: "it", out: {}, back: {}, total, cityCode: "MILAN" });
  const other = { code: "NCL", city: "Newcastle", country: "UK", countryCode: "gb", out: {}, back: {}, total: 100 };
  const g = plain(WypadFares.groupByCity([mk("MXP", 300), other, mk("BGY", 250)]));
  assert.equal(g.length, 2);
  assert.equal(g[0].city, "Newcastle");
  assert.equal(g[1].city, "Mediolan");
  assert.equal(g[1].offers.length, 2);
  assert.equal(g[1].cheapest.code, "BGY");
});

test("search: timeout po braku odpowiedzi", async () => {
  const fetch = (url, { signal }) => new Promise((_, rej) => signal.addEventListener("abort", () => rej(new Error("aborted"))));
  const w = load(["fares.js"], { fetch });
  w.WypadFares._timeout = 20;
  await assert.rejects(() => w.WypadFares.search(params), /timeout/);
});

test("search: odpowiedź bez fares to []", async () => {
  const w = load(["fares.js"], { fetch: okFetch({}) });
  assert.deepEqual(plain(await w.WypadFares.search(params)), []);
});

test("search: cache 6 h i URL", async () => {
  let calls = 0, url;
  const w = load(["fares.js"], { fetch: async u => { calls++; url = u; return { ok: true, json: async () => fixture }; } });
  assert.equal((await w.WypadFares.search(params)).length, 57);
  assert.equal((await w.WypadFares.search(params)).length, 57);
  assert.equal(calls, 1);
  assert.match(url, /departureAirportIataCode=KRK/);
  assert.match(url, /outboundDepartureDateFrom=2026-11-19/);
  assert.match(url, /inboundDepartureDateTo=2026-11-24/);
  const key = "wypad-fares:KRK:2026-11-19:2026-11-20:2026-11-22:2026-11-24";
  const c = JSON.parse(w.localStorage.getItem(key));
  c.at -= 7 * 3600 * 1000;
  w.localStorage.setItem(key, JSON.stringify(c));
  await w.WypadFares.search(params);
  assert.equal(calls, 2);
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
