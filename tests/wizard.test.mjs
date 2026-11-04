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
