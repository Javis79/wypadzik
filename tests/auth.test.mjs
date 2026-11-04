import test from "node:test";
import assert from "node:assert/strict";
import { load, plain } from "./load.mjs";

const res = (status, body) => ({ ok: status < 400, status, json: async () => body });
const now = () => Math.floor(Date.now() / 1000);
const sess = (over = {}) => ({
  access_token: "A1", refresh_token: "R1", expires_at: now() + 3600,
  user: { id: "u1", email: "zuzia@wypad.app", user_metadata: { login: "zuzia", name: "Zuzia" } }, ...over,
});

test("normalizeLogin", () => {
  const A = load(["auth.js"]).WypadAuth;
  assert.equal(A.normalizeLogin(" Zuzia "), "zuzia");
  assert.equal(A.normalizeLogin("ab"), null);
  assert.equal(A.normalizeLogin("ala ma"), null);
  assert.equal(A.normalizeLogin("a".repeat(21)), null);
  assert.equal(A.normalizeLogin("t_k.1"), "t_k.1");
});

test("stałe URL i KEY", () => {
  const A = load(["auth.js"]).WypadAuth;
  assert.match(A.URL, /^https:\/\/.+\.supabase\.co$/);
  assert.match(A.KEY, /^sb_publishable_/);
});

test("signIn z invalid_credentials", async () => {
  const w = load(["auth.js"], { fetch: async () => res(400, { error_code: "invalid_credentials" }) });
  await assert.rejects(w.WypadAuth.signIn({ login: "zuzia", password: "x" }), { message: "Zły login albo hasło" });
  assert.equal(w.WypadAuth.user, null);
});

test("signIn zapisuje sesję i wysyła login@wypad.app", async () => {
  let call;
  const w = load(["auth.js"], { fetch: async (u, o) => { call = { u, o }; return res(200, sess()); } });
  const u = await w.WypadAuth.signIn({ login: " Zuzia ", password: "pw" });
  assert.deepEqual(plain(u), { id: "u1", login: "zuzia", name: "Zuzia" });
  assert.match(call.u, /\/auth\/v1\/token\?grant_type=password$/);
  assert.equal(JSON.parse(call.o.body).email, "zuzia@wypad.app");
  assert.equal(call.o.headers.apikey, w.WypadAuth.KEY);
  assert.equal(JSON.parse(w.localStorage.getItem("wypad-auth")).access_token, "A1");
  assert.deepEqual(plain(w.WypadAuth.user), { id: "u1", login: "zuzia", name: "Zuzia" });
});

test("sesja z localStorage jest wczytana na starcie", () => {
  const w = load([]);
  w.localStorage.setItem("wypad-auth", JSON.stringify(sess()));
  const w3 = load(["auth.js"], { localStorage: w.localStorage });
  assert.equal(w3.WypadAuth.user.login, "zuzia");
});

test("offline", async () => {
  const w = load(["auth.js"], { navigator: { onLine: false }, fetch: async () => { throw new Error("x"); } });
  await assert.rejects(w.WypadAuth.signIn({ login: "zuzia", password: "x" }), { message: "Brak internetu: pierwsze logowanie wymaga sieci" });
  const w2 = load(["auth.js"], { fetch: async () => { throw new TypeError("Failed to fetch"); } });
  await assert.rejects(w2.WypadAuth.signIn({ login: "zuzia", password: "x" }), /Brak internetu/);
});

test("signUp: metadane, user_already_exists, brak sesji", async () => {
  let body;
  const w = load(["auth.js"], { fetch: async (u, o) => { body = JSON.parse(o.body); return res(200, sess()); } });
  await w.WypadAuth.signUp({ login: "Zuzia", name: "Zuzia", password: "haslo123" });
  assert.deepEqual(plain(body), { email: "zuzia@wypad.app", password: "haslo123", data: { login: "zuzia", name: "Zuzia" } });

  const w2 = load(["auth.js"], { fetch: async () => res(422, { error_code: "user_already_exists" }) });
  await assert.rejects(w2.WypadAuth.signUp({ login: "zuzia", name: "Z", password: "haslo123" }), { message: "Taki login już jest" });

  const w3 = load(["auth.js"], { fetch: async () => res(200, { id: "u1", email: "zuzia@wypad.app" }) });
  await assert.rejects(w3.WypadAuth.signUp({ login: "zuzia", name: "Z", password: "haslo123" }), /potwierdzenia e-mail/);
  assert.equal(w3.WypadAuth.user, null);

  const w4 = load(["auth.js"], { fetch: async () => res(422, { error_code: "weak_password" }) });
  await assert.rejects(w4.WypadAuth.signUp({ login: "zuzia", name: "Z", password: "1" }), /Hasło/);
  await assert.rejects(w4.WypadAuth.signUp({ login: "z", name: "Z", password: "haslo123" }), /Login/);
});

test("token(): ważny nie odświeża, <60 s odświeża", async () => {
  const calls = [];
  const w0 = load([]);
  w0.localStorage.setItem("wypad-auth", JSON.stringify(sess({ expires_at: now() + 30 })));
  const w = load(["auth.js"], { localStorage: w0.localStorage, fetch: async (u, o) => {
    calls.push(u);
    return res(200, sess({ access_token: "A2", refresh_token: "R2", expires_at: now() + 3600 }));
  } });
  assert.equal(await w.WypadAuth.token(), "A2");
  assert.match(calls[0], /grant_type=refresh_token$/);
  assert.equal(await w.WypadAuth.token(), "A2");
  assert.equal(calls.length, 1);
});

test("token(): błąd odświeżenia wylogowuje i woła onChange", async () => {
  const w0 = load([]);
  w0.localStorage.setItem("wypad-auth", JSON.stringify(sess({ expires_at: now() + 5 })));
  const w = load(["auth.js"], { localStorage: w0.localStorage, fetch: async () => res(400, { error_code: "refresh_token_not_found" }) });
  const seen = [];
  w.WypadAuth.onChange(u => seen.push(u));
  await assert.rejects(w.WypadAuth.token());
  assert.equal(w.WypadAuth.user, null);
  assert.equal(w.localStorage.getItem("wypad-auth"), null);
  assert.deepEqual(plain(seen), [null]);
});

test("token(): błąd sieci przy odświeżeniu nie wylogowuje", async () => {
  const w0 = load([]);
  w0.localStorage.setItem("wypad-auth", JSON.stringify(sess({ expires_at: now() + 5 })));
  const w = load(["auth.js"], { localStorage: w0.localStorage, fetch: async () => { throw new TypeError("Failed to fetch"); } });
  await assert.rejects(w.WypadAuth.token(), /Brak internetu/);
  assert.equal(w.WypadAuth.user.login, "zuzia");
});

test("signOut czyści sesję, woła onChange i /logout", async () => {
  const urls = [];
  const w = load(["auth.js"], { fetch: async (u) => { urls.push(u); return res(200, sess()); } });
  await w.WypadAuth.signIn({ login: "zuzia", password: "pw" });
  const seen = [];
  w.WypadAuth.onChange(u => seen.push(u && u.login));
  w.WypadAuth.signOut();
  assert.equal(w.WypadAuth.user, null);
  assert.equal(w.localStorage.getItem("wypad-auth"), null);
  assert.deepEqual(plain(seen), [null]);
  assert.ok(urls.some(u => u.endsWith("/auth/v1/logout")));
});

test("signUp: hasło 7 znaków odrzucone (pole password), 8 przyjęte", async () => {
  let n = 0;
  const w = load(["auth.js"], { fetch: async () => { n++; return res(200, sess()); } });
  await assert.rejects(w.WypadAuth.signUp({ login: "zuzia", name: "Z", password: "1234567" }),
    e => e.field === "password" && /8 znaków/.test(e.message));
  assert.equal(n, 0);
  await w.WypadAuth.signUp({ login: "zuzia", name: "Z", password: "12345678" });
  assert.equal(n, 1);
  await assert.rejects(load(["auth.js"]).WypadAuth.signUp({ login: "z", name: "Z", password: "12345678" }), e => e.field === "login");
});

test("token() bez sesji rzuca not_signed_in", async () => {
  const w = load(["auth.js"]);
  await assert.rejects(w.WypadAuth.token(), e => e.code === "not_signed_in" && e.message === "not_signed_in");
});

test("signOut w trakcie odświeżania nie przywraca sesji", async () => {
  const w0 = load([]);
  w0.localStorage.setItem("wypad-auth", JSON.stringify(sess({ expires_at: now() + 5 })));
  let release;
  const gate = new Promise(r => { release = r; });
  const w = load(["auth.js"], { localStorage: w0.localStorage, fetch: async (u) => {
    if (u.includes("refresh_token")) { await gate; return res(200, sess({ access_token: "A2", expires_at: now() + 3600 })); }
    return res(200, {});
  } });
  const p = w.WypadAuth.token();
  const settled = p.then(v => ({ v }), e => ({ e }));
  w.WypadAuth.signOut();
  release();
  const out = await settled;
  assert.equal(out.e && out.e.code, "not_signed_in");
  assert.equal(w.WypadAuth.user, null);
  assert.equal(w.localStorage.getItem("wypad-auth"), null);
});

test("odświeżanie: 503 i 429 zostawiają sesję, 401 wylogowuje", async () => {
  for (const [status, out] of [[503, true], [429, true], [401, false]]) {
    const w0 = load([]);
    w0.localStorage.setItem("wypad-auth", JSON.stringify(sess({ expires_at: now() + 5 })));
    const w = load(["auth.js"], { localStorage: w0.localStorage, fetch: async () => res(status, { error_code: "x" }) });
    await assert.rejects(w.WypadAuth.token());
    assert.equal(!!w.WypadAuth.user, out, String(status));
  }
});
