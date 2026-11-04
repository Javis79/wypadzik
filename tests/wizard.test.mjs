import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { load, plain } from "./load.mjs";

const airports = JSON.parse(fs.readFileSync(new URL("../airports.json", import.meta.url), "utf8"));
const W = () => load(["data.js", "wizard.js"]);
const when = o => ({ title: "Wypad", start: "2026-11-19", end: "2026-11-24", origin: "KRK", ...o });

const sofia = {
  city: "Sofia", country: "Bułgaria", countryCode: "bg",
  cheapest: { code: "SOF", city: "Sofia", country: "Bułgaria", countryCode: "bg",
    out: { day: "pt", dep: "10:15", arr: "13:05", price: 66, date: "2026-11-20" },
    back: { day: "pon", dep: "11:40", arr: "12:20", price: 122, date: "2026-11-23" }, total: 188 },
};
sofia.offers = [sofia.cheapest];

test("validateWhen: powrót przed wylotem", () => {
  const { WypadWizard } = W();
  assert.equal(WypadWizard.validateWhen(when({ start: "2026-11-24", end: "2026-11-19" })), "Powrót musi być po wylocie");
});

test("validateWhen: pusty tytuł, brak dat i lotniska, poprawne dane", () => {
  const { WypadWizard: Z } = W();
  assert.equal(Z.validateWhen(when({ title: "  " })), "Dodaj tytuł");
  assert.equal(Z.validateWhen(when({ start: "" })), "Wybierz daty wylotu i powrotu");
  assert.equal(Z.validateWhen(when({ origin: "" })), "Wybierz lotnisko z listy");
  assert.equal(Z.validateWhen(when()), null);
});

test("defaultTitle", () => {
  const { WypadWizard: Z } = W();
  assert.equal(Z.defaultTitle("2026-11-19", "2026-11-24"), "Wypad 19–24 lis");
  assert.equal(Z.defaultTitle("2026-11-30", "2026-12-02"), "Wypad 30 lis – 2 gru");
  assert.equal(Z.defaultTitle("2026-11-19", "2026-11-19"), "Wypad 19 lis");
});

test("toDestination z ofertą Sofii", () => {
  const { WypadWizard: Z } = W();
  const d = Z.toDestination(sofia, { lat: 42.6977, lng: 23.3219 }, airports);
  assert.equal(d.id, "sofia");
  assert.equal(d.name, "Sofia");
  assert.equal(d.country, "Bułgaria");
  assert.equal(d.out[0].price, 66);
  assert.equal(d.back[0].price, 122);
  assert.equal(d.out[0].dep, "10:15");
  assert.equal(d.selOut, 0);
  assert.equal(d.selBack, 0);
  assert.equal(d.airport, "Sofia (SOF)");
  assert.equal(d.lat, 42.6977);
  assert.equal(d.tz, 0);
  assert.deepEqual(plain(d.votes), {});
  assert.deepEqual(plain(d.places), []);
  assert.equal(typeof d.apKm, "number");   // współrzędne Ryanaira są zgrubne (SOF ~30 km od centrum)
});

test("toDestination: kilka lotnisk, najtańsze pierwsze, kod w uwadze; bez geo współrzędne lotniska", () => {
  const { WypadWizard: Z } = W();
  const leg = (price, day = "pt") => ({ day, dep: "07:00", arr: "09:00", price, date: "2026-11-20" });
  const bgy = { code: "BGY", city: "Mediolan", country: "Włochy", countryCode: "it", out: leg(100), back: leg(90, "pon"), total: 190 };
  const mxp = { code: "MXP", city: "Mediolan", country: "Włochy", countryCode: "it", out: leg(200), back: leg(150, "pon"), total: 350 };
  const d = Z.toDestination({ city: "Mediolan", country: "Włochy", countryCode: "it", cheapest: bgy, offers: [mxp, bgy] }, null, airports);
  assert.equal(d.id, "mediolan");
  assert.equal(d.airport, "Mediolan-Bergamo (BGY)");
  assert.deepEqual(plain(d.out.map(x => [x.price, x.note])), [[100, "BGY"], [200, "MXP"]]);
  assert.deepEqual(plain(d.back.map(x => x.price)), [90, 150]);
  const ap = airports.find(a => a.code === "BGY");
  assert.equal(d.lat, ap.lat);
  assert.equal(d.apKm, null);
});

test("flexRange: ±N dni wokół dat, nigdy przed dzisiaj", () => {
  const { WypadWizard: Z } = W();
  assert.deepEqual(plain(Z.flexRange("2026-11-19", "2026-11-24", 0, 0, "2026-11-04")),
    { outFrom: "2026-11-19", outTo: "2026-11-19", backFrom: "2026-11-24", backTo: "2026-11-24" });
  assert.deepEqual(plain(Z.flexRange("2026-11-30", "2026-12-02", 2, 1, "2026-11-04")),
    { outFrom: "2026-11-28", outTo: "2026-12-02", backFrom: "2026-12-01", backTo: "2026-12-03" });
  assert.deepEqual(plain(Z.flexRange("2026-11-05", "2026-11-06", 2, 2, "2026-11-04")),
    { outFrom: "2026-11-04", outTo: "2026-11-07", backFrom: "2026-11-04", backTo: "2026-11-08" });
});

test("makeDestination: domyślne pola jak w D()", () => {
  const w = W();
  const d = w.makeDestination({ name: "Porto Santo", country: "Portugalia", lat: 1, lng: 2 });
  assert.equal(d.id, "portosanto");
  assert.deepEqual(Object.keys(d), Object.keys(w.SAMPLE_DATA.destinations[0]));
  assert.equal(d.selOut, null);
  assert.deepEqual(plain(d.stay), { name: "", perNight: 0, link: "" });
});

test("saveTrip: zapis w kształcie SAMPLE_DATA i scalanie po id", () => {
  const w = W(), Z = w.WypadWizard;
  const d = Z.toDestination(sofia, { lat: 1, lng: 2 }, airports);
  Z.saveTrip("t1", [d], 2);
  const s1 = JSON.parse(w.localStorage.getItem("wypad-trip-t1"));
  assert.equal(s1.version, 3);
  assert.equal(s1.budget, 0);
  assert.equal(s1.persons, 2);
  assert.equal(s1.destinations.length, 1);
  s1.destinations[0].votes = { u1: 1 };
  w.localStorage.setItem("wypad-trip-t1", JSON.stringify(s1));
  const other = w.makeDestination({ name: "Porto", country: "Portugalia", lat: 3, lng: 4 });
  Z.saveTrip("t1", [Z.toDestination(sofia, null, airports), other], 3);
  const s2 = JSON.parse(w.localStorage.getItem("wypad-trip-t1"));
  assert.deepEqual(s2.destinations.map(x => x.id), ["sofia", "porto"]);
  assert.deepEqual(s2.destinations[0].votes, { u1: 1 });
  assert.equal(s2.persons, 3);
});

test("copyFrom: kierunki z poprzedniego wypadu bez głosów, miejsc i lotów", () => {
  const w = W(), Z = w.WypadWizard;
  const src = w.makeDestination({ name: "Sofia", country: "Bułgaria", lat: 1, lng: 2, photo: "p.jpg", airport: "Sofia (SOF)",
    votes: { a: 1 }, places: [{ id: "x" }], out: [{ day: "pt", dep: "1", arr: "2", price: 3, note: "" }], selOut: 0 });
  w.localStorage.setItem("wypad-trip-old", JSON.stringify({ version: 3, destinations: [src] }));
  w.localStorage.setItem("wypad-trip-cur", JSON.stringify({ version: 3, destinations: [w.makeDestination({ name: "Porto" })] }));
  const sources = Z.copySources([{ id: "old", title: "Stary" }, { id: "cur", title: "Ten" }, { id: "none", title: "Pusty" }], "cur");
  assert.deepEqual(plain(sources.map(s => s.id)), ["old"]);
  const [c] = sources[0].destinations;
  assert.equal(c.name, "Sofia");
  assert.equal(c.photo, "p.jpg");
  assert.equal(c.airport, "Sofia (SOF)");
  assert.equal(c.lat, 1);
  assert.deepEqual(plain(c.votes), {});
  assert.deepEqual(plain(c.places), []);
  assert.deepEqual(plain(c.out), []);
  assert.equal(c.selOut, null);
});

// ---------- kreator na atrapie DOM: zakładanie przy „Gotowe” i brak wyścigów ----------
const fixture = JSON.parse(fs.readFileSync(new URL("./fixtures/ryanair-roundtrip.json", import.meta.url), "utf8"));
const pad = n => String(n).padStart(2, "0");
const day = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise(r => setTimeout(r, 2)); };
const defer = () => { let resolve; const p = new Promise(r => { resolve = r; }); return { p, resolve }; };
const ok = body => ({ ok: true, status: 200, json: async () => body });

function el(sel) {
  const h = {}, attrs = {};
  const e = {
    id: sel.startsWith("#") ? sel.slice(1) : "", value: "", hidden: false, disabled: false, textContent: "", innerHTML: "",
    min: "", max: "", step: "", scrollTop: 0, children: [], dataset: {}, name: "",
    classList: { add() {}, remove() {}, toggle() {} },
    setAttribute(k, v) { attrs[k] = String(v); }, getAttribute: k => attrs[k] ?? null, removeAttribute(k) { delete attrs[k]; },
    addEventListener(t, f) { (h[t] ||= []).push(f); },
    fire(t) { const ev = { type: t, target: e, preventDefault() {}, stopPropagation() {} }; (h[t] || []).forEach(f => f(ev)); },
    click() { if (!e.disabled) e.fire("click"); },
    focus() {}, select() {}, reset() {}, matches: () => false, animate() {}, closest: () => null,
  };
  return e;
}

const PROFILES = [{ id: "u2", login: "t_z", name: "Test Z" }, { id: "u3", login: "t_y", name: "Test Y" }];
function setup({ ryanair, nominatim, trips = [], addMember, confirmAnswer = true } = {}) {
  const els = new Map();
  const q = sel => { if (sel.includes(":checked")) return null; if (!els.has(sel)) els.set(sel, el(sel)); return els.get(sel); };
  const dlg = { open: false, showModal() { this.open = true; }, close() { this.open = false; }, querySelector: q, addEventListener() {} };
  const toastEl = el("#toast");
  const calls = { create: [], add: [], update: [], done: [], confirm: [], ryanair: 0 };
  const WypadTrips = {
    list: () => trips,
    create: async f => { calls.create.push(f); return { id: "T1", ...f, createdBy: "u1", members: [] }; },
    update: async (id, f) => { calls.update.push(f); return { id, ...f, members: [] }; },
    addMember: addMember || (async (id, login) => { calls.add.push(login); return PROFILES.find(p => p.login === login); }),
    findProfiles: async s => PROFILES.filter(p => p.login.startsWith(s)),
    invite: async id => `http://localhost/#zaproszenie=${id}`,
  };
  const fetch = async (u, o) => {
    if (u === "airports.json") return ok(airports);
    if (u.includes("ryanair.com")) { calls.ryanair++; return ryanair ? ryanair(u, o) : ok(fixture); }
    if (u.includes("nominatim")) return nominatim ? nominatim(u, o) : ok([{ lat: "0", lon: "0", display_name: "Gdzieś, Daleko" }]);
    throw new Error("unexpected " + u);
  };
  const w = load(["data.js", "fares.js", "wizard.js"], {
    document: { getElementById: id => (id === "wizard" ? dlg : id === "toast" ? toastEl : null), addEventListener() {}, removeEventListener() {} },
    WypadTrips, WypadAuth: { user: { id: "u1", login: "t_k", name: "Test K" } }, fetch,
    confirm: m => { calls.confirm.push(m); return confirmAnswer; },
    navigator: { onLine: true, share: async () => {} },
    requestAnimationFrame: f => f(), cancelAnimationFrame() {},
  });
  w.WypadWizard._geoGap = 0;
  const Z = w.WypadWizard;
  const open = (o = {}) => Z.open({ onDone: id => calls.done.push(id), ...o });
  return { w, Z, $: q, dlg, calls, toastEl, open };
}
function fill1($, start = day(15), end = day(20)) {
  $("#wz-start").value = start; $("#wz-start").fire("change");
  $("#wz-end").value = end; $("#wz-end").fire("change");
}
async function toStep3(t, people = []) {
  fill1(t.$);
  t.$("#wz-next").click();
  for (const p of people) { t.$("#wz-login").value = p; t.$("#wz-f2").fire("submit"); await flush(); }
  t.$("#wz-next").click();
  await flush();
}
// zaznaczenie jak stuknięcie w odbitkę, potem przerysowanie (zmiana filtra kraju) liczy wybrane
const pick = (t, n) => { const s = t.Z._state(); s.cities.slice(0, n).forEach(c => s.sel.add(c.key)); t.$("#wz-country").fire("change"); };

test("krok 1: „Dalej” nieaktywne na żywo z komunikatem przy polu", () => {
  const { $, open } = setup();
  open();
  assert.equal($("#wz-next").disabled, true);
  $("#wz-start").value = day(15); $("#wz-start").fire("change");
  assert.equal($("#wz-end").value, day(18));
  $("#wz-end").value = day(10); $("#wz-end").fire("change");
  assert.equal($("#wz-next").disabled, true);
  assert.equal($("#wz-e-dates").textContent, "Powrót musi być po wylocie");
  assert.equal($("#wz-end").getAttribute("aria-invalid"), "true");
  assert.equal($("#wz-status").textContent, "Powrót musi być po wylocie");
  $("#wz-end").value = day(20); $("#wz-end").fire("change");
  assert.equal($("#wz-next").disabled, false);
  $("#wz-title").value = ""; $("#wz-title").fire("input");
  assert.equal($("#wz-next").disabled, true);
  assert.equal($("#wz-e-title").textContent, "Dodaj tytuł");
  assert.equal($("#wz-title").getAttribute("aria-describedby"), "wz-e-title");
  $("#wz-title").value = "Test"; $("#wz-title").fire("input");
  $("#wz-start").value = day(-1); $("#wz-start").fire("change");
  assert.equal($("#wz-e-dates").textContent, "Wylot nie może być w przeszłości");
  assert.equal($("#wz-next").disabled, true);
});

test("„Gotowe” zakłada wypad, dodaje osoby z kolejki i zapisuje kierunki", async () => {
  const t = setup();
  const pushed = [];
  t.w.pushTrip = id => { pushed.push([id, JSON.parse(t.w.localStorage.getItem("wypad-trip-" + id)).destinations.length]); return Promise.resolve(true); };
  t.open();
  fill1(t.$);
  t.$("#wz-next").click();
  assert.equal(t.calls.create.length, 0);
  t.$("#wz-login").value = "nikt"; t.$("#wz-f2").fire("submit"); await flush();
  assert.equal(t.$("#wz-e-login").textContent, "Nie ma takiego loginu");
  t.$("#wz-login").value = "t_z"; t.$("#wz-f2").fire("submit"); await flush();
  assert.deepEqual(plain(t.Z._state().members.map(m => m.login)), ["t_k", "t_z"]);
  assert.equal(t.calls.add.length, 0);
  t.$("#wz-next").click(); await flush();
  assert.ok(t.Z._state().cities.length > 10);
  assert.equal(t.calls.create.length, 0);
  pick(t, 2);
  t.$("#wz-next").click(); await flush(20);
  assert.equal(t.calls.create.length, 1);
  assert.equal(t.calls.create[0].title, t.w.WypadWizard.defaultTitle(day(15), day(20)));
  assert.deepEqual(plain(t.calls.add), ["t_z"]);
  const saved = JSON.parse(t.w.localStorage.getItem("wypad-trip-T1"));
  assert.equal(saved.destinations.length, 2);
  assert.equal(saved.persons, 2);
  assert.notEqual(saved.destinations[0].lat, 0);      // punkt Nominatim ~0,0 jest za daleko: współrzędne lotniska
  assert.deepEqual(plain(t.calls.done), ["T1"]);
  assert.equal(t.dlg.open, false);
  assert.match(t.toastEl.textContent, /: 2 kierunki$/);
  // kierunki wysłane od razu (po zapisie lokalnym), bez czekania na otwarcie wypadu przez założyciela
  assert.deepEqual(plain(pushed), [["T1", 2]]);
});

test("zamknięcie w trakcie „Gotowe”: nic nie zapisane, bez onDone", async () => {
  const g = defer();
  const t = setup({ nominatim: () => g.p });
  t.open();
  await toStep3(t);
  pick(t, 2);
  t.$("#wz-next").click(); await flush();
  t.$("#wz-x").click();
  assert.match(t.calls.confirm[0], /Wybrane kierunki nie zostaną zapisane/);
  assert.equal(t.dlg.open, false);
  g.resolve(ok([{ lat: "1", lon: "1", display_name: "A, B" }]));
  await flush(20);
  assert.equal(t.calls.create.length, 0);
  assert.equal(t.w.localStorage.getItem("wypad-trip-T1"), null);
  assert.deepEqual(plain(t.calls.done), []);
  t.open();                                 // przerwane „Gotowe” nie zostawia zablokowanych przycisków
  fill1(t.$);
  t.$("#wz-next").click();
  assert.equal(t.$("#wz-back").disabled, false);
  assert.equal(t.$("#wz-skip").disabled, false);
});

test("zamknięcie i ponowne otwarcie: stary wynik cen nie trafia do nowego kreatora", async () => {
  const pend = [];
  const t = setup({ ryanair: () => { const d = defer(); pend.push(d); return d.p; } });
  t.open();
  await toStep3(t);
  t.$("#wz-x").click();
  t.open();
  await toStep3(t);
  assert.equal(pend.length, 2);
  pend[0].resolve(ok(fixture)); await flush();
  assert.equal(t.Z._state().cities.length, 0);
  assert.equal(t.$("#wz-grid").innerHTML, "");
  pend[1].resolve(ok(fixture)); await flush();
  assert.ok(t.Z._state().cities.length > 10);
});

test("link-zaproszenie zakłada wypad wcześniej; zamknięcie ostrzega i odświeża listę", async () => {
  const t = setup();
  t.open();
  fill1(t.$);
  t.$("#wz-next").click();
  t.$("#wz-login").value = "t_z"; t.$("#wz-f2").fire("submit"); await flush();
  t.$("#wz-invite").click(); await flush();
  assert.equal(t.calls.create.length, 1);
  assert.deepEqual(plain(t.calls.add), ["t_z"]);
  t.$("#wz-x").click();
  assert.equal(t.calls.confirm[0], `Wypad „${t.calls.create[0].title}” jest już założony i zostanie na liście.`);
  assert.deepEqual(plain(t.calls.done), ["T1"]);
});

test("addMember nie wyszedł po założeniu: toast z loginem, wypad i tak założony", async () => {
  const t = setup({ addMember: async () => { const e = new Error("x"); e.status = 500; throw e; } });
  t.open();
  await toStep3(t, ["t_z"]);
  pick(t, 1);
  t.$("#wz-next").click(); await flush(20);
  assert.match(t.toastEl.textContent, /Nie udało się dodać: t_z/);
  assert.ok(t.w.localStorage.getItem("wypad-trip-T1"));
  assert.deepEqual(plain(t.calls.done), ["T1"]);
});

test("tryb tripId: persons bez zmian, toast liczy kierunki po scaleniu", async () => {
  const trip = { id: "T9", title: "Stary", start: day(15), end: day(20), origin: "KRK", members: [{ id: "u1", login: "t_k" }] };
  const t = setup({ trips: [trip] });
  t.open({ tripId: "T9" });
  await flush();
  const first = t.Z._state().cities[0];
  t.w.localStorage.setItem("wypad-trip-T9", JSON.stringify({ version: 3, budget: 0, persons: 4, destinations: [t.w.makeDestination({ name: first.city })] }));
  pick(t, 2);
  t.$("#wz-next").click(); await flush(20);
  const saved = JSON.parse(t.w.localStorage.getItem("wypad-trip-T9"));
  assert.equal(saved.persons, 4);
  assert.equal(saved.destinations.length, 2);
  assert.equal(t.toastEl.textContent, "Dodano 1 kierunek");
  assert.equal(t.calls.create.length, 0);
  assert.deepEqual(plain(t.calls.done), ["T9"]);
});

test("tryb tripId, wypad już trwa: bez szukania cen, ręczne dodawanie", async () => {
  const trip = { id: "T8", title: "Trwa", start: day(-1), end: day(3), origin: "KRK", members: [] };
  const t = setup({ trips: [trip] });
  t.open({ tripId: "T8" });
  await flush();
  assert.equal(t.calls.ryanair, 0);
  assert.equal(t.$("#wz-e3").textContent, "Ten wypad już się zaczął — dodaj miasto ręcznie.");
  assert.equal(t.$("#wz-man").hidden, false);
});

test("brak miejsca przy zapisie: błąd zamiast sukcesu, wypad zostaje na liście", async () => {
  const t = setup();
  const orig = t.w.localStorage.setItem;
  t.w.localStorage.setItem = (k, v) => { if (String(k).startsWith("wypad-trip-")) throw new Error("QuotaExceededError"); return orig(k, v); };
  t.open();
  await toStep3(t);
  pick(t, 1);
  t.$("#wz-next").click(); await flush(20);
  assert.match(t.$("#wz-e3").textContent, /brak miejsca/);
  assert.equal(t.$("#wz-e3").hidden, false);
  assert.equal(t.dlg.open, true);
  assert.equal(t.toastEl.textContent, "");
  t.$("#wz-x").click();
  assert.deepEqual(plain(t.calls.done), ["T1"]);
});

test("toDestination: punkt Nominatim dalej niż 150 km od lotniska ustępuje lotnisku", () => {
  const { WypadWizard: Z } = W();
  const sof = airports.find(a => a.code === "SOF");
  const d = Z.toDestination(sofia, { lat: 48.0, lng: 2.0 }, airports);
  assert.equal(d.lat, sof.lat);
  assert.equal(d.apKm, null);
});

test("geocode: accept-language=pl i limit czasu", async () => {
  let url = "";
  const w1 = load(["data.js", "wizard.js"], { fetch: async u => { url = u; return ok([{ lat: "1", lon: "2", display_name: "Neapol, Kampania, Włochy" }]); } });
  assert.deepEqual(plain(await w1.WypadWizard.geocode("Neapol")), { lat: 1, lng: 2, name: "Neapol", country: "Włochy" });
  assert.equal(url, "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=Neapol&accept-language=pl");
  const w2 = load(["data.js", "wizard.js"], { fetch: (u, o) => new Promise((_, rej) => o.signal.addEventListener("abort", () => rej(new Error("aborted")))) });
  w2.WypadWizard._geoTimeout = 20;
  assert.equal(await w2.WypadWizard.geocode("X"), null);
});
