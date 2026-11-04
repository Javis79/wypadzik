// Jednorazowo (Node): pobiera listę lotnisk Ryanaira i zapisuje airports.json.
// Endpoint nie ma CORS, więc przeglądarka nie może go pobrać sama.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_ = "https://www.ryanair.com/api/views/locate/5/airports/pl/active";
const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "airports.json");
const res = await fetch(URL_);
if (!res.ok) throw new Error("HTTP " + res.status);
const list = (await res.json()).map(a => ({
  code: a.code, name: a.name, city: a.city.name, country: a.country.name,
  countryCode: a.country.code, lat: a.coordinates.latitude, lng: a.coordinates.longitude,
}));
list.sort((a, b) => a.city.localeCompare(b.city, "pl") || a.code.localeCompare(b.code));
fs.writeFileSync(out, JSON.stringify(list, null, 1) + "\n");
console.log(list.length + " lotnisk -> " + out);
