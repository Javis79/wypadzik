/* Konto: logowanie loginem i hasłem przez Supabase Auth (REST, bez bibliotek).
   Login zamieniamy na e-mail <login>@wypad.app; serwer pilnuje tej samej reguły.
   Sesja leży w localStorage pod „wypad-auth”. Klucz to publiczny „publishable”, przeznaczony do przeglądarki. */
(() => {
  const URL_ = "https://zyvjjqucfidnbzoevqlr.supabase.co";
  const KEY = "sb_publishable_EVB-jO0lqjj_hB49t7M7fA_wNh42fWX";
  const LS = "wypad-auth";
  const DOMAIN = "wypad.app";
  const LOGIN_RE = /^[a-z0-9_.]{3,20}$/;

  const MSG = {
    exists: "Taki login już jest",
    creds: "Zły login albo hasło",
    offline: "Brak internetu: pierwsze logowanie wymaga sieci",
    weak: "Hasło ma mieć co najmniej 8 znaków",
    login: "Login: 3–20 znaków, małe litery, cyfry, _ lub .",
    rate: "Za dużo prób, spróbuj za chwilę",
    confirm: "Konto założone, ale serwer wymaga potwierdzenia e-mail — daj znać Krystianowi",
    generic: "Coś poszło nie tak, spróbuj ponownie",
    signupFail: "Nie udało się założyć konta. Może taki login już jest, spróbuj innego",
  };

  const normalizeLogin = s => {
    const l = String(s == null ? "" : s).trim().toLowerCase();
    return LOGIN_RE.test(l) ? l : null;
  };

  const read = () => { try { return JSON.parse(localStorage.getItem(LS)); } catch { return null; } };
  const write = s => { try { s ? localStorage.setItem(LS, JSON.stringify(s)) : localStorage.removeItem(LS); } catch {} };

  const toUser = u => u && { id: u.id, login: (u.user_metadata && u.user_metadata.login) || String(u.email || "").split("@")[0], name: (u.user_metadata && u.user_metadata.name) || "" };

  let sess = read();
  if (!sess || !sess.access_token || !sess.refresh_token) sess = null;
  const listeners = [];
  const api = { URL: URL_, KEY, normalizeLogin, user: sess ? toUser(sess.user) : null };
  // klasa na <html> ukrywa apkę bez konta (ustawiana od razu, żeby nie mignął ekran apki)
  const gate = () => { try { document.documentElement.classList.toggle("signed-out", !api.user); } catch {} };
  const fire = () => { gate(); listeners.slice().forEach(fn => { try { fn(api.user); } catch {} }); };

  function setSession(r) {
    const exp = r.expires_at || Math.floor(Date.now() / 1000) + (r.expires_in || 3600);
    sess = { access_token: r.access_token, refresh_token: r.refresh_token, expires_at: exp, user: r.user || (sess && sess.user) };
    write(sess);
    api.user = toUser(sess.user);
  }

  async function call(path, body, extra = {}) {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error(MSG.offline);
    let r;
    try {
      r = await fetch(URL_ + path, {
        method: "POST",
        headers: { apikey: KEY, "Content-Type": "application/json", ...extra },
        body: JSON.stringify(body),
      });
    } catch { throw new Error(MSG.offline); }
    let j = null;
    try { j = await r.json(); } catch {}
    if (!r.ok) { const e = new Error(explain(r.status, j || {})); e.code = (j && (j.error_code || j.code)) || String(r.status); e.status = r.status;
      if (e.message === MSG.exists) e.field = "login"; else if (e.message === MSG.weak) e.field = "password";
      throw e; }
    return j || {};
  }

  function explain(status, j) {
    const c = j.error_code || "";
    if (c === "user_already_exists" || c === "email_exists") return MSG.exists;
    if (c === "invalid_credentials") return MSG.creds;
    if (c === "weak_password") return MSG.weak;
    if (c === "over_email_send_rate_limit" || c === "over_request_rate_limit" || status === 429) return MSG.rate;
    const text = String(j.msg || j.message || j.error_description || "");
    if (status >= 500 && /saving new user/i.test(text)) return MSG.signupFail;
    return MSG.generic;
  }

  const fieldErr = (msg, field) => { const e = new Error(msg); e.field = field; return e; };
  function need(login, password) {
    const l = normalizeLogin(login);
    if (!l) throw fieldErr(MSG.login, "login");
    if (!password || String(password).length < 8) throw fieldErr(MSG.weak, "password");
    return l;
  }

  api.signUp = async ({ login, name, password }) => {
    const l = need(login, password);
    const nm = String(name || "").trim() || l;
    const r = await call("/auth/v1/signup", { email: `${l}@${DOMAIN}`, password, data: { login: l, name: nm } });
    if (!r.access_token) throw new Error(MSG.confirm);   // potwierdzanie e-mail nadal włączone na serwerze
    setSession(r);
    fire();
    return api.user;
  };

  api.signIn = async ({ login, password }) => {
    const l = normalizeLogin(login);
    if (!l || !password) throw new Error(MSG.creds);
    const r = await call("/auth/v1/token?grant_type=password", { email: `${l}@${DOMAIN}`, password });
    setSession(r);
    fire();
    return api.user;
  };

  api.signOut = () => {
    const t = sess && sess.access_token;
    sess = null; api.user = null; write(null);
    if (t) { try { Promise.resolve(fetch(`${URL_}/auth/v1/logout`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${t}` } })).catch(() => {}); } catch {} }
    fire();
  };

  let refreshing = null;
  api.token = async ({ force } = {}) => {
    if (!sess) { const e = new Error("not_signed_in"); e.code = "not_signed_in"; throw e; }
    if (!force && sess.expires_at - Math.floor(Date.now() / 1000) >= 60) return sess.access_token;
    const from = sess;
    if (!refreshing || refreshing.from !== from) {
      const p = (async () => {
        try {
          const r = await call("/auth/v1/token?grant_type=refresh_token", { refresh_token: from.refresh_token });
          if (sess !== from) return null;                 // w międzyczasie wylogowanie albo nowe logowanie
          setSession(r);
          return sess.access_token;
        } catch (e) {
          // tylko odrzucony token wylogowuje; 5xx, 429 i brak sieci zostawiają sesję
          if (sess === from && (e.status === 400 || e.status === 401)) api.signOut();
          throw e;
        } finally { if (refreshing === h) refreshing = null; }
      })();
      var h = refreshing = { from, p };   // finally wykona się dopiero po tym przypisaniu (pierwszy await w środku)
    }
    const out = await refreshing.p;
    return out == null ? api.token({ force }) : out;
  };

  api.onChange = fn => { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; };

  window.WypadAuth = api;
  gate();
})();
