// Lotniska i ceny lotów Ryanaira (przelot w obie strony z lotniska domowego).
// Godziny to czasy lokalne lotnisk, brane wprost z tekstu odpowiedzi (bez stref czasowych).
(() => {
  const DAYS = ["ndz", "pon", "wt", "śr", "czw", "pt", "sob"];
  const TTL = 6 * 3600 * 1000;
  const API = "https://services-api.ryanair.com/farfnd/v4/roundTripFares";

  const dayOf = date => {
    const [y, m, d] = date.split("-").map(Number);
    return DAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  };
  const leg = (f, price) => {
    const [date, dep] = f.departureDate.split("T");
    return { day: dayOf(date), dep: dep.slice(0, 5), arr: f.arrivalDate.split("T")[1].slice(0, 5), price, date };
  };

  function parse(json) {
    const out = [];
    for (const f of (json && json.fares) || []) {
      const o = f.outbound, i = f.inbound;
      if (!o || !i) continue;
      const a = o.arrivalAirport;
      const total = f.summary.price.value;
      out.push({
        code: a.iataCode, city: a.city.name, cityCode: a.city.code || "", country: a.countryName, countryCode: a.city.countryCode,
        out: leg(o, o.price.value), back: leg(i, i.price.value), total,
      });
    }
    return out;
  }

  function groupByCity(offers) {
    const map = new Map();
    for (const o of offers) {
      const key = o.cityCode || o.city;
      let g = map.get(key);
      if (!g) map.set(key, g = { city: o.city, country: o.country, countryCode: o.countryCode, cheapest: o, offers: [] });
      g.offers.push(o);
      if (o.total < g.cheapest.total) g.cheapest = o;
    }
    return [...map.values()].sort((a, b) => a.cheapest.total - b.cheapest.total);
  }

  const cacheKey = p => `wypad-fares:${p.origin}:${p.outFrom}:${p.outTo}:${p.backFrom}:${p.backTo}`;

  async function search(p) {
    const key = cacheKey(p);
    try {
      const c = JSON.parse(localStorage.getItem(key));
      if (c && Date.now() - c.at < TTL) return c.offers;
    } catch {}
    const q = {
      departureAirportIataCode: p.origin,
      outboundDepartureDateFrom: p.outFrom, outboundDepartureDateTo: p.outTo,
      inboundDepartureDateFrom: p.backFrom, inboundDepartureDateTo: p.backTo,
      currency: "PLN", market: "pl-pl", adultPaxCount: "1",
    };
    const qs = Object.keys(q).map(k => `${k}=${encodeURIComponent(q[k])}`).join("&");
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, WypadFares._timeout);
    let json;
    try {
      const res = await fetch(`${API}?${qs}`, { signal: ctl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      json = await res.json();
    } catch (e) {
      if (timedOut) throw new Error("timeout");
      throw e;
    } finally { clearTimeout(timer); }
    const offers = parse(json);
    try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), offers })); } catch {}
    return offers;
  }

  async function airports() {
    const res = await fetch("airports.json");
    if (!res.ok) throw new Error("HTTP " + res.status);
    return res.json();
  }

  const WypadFares = { airports, search, parse, groupByCity, _timeout: 8000 };
  window.WypadFares = WypadFares;
})();
