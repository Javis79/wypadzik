import test from "node:test";
import vm from "node:vm";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

test("load uruchamia plik apki i zwraca window", () => {
  const w = load(["motion.js"]);
  assert.equal(w.Motion.EASE, "cubic-bezier(.16,1,.3,1)");
  assert.equal(w.window, w);
});

test("extra nadpisuje stuby, localStorage działa", async () => {
  const w = load([], { fetch: async () => "ok" });
  assert.equal(await w.fetch(), "ok");
  w.localStorage.setItem("a", "1");
  assert.equal(w.localStorage.getItem("a"), "1");
  assert.equal(w.localStorage.length, 1);
  await assert.rejects(load([]).fetch(), /no fetch stub/);
});

test("plain porównuje obiekty z vm z literałami", () => {
  const w = load([]);
  const inCtx = vm.runInContext("({a:[1,2],b:{c:3}})", vm.createContext(w));
  assert.notDeepEqual(inCtx, { a: [1, 2], b: { c: 3 } });
  assert.deepEqual(plain(inCtx), { a: [1, 2], b: { c: 3 } });
});

test("domyślny WebSocket to atrapa, extra go nadpisuje", () => {
  const ws = new (load([]).WebSocket)("wss://x");
  assert.equal(ws.url, "wss://x");
  assert.equal(ws.readyState, 0);
  ws.onopen = () => {};
  assert.equal(load([], { WebSocket: 1 }).WebSocket, 1);
});
