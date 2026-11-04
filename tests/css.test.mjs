import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const html = readFileSync(new URL("index.html", root), "utf8");
const css = readFileSync(new URL("styles.css", root), "utf8");

// .btn ustawia display:inline-flex, więc bez tej reguły atrybut hidden nie chowa przycisku
// (np. „Usuń wypad” był widoczny dla osób, które nie założyły wypadu)
test("przycisk z atrybutem hidden naprawdę znika", () => {
  const hiddenBtns = [...html.matchAll(/<(?:button|label)\b[^>]*class="[^"]*\bbtn\b[^"]*"[^>]*\bhidden\b[^>]*>/g)];
  assert.ok(hiddenBtns.length >= 2, "w index.html są ukryte przyciski .btn");
  assert.match(css, /\.btn\[hidden\]\s*\{\s*display:\s*none/);
});
