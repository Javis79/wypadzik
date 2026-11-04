// Uruchamia skrypty przeglądarkowe apki (IIFE na window) w vm z udawanym środowiskiem.
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { webcrypto } from "node:crypto";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function makeStorage() {
  const m = new Map();
  return {
    getItem: k => (m.has(String(k)) ? m.get(String(k)) : null),
    setItem: (k, v) => { m.set(String(k), String(v)); },
    removeItem: k => { m.delete(String(k)); },
    clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
}

export function load(files, extra = {}) {
  const window = {
    localStorage: makeStorage(),
    document: {
      hidden: false,
      addEventListener() {}, removeEventListener() {},
      getElementById: () => null,
    },
    navigator: { onLine: true, vibrate() {} },
    matchMedia: () => ({ matches: false }),
    addEventListener() {}, removeEventListener() {},
    crypto: webcrypto,
    setTimeout, clearTimeout, clearInterval,
    setInterval: (...a) => { const h = setInterval(...a); h?.unref?.(); return h; },
    fetch: () => Promise.reject(new Error("no fetch stub")),
    URL, AbortController, TextEncoder, TextDecoder, structuredClone, console,
    Date, Promise, JSON, Math,
    ...extra,
  };
  window.window = window;
  const ctx = vm.createContext(window);
  for (const f of files) {
    vm.runInContext(fs.readFileSync(path.resolve(ROOT, f), "utf8"), ctx, { filename: f });
  }
  return window;
}
