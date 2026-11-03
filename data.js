// Loty przepisane z kartek Krystiana (wylot z Krakowa, 19.11.2026 → 22/23.11).
// Ceny lotów: zł za osobę w jedną stronę. Nocleg, wydatki i dojazdy są puste: uzupełniacie je sami (linki do Booking/Airbnb w apce).
// Lotniska i odległości to przybliżenia (~), do sprawdzenia przy rezerwacji.
// Format lotu: "dzień HH:MM-HH:MM cena [uwaga]". Dni: czw=19.11, pt=20, sob=21, ndz=22, pon=23, wt=24.
(() => {
  const fl = s => {
    const m = s.match(/^(\S+) (\d\d?:\d\d)-(\d\d?:\d\d) (\d+)\s*(.*)$/);
    return { day: m[1], dep: m[2], arr: m[3], price: +m[4], note: m[5] || "" };
  };
  // strefa czasowa względem Polski, tytuł artykułu na Wikipedii (zdjęcie), lotnisko: [nazwa, km do centrum, minuty dojazdu]
  const X = {
    Alicante: [0, "Alicante", "Alicante (ALC)", 10, 25], Bari: [0, "Bari", "Bari (BRI)", 9, 30],
    Barcelona: [0, "Barcelona", "El Prat (BCN)", 14, 35], Bilbao: [0, "Bilbao", "Bilbao (BIO)", 12, 25],
    Bolonia: [0, "Bologna", "Bolonia (BLQ)", 6, 20], Bukareszt: [1, "Bucharest", "Otopeni (OTP) lub Băneasa (BBU)", 17, 40],
    Cypr: [1, "Larnaca", "Larnaka (LCA)?", 5, 15], Dubrovnik: [0, "Dubrovnik", "Dubrownik (DBV)", 20, 35],
    "Gran Canaria": [-1, "Las_Palmas", "Gran Canaria (LPA)", 20, 30], Katania: [0, "Catania", "Katania (CTA)", 5, 20],
    Kopenhaga: [0, "Copenhagen", "Kastrup (CPH)", 8, 15], Lizbona: [-1, "Lisbon", "Lizbona (LIS)", 7, 25],
    Madryt: [0, "Madrid", "Barajas (MAD)", 13, 35], Malaga: [0, "Málaga", "Malaga (AGP)", 8, 15],
    Malta: [0, "Valletta", "Malta (MLA)", 6, 25], Mediolan: [0, "Milan", "Bergamo (BGY) lub Malpensa (MXP)", 50, 60],
    Oslo: [0, "Oslo", "Gardermoen (OSL) lub Torp (TRF, ~110 km)", 50, 25], Pafos: [1, "Paphos", "Pafos (PFO)", 15, 25],
    Palermo: [0, "Palermo", "Palermo (PMO)", 30, 50], Piza: [0, "Pisa", "Piza (PSA)", 2, 10],
    Porto: [-1, "Porto", "Porto (OPO)", 15, 30], Rzym: [0, "Rome", "Ciampino (CIA) lub Fiumicino (FCO)", 15, 40],
    Saloniki: [1, "Thessaloniki", "Saloniki (SKG)", 15, 35], Sevilla: [0, "Seville", "Sewilla (SVQ)", 10, 25],
    Sofia: [1, "Sofia", "Sofia (SOF)", 10, 25], Sztokholm: [0, "Stockholm", "Arlanda (ARN) lub Skavsta (NYO)", 40, 40],
    Tirana: [0, "Tirana", "Tirana (TIA)", 17, 30], Walencja: [0, "Valencia", "Walencja (VLC)", 9, 25],
    Wenecja: [0, "Venice", "Treviso (TSF) lub Marco Polo (VCE)", 40, 60],
  };
  const D = (name, country, lat, lng, temp, _s, _d, _t, out, back, note = "") => {
    const [tz, wiki, airport, apKm, apMin] = X[name] || [0, name, "", null, null];
    return {
      id: name.toLowerCase().normalize("NFD").replace(/[^a-z]/g, ""),
      name, country, lat, lng, temp, note, tz, wiki, photo: "", airport, apKm, apMin,
      out: out.map(fl), back: back.map(fl), selOut: null, selBack: null,
      stay: { name: "", perNight: 0, link: "" }, dailySpend: 0, transferCost: 0,
      votes: {}, pros: "", cons: "", places: [],
    };
  };

  window.SAMPLE_DATA = {
    version: 3,
    budget: 0,
    persons: 2,
    destinations: [
      D("Alicante", "Hiszpania", 38.3452, -0.4810, 20, 300, 300, 60,
        ["pt 06:05-09:25 114"], ["pon 10:10-13:20 290"]),
      D("Bari", "Włochy", 41.1171, 16.8719, 17, 300, 300, 50,
        ["czw 07:05-09:00 83", "pt 11:30-13:25 149 promo"], ["ndz 08:35-10:30 441", "pon 09:25-11:20 375"]),
      D("Barcelona", "Hiszpania", 41.3874, 2.1686, 17, 450, 400, 80,
        ["czw 05:30-08:05 259", "czw 09:20-12:10 196", "sob 05:40-08:25 579"],
        ["ndz 09:10-12:15 369", "pon 09:10-12:15 1112", "pon 21:10-00:05 789 przylot we wt"]),
      D("Bilbao", "Hiszpania", 43.2630, -2.9350, 15, 380, 380, 60,
        ["czw 06:15-09:25 169", "sob 06:15-09:25 209"], ["wt 10:05-13:10 319"]),
      D("Bolonia", "Włochy", 44.4949, 11.3426, 11, 400, 350, 70,
        ["czw 08:00-09:45 246", "pt 15:10-16:55 193"], ["pon 05:50-07:35 162"]),
      D("Bukareszt", "Rumunia", 44.4268, 26.1025, 9, 250, 240, 30,
        ["pt 10:40-13:15 169 1,5h lotu + zmiana czasu"], ["ndz 13:50-14:30 149", "pon 13:50-14:30 169"],
        "dwa lotniska do wyboru"),
      D("Cypr", "Cypr", 34.9167, 33.6290, 23, 280, 330, 100,
        ["czw 06:00-10:10 229", "pt 06:00-10:10 369"], ["ndz 10:45-13:15 528", "pon 10:45-13:15 739"]),
      D("Dubrovnik", "Chorwacja", 42.6507, 18.0944, 16, 300, 350, 100,
        ["sob 07:10-08:50 171"], ["pon 15:15-16:55 109"]),
      D("Gran Canaria", "Hiszpania (Kanary)", 28.1235, -15.4363, 25, 350, 350, 60,
        ["czw 12:35-17:10 256"], ["ndz 16:30-22:55 745"]),
      D("Katania", "Włochy (Sycylia)", 37.5079, 15.0830, 20, 280, 280, 40,
        ["czw 16:45-19:15 97"], ["ndz 09:40-12:10 306", "ndz 16:20-18:50 492", "pon 14:25-16:55 311"]),
      D("Kopenhaga", "Dania", 55.6761, 12.5683, 7, 600, 550, 80,
        ["czw 05:45-07:25 153 dzień skreślony na kartce, sprawdź"], ["pon 08:10-09:45 103"]),
      D("Lizbona", "Portugalia", 38.7223, -9.1393, 18, 400, 350, 60,
        ["czw 06:15-09:25 202", "pt 14:00-18:00 250"], ["pon 17:45-22:40 731"]),
      D("Madryt", "Hiszpania", 40.4168, -3.7038, 14, 400, 350, 60,
        ["czw 07:20-10:55 123 później tego dnia też za tę cenę"], ["ndz 17:00-20:25 683"]),
      D("Malaga", "Hiszpania", 36.7213, -4.4214, 20, 330, 320, 40,
        ["czw 10:05-13:55 277", "pt 15:05-19:00 299 na kartce pt (19.11)"], ["pon 06:20-10:00 446", "pon 18:45-23:30 399"]),
      D("Malta", "Malta", 35.8989, 14.5146, 20, 300, 330, 40,
        ["czw 22:05-00:45 158 przylot w nocy"], ["pon 10:00-12:35 290"]),
      D("Mediolan", "Włochy", 45.4642, 9.1900, 10, 450, 400, 100,
        ["czw 07:00-08:50 162", "czw 15:15-17:05 149", "czw 19:00-21:00 169 godzina przylotu nieznana", "pt 05:50-07:40 154"],
        ["ndz 10:35-12:15 145", "ndz 20:35-22:20 253", "ndz 21:30-23:35 209", "pon 09:10-11:05 145", "pon 20:50-22:35 175", "pon 21:30-23:35 169"]),
      D("Oslo", "Norwegia", 59.9139, 10.7522, 5, 550, 600, 300,
        ["czw 07:20-09:30 68", "czw 12:55-15:15 179", "pt 12:55-15:15 179"],
        ["ndz 14:45-16:50 313", "ndz 15:50-18:05 209", "pon 09:50-11:55 184", "pon 15:50-18:05 209"]),
      D("Pafos", "Cypr", 34.7754, 32.4245, 23, 260, 330, 60,
        ["czw 19:50-23:55 97"], ["ndz 06:15-08:35 480"], "na kartce: pada!"),
      D("Palermo", "Włochy (Sycylia)", 38.1157, 13.3615, 20, 280, 280, 50,
        ["czw 07:05-09:30 240", "pt 14:00-16:25 169"], ["pon 11:20-13:40 178"]),
      D("Piza", "Włochy", 43.7228, 10.4017, 15, 330, 330, 40,
        ["czw 07:10-09:05 86"], ["ndz 21:35-23:30 309"], "blisko Florencja (1h pociągiem)"),
      D("Porto", "Portugalia", 41.1579, -8.6291, 16, 330, 300, 50,
        ["pt 06:25-09:15 184"], ["pon 06:40-11:20 289", "pon 12:50-17:30 333"]),
      D("Rzym", "Włochy", 41.9028, 12.4964, 16, 450, 400, 100,
        ["czw 08:40-10:40 338", "czw 19:35-21:35 123", "pt 08:30-10:30 208"],
        ["ndz 06:20-08:20 179 dzień skreślony na kartce; późniejszy wyprzedany", "pon 16:15-18:15 245"]),
      D("Saloniki", "Grecja", 40.6401, 22.9444, 15, 280, 260, 20,
        ["pt 12:35-15:35 245"], ["pon 22:30-23:30 245"]),
      D("Sevilla", "Hiszpania", 37.3891, -5.9845, 20, 350, 300, 40,
        ["czw 15:45-19:35 111"], ["pon 11:25-15:10 395"]),
      D("Sofia", "Bułgaria", 42.6977, 23.3219, 10, 220, 220, 20,
        ["pt 10:15-13:05 66"], ["pon 11:40-12:20 122 zmiana czasu"]),
      D("Sztokholm", "Szwecja", 59.3293, 18.0686, 5, 550, 500, 250,
        ["czw 13:25-15:30 224", "pt 20:25-22:20 127"], ["pon 18:00-20:00 95 dzień skreślony na kartce", "wt 13:20-15:20 88"]),
      D("Tirana", "Albania", 41.3275, 19.8187, 16, 200, 200, 40,
        ["pt 07:05-08:55 92"], ["ndz 15:10-17:00 220"]),
      D("Walencja", "Hiszpania", 39.4699, -0.3763, 19, 330, 320, 40,
        ["czw 17:00-20:10 179"], ["pon 21:25-00:35 281 przylot we wt"]),
      D("Wenecja", "Włochy", 45.4408, 12.3155, 12, 500, 450, 100,
        ["pt 06:50-08:45 85"], ["wt 14:15-16:10 157"]),
    ],
  };
})();
