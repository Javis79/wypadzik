import test from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const now = () => Math.floor(Date.now() / 1000);
const sess = () => ({
  access_token: "A1", refresh_token: "R1", expires_at: now() + 3600,
  user: { id: "u1", email: "zuzia@wypad.app", user_metadata: { login: "zuzia", name: "Zuzia" } },
});
const res = (status, body) => ({ ok: status < 400, status, json: async () => body });
const T1 = "11111111-1111-1111-1111-111111111111";
const row = (o = {}) => ({ id: T1, title: "Lizbona", start_date: "2026-11-19", end_date: "2026-11-24", origin: "WAW", created_by: "u1",
  members: [{ id: "u1", login: "zuzia", name: "Zuzia" }], ...o });

function setup(fetchImpl, extra = {}) {
  const w0 = load([]);
  w0.localStorage.setItem("wypad-auth", JSON.stringify(sess()));
  const calls = [];
  const w = load(["auth.js", "trips.js"], {
    localStorage: w0.localStorage,
    fetch: async (u, o) => { const c = { u, fn: u.split("/rpc/")[1], body: o.body ? JSON.parse(o.body) : null, h: o.headers }; calls.push(c); return fetchImpl(c); },
    ...extra,
  });
  return { w, calls, T: w.WypadTrips };
}

test("formatRange", () => {
  const { T } = setup(() => res(200, []));
  assert.equal(T.formatRange("2026-11-19", "2026-11-24"), "19–24 lis 2026");
  assert.equal(T.formatRange("2026-12-30", "2027-01-02"), "30 gru 2026 – 2 sty 2027");
  assert.equal(T.formatRange("2026-11-28", "2026-12-02"), "28 lis – 2 gru 2026");
  assert.equal(T.formatRange("2026-09-05", "2026-09-05"), "5 wrz 2026");
  assert.equal(T.formatRange("2026-10-05", null), "5 paź 2026");
  assert.equal(T.formatRange(null, null), "");
});

test("split: minione kończą się przed dzisiaj", () => {
  const { T } = setup(() => res(200, []));
  const a = { id: "a", start: "2026-11-19", end: "2026-11-24" }, b = { id: "b", start: "2027-01-10", end: "2027-01-12" }, c = { id: "c", start: "2026-12-01", end: "2026-12-03" };
  const r = plain(T.split([a, b, c], "2026-11-25"));
  assert.deepEqual(r.past.map(t => t.id), ["a"]);
  assert.deepEqual(r.upcoming.map(t => t.id), ["c", "b"]);
  assert.deepEqual(plain(T.split([a], "2026-11-24")).upcoming.map(t => t.id), ["a"]);   // ostatni dzień jeszcze trwa
});

test("refresh mapuje wiersze, zapisuje w pamięci i wysyła token", async () => {
  const { w, calls, T } = setup(() => res(200, [row()]));
  const out = plain(await T.refresh());
  assert.deepEqual(out, [{ id: T1, title: "Lizbona", start: "2026-11-19", end: "2026-11-24", origin: "WAW", createdBy: "u1", members: [{ id: "u1", login: "zuzia", name: "Zuzia" }] }]);
  assert.equal(calls[0].fn, "my_trips");
  assert.equal(calls[0].h.Authorization, "Bearer A1");
  assert.deepEqual(plain(T.list()), out);
  assert.deepEqual(JSON.parse(w.localStorage.getItem("wypad-trips:u1")), out);
});

test("refresh offline zwraca listę z pamięci", async () => {
  let online = true;
  const { T } = setup(() => { if (!online) throw new TypeError("Failed to fetch"); return res(200, [row()]); });
  await T.refresh();
  online = false;
  const out = plain(await T.refresh());
  assert.equal(out.length, 1);
  assert.equal(out[0].title, "Lizbona");
});

test("create i update wysyłają parametry p_* i zwracają Trip", async () => {
  const { calls, T } = setup(c => res(200, row({ title: c.body.p_title })));
  const t = await T.create({ title: "Rzym", start: "2026-11-19", end: "2026-11-24", origin: "WAW" });
  assert.equal(t.title, "Rzym");
  assert.deepEqual(plain(calls[0].body), { p_title: "Rzym", p_start: "2026-11-19", p_end: "2026-11-24", p_origin: "WAW" });
  assert.equal(plain(T.list())[0].id, T1);     // trafia do pamięci
  await T.update(T1, { title: "Neapol", start: "2026-11-19", end: "2026-11-24", origin: "KRK" });
  assert.deepEqual(plain(calls[1].body), { p_trip: T1, p_title: "Neapol", p_start: "2026-11-19", p_end: "2026-11-24", p_origin: "KRK" });
  assert.equal(T.list().length, 1);            // update podmienia, nie dubluje
  assert.equal(T.list()[0].title, "Neapol");
});

test("błąd serwera niesie kod", async () => {
  const { T } = setup(() => res(400, { message: "no_such_login" }));
  await assert.rejects(T.addMember(T1, "nikt"), e => e.code === "no_such_login");
});

test("invite zwraca pełny link z tokenem", async () => {
  const { calls, T } = setup(() => res(200, "TOK123"), { location: { origin: "https://wypad.example", pathname: "/", hash: "" } });
  assert.equal(await T.invite(T1), "https://wypad.example/#zaproszenie=TOK123");
  assert.deepEqual(plain(calls[0].body), { p_trip: T1 });
});

test("acceptFromHash przyjmuje zaproszenie i czyści hash", async () => {
  const replaced = [];
  const location = { origin: "https://x", pathname: "/", search: "", hash: "#zaproszenie=ABC" };
  const history = { replaceState: (...a) => replaced.push(a) };
  const { calls, T } = setup(c => c.fn === "accept_invite" ? res(200, T1) : res(200, [row()]), { location, history });
  assert.equal(await T.acceptFromHash(), T1);
  assert.equal(calls[0].fn, "accept_invite");
  assert.deepEqual(plain(calls[0].body), { p_token: "ABC" });
  assert.equal(replaced.length, 1);
  assert.equal(replaced[0][2], "/");
});

test("acceptFromHash bez hasha albo bez konta nic nie robi", async () => {
  const a = setup(() => res(200, T1), { location: { origin: "https://x", pathname: "/", hash: "" }, history: { replaceState() {} } });
  assert.equal(await a.T.acceptFromHash(), null);
  assert.equal(a.calls.length, 0);
  const w = load(["auth.js", "trips.js"], { location: { origin: "https://x", pathname: "/", hash: "#zaproszenie=ABC" }, history: { replaceState() { throw new Error("nie czyścić"); } } });
  assert.equal(await w.WypadTrips.acceptFromHash(), null);   // wylogowany: hash zostaje na po zalogowaniu
});

test("wygasłe zaproszenie czyści hash i zgłasza błąd", async () => {
  const replaced = [];
  const { T } = setup(() => res(400, { message: "invite_expired" }),
    { location: { origin: "https://x", pathname: "/", search: "", hash: "#zaproszenie=ABC" }, history: { replaceState: (...a) => replaced.push(a) } });
  await assert.rejects(T.acceptFromHash(), e => e.code === "invite_expired");
  assert.equal(replaced.length, 1);
});

test("leader: zdjęcie kierunku z największą liczbą głosów tak", () => {
  const { w, T } = setup(() => res(200, []));
  assert.equal(T.leaderPhoto(T1), null);
  w.localStorage.setItem("wypad-trip-" + T1, JSON.stringify({ destinations: [
    { id: "a", photo: "a.jpg", votes: { K: 1, Z: -1 } }, { id: "b", photo: "b.jpg", votes: { K: 1, Z: 1 } }, { id: "c", votes: { K: 1, Z: 1 } }] }));
  assert.equal(T.leaderPhoto(T1), "b.jpg");
  w.localStorage.setItem("wypad-trip-" + T1, "{zepsute");
  assert.equal(T.leaderPhoto(T1), null);
});

test("lista jest osobna dla każdego konta", async () => {
  const w0 = load([]);
  w0.localStorage.setItem("wypad-auth", JSON.stringify(sess()));
  w0.localStorage.setItem("wypad-trips", JSON.stringify([{ id: "stary" }]));     // dawny globalny klucz
  let fail = false;
  const w = load(["auth.js", "trips.js"], { localStorage: w0.localStorage, fetch: async () => { if (fail) throw new TypeError("offline"); return res(200, [row()]); } });
  assert.equal(w.WypadTrips.list().length, 0);
  await w.WypadTrips.refresh();
  assert.equal(w.WypadTrips.list().length, 1);
  const b = sess(); b.user = { id: "u2", email: "kuba@wypad.app", user_metadata: { login: "kuba", name: "Kuba" } };
  w.localStorage.setItem("wypad-auth", JSON.stringify(b));
  const w2 = load(["auth.js", "trips.js"], { localStorage: w.localStorage, fetch: async () => { throw new TypeError("offline"); } });
  assert.equal(w2.WypadTrips.list().length, 0);
  assert.equal(plain(await w2.WypadTrips.refresh()).length, 0);
  assert.equal(w2.localStorage.getItem("wypad-trips"), null);
});

test("nieprawidłowy token zaproszenia czyści hash", async () => {
  const replaced = [];
  const { T } = setup(() => res(400, { message: "invalid_invite" }),
    { location: { origin: "https://x", pathname: "/", search: "", hash: "#zaproszenie=ZLY" }, history: { replaceState: (...a) => replaced.push(a) } });
  await assert.rejects(T.acceptFromHash(), e => e.code === "invalid_invite");
  assert.equal(replaced.length, 1);
  const r2 = [];
  const b = setup(() => res(200, T1), { location: { origin: "https://x", pathname: "/", search: "", hash: "#zaproszenie=%E0%A4%A" }, history: { replaceState: (...a) => r2.push(a) } });
  await assert.rejects(b.T.acceptFromHash());
  assert.equal(r2.length, 1);
  assert.equal(b.calls.length, 0);
});

const keeps = (name, impl) => test(name, async () => {
  const replaced = [];
  const { T } = setup(impl, { location: { origin: "https://x", pathname: "/", search: "", hash: "#zaproszenie=ABC" }, history: { replaceState: (...a) => replaced.push(a) } });
  await assert.rejects(T.acceptFromHash());
  assert.equal(replaced.length, 0);
});
keeps("błąd sieci zostawia hash zaproszenia", () => { throw new TypeError("Failed to fetch"); });
keeps("błąd serwera 5xx zostawia hash zaproszenia", () => res(503, { message: "oops" }));
keeps("401 po wymuszonym odświeżeniu zostawia hash zaproszenia", c =>
  c.u.includes("/auth/v1/token") ? res(200, { ...sess(), access_token: "A2", refresh_token: "R2", user: sess().user }) : res(401, { message: "JWT expired" }));

test("update bez członków w odpowiedzi zostawia członków z listy", async () => {
  const two = [{ id: "u1", login: "zuzia", name: "Zuzia" }, { id: "u2", login: "ala", name: "Ala" }];
  let fn = "my_trips";
  const { T } = setup(c => { fn = c.fn; return res(200, c.fn === "my_trips" ? [row({ members: two })] : row({ title: "Neapol", members: undefined })); });
  await T.refresh();
  const t = plain(await T.update(T1, { title: "Neapol", start: "2026-11-19", end: "2026-11-24", origin: "KRK" }));
  assert.equal(fn, "update_trip");
  assert.equal(t.title, "Neapol");
  assert.deepEqual(t.members, two);
  assert.deepEqual(plain(T.list()[0].members), two);
  assert.equal(T.list()[0].title, "Neapol");
});
