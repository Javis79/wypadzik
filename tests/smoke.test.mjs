import test from "node:test";
import assert from "node:assert/strict";
import { load } from "./load.mjs";

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
