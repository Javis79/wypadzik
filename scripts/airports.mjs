// Jednorazowo (Node): pobiera listę lotnisk Ryanaira i zapisuje airports.json.
// Endpoint nie ma CORS, więc przeglądarka nie może go pobrać sama.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_ = "https://www.ryanair.com/api/views/locate/5/airports/pl/active";
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "airports.json");
const res = await fetch(URL_);
if (!res.ok) throw new Error("HTTP " + res.status);
const raw = (await res.json()).map(a => ({
  code: a.code, name: a.name.trim(), city: a.city.name.trim(), country: a.country.name,
  countryCode: a.country.code, lat: a.coordinates.latitude, lng: a.coordinates.longitude,
}));
// metro: miasto zbiorcze (np. "Mediolan-Bergamo" -> Mediolan), żeby lotniska jednego miasta się grupowały
const known = new Set(raw.map(a => a.city));
const metroOf = a => {
  if (a.name.startsWith(a.city)) return a.city;
  const dash = a.name.split(/[-\/]/)[0].trim();
  if (dash && dash !== a.name && (!dash.includes(" ") || known.has(dash))) return dash;
  const first = a.name.split(" ")[0];
  if (first !== a.name && known.has(first)) return first;
  return a.city;
};
const list = raw.map(a => ({ ...a, metro: metroOf(a) }));
list.sort((a, b) => a.city.localeCompare(b.city, "pl") || a.code.localeCompare(b.code));
fs.writeFileSync(out, JSON.stringify(list, null, 1) + "\n");
for (const a of list) if (a.metro !== a.city) console.log(`${a.code}: "${a.name}" city=${a.city} -> metro=${a.metro}`);
console.log(list.length + " lotnisk -> " + out);
