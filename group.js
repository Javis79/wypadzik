/* Głosowanie w grupie: match, znaczniki głosów i inicjały członków wypadu. Czyste funkcje, bez DOM. */
(() => {
  const label = m => String((m && (m.name || m.login)) || "?").trim() || "?";

  // match: wszyscy obecni członkowie na tak; raz zapisany w cfg.matched zostaje, gdy dojdzie nowa osoba
  function isMatch(dest, members, cfg) {
    if (!dest) return false;
    if (cfg && Array.isArray(cfg.matched) && cfg.matched.includes(dest.id)) return true;
    const v = dest.votes || {};
    return Array.isArray(members) && members.length > 0 && members.every(m => v[m.id] === 1);
  }

  // unikalne inicjały w kolejności członków: pierwsza osoba na K dostaje „K”, następna „Ka”
  function initials(members) {
    const used = new Set();
    return (members || []).map(m => {
      const s = label(m);
      const pre = n => s.charAt(0).toUpperCase() + s.slice(1, n).toLowerCase();
      let n = 1;
      while (n < s.length && used.has(pre(n))) n++;
      let out = pre(n);
      for (let k = 2; used.has(out); k++) out = pre(n) + k;
      used.add(out);
      return out;
    });
  }

  // znaczniki: ja pierwszy, potem reszta w kolejności z wypadu; przy 5+ osobach trzy i „+N”
  function voteTags(dest, members, meId) {
    const v = (dest && dest.votes) || {};
    const ini = initials(members);
    const all = (members || []).map((m, i) => ({ id: m.id, initial: ini[i], v: v[m.id] === 1 ? 1 : v[m.id] === -1 ? -1 : 0, name: label(m) }));
    const me = all.findIndex(x => x.id === meId);
    if (me > 0) all.unshift(all.splice(me, 1)[0]);
    const shown = all.length >= 5 ? all.slice(0, 3) : all;
    return { shown, more: all.length - shown.length };
  }

  // newlyYes: osoby, których głos właśnie domknął match
  const matchLine = newlyYes => (newlyYes || []).length === 1 ? `${label(newlyYes[0])} też chce!` : (newlyYes || []).length > 1 ? "Wszyscy chcą!" : "Wszyscy na tak";

  // ---------- trwałe matche ----------
  // cofnięcie głosu usuwa match tylko wtedy, gdy to ten głos go stworzył (entry.made); głos spóźnialskiego nic nie zmienia
  const undoMatch = (matched, entry) => (matched || []).filter(id => !(entry && entry.made && id === entry.id));
  // „Przejrzyj jeszcze raz” nie rusza wspólnych kierunków
  const resetMatched = matched => [...(matched || [])];
  // nowe matche po pobraniu; quiet = pierwsze pobranie po otwarciu (pusty stan lokalny): bez oklasków
  function newMatches({ before, dests, members, matched, quiet }) {
    if (quiet) return [];
    const had = new Set(before || []);
    return (dests || []).filter(d => !had.has(d.id) && isMatch(d, members, { matched })).map(d => d.id);
  }

  // ---------- dane od innych członków: czyszczenie na wejściu (serwer, import, localStorage) ----------
  const num = (x, def = null) => (x === null || x === undefined || x === "" || typeof x === "boolean" || !Number.isFinite(+x) ? def : +x);
  const int = (x, def = null) => { const n = num(x, null); return n === null || !Number.isInteger(n) ? def : n; };
  const str = x => (x === null || x === undefined ? "" : typeof x === "object" ? "" : String(x));
  const safeId = x => (typeof x === "string" && /^[a-z0-9_-]{1,64}$/.test(x) ? x : null);
  const safeUrl = x => { const u = str(x).trim(); return /^https?:\/\//i.test(u) ? u : ""; };
  const safePhoto = x => { const u = str(x).trim(); return /^data:image\/(jpeg|png|webp|gif);base64,[a-z0-9+/=]+$/i.test(u) ? u : safeUrl(u); };
  const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^\d\d?:\d\d$/;
  const cleanLeg = l => {
    if (!l || typeof l !== "object" || Array.isArray(l)) return null;
    const o = { day: str(l.day), dep: TIME.test(str(l.dep)) ? l.dep : "", arr: TIME.test(str(l.arr)) ? l.arr : "", price: num(l.price, 0), note: str(l.note) };
    if (DATE.test(str(l.date))) o.date = l.date;
    return o;
  };
  const legs = a => (Array.isArray(a) ? a.map(cleanLeg).filter(Boolean) : []);
  const cleanRatings = r => {
    const o = {};
    if (r && typeof r === "object") for (const k of Object.keys(r)) { const n = int(r[k]); if (safeId(k) && n !== null && n >= 1 && n <= 5) o[k] = n; }
    return o;
  };
  // kierunek bez głosów i miejsc; keepLocal zostawia pola „_” (tylko dane z własnego localStorage)
  function cleanDest(d, keepLocal) {
    if (!d || typeof d !== "object") return null;
    const id = safeId(d.id); if (!id) return null;
    const stay = d.stay && typeof d.stay === "object" ? d.stay : {};
    const o = {
      id, name: str(d.name), country: str(d.country), note: str(d.note), pros: str(d.pros), cons: str(d.cons),
      airport: str(d.airport), wiki: str(d.wiki), photo: safePhoto(d.photo),
      lat: num(d.lat), lng: num(d.lng), temp: num(d.temp), apKm: num(d.apKm), apMin: num(d.apMin), tz: num(d.tz, 0),
      out: legs(d.out), back: legs(d.back), selOut: int(d.selOut), selBack: int(d.selBack),
      stay: { name: str(stay.name), perNight: num(stay.perNight, 0), link: safeUrl(stay.link) },
      dailySpend: num(d.dailySpend, 0), transferCost: num(d.transferCost, 0), ratings: cleanRatings(d.ratings),
    };
    if (d.airportCode !== undefined) o.airportCode = str(d.airportCode);
    if (d._geoName !== undefined) o._geoName = str(d._geoName);
    if (d.ratingK !== undefined) o.ratingK = num(d.ratingK, 0);
    if (d.ratingZ !== undefined) o.ratingZ = num(d.ratingZ, 0);
    if (keepLocal) for (const k of Object.keys(d)) if (k[0] === "_" && k !== "_m") o[k] = d[k];
    return o;
  }
  const CATS = ["food", "sight", "stay", "other"];
  function cleanPlace(p) {
    if (!p || typeof p !== "object") return null;
    const id = safeId(p.id); if (!id) return null;
    return {
      id, name: str(p.name), cat: CATS.includes(p.cat) ? p.cat : "other", lat: num(p.lat), lng: num(p.lng),
      price: num(p.price, 0), link: safeUrl(p.link), day: int(p.day), time: TIME.test(str(p.time)) ? p.time : "", done: !!p.done, note: str(p.note),
    };
  }
  function cleanCfg(c) {
    c = c && typeof c === "object" ? c : {};
    const persons = int(c.persons, 1);
    const out = { budget: Math.max(0, num(c.budget, 0)), persons: Math.min(99, Math.max(1, persons)), matched: Array.isArray(c.matched) ? [...new Set(c.matched.map(safeId).filter(Boolean))] : [] };
    const l = cleanLegacy(c.legacy);
    if (l) out.legacy = l;
    return out;
  }
  // głosy ze starego wyjazdu (K = Krystian, Z = Zuzia), które czekają, aż ktoś z grupy wskaże swoją literę
  function cleanLegacy(l) {
    if (!l || typeof l !== "object" || Array.isArray(l)) return null;
    const out = {};
    for (const letter of ["K", "Z"]) {
      const src = l[letter];
      if (!src || typeof src !== "object" || Array.isArray(src)) continue;
      const o = {};
      for (const k of Object.keys(src)) { const v = cleanVote(src[k]); if (safeId(k) && v) o[k] = v; }
      if (Object.keys(o).length) out[letter] = o;
    }
    return out;
  }
  const cleanVote = v => (v === 1 || v === -1 ? v : null);

  window.WypadGroup = { isMatch, voteTags, matchLine, initials, undoMatch, resetMatched, newMatches,
    safeId, safeUrl, safePhoto, cleanDest, cleanPlace, cleanCfg, cleanVote };
})();
