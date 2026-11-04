/* Loty kierunku: kolejność odcinków, pary wylot–powrót i zapis tekstowy w edytorze. Czyste funkcje, bez DOM.
   Odcinek: { day, dep, arr, price, note, date? }. Z datą (YYYY-MM-DD) liczy się data; bez daty to stary wyjazd
   19–24.11.2026 (czw…wt), a nieznane tam dni liczą się po tygodniu. */
(() => {
  const WEEK = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];
  const OLD = ["czw", "pt", "sob", "ndz", "pon", "wt"];         // stary wyjazd: czw 19.11 … wt 24.11.2026
  const OLD_START = Date.UTC(2026, 10, 19);
  const DAY = 864e5;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/;
  const dnum = s => { const m = iso.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY : null; };
  const fromNum = n => new Date(n * DAY).toISOString().slice(0, 10);
  const dayOf = date => WEEK[new Date(dnum(date) * DAY).getUTCDay()];

  // data odcinka: zapisana albo wyliczona ze starego wyjazdu; null, gdy nie da się ustalić
  function legDate(l) {
    if (l && dnum(l.date) != null) return l.date;
    const i = OLD.indexOf(l && l.day);
    return i >= 0 ? fromNum(OLD_START / DAY + i) : null;
  }
  const short = l => { const d = legDate(l); return d ? `${d.slice(8, 10)}.${d.slice(5, 7)}` : ""; };

  // liczba dni od wylotu do powrotu
  function gap(o, b) {
    const a = dnum(o && o.date), c = dnum(b && b.date);
    if (a != null && c != null) return c - a;
    const i = OLD.indexOf(o && o.day), j = OLD.indexOf(b && b.day);
    if (a == null && c == null && i >= 0 && j >= 0) return j - i;
    const x = WEEK.indexOf(o && o.day), y = WEEK.indexOf(b && b.day);
    return x < 0 || y < 0 ? NaN : ((y - x) % 7 + 7) % 7;
  }

  // limit powrotu: "" bez limitu, data YYYY-MM-DD albo dzień starego wyjazdu („pon”)
  function within(b, lim) {
    if (!lim) return true;
    if (dnum(lim) != null) { const d = legDate(b); return !d || d <= lim; }
    const i = OLD.indexOf(lim), j = OLD.indexOf(b && b.day);
    return i < 0 || j < 0 || b.date ? true : j <= i;
  }

  // dopuszczalne pary [i, j, noce]: powrót co najmniej dzień po wylocie i nie później niż limit
  function pairs(d, lim) {
    const out = [];
    (d.out || []).forEach((o, i) => (d.back || []).forEach((b, j) => {
      const n = gap(o, b);
      if (n >= 1 && within(b, lim)) out.push([i, j, n]);
    }));
    return out;
  }

  // ---------- edytor: jedna linia = jeden lot, „pt 20.11 06:05-09:25 114 uwaga” ----------
  const lines = arr => (arr || []).map(x => {
    const dt = dnum(x.date) != null ? ` ${x.date.slice(8, 10)}.${x.date.slice(5, 7)}` : "";
    return `${x.day}${dt} ${x.dep}-${x.arr} ${x.price}${x.note ? " " + x.note : ""}`;
  }).join("\n");

  // rok daty „dd.mm”: ten, przy którym data leży najbliżej początku wypadu
  function yearFor(dd, mm, ref) {
    const r = dnum(ref) ?? Math.floor(Date.now() / DAY), y = new Date(r * DAY).getUTCFullYear();
    let best = null;
    for (const yy of [y - 1, y, y + 1]) {
      const n = Date.UTC(yy, mm - 1, dd) / DAY;
      if (best == null || Math.abs(n - r) < Math.abs(best - r)) best = n;
    }
    return fromNum(best);
  }
  const DAY_RE = "pon|wt|śr|sr|czw|pt|sob|ndz";
  const LINE = new RegExp(`^(?:(${DAY_RE})\\.?\\s+)?(?:(\\d\\d?)\\.(\\d\\d?)\\.?\\s+)?(\\d\\d?[:.]\\d\\d)\\s*-\\s*(\\d\\d?[:.]\\d\\d)\\s+(\\d+)\\s*(.*)$`, "iu");
  const parse = (txt, ref) => String(txt || "").split("\n").map(s => s.trim()).filter(Boolean).map(s => {
    const m = s.match(LINE);
    if (!m || (!m[1] && !m[2])) return null;
    const leg = { day: "", dep: m[4].replace(".", ":"), arr: m[5].replace(".", ":"), price: +m[6], note: m[7] };
    if (m[2]) {
      const dd = +m[2], mm = +m[3];
      if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
      leg.date = yearFor(dd, mm, ref);
      if (+leg.date.slice(8, 10) !== dd) return null;   // np. 31.11
      leg.day = dayOf(leg.date);
    } else leg.day = m[1].toLowerCase().replace(/^sr$/, "śr");
    return leg;
  });

  window.WypadFlights = { WEEK, OLD, legDate, short, gap, within, pairs, lines, parse, dayOf };
})();
