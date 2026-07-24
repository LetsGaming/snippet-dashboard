"use strict";

/* ============================================================
   1 — Kalender: Monat 0 ist immer der laufende Monat
   ============================================================ */
const NOW = new Date();
const BASE_Y = NOW.getFullYear();
const BASE_M = NOW.getMonth() + 1;

const absMonths = (y, m) => y * 12 + (m - 1);
const BASE_ABS = absMonths(BASE_Y, BASE_M);

/** '1998-06' → Monatsindex relativ zu heute (negativ = Vergangenheit) */
const idxFromYm = (ym) => {
  if (typeof ym !== "string") return null;
  const [y, m] = ym.split("-").map(Number);
  return !y || !m ? null : absMonths(y, m) - BASE_ABS;
};
/** Monatsindex → '06/2028' */
const dat = (i) => {
  if (i == null || !isFinite(i)) return "—";
  const a = BASE_ABS + Math.round(i);
  return String((a % 12) + 1).padStart(2, "0") + "/" + Math.floor(a / 12);
};
const ymOf = (i) => {
  const a = BASE_ABS + Math.round(i);
  return Math.floor(a / 12) + "-" + String((a % 12) + 1).padStart(2, "0");
};

/* ============================================================
   2 — Recht: Kfz-Steuer nach §§ 8, 9 KraftStG
   Keine Schätzung, sondern der Tarif selbst. Stand Juli 2026.
   ============================================================ */
const TAX = {
  hFlatCar: 191.73,
  perUnitPre2009: {
    otto: {
      "Euro 3+": 6.75,
      "Euro 2": 7.36,
      "Euro 1": 15.13,
      "Euro 0 bedingt": 21.07,
      "ohne Einstufung": 25.36,
    },
    diesel: {
      "Euro 3+": 15.44,
      "Euro 2": 16.05,
      "Euro 1": 27.35,
      "Euro 0 bedingt": 33.29,
      "ohne Einstufung": 37.58,
    },
  },
  perUnitHub: { otto: 2.0, diesel: 9.5 },
  co2Tiers: [
    [115, 2.0],
    [135, 2.2],
    [155, 2.5],
    [175, 2.9],
    [195, 3.4],
    [Infinity, 4.0],
  ],
};
const EZ_CO2_START = absMonths(2009, 7);
const EZ_CO2_WINDOW = absMonths(2008, 11);
const EZ_TIERS_START = absMonths(2021, 1);
const H_PLATE_YEARS = 30;

function co2Component(co2, ezAbs) {
  // Auch im Übergangsfenster ab 11/2008 nötig: dort wird gegen den CO2-Tarif verglichen.
  if (ezAbs < EZ_CO2_WINDOW || !isFinite(co2) || co2 <= 0) return 0;
  const free =
    ezAbs < absMonths(2012, 1) ? 120 : ezAbs < absMonths(2014, 1) ? 110 : 95;
  const over = Math.max(0, co2 - free);
  if (over === 0) return 0;
  if (ezAbs < EZ_TIERS_START) return over * 2.0;
  let sum = 0,
    from = free;
  for (const [upTo, rate] of TAX.co2Tiers) {
    const inTier = Math.max(0, Math.min(co2, upTo) - Math.max(from, free));
    sum += inTier * rate;
    from = upTo;
    if (co2 <= upTo) break;
  }
  return sum;
}

/** Jahressteuer in € für ein Fahrzeug. hPlate schlägt alles andere. */
function kfzTaxYear(v) {
  if (v.hPlate) return TAX.hFlatCar;
  const ez = idxFromYm(v.ez);
  if (ez == null || !isFinite(v.ccm) || v.ccm <= 0) return 0;
  const ezAbs = BASE_ABS + ez;
  const units = Math.ceil(v.ccm / 100);
  const fuel = v.fuel === "diesel" ? "diesel" : "otto";
  const oldWay =
    units *
    (TAX.perUnitPre2009[fuel][v.norm] ??
      TAX.perUnitPre2009[fuel]["ohne Einstufung"]);
  const newWay = units * TAX.perUnitHub[fuel] + co2Component(v.co2, ezAbs);
  if (ezAbs < EZ_CO2_WINDOW) return oldWay;
  if (ezAbs < EZ_CO2_START) return Math.min(oldWay, newWay);
  return newWay;
}
const hPlateFromEz = (ez) => {
  const i = idxFromYm(ez);
  return i == null ? null : i + H_PLATE_YEARS * 12;
};
const age25From = (birth) => {
  const i = idxFromYm(birth);
  return i == null ? null : i + 25 * 12;
};

/* ============================================================
   3 — Adapter für offene Schnittstellen
   Kein Schlüssel, kein Konto. Jede Quelle: Timeout, typisierter
   Fehler, Rückfall auf den letzten bekannten Wert.
   ============================================================ */
const FETCH_TIMEOUT_MS = 8000;

async function getText(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!res.ok) return { ok: false, error: "HTTP " + res.status };
    return { ok: true, value: await res.text() };
  } catch (e) {
    const blocked = e && e.name !== "AbortError";
    return {
      ok: false,
      error: blocked ? "Netz oder CORS blockiert" : "Zeitüberschreitung",
    };
  } finally {
    clearTimeout(t);
  }
}

/** Erste URL, die etwas Brauchbares liefert, gewinnt. */
async function firstUsable(urls, parse) {
  let last = "keine URL";
  for (const url of urls) {
    const r = await getText(url);
    if (!r.ok) {
      last = r.error;
      continue;
    }
    try {
      const parsed = parse(r.value);
      if (parsed) return { ok: true, value: parsed };
      last = "Antwort unlesbar";
    } catch {
      last = "Antwort unlesbar";
    }
  }
  return { ok: false, error: last };
}

const splitCsv = (line) => {
  const out = [];
  let cur = "",
    q = false;
  for (const ch of line) {
    if (ch === '"') q = !q;
    else if (ch === "," && !q) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
};

/** SDMX-CSV der EZB → letzter Beobachtungswert. Spalten über Namen, nicht Position. */
function parseEcbCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const head = splitCsv(lines[0]);
  const iT = head.indexOf("TIME_PERIOD"),
    iV = head.indexOf("OBS_VALUE");
  if (iT < 0 || iV < 0) return null;
  for (let i = lines.length - 1; i > 0; i--) {
    const row = splitCsv(lines[i]);
    const value = parseFloat(row[iV]);
    if (isFinite(value)) return { value, asOf: row[iT] };
  }
  return null;
}

const ecbUrl = (flow, key) =>
  `https://data-api.ecb.europa.eu/service/data/${flow}/${key}?lastNObservations=1&format=csvdata&detail=dataonly`;

const ecbSource = (id, label, flow, key, docs, note, fmt) => ({
  id,
  label,
  flow,
  key,
  docs,
  note,
  editable: true,
  urls: (s) => [ecbUrl(s.flow, s.key)],
  parse: parseEcbCsv,
  fmt: fmt ?? ((v) => v.value.toFixed(2).replace(".", ",") + " %"),
});

const SOURCES = [
  {
    id: "fuel",
    label: "Spritpreise, Bundesdurchschnitt",
    note: "Markttransparenzstelle für Kraftstoffe (MTS-K), alle 5 Minuten aktualisiert",
    docs: "https://www.benzinpreis-aktuell.de/",
    urls: () => [
      "https://www.benzinpreis-aktuell.de/api.v2.php?data=nationwide",
    ],
    parse(text) {
      const j = JSON.parse(text);
      const e5 = parseFloat(j.super),
        e10 = parseFloat(j.e10),
        di = parseFloat(j.diesel);
      if (!isFinite(e5) || !isFinite(e10)) return null;
      return { asOf: String(j.date || "").slice(0, 10), e5, e10, diesel: di };
    },
    fmt: (v) =>
      `E5 ${v.e5.toFixed(3)} · E10 ${v.e10.toFixed(3)} · Diesel ${v.diesel.toFixed(3)} €/l`,
  },
  {
    id: "fx",
    label: "Wechselkurs EUR / JPY",
    note: "EZB-Referenzkurs über Frankfurter, werktags gegen 16:00 MEZ",
    docs: "https://frankfurter.dev/",
    urls: () => [
      "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=JPY",
      "https://api.frankfurter.app/latest?from=EUR&to=JPY",
    ],
    parse(text) {
      const j = JSON.parse(text);
      const jpy = j && j.rates && j.rates.JPY;
      return isFinite(jpy) ? { asOf: j.date, value: jpy } : null;
    },
    fmt: (v) => "1 € = " + v.value.toFixed(2).replace(".", ",") + " ¥",
  },
  ecbSource(
    "hicp",
    "Inflation Deutschland (HVPI, Jahresrate)",
    "ICP",
    "M.DE.N.000000.4.ANR",
    "https://data.ecb.europa.eu/data/datasets/ICP",
    "EZB-Datenportal, monatlich",
  ),
  ecbSource(
    "credit",
    "Konsumentenkredit DE, 1–5 Jahre (Neugeschäft)",
    "MIR",
    "M.DE.B.A2B.I.R.A.2250.EUR.N",
    "https://data.ecb.europa.eu/data/datasets/MIR",
    "EZB-Zinsstatistik, Durchschnitt aller Banken",
  ),
  ecbSource(
    "depo",
    "EZB-Einlagesatz",
    "FM",
    "D.U2.EUR.4F.KR.DFR.LEV",
    "https://data.ecb.europa.eu/data/datasets/FM",
    "Ankerwert für Tagesgeld — gute Angebote liegen leicht darunter",
  ),
];

const live = {}; // id → { state:'load'|'ok'|'fail', data, error, at }

async function loadSources() {
  SOURCES.forEach((s) => {
    live[s.id] = { state: "load" };
  });
  renderSources();
  await Promise.all(
    SOURCES.map(async (s) => {
      const r = await firstUsable(s.urls(s), s.parse);
      live[s.id] = r.ok
        ? { state: "ok", data: r.value, at: new Date() }
        : { state: "fail", error: r.error, at: new Date() };
      renderSources();
    }),
  );
  adoptLive();
  render();
}

/** Live-Werte in den Zustand ziehen — aber nie über eine Handeingabe. */
function adoptLive() {
  const set = (key, value, from) => {
    if (!isFinite(value) || prov[key] === "manual" || prov[key] === "proof")
      return;
    state[key] = Math.round(value * 1000) / 1000;
    prov[key] = from;
    const inp = document.getElementById("f_" + key);
    if (inp) inp.value = state[key];
  };
  const f = live.fuel;
  if (f && f.state === "ok") {
    set("fuelE5", f.data.e5, "live");
    set("fuelE10", f.data.e10, "live");
    set("fuelDiesel", f.data.diesel, "live");
  }
  const h = live.hicp;
  if (h && h.state === "ok") {
    set("inflCost", h.data.value, "live");
    set("inflIncome", h.data.value, "live");
  }
  const c = live.credit;
  if (c && c.state === "ok") set("rate", c.data.value, "live");
  const d = live.depo;
  if (d && d.state === "ok")
    set("saveRate", Math.max(0, d.data.value - 0.25), "live");
  const x = live.fx;
  if (x && x.state === "ok") set("jpyRate", x.data.value, "live");
}

/* ============================================================
   4 — Belege: echte Angebote statt Schätzwerte
   ============================================================ */
const LEDGERS = {
  price: {
    title: "Vergleichsangebote R34",
    help: "priceLedger",
    cols: [
      { key: "src", ph: "Quelle, z. B. mobile.de", type: "text" },
      { key: "amt", ph: "Preis", type: "number" },
      { key: "cur", type: "select", opts: ["EUR", "JPY", "USD", "GBP"] },
      { key: "km", ph: "km", type: "number" },
    ],
    empty:
      "Noch kein Angebot erfasst — der Kaufpreis ist so lange eine Schätzung.",
  },
  insR34: {
    title: "Versicherungsangebote R34",
    help: "insLedger",
    cols: [
      { key: "src", ph: "Anbieter", type: "text" },
      { key: "amt", ph: "€ / Jahr", type: "number" },
      { key: "basis", type: "select", opts: ["meine SF", "erfahren"] },
    ],
    empty:
      "Noch kein Angebot erfasst — es rechnet mit dem Schätzwert der Variante.",
  },
  insDaily: {
    title: "Versicherungsangebote Daily",
    help: "insLedger",
    cols: [
      { key: "src", ph: "Anbieter", type: "text" },
      { key: "amt", ph: "€ / Jahr", type: "number" },
      { key: "basis", type: "select", opts: ["meine SF", "erfahren"] },
    ],
    empty:
      "Noch kein Angebot erfasst — es rechnet mit dem Schätzwert der Variante.",
  },
};
const ledgers = { price: [], insR34: [], insDaily: [] };

const RATE_CACHE = { EUR: 1, USD: null, GBP: null, JPY: null };
function toEur(amount, cur) {
  if (cur === "EUR") return amount;
  if (cur === "JPY") {
    const r =
      live.fx && live.fx.state === "ok" ? live.fx.data.value : state.jpyRate;
    return isFinite(r) && r > 0 ? amount / r : null;
  }
  const r = RATE_CACHE[cur];
  return isFinite(r) && r > 0 ? amount / r : null;
}
const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((p, q) => p - q),
    m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/** Belegter Kaufpreis: Median aller Angebote in Euro. */
function priceFromLedger() {
  const eur = ledgers.price
    .map((r) => toEur(r.amt, r.cur))
    .filter((v) => isFinite(v) && v > 0);
  return eur.length
    ? {
        value: median(eur),
        n: eur.length,
        min: Math.min(...eur),
        max: Math.max(...eur),
      }
    : null;
}
/** Belegter Beitrag: günstigstes Angebot, normiert auf „erfahren"-Niveau. */
function premiumFromLedger(which, level) {
  const rows = ledgers[which].filter((r) => isFinite(r.amt) && r.amt > 0);
  if (!rows.length) return null;
  const norm = rows.map((r) =>
    r.basis === "meine SF" ? r.amt / sfAt(level, 0) : r.amt,
  );
  return { value: Math.min(...norm), n: rows.length };
}

/* ============================================================
   5 — Speicher: window.storage, sonst localStorage, sonst RAM
   ============================================================ */
const store = (() => {
  const mem = {};
  const ws =
    typeof window !== "undefined" && window.storage ? window.storage : null;
  let ls = null;
  try {
    localStorage.setItem("__p", "1");
    localStorage.removeItem("__p");
    ls = localStorage;
  } catch {
    /* gesperrt */
  }
  return {
    async get(k) {
      if (ws) {
        try {
          const r = await ws.get(k);
          return r ? r.value : null;
        } catch {
          return null;
        }
      }
      if (ls) return ls.getItem(k);
      return mem[k] ?? null;
    },
    async set(k, v) {
      if (ws) {
        try {
          await ws.set(k, v);
          return;
        } catch {
          /* weiter unten */
        }
      }
      if (ls) {
        try {
          ls.setItem(k, v);
          return;
        } catch {
          /* voll */
        }
      }
      mem[k] = v;
    },
  };
})();
const STORE_KEY = "r34planer:v2";

async function persist() {
  const manual = {};
  Object.keys(prov).forEach((k) => {
    if (prov[k] === "manual") manual[k] = state[k];
  });
  await store.set(
    STORE_KEY,
    JSON.stringify({
      manual,
      ledgers,
      keys: SOURCES.filter((s) => s.editable).map((s) => [s.id, s.key]),
    }),
  );
}
async function restore() {
  const raw = await store.get(STORE_KEY);
  if (!raw) return;
  try {
    const j = JSON.parse(raw);
    Object.entries(j.manual || {}).forEach(([k, v]) => {
      state[k] = v;
      prov[k] = "manual";
    });
    Object.entries(j.ledgers || {}).forEach(([k, v]) => {
      if (ledgers[k]) ledgers[k] = v;
    });
    (j.keys || []).forEach(([id, key]) => {
      const s = SOURCES.find((x) => x.id === id);
      if (s && key) s.key = key;
    });
  } catch {
    /* kaputter Eintrag wird ignoriert */
  }
}

/* ============================================================
   6 — Hilfetexte
   ============================================================ */
const HELP = {
  netNow: {
    t: "Netto heute",
    b: 'Dein monatliches Nettoeinkommen inklusive steuerfreiem Fahrgeld. Gilt im Modell bis zu dem Monat, den du unter „Erhöhung ab" einträgst.',
  },
  netAfter: {
    t: "Netto nach der Erhöhung",
    b: "Das Netto ab dem Monat der vertraglichen Erhöhung. Ab da schreibt der Rechner es jährlich mit der Lohnentwicklung fort, es bleibt also nicht konstant stehen.<br><br>Zweitstärkster Hebel auf den Termin: mit den Standardwerten bewegen 200 € mehr oder weniger ihn um rund 14 Monate.",
  },
  raiseYm: {
    t: "Monat der Erhöhung",
    b: "Ab diesem Monat rechnet das Modell mit dem höheren Netto, davor mit dem aktuellen. Der Übergang ist hart, eine Zwischenstufe gibt es nicht.",
  },
  living: {
    t: "Lebenshaltung ohne Auto",
    b: "Alles, was monatlich abgeht außer Autokosten: Warmmiete, Strom, Internet, Handy, Versicherungen, Abos, Essen, Freizeit, Kleidung.<br><br>Der Rechner zieht den Betrag jeden Monat vom Netto ab und erhöht ihn jährlich um die Kosteninflation. Er ist der stärkste Hebel im ganzen Modell: ±150 € verschieben den Kauftermin um etwa 15 Monate.<br><br>Wenn du eine einzige Zahl belastbar machst, dann diese. Drei Monate Kontoauszug, alles ohne Auto summieren, durch drei teilen.",
  },
  levers: {
    t: "Was den Termin verschiebt",
    b: "Der Rechner dreht jeden Wert einmal um die angegebene Spanne nach unten und nach oben und lässt die Simulation beide Male komplett durchlaufen. Der Balken zeigt, wie weit der Kauftermin dabei wandert. Die Reihenfolge ordnet sich neu, sobald du oben etwas änderst.<br><br>Die Schlusszeile listet die Posten, die den Termin um null Monate bewegen. Das sind sämtliche laufenden Kosten des R34, weil sie erst ab dem Kaufmonat anfallen. Sie entscheiden darüber, was dir nach dem Kauf im Monat bleibt, und haben auf den Kaufzeitpunkt keinen Einfluss.",
  },

  inflCost: {
    t: "Kosteninflation",
    b: 'Jährliche Steigerung von Lebenshaltung, Wartung, Versicherung und Stellplatz. Vorbelegt mit der aktuellen HVPI-Jahresrate für Deutschland aus dem EZB-Datenportal, nachzusehen unten unter „Datenquellen".<br><br>Der Rechner multipliziert die Kosten in Monat m mit (1 + Rate/100)^(m/12). Über vier Jahre machen schon 2 % rund 8 % im Unterhalt aus.',
    l: [
      {
        h: "https://data.ecb.europa.eu/data/datasets/ICP",
        n: "EZB-Datenportal: HVPI",
      },
    ],
  },
  inflIncome: {
    t: "Lohnentwicklung",
    b: "Jährliche Steigerung des Nettos nach der vertraglichen Erhöhung, gleiche Formel wie bei den Kosten.<br><br>Steht sie gleich hoch wie die Kosteninflation, bleibt dein Spielraum real konstant. Auf 0 gesetzt schmilzt die Kaufkraft über die Laufzeit ab, das ist die pessimistische Variante.",
  },
  birth: {
    t: "Geburtsmonat",
    b: "Bestimmt genau einen Termin: den Monat, ab dem Liebhaber- und Oldtimertarife zugänglich sind. Die meisten Anbieter setzen 25 Jahre Mindestalter voraus.<br><br>Der Rechner addiert 25 Jahre auf diesen Monat und schaltet den Tarif ab da um, sofern der Schalter unter R34-Unterhalt aktiv ist.",
  },
  licenseOwned: {
    t: "Führerschein-Status",
    b: 'Bei „noch zu machen" zieht der Rechner die Kosten im geplanten Monat einmalig vom Ersparten ab und lässt vorher keinen Autokauf zu.<br><br>Bei „vorhanden" entfallen Kosten und Sperre. Das Datum darunter ist reine Dokumentation: die SF-Einstufung hängt an eigenen versicherten Fahrzeugjahren, nicht am Alter des Führerscheins.',
  },
  licence: {
    t: "Kosten Führerschein",
    b: "Klasse B, realistisch 3.000 bis 4.500 € inklusive Fahrstunden, Theorie und Prüfungsgebühren.<br><br>Wird einmalig im geplanten Monat abgezogen und verschiebt den Termin um etwa einen Monat, ist also der kleinste der wirksamen Posten. Zwei Angebote von Fahrschulen vor Ort ersetzen die Schätzung.",
  },

  ez: {
    t: "Erstzulassung",
    b: "Steuert im Modell drei Dinge gleichzeitig:<br>• den <b>H-Termin</b>, 30 Jahre nach diesem Datum<br>• das <b>Steuerregime</b>: vor dem 01.07.2009 nach Hubraum und Schadstoffklasse, danach nach Hubraum und CO₂<br>• die Einordnung als <b>Sammlungsstück</b> beim Import, ebenfalls ab 30 Jahren<br><br>Ändere das Datum und alle drei Termine wandern mit.",
  },
  ccm: {
    t: "Hubraum",
    b: "Aus der Zulassungsbescheinigung Teil I, Feld P.1. Der RB25DET hat 2.498 cm³.<br><br>Die Steuer rechnet mit angefangenen 100 cm³, aus 2.498 werden also 25 Einheiten.",
  },
  norm: {
    t: "Schadstoffklasse",
    b: "Feld 14.1 der Zulassungsbescheinigung. Bei Erstzulassung vor dem 01.07.2009 bestimmt sie den Steuersatz je angefangene 100 cm³ vollständig. Für Benziner:<br><br>Euro 3 und besser <b>6,75 €</b> · Euro 2 7,36 € · Euro 1 15,13 € · Euro 0 bedingt 21,07 € · ohne Einstufung <b>25,36 €</b><br><br>Ein JDM-Import ohne europäische Einstufung landet regelmäßig in der letzten Zeile, beim R34 sind das 634 € im Jahr. Mit Kat-Nachrüstung und Einstufung auf Euro 2 werden daraus 184 €. Beim Kauf in die Papiere schauen und hier eintragen.",
    l: [
      {
        h: "https://de.wikipedia.org/wiki/Kraftfahrzeugsteuer_(Deutschland)",
        n: "Kraftfahrzeugsteuer: Sätze und Rechtsgrundlage",
      },
    ],
  },
  co2: {
    t: "CO₂-Wert",
    b: "Feld V.7, nur relevant bei Erstzulassung ab dem 01.07.2009. Die ersten 95 g/km sind frei, darüber staffelt der Tarif:<br><br>96–115 g 2,00 € · 116–135 2,20 € · 136–155 2,50 € · 156–175 2,90 € · 176–195 3,40 € · ab 196 4,00 € je g/km<br><br>Vor 2021 gilt statt der Staffel ein linearer Satz von 2,00 €/g, und die Freigrenze lag bei 110 g/km (2012 und 2013) beziehungsweise 120 g/km (bis 2011). Welche Variante greift, entscheidet der Rechner am Erstzulassungsdatum.",
  },
  taxCalc: {
    t: "Wie die Kfz-Steuer hier entsteht",
    b: "Der Wert kommt aus dem Tarif nach §§ 8, 9 KraftStG, angewandt auf Hubraum, Kraftstoff, Schadstoffklasse, CO₂ und Erstzulassung.<br><br>Drei Sonderfälle sind abgedeckt: Erstzulassung zwischen dem 05.11.2008 und dem 30.06.2009 nimmt die günstigere der beiden Rechnungen, das H-Kennzeichen setzt pauschal <b>191,73 €</b> im Jahr, und ein Saisonkennzeichen kürzt anteilig auf die zugelassenen Monate.<br><br>Zum Gegenprüfen taugt der Rechner des ADAC.",
    l: [
      {
        h: "https://www.adac.de/rund-ums-fahrzeug/auto-kaufen-verkaufen/kfz-steuer/kfz-steuer-rechner/",
        n: "ADAC: Kfz-Steuer-Rechner zum Gegenprüfen",
      },
    ],
  },

  car: {
    t: "Kaufpreis R34",
    b: 'Solange keine Vergleichsangebote erfasst sind, trägt diese Zahl die größte Unsicherheit im Plan: ±3.000 € verschieben den Termin um rund sieben Monate.<br><br>Unter Feineinstellungen → „Kaufpreis belegen" kannst du echte Inserate eintragen, dann ersetzt deren Median diesen Wert. Preise in Yen rechnet der Rechner über den EZB-Referenzkurs um.',
  },
  priceLedger: {
    t: "Vergleichsangebote",
    b: "Jede Zeile ist ein reales Inserat mit Erfassungsdatum. Der Median aller Zeilen ersetzt den geschätzten Kaufpreis, die Spanne daneben zeigt, wie belastbar er ist. Ab etwa fünf Inseraten wird das Bild brauchbar.<br><br>Trag entweder nur deutsche Angebote frei Haus ein oder nur japanische ab Werk und schalt den Import-Rechner dazu. Gemischt im selben Median vergleichst du Preise, die nicht dasselbe enthalten.<br><br>Zum Suchen: <b>mobile.de</b> und <b>Classic Trader</b> für Fahrzeuge in Deutschland, <b>Goo-net Exchange</b> für den japanischen Markt.",
    l: [
      {
        h: "https://www.classic-trader.com/de/",
        n: "Classic Trader: Marktübersicht Klassiker",
      },
      {
        h: "https://www.goo-net-exchange.com/",
        n: "Goo-net Exchange: japanischer Gebrauchtmarkt",
      },
    ],
  },
  importCalc: {
    t: "Import aus Japan",
    b: "Rechnet aus dem Yen-Preis die Landekosten. Fracht und Versicherung ergeben zusammen mit dem Fahrzeugpreis den Zollwert, darauf kommt der Zoll, auf die Summe die Einfuhrumsatzsteuer, dazu Einzelabnahme nach §21 StVZO und Zulassung.<br><br>Regulär sind das 10 % Zoll und 19 % EUSt. Als <b>Sammlungsstück nach Position 9705</b> (mindestens 30 Jahre alt, Originalzustand ohne wesentliche Umbauten, Modell nicht mehr gebaut) entfällt der Zoll und die EUSt sinkt auf 7 %. Bei 25.000 € Fahrzeugwert sind das grob 6.000 € Unterschied.<br><br>Das Freihandelsabkommen zwischen EU und Japan kann den Zoll mit gültiger Ursprungserklärung des Verkäufers ebenfalls senken. Deshalb ist der Satz hier ein Feld. Verbindlich ist nur eine Auskunft beim Zoll.",
    l: [
      {
        h: "https://www.adac.de/rund-ums-fahrzeug/oldtimer-youngtimer/recht-tipps/oldtimer-import-export/",
        n: "ADAC: Oldtimer-Import, Zoll und Einfuhrsteuer",
      },
    ],
  },

  insVariant: {
    t: "Versicherungsart",
    b: "<b>Haftpflicht</b> zahlt nur Schäden an anderen. <b>Teilkasko</b> ergänzt Diebstahl, Glas, Hagel, Wild und Brand. <b>Vollkasko</b> ergänzt selbstverschuldete Schäden am eigenen Auto. <b>Liebhaber</b> ist ein Pauschaltarif ohne SF-Einstufung und setzt Mindestalter 25, abschließbare Garage, ein Alltagsfahrzeug und eine gute Zustandsnote voraus.<br><br>Die hinterlegten Beträge sind Schätzwerte. Die tatsächliche Höhe hängt an Typklasse und Regionalklasse, beide lassen sich beim GDV kostenlos abfragen.",
    l: [
      {
        h: "https://www.gdv.de/gdv/themen/mobilitaet/typklassen-kurz-erklaert-12228",
        n: "GDV: Typklasse deines Wunschautos abfragen",
      },
    ],
  },
  insY: {
    t: "Versicherungsbeitrag",
    b: 'Jahresbeitrag auf „erfahren"-Niveau, also SF 3 und besser. Den Fahranfänger-Zuschlag legt der Rechner separat über die SF-Kurve darauf, damit er nicht zweimal zählt.<br><br>Sobald du unten ein echtes Angebot einträgst, ersetzt das günstigste diesen Wert und das Feld wechselt auf „beleg".',
    l: [
      {
        h: "https://www.gdv.de/gdv/themen/mobilitaet/typklassen-kurz-erklaert-12228",
        n: "GDV: Typklassen und Regionalklassen abfragen",
      },
    ],
  },
  insLedger: {
    t: "Versicherungsangebote",
    b: 'Anbieter und Jahresbeitrag eintragen, der Rechner nimmt das günstigste Angebot.<br><br>Entscheidend ist die Spalte daneben. Ein Angebot aus einem Vergleichsportal gilt für <b>deine</b> Einstufung und enthält den Fahranfänger-Zuschlag bereits. Wähl dann „meine SF", der Rechner rechnet es auf erfahren-Niveau zurück und lässt den Zuschlag über die Jahre wieder abschmelzen. „Erfahren" ist für Beiträge gedacht, die schon auf SF 3 kalkuliert sind.',
  },
  sf: {
    t: "SF-Einstufung",
    b: 'Die Schadenfreiheitsklasse zählt Jahre mit eigenem versicherten Fahrzeug, keine Führerscheinjahre. Wer nie ein Auto versichert hatte, startet bei SF 0.<br><br>„Automatisch" leitet ab: das erste Auto der gewählten Reihenfolge zählt als Fahranfänger, das zweite als Zweitwagen.<br><br>Der Rechner multipliziert den Jahresbeitrag im ersten Jahr mit ×2,3, dann 1,8 · 1,5 · 1,3 · 1,15 und ab dem sechsten Jahr 1,0. Zweitwagen laufen mit 1,3 · 1,2 · 1,1. Diese Kurve ist eine Annahme und schwankt je Versicherer deutlich. Ein Zweitwagenvertrag über die Eltern startet oft bei SF ½ statt SF 0.',
    l: [
      {
        h: "https://de.wikipedia.org/wiki/Schadenfreiheitsklasse",
        n: "Wikipedia: Schadenfreiheitsklasse",
      },
    ],
  },
  switch25: {
    t: "Tarifwechsel mit 25",
    b: 'Ab dem Monat, in dem du 25 wirst, rechnet das Modell den R34 mit der Liebhaber-Pauschale von 800 € im Jahr weiter statt mit der gewählten Variante samt SF-Zuschlag. Der Termin kommt aus deinem Geburtsmonat unter „Sparen & Rahmendaten".<br><br>Voraussetzungen bleiben abschließbare Garage, vorhandenes Alltagsauto und guter Zustand. Fällt eine davon weg, schalt den Wechsel ab.',
  },
  season: {
    t: "Saisonkennzeichen",
    b: "Zulassung nur für die gewählten Monate. Außerhalb darf das Auto nicht auf öffentlichem Grund stehen oder fahren.<br><br>Der Rechner kürzt die Steuer auf Monate/12 und die Versicherung auf denselben Anteil mal dem Saison-Aufschlag daneben, weil Saisontarife nicht exakt linear kalkuliert sind. März bis Oktober ergibt 8/12, also 67 % der Steuer.<br><br>Der Stellplatz läuft ganzjährig weiter, das Auto steht auch im Winter irgendwo.",
    l: [
      {
        h: "https://de.wikipedia.org/wiki/Saisonkennzeichen",
        n: "Wikipedia: Saisonkennzeichen",
      },
    ],
  },
  hkz: {
    t: "H-Kennzeichen",
    b: "Möglich ab 30 Jahren nach Erstzulassung. Der Termin folgt dem Erstzulassungsdatum unter R34-Unterhalt.<br><br>Die Steuer fällt dann pauschal auf <b>191,73 €</b> im Jahr, unabhängig vom Hubraum. Dazu kommen Zugang zu allen Umweltzonen und der Zugang zu Klassikertarifen.<br><br>Voraussetzungen: Gutachten nach §23 StVZO durch TÜV, DEKRA, GTÜ oder KÜS (etwa 80 bis 200 €), weitgehend originaler und guter Erhaltungszustand, gültige HU. Umbauten müssen zeitgenössisch sein, starkes Tuning kostet das H-Kennzeichen.",
    l: [
      {
        h: "https://www.adac.de/rund-ums-fahrzeug/oldtimer-youngtimer/recht-tipps/oldtimer-zulassung/",
        n: "ADAC: Oldtimer-Zulassung, H- und Saisonkennzeichen",
      },
    ],
  },

  maint: {
    t: "Wartung und Rücklage",
    b: "Jahresrücklage für Inspektion, Öl, Bremsen, Reifen, HU alle zwei Jahre und Puffer für Verschleiß. Der Rechner verteilt sie gleichmäßig auf zwölf Monate und erhöht sie jährlich um die Kosteninflation.<br><br>In der Realität kostet ein Jahr 200 € und das nächste 900 €, der Wert ist also ein Durchschnitt. Beim R34 höher ansetzen, JDM-Teile sind teurer und teils nur aus Japan zu bekommen.",
  },
  garage: {
    t: "Garage oder Stellplatz",
    b: "Monatliche Miete für den Abstellplatz. Läuft auch bei Saisonkennzeichen ganzjährig weiter. Beim Daily meist 0, wenn er auf der Straße steht.<br><br>Beim R34 verlangen Klassiker- und Liebhabertarife fast immer eine abschließbare Garage. Ohne sie ist die Pauschale von 800 € nicht zu bekommen.",
  },
  km: {
    t: "Fahrleistung",
    b: "Kilometer pro Jahr. Wirkt im Modell auf die Spritkosten: km × Verbrauch/100 × Literpreis, verteilt auf zwölf Monate.<br><br>Beim Daily ist das einer der stärkeren Hebel auf den Termin, weil die Kosten die ganze Sparphase mitlaufen. ±4.000 km verschieben ihn um etwa fünf Monate. Beim R34 wirkt die Fahrleistung nur auf das, was nach dem Kauf übrig bleibt.<br><br>Auf den Versicherungsbeitrag wirkt sie hier nicht, in echten Tarifen dagegen spürbar.",
  },
  cons: {
    t: "Verbrauch",
    b: "Liter pro 100 km im realen Betrieb, nicht nach Prospekt. Der RB25DET liegt je nach Fahrweise bei 10 bis 13, ein sparsamer Vierzylinder bei 6 bis 8.<br><br>Bleibt eine Annahme, bis du selbst getankt und nachgerechnet hast.",
  },
  fuelGrade: {
    t: "Kraftstoffsorte",
    b: 'Der Literpreis kommt live aus dem Bundesdurchschnitt der Markttransparenzstelle für Kraftstoffe, alle fünf Minuten aktualisiert und unten unter „Datenquellen" einsehbar.<br><br>Super Plus meldet die MTS-K nicht separat. Der Rechner nimmt deshalb Super E5 und addiert den Aufschlag aus dem Feld darunter, der je nach Region und Marke zwischen 8 und 20 Cent liegt.',
    l: [
      {
        h: "https://www.benzinpreis-aktuell.de/",
        n: "Bundesdurchschnitt und Preisverlauf",
      },
    ],
  },
  price: {
    t: "Kaufpreis Daily",
    b: "Ein Alltagsauto mit Steuerkette und wenig Rost gibt es realistisch ab 2.500 bis 4.000 €. Rechne 500 bis 700 € dazu für Zulassung, Kennzeichen, eventuell fällige HU und Winterreifen.<br><br>Der Rechner zieht den Betrag im Kaufmonat vom Ersparten ab.",
  },

  reserve: {
    t: "Rücklage",
    b: "Bargeld, das nach dem Kauf liegen bleibt. Der Rechner kauft bar erst, wenn das Ersparte Kaufpreis <b>und</b> Rücklage deckt, und nimmt sie bei Finanzierung von der Anzahlung aus.<br><br>Bei einem fast 30 Jahre alten Import ist der Posten schwer wegzudiskutieren: Kupplung, Turbo oder Getriebe kosten schnell vierstellig.",
  },
  rate: {
    t: "Kreditzins",
    b: "Vorbelegt mit dem Durchschnittszins für Konsumentenkredite an private Haushalte in Deutschland mit ein bis fünf Jahren Zinsbindung, aus der EZB-Zinsstatistik. Der Rechner bildet daraus eine Annuität, also eine gleichbleibende Monatsrate über die Laufzeit.<br><br>Der Wert ist ein Marktdurchschnitt über alle Banken und kein Angebot an dich. Für einen JDM-Import gibt es meist keinen günstigen Autokredit, weil Banken den Beleihungswert nicht über Schwacke ermitteln können. Rechne mit Aufschlag und ersetz die Zahl, sobald du eine Zusage hast.",
    l: [
      {
        h: "https://data.ecb.europa.eu/data/datasets/MIR",
        n: "EZB: Zinsstatistik der Banken",
      },
    ],
  },
  saveRate: {
    t: "Tagesgeldzins",
    b: "Vorbelegt mit dem EZB-Einlagesatz minus 0,25 Punkte, weil gute Tagesgeldangebote erfahrungsgemäß knapp darunter liegen. Auf dem Girokonto sind es 0.<br><br>Der Rechner schreibt die Zinsen monatlich auf das Ersparte gut. Über drei Jahre Ansparphase macht das etwa einen Monat beim Termin aus.",
  },
  cap: {
    t: "Startkapital",
    b: "Was du heute schon gespart hast. Geht direkt als Startsumme in die Simulation.<br><br>±4.000 € verschieben den Termin um etwa vier Monate. Bei Finanzierung senkt jeder Euro zusätzlich die Kreditsumme und damit die Zinsen.",
  },

  strat: {
    t: "Reihenfolge der Käufe",
    b: "<b>Daily zuerst:</b> Du bist früh mobil und sammelst SF-Jahre auf dem günstigen Auto. Der R34 kommt später, startet dann aber als Zweitwagen und ist deutlich billiger versichert.<br><br><b>R34 zuerst:</b> Du bist früher am Traumauto, versicherst es aber als Erstwagen eines Fahranfängers. Der Daily kommt erst danach und nur, wenn der Kauf die Rücklage nicht antastet.<br><br>Die Wahl steuert auch die automatische SF-Einstufung beider Autos.",
  },
  method: {
    t: "Bar oder Kredit",
    b: "<b>Bar:</b> Gekauft wird im ersten Monat, in dem das Ersparte Kaufpreis und Rücklage deckt. Keine Zinsen, dafür später.<br><br><b>Kredit:</b> Gekauft wird im eingestellten Monat. Anzahlung ist alles Ersparte über der Rücklage, der Rest läuft als Annuität über die Laufzeit. Kürzere Laufzeit heißt weniger Zinsen, aber eine höhere Rate, und die drückt genau auf den engsten Monat.",
  },
  r34start: {
    t: "R34 frühestens",
    b: "Frühester Kaufmonat. Bei Barkauf wird gekauft, sobald danach das Geld reicht, bei Kredit startet die Finanzierung genau in diesem Monat.<br><br>Vorbelegt mit dem H-Termin. Frühere Monate sind erlaubt, kosten aber die höhere Kfz-Steuer und den Zugang zu Klassikertarifen. Der Rechner warnt dann in der Zeile unter dem R34-Unterhalt.",
  },
  dailystart: {
    t: "Daily frühestens",
    b: 'Frühester Kaufmonat des Alltagsautos, vorbelegt mit dem Führerscheintermin. Gekauft wird im ersten Monat danach, in dem das Geld reicht, spätestens sechs Monate später auch dann, wenn es knapp wird. Sonst kämst du nicht zur Arbeit.<br><br>Bei „R34 zuerst" wartet der Daily zusätzlich, bis der R34 da ist.',
  },
  appr: {
    t: "Wertsteigerung",
    b: "Angenommene jährliche Wertentwicklung. Der Rechner verzinst den Kaufpreis exponentiell bis zum Kaufmonat, bei 5 % über vier Jahre sind das gut 20 % Aufschlag.<br><br>Für JDM-Klassiker gibt es keinen offenen Preisindex, der Wert bleibt also eine Annahme. Der Sammleraufschlag hängt vor allem am <b>Coupé</b>. Für die Limousine ist ein flacherer Wert wie 3 % realistischer, was den Zeitdruck spürbar senkt.<br><br>Sammelst du über Monate Vergleichsangebote, kannst du deine eigene Rate daraus ablesen.",
  },
  leftover: {
    t: "Frei nach dem Kauf",
    b: "Der engste Monat ab dem Kauf: Netto minus Lebenshaltung, minus Unterhalt beider Autos, minus Kreditrate, jeweils zum dann gültigen inflationierten Stand.<br><br>Der Rechner nimmt bewusst das Minimum und keinen Durchschnitt, weil sich daran entscheidet, ob der Plan im Alltag trägt. Der Wert daneben zeigt den eingeschwungenen Zustand: SF abgeschmolzen, Kredit getilgt, gegebenenfalls Liebhabertarif aktiv.<br><br>Die Rücklage ist darin nicht enthalten, die liegt separat für Reparaturen.",
  },
  timeline: {
    t: "Zeitleiste",
    b: "Die Meilensteine des Plans in zeitlicher Reihenfolge. Der eingefärbte Abschnitt reicht bis zum R34-Kauf. Ereignisse erscheinen nur, wenn sie im gewählten Szenario vorkommen.",
  },
  sources: {
    t: "Datenquellen",
    b: 'Alle Quellen laufen ohne Schlüssel und ohne Konto direkt aus dem Browser.<br><br>Spritpreise aus der amtlichen Markttransparenzstelle für Kraftstoffe. Inflation, Kreditzins und Einlagesatz aus dem Datenportal der EZB. Wechselkurse über Frankfurter, das dieselben EZB-Referenzkurse ausliefert.<br><br>Fällt eine Quelle aus, rechnet das Modell mit dem hinterlegten Rückfallwert weiter und meldet das in der Kopfzeile dieses Panels sowie unter „Was noch geraten ist". Die EZB-Reihenschlüssel sind editierbar, falls du im Datenportal eine passendere Zeitreihe findest.',
    l: [
      {
        h: "https://data.ecb.europa.eu/help/api/data",
        n: "EZB: Aufbau der API-Abfragen",
      },
    ],
  },
};

/* ============================================================
   7 — Feldkatalog
   ============================================================ */
const NORMS = [
  "Euro 3+",
  "Euro 2",
  "Euro 1",
  "Euro 0 bedingt",
  "ohne Einstufung",
];
const MONTHS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

/* Die fünf Zahlen, die den Termin wirklich verschieben — gemessen, nicht geraten.
   Alles andere liegt eine Ebene tiefer und ist sinnvoll vorbelegt. */
const CORE = [
  {
    key: "netNow",
    label: "Netto heute",
    unit: "€/M",
    def: 1903,
    help: "netNow",
    prov: "guess",
  },
  {
    key: "netAfter",
    label: "Netto nach der Erhöhung",
    unit: "€/M",
    def: 2246,
    help: "netAfter",
    prov: "guess",
  },
  {
    type: "month",
    key: "raiseYm",
    label: "Erhöhung ab",
    def: "2027-07",
    help: "raiseYm",
    prov: "guess",
  },
  {
    key: "living",
    label: "Lebenshaltung ohne Auto",
    unit: "€/M",
    def: 950,
    help: "living",
    prov: "guess",
  },
  {
    key: "car",
    label: "Kaufpreis R34",
    unit: "€",
    def: 28500,
    help: "car",
    prov: "guess",
  },
];

const GROUPS = [
  {
    title: "Alltagsauto",
    effect: "date",
    open: false,
    derived: "daily",
    ledger: "insDaily",
    sum: (s) =>
      `${eur(dailyRunAt(s, lastRun?.dailyMonth ?? 0, 0))} €/M Unterhalt`,
    fields: [
      {
        key: "dailyPrice",
        label: "Kaufpreis",
        unit: "€",
        def: 3000,
        help: "price",
        prov: "guess",
      },
      {
        key: "dailyKm",
        label: "Fahrleistung",
        unit: "km/J",
        def: 10000,
        help: "km",
        prov: "guess",
      },
      {
        key: "dailyCons",
        label: "Verbrauch",
        unit: "l/100",
        def: 7.5,
        help: "cons",
        prov: "guess",
      },
      {
        type: "seg",
        key: "dailyGrade",
        label: "Kraftstoff",
        def: "E10",
        help: "fuelGrade",
        prov: "live",
        opts: [{ v: "E10" }, { v: "Super E5" }, { v: "Diesel" }],
      },
      {
        type: "seg",
        key: "dailyIns",
        target: "dailyInsY",
        label: "Versicherungsart",
        def: "Haftpfl.+TK",
        help: "insVariant",
        prov: "manual",
        opts: [
          {
            v: "Haftpflicht",
            p: 380,
            tip: "Minimum — bei einem 3.000-€-Auto vertretbar",
          },
          {
            v: "Haftpfl.+TK",
            p: 600,
            tip: "Diebstahl, Glas, Hagel, Wild — guter Kompromiss",
          },
          {
            v: "Vollkasko",
            p: 1150,
            tip: "Bei einem alten Daily selten wirtschaftlich",
          },
        ],
      },
      {
        key: "dailyInsY",
        label: "Versicherung",
        unit: "€/J",
        def: 600,
        help: "insY",
        prov: "guess",
      },
      {
        type: "seg",
        key: "dailySf",
        label: "SF-Start",
        def: "Automatisch",
        help: "sf",
        prov: "calc",
        opts: [
          { v: "Automatisch" },
          { v: "Fahranfänger" },
          { v: "Zweitwagen" },
          { v: "Erfahren" },
        ],
      },
      {
        key: "dailyMaint",
        label: "Wartung / Rücklage",
        unit: "€/J",
        def: 500,
        help: "maint",
        prov: "guess",
      },
      {
        key: "dailyGarage",
        label: "Garage / Stellplatz",
        unit: "€/M",
        def: 0,
        help: "garage",
        prov: "guess",
      },
      {
        type: "month",
        key: "dailyEz",
        label: "Erstzulassung",
        def: "2012-05",
        help: "ez",
        prov: "guess",
      },
      {
        key: "dailyCcm",
        label: "Hubraum",
        unit: "cm³",
        def: 1598,
        help: "ccm",
        prov: "guess",
      },
      {
        key: "dailyCo2",
        label: "CO₂",
        unit: "g/km",
        def: 139,
        help: "co2",
        prov: "guess",
      },
      {
        type: "seg",
        key: "dailyNorm",
        label: "Schadstoffklasse",
        def: "Euro 3+",
        help: "norm",
        prov: "guess",
        opts: NORMS.map((v) => ({
          v,
          tip: `${TAX.perUnitPre2009.otto[v].toFixed(2).replace(".", ",")} € je angefangene 100 cm³ (nur vor 07/2009)`,
        })),
      },
    ],
  },

  {
    title: "Sparen & Rahmendaten",
    effect: "date",
    open: false,
    sum: (s) =>
      `${s.licenseOwned ? "Schein da" : "Schein " + dat(licenceMonth(s))} · ${eur(s.reserve)} € Rücklage · ${num(s.inflCost, 1)} % Inflation`,
    fields: [
      {
        type: "toggle",
        key: "licenseOwned",
        label: "Führerschein",
        onLabel: "vorhanden",
        offLabel: "noch zu machen",
        def: false,
        help: "licenseOwned",
        prov: "manual",
      },
      {
        type: "month",
        key: "licenseSince",
        label: "Schein seit",
        def: "2024-04",
        showIf: "licenseOwned",
        prov: "manual",
      },
      {
        type: "month",
        key: "licenceYm",
        label: "Schein geplant für",
        def: "2026-11",
        hideIf: "licenseOwned",
        prov: "guess",
      },
      {
        key: "licence",
        label: "Kosten Führerschein",
        unit: "€",
        def: 3500,
        hideIf: "licenseOwned",
        help: "licence",
        prov: "guess",
      },
      {
        key: "reserve",
        label: "Rücklage (bar)",
        unit: "€",
        def: 4000,
        help: "reserve",
        prov: "guess",
      },
      {
        key: "saveRate",
        label: "Tagesgeldzins",
        unit: "%",
        def: 1.75,
        help: "saveRate",
        prov: "guess",
      },
      {
        key: "rate",
        label: "Kreditzins",
        unit: "%",
        def: 8.5,
        help: "rate",
        prov: "guess",
      },
      {
        key: "inflCost",
        label: "Kosteninflation",
        unit: "%/J",
        def: 2.2,
        help: "inflCost",
        prov: "guess",
      },
      {
        key: "inflIncome",
        label: "Lohnentwicklung",
        unit: "%/J",
        def: 2.2,
        help: "inflIncome",
        prov: "guess",
      },
      {
        type: "month",
        key: "birth",
        label: "Geburtsmonat",
        def: "2004-04",
        help: "birth",
        prov: "manual",
      },
      {
        key: "fuelE5",
        label: "Super E5",
        unit: "€/l",
        def: 2.29,
        ro: true,
        help: "fuelGrade",
        prov: "guess",
      },
      {
        key: "fuelE10",
        label: "Super E10",
        unit: "€/l",
        def: 2.24,
        ro: true,
        help: "fuelGrade",
        prov: "guess",
      },
      {
        key: "fuelDiesel",
        label: "Diesel",
        unit: "€/l",
        def: 2.27,
        ro: true,
        help: "fuelGrade",
        prov: "guess",
      },
    ],
  },

  {
    title: "R34-Unterhalt",
    effect: "after",
    open: false,
    derived: "r34",
    ledger: "insR34",
    sum: (s) =>
      `${eur(r34RunAt(s, lastRun?.r34Month ?? Math.max(0, idxFromYm(s.startYm) ?? 0), 0))} €/M Unterhalt`,
    fields: [
      {
        type: "seg",
        key: "r34Ins",
        target: "r34InsY",
        label: "Versicherungsart",
        def: "Vollkasko",
        help: "insVariant",
        prov: "manual",
        opts: [
          {
            v: "Liebhaber",
            p: 800,
            tip: "Pauschal, SF-frei — ab 25, Garage, guter Zustand",
          },
          {
            v: "Haftpfl.+TK",
            p: 1540,
            tip: "Ohne Schutz bei selbstverschuldeten Schäden",
          },
          {
            v: "Vollkasko",
            p: 3800,
            tip: "Voller Schutz — bei einem Wertobjekt sinnvoll",
          },
        ],
      },
      {
        key: "r34InsY",
        label: "Versicherung",
        unit: "€/J",
        def: 3800,
        help: "insY",
        prov: "guess",
      },
      {
        type: "seg",
        key: "r34Sf",
        label: "SF-Start",
        def: "Automatisch",
        help: "sf",
        prov: "calc",
        opts: [
          {
            v: "Automatisch",
            tip: "Leitet sich aus der gewählten Reihenfolge ab",
          },
          { v: "Fahranfänger", tip: "SF 0 — Zuschlag ×2,3 im ersten Jahr" },
          { v: "Zweitwagen", tip: "SF ½ — Zuschlag ×1,3" },
          { v: "Erfahren", tip: "SF 3+ — kein Zuschlag" },
        ],
      },
      {
        type: "toggle",
        key: "r34Switch25",
        label: "Ab 25",
        onLabel: "Liebhaber-Tarif",
        offLabel: "Variante behalten",
        def: true,
        help: "switch25",
        prov: "manual",
        showWhen: (s) => s.r34Ins !== "Liebhaber",
      },
      {
        type: "toggle",
        key: "r34Season",
        label: "Zulassung",
        onLabel: "Saisonkennzeichen",
        offLabel: "ganzjährig",
        def: true,
        help: "season",
        prov: "manual",
      },
      {
        type: "select",
        key: "r34SeasonFrom",
        label: "Saison von",
        def: 3,
        opts: MONTHS.map((m, i) => [i + 1, m]),
        showIf: "r34Season",
        prov: "manual",
      },
      {
        type: "select",
        key: "r34SeasonTo",
        label: "Saison bis",
        def: 10,
        opts: MONTHS.map((m, i) => [i + 1, m]),
        showIf: "r34Season",
        prov: "manual",
      },
      {
        key: "seasonLoad",
        label: "Saison-Aufschlag Vers.",
        unit: "×",
        def: 1.05,
        showIf: "r34Season",
        help: "season",
        prov: "guess",
      },
      {
        key: "r34Maint",
        label: "Wartung / Rücklage",
        unit: "€/J",
        def: 1200,
        help: "maint",
        prov: "guess",
      },
      {
        key: "r34Garage",
        label: "Garage / Stellplatz",
        unit: "€/M",
        def: 60,
        help: "garage",
        prov: "guess",
      },
      {
        key: "r34Km",
        label: "Fahrleistung",
        unit: "km/J",
        def: 5000,
        help: "km",
        prov: "guess",
      },
      {
        key: "r34Cons",
        label: "Verbrauch",
        unit: "l/100",
        def: 11,
        help: "cons",
        prov: "guess",
      },
      {
        type: "seg",
        key: "r34Grade",
        label: "Kraftstoff",
        def: "Super Plus",
        help: "fuelGrade",
        prov: "live",
        opts: [
          { v: "Super Plus", tip: "98 Oktan — Super E5 plus Aufschlag" },
          { v: "Super E5", tip: "95 Oktan, live aus der MTS-K" },
          { v: "E10", tip: "95 Oktan mit 10 % Ethanol" },
        ],
      },
      {
        key: "superPlusAdd",
        label: "Aufschlag Super Plus",
        unit: "€/l",
        def: 0.14,
        help: "fuelGrade",
        prov: "guess",
      },
      {
        type: "month",
        key: "r34Ez",
        label: "Erstzulassung",
        def: "1998-06",
        help: "ez",
        prov: "manual",
      },
      {
        key: "r34Ccm",
        label: "Hubraum",
        unit: "cm³",
        def: 2498,
        help: "ccm",
        prov: "manual",
      },
      {
        key: "r34Co2",
        label: "CO₂",
        unit: "g/km",
        def: 0,
        help: "co2",
        prov: "calc",
        showWhen: (s) =>
          (idxFromYm(s.r34Ez) ?? -1e9) + BASE_ABS >= EZ_CO2_WINDOW,
      },
      {
        type: "seg",
        key: "r34Norm",
        label: "Schadstoffklasse",
        def: "ohne Einstufung",
        help: "norm",
        prov: "manual",
        opts: NORMS.map((v) => ({
          v,
          tip: `${TAX.perUnitPre2009.otto[v].toFixed(2).replace(".", ",")} € je angefangene 100 cm³`,
        })),
      },
    ],
  },

  {
    title: "Kaufpreis belegen & Import",
    effect: "date",
    open: false,
    derived: "import",
    ledger: "price",
    sum: (s) =>
      s.importOn
        ? `Import: ${eur(importCost().total)} € an der Rampe`
        : priceFromLedger()
          ? `${priceFromLedger().n} Angebote erfasst`
          : "keine Angebote erfasst",
    fields: [
      {
        type: "toggle",
        key: "importOn",
        label: "Import rechnen",
        onLabel: "ja",
        offLabel: "nein",
        def: false,
        help: "importCalc",
        prov: "manual",
      },
      {
        key: "impJpy",
        label: "Fahrzeugpreis",
        unit: "¥",
        def: 2800000,
        showIf: "importOn",
        help: "importCalc",
        prov: "guess",
      },
      {
        key: "jpyRate",
        label: "Kurs EUR/JPY",
        unit: "¥",
        def: 170,
        showIf: "importOn",
        prov: "guess",
      },
      {
        key: "impFreight",
        label: "Fracht + Vers.",
        unit: "€",
        def: 2200,
        showIf: "importOn",
        prov: "guess",
      },
      {
        type: "toggle",
        key: "impCollector",
        label: "Sammlungsstück 9705",
        onLabel: "ja — 0 % / 7 %",
        offLabel: "nein — Zoll / 19 %",
        def: true,
        showIf: "importOn",
        help: "importCalc",
        prov: "calc",
      },
      {
        key: "impDuty",
        label: "Zollsatz",
        unit: "%",
        def: 10,
        showIf: "importOn",
        help: "importCalc",
        prov: "calc",
      },
      {
        key: "impReg",
        label: "§21 + Zulassung",
        unit: "€",
        def: 1400,
        showIf: "importOn",
        prov: "guess",
      },
    ],
  },

  {
    title: "Frühestens kaufen ab",
    effect: "date",
    open: false,
    sum: (s) => `R34 ${fmtYm(s.startYm)} · Daily ${fmtYm(s.dailyYm)}`,
    fields: [
      {
        type: "month",
        key: "startYm",
        label: "R34 frühestens",
        def: "2028-06",
        help: "r34start",
        prov: "calc",
      },
      {
        type: "month",
        key: "dailyYm",
        label: "Daily frühestens",
        def: "2026-11",
        help: "dailystart",
        prov: "calc",
      },
    ],
  },
];
const ALLFIELDS = [...CORE, ...GROUPS.flatMap((g) => g.fields)];

/* ============================================================
   8 — Zustand
   ============================================================ */
const state = { cap: 0, appr: 5, strat: "dailyfirst", method: "cash" };
let lastRun = null; // letztes Simulationsergebnis, für Zusammenfassungen
const prov = {};

const SF_CURVES = {
  Fahranfänger: [2.3, 1.8, 1.5, 1.3, 1.15],
  Zweitwagen: [1.3, 1.2, 1.1],
  Erfahren: [1.0],
};
const sfAt = (level, years) => {
  const c = SF_CURVES[level] ?? [1];
  const y = Math.max(0, years);
  return y < c.length ? c[y] : 1.0;
};
const DAILY_FORCE_AFTER = 6;
const LIEBHABER_Y = 800;
const LIEBHABER_FALLBACK_Y = 1540;

const annuity = (P, years, eff) => {
  if (P <= 0) return 0;
  const n = years * 12,
    r = eff / 12;
  return r === 0 ? P / n : (P * r) / (1 - Math.pow(1 + r, -n));
};
const eur = (n) => (isFinite(n) ? Math.round(n).toLocaleString("de-DE") : "—");
const num = (n, d = 2) => (isFinite(n) ? n.toFixed(d).replace(".", ",") : "—");
const esc = (t) =>
  String(t)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
const fuelM = (km, cons, price) => (((km * cons) / 100) * price) / 12;
const growth = (pct, months) => Math.pow(1 + (pct || 0) / 100, months / 12);

/* ---- abgeleitete Termine ---- */
const fmtYm = (ym) =>
  typeof ym === "string" && ym.includes("-")
    ? ym.split("-")[1] + "/" + ym.split("-")[0]
    : "—";
const licenceMonth = (s) =>
  s.licenseOwned
    ? (idxFromYm(s.licenseSince) ?? 0)
    : (idxFromYm(s.licenceYm) ?? 0);
const hMonth = (s) => hPlateFromEz(s.r34Ez) ?? 1e6;
const age25Month = (s) => age25From(s.birth) ?? 1e6;
const raiseMonth = (s) => Math.max(0, idxFromYm(s.raiseYm) ?? 0);

const seasonMonths = (s) => {
  if (!s.r34Season) return 12;
  const a = Number(s.r34SeasonFrom),
    b = Number(s.r34SeasonTo);
  return b >= a ? b - a + 1 : 12 - a + 1 + b;
};
const seasonTaxFactor = (s) => seasonMonths(s) / 12;
const seasonInsFactor = (s) =>
  s.r34Season ? Math.min(1, (seasonMonths(s) / 12) * (s.seasonLoad || 1)) : 1;

const gradePrice = (grade, s) =>
  grade === "Super Plus"
    ? s.fuelE5 + (s.superPlusAdd || 0)
    : grade === "Super E5"
      ? s.fuelE5
      : grade === "Diesel"
        ? s.fuelDiesel
        : s.fuelE10;

/* ---- Import ---- */
function importCost() {
  const s = state;
  const rate = s.jpyRate > 0 ? s.jpyRate : 1;
  const carEur = (s.impJpy || 0) / rate;
  const cif = carEur + (s.impFreight || 0);
  const dutyPct = s.impCollector ? 0 : s.impDuty || 0;
  const duty = (cif * dutyPct) / 100;
  const vatPct = s.impCollector ? 7 : 19;
  const vat = ((cif + duty) * vatPct) / 100;
  const total = cif + duty + vat + (s.impReg || 0);
  return { carEur, cif, duty, dutyPct, vat, vatPct, total };
}

/* ---- Kosten je Monat ---- */
const resolveSf = (s, which) => {
  const sel = which === "r34" ? s.r34Sf : s.dailySf;
  if (sel !== "Automatisch") return sel;
  const firstCar = s.strat === "dailyfirst" ? "daily" : "r34";
  return which === firstCar ? "Fahranfänger" : "Zweitwagen";
};

function r34PremiumBase(s) {
  const level = resolveSf(s, "r34");
  const fromLedger =
    prov.r34InsY === "manual" ? null : premiumFromLedger("insR34", level);
  if (fromLedger) return { y: fromLedger.value, src: "proof" };
  if (s.r34Ins === "Liebhaber")
    return { y: LIEBHABER_FALLBACK_Y, src: "guess" };
  return { y: s.r34InsY, src: prov.r34InsY === "manual" ? "manual" : "guess" };
}
function dailyPremiumBase(s) {
  const level = resolveSf(s, "daily");
  const fromLedger =
    prov.dailyInsY === "manual" ? null : premiumFromLedger("insDaily", level);
  if (fromLedger) return { y: fromLedger.value, src: "proof" };
  return {
    y: s.dailyInsY,
    src: prov.dailyInsY === "manual" ? "manual" : "guess",
  };
}

const r34InsAt = (s, m, years) => {
  const infl = growth(s.inflCost, Math.max(0, m));
  if (m >= age25Month(s) && (s.r34Ins === "Liebhaber" || s.r34Switch25))
    return (LIEBHABER_Y * seasonInsFactor(s) * infl) / 12;
  return (
    (r34PremiumBase(s).y *
      seasonInsFactor(s) *
      sfAt(resolveSf(s, "r34"), years) *
      infl) /
    12
  );
};
const r34TaxAt = (s, m) =>
  (kfzTaxYear({
    ez: s.r34Ez,
    ccm: s.r34Ccm,
    co2: s.r34Co2,
    norm: s.r34Norm,
    fuel: "otto",
    hPlate: m >= hMonth(s),
  }) *
    seasonTaxFactor(s)) /
  12;

const r34RunAt = (s, m, years) => {
  const infl = growth(s.inflCost, Math.max(0, m));
  return (
    r34InsAt(s, m, years) +
    r34TaxAt(s, m) +
    (s.r34Maint / 12 + (s.r34Garage || 0)) * infl +
    fuelM(s.r34Km, s.r34Cons, gradePrice(s.r34Grade, s)) * infl
  );
};

const dailyInsAt = (s, m, years) =>
  (dailyPremiumBase(s).y *
    sfAt(resolveSf(s, "daily"), years) *
    growth(s.inflCost, Math.max(0, m))) /
  12;
const dailyTaxYear = (s) =>
  kfzTaxYear({
    ez: s.dailyEz,
    ccm: s.dailyCcm,
    co2: s.dailyCo2,
    norm: s.dailyNorm,
    fuel: "otto",
    hPlate: false,
  });
const dailyRunAt = (s, m, years) => {
  const infl = growth(s.inflCost, Math.max(0, m));
  return (
    dailyInsAt(s, m, years) +
    dailyTaxYear(s) / 12 +
    (s.dailyMaint / 12 + (s.dailyGarage || 0)) * infl +
    fuelM(s.dailyKm, s.dailyCons, gradePrice(s.dailyGrade, s)) * infl
  );
};

/* ============================================================
   9 — Simulation
   ============================================================ */
function simulate(s) {
  const dailyFirst = s.strat === "dailyfirst";
  const finance = s.method !== "cash";
  const term = s.method === "fin2" ? 2 : 3;
  const rM = raiseMonth(s);
  const licM = licenceMonth(s);
  const dailyEarliest = Math.max(0, licM, idxFromYm(s.dailyYm) ?? 0);
  const r34Earliest = Math.max(0, licM, idxFromYm(s.startYm) ?? 0);
  const basePrice = s.car;

  const net = (m) =>
    m < rM ? s.netNow : s.netAfter * growth(s.inflIncome, m - rM);
  const household = (m) => s.living * growth(s.inflCost, m);
  const yrs = (buy, m) => Math.floor((m - buy) / 12);

  let cap = s.cap,
    dailyMonth = null,
    r34Month = null,
    leftoverMin = null;
  let financed = 0,
    payment = 0,
    interest = 0,
    priceAtBuy = 0;

  for (let m = 0; m < 480; m++) {
    // Nach Kauf beider Autos plus Kreditlaufzeit ändert sich nichts mehr am Ergebnis.
    if (
      r34Month != null &&
      dailyMonth != null &&
      m > r34Month + (finance ? term * 12 : 0) + 24
    )
      break;
    if (cap > 0) cap += (cap * (s.saveRate || 0)) / 100 / 12;

    let cost = household(m);
    if (dailyMonth != null) cost += dailyRunAt(s, m, yrs(dailyMonth, m));
    if (r34Month != null) {
      cost += r34RunAt(s, m, yrs(r34Month, m));
      if (finance && m < r34Month + term * 12) cost += payment;
    }
    const flow = net(m) - cost;
    cap += flow;
    if (r34Month != null && (leftoverMin == null || flow < leftoverMin))
      leftoverMin = flow;
    if (!s.licenseOwned && m === licM) cap -= s.licence;

    if (dailyMonth == null && m >= dailyEarliest) {
      if (dailyFirst) {
        if (cap >= s.dailyPrice || m >= dailyEarliest + DAILY_FORCE_AFTER) {
          cap -= s.dailyPrice;
          dailyMonth = m;
        }
      } else if (
        r34Month != null &&
        m > r34Month &&
        cap - s.dailyPrice >= s.reserve
      ) {
        cap -= s.dailyPrice;
        dailyMonth = m;
      }
    }

    if (r34Month != null) continue;
    if (m < r34Earliest) continue;
    const price = basePrice * Math.pow(1 + s.appr / 100, m / 12);
    if (finance) {
      priceAtBuy = price;
      const deposit = Math.max(0, cap - s.reserve);
      financed = Math.max(0, price - deposit);
      cap -= Math.min(deposit, price);
      payment = annuity(financed, term, s.rate / 100);
      interest = payment * term * 12 - financed;
      r34Month = m;
    } else if (cap >= price + s.reserve) {
      priceAtBuy = price;
      cap -= price;
      r34Month = m;
    }
  }

  const bothMonth =
    r34Month != null && dailyMonth != null
      ? Math.max(r34Month, dailyMonth)
      : null;
  let leftoverLong = null;
  if (r34Month != null) {
    const mL = Math.max(r34Month, age25Month(s), hMonth(s)) + 120;
    leftoverLong =
      s.netAfter * growth(s.inflIncome, mL - rM) -
      household(mL) -
      dailyRunAt(s, mL, 99) -
      r34RunAt(s, mL, 99);
  }
  return {
    r34Month,
    dailyMonth,
    bothMonth,
    financed,
    payment,
    interest,
    leftover: leftoverMin,
    leftoverLong,
    priceAtBuy,
    finance,
    term,
    basePrice,
  };
}

const statusOf = (v) =>
  v >= 400
    ? { w: "komfortabel", c: "ok" }
    : v >= 200
      ? { w: "solide", c: "ok" }
      : v >= 100
        ? { w: "eng", c: "warn" }
        : { w: "kritisch", c: "bad" };

/* ============================================================
   10 — Rendering
   ============================================================ */
const PROV_LABEL = {
  live: "live",
  calc: "berechnet",
  proof: "beleg",
  guess: "annahme",
  manual: "manuell",
};
const chip = (p) =>
  p ? `<span class="prov ${p}">${PROV_LABEL[p]}</span>` : "";

function renderSources() {
  const count = (st) =>
    SOURCES.filter((s) => (live[s.id] || {}).state === st).length;
  const ok = count("ok"),
    bad = count("fail"),
    busy = count("load");
  const sum = document.getElementById("srcSum");
  if (sum) {
    sum.textContent = busy
      ? "wird geladen …"
      : bad
        ? `${ok} live · ${bad} offline, Rückfallwerte aktiv`
        : `alle ${ok} live`;
    sum.classList.toggle("warn", !busy && bad > 0);
  }

  document.getElementById("sources").innerHTML = SOURCES.map((s) => {
    const st = live[s.id] || { state: "load" };
    const dot =
      st.state === "ok" ? "live" : st.state === "fail" ? "fail" : "load";
    const val =
      st.state === "ok"
        ? s.fmt(st.data)
        : st.state === "fail"
          ? `nicht erreichbar — ${esc(st.error)}, es gilt der Rückfallwert`
          : "wird geladen …";
    const stamp =
      st.state === "ok" && st.data.asOf ? ` · Stand ${st.data.asOf}` : "";
    const key = s.editable
      ? `<input class="skey" data-src="${s.id}" value="${esc(s.key)}" spellcheck="false" aria-label="Reihenschlüssel ${esc(s.label)}">`
      : "";
    return `<div class="src"><div class="sdot ${dot}"></div><div class="sbody">
      <div class="sname">${s.label}</div>
      <div class="sval">${val}${stamp}</div>
      <div class="smeta">${s.note}${s.docs ? ` · <a href="${s.docs}" target="_blank" rel="noopener noreferrer" style="color:var(--acc);text-decoration:none">Quelle ↗</a>` : ""}</div>
      ${key}</div></div>`;
  }).join("");
  document.querySelectorAll(".skey").forEach((el) => {
    el.addEventListener("change", (e) => {
      const s = SOURCES.find((x) => x.id === e.target.dataset.src);
      if (s) {
        s.key = e.target.value.trim();
        persist();
        loadSources();
      }
    });
  });
}

function renderLedger(id) {
  const box = document.getElementById("led_" + id);
  if (!box) return;
  const def = LEDGERS[id],
    rows = ledgers[id];
  const body = rows.length
    ? rows
        .map((r, i) => {
          const eurVal = id === "price" ? toEur(r.amt, r.cur) : r.amt;
          const meta =
            id === "price"
              ? `${r.date}${r.km ? " · " + eur(r.km) + " km" : ""}${r.cur !== "EUR" ? " · " + eur(r.amt) + " " + r.cur : ""}`
              : `${r.date} · ${r.basis}`;
          return `<div class="lrow"><div class="lmain">
        <div class="lsrc">${esc(r.src || "—")}</div><div class="lmeta">${esc(meta)}</div></div>
      <div class="lval">${eurVal == null ? "—" : eur(eurVal) + " €"}</div>
      <button type="button" class="ldel" data-led="${id}" data-i="${i}" aria-label="Zeile löschen">×</button></div>`;
        })
        .join("")
    : `<div class="empty">${def.empty}</div>`;

  const inputs = def.cols
    .map((c) =>
      c.type === "select"
        ? `<select data-led="${id}" data-col="${c.key}">${c.opts.map((o) => `<option>${o}</option>`).join("")}</select>`
        : `<input data-led="${id}" data-col="${c.key}" type="${c.type}" placeholder="${esc(c.ph)}" ${c.type === "number" ? 'step="any"' : ""}>`,
    )
    .join("");

  const mixed =
    id === "price" &&
    rows.some((r) => r.cur && r.cur !== "EUR") &&
    rows.some((r) => !r.cur || r.cur === "EUR");
  const hint = mixed
    ? `<div class="empty" style="color:var(--warn);font-style:normal">⚠ Angebote aus Japan und aus Deutschland im selben Median: der Yen-Preis ist ab Werk, der deutsche frei Haus. Entweder nur eine Sorte erfassen oder den Import-Rechner nutzen.</div>`
    : "";

  box.innerHTML = `<div class="flab" style="margin-bottom:7px">${def.title}
      <button type="button" class="hbtn" data-help="${def.help}">?</button>${chip(rows.length ? "proof" : "guess")}</div>
    ${body}${hint}<div class="ladd">${inputs}<button type="button" data-add="${id}">+ Angebot hinzufügen</button></div>`;
}

function renderDerived(s, r) {
  const mBuy = r.r34Month ?? Math.max(0, idxFromYm(s.startYm) ?? 0);
  const mLong = Math.max(mBuy, age25Month(s), hMonth(s)) + 120;
  const hm = hMonth(s),
    a25 = age25Month(s);

  const taxNoH = kfzTaxYear({
    ez: s.r34Ez,
    ccm: s.r34Ccm,
    co2: s.r34Co2,
    norm: s.r34Norm,
    fuel: "otto",
    hPlate: false,
  });
  const warn = [];
  if (mBuy < hm)
    warn.push(
      `Kauf vor ${dat(hm)}: kein H-Kennzeichen — Steuer ${eur(taxNoH)} €/J statt ${eur(TAX.hFlatCar)} €/J`,
    );
  if (s.r34Ins === "Liebhaber" && mBuy < a25)
    warn.push(
      `Liebhaber erst ab ${dat(a25)} — bis dahin mit Haftpfl.+TK gerechnet`,
    );
  if (s.r34Ins !== "Liebhaber" && s.r34Switch25 && mBuy < a25)
    warn.push(`ab ${dat(a25)} auf Liebhaber gewechselt`);
  warn.push(
    `SF-Start ${resolveSf(s, "r34")}${s.r34Sf === "Automatisch" ? " (automatisch)" : ""} · Beitrag ${r34PremiumBase(s).src === "proof" ? "aus Angebot" : "geschätzt"}`,
  );

  const der = document.getElementById("der_r34");
  if (der)
    der.innerHTML =
      `Steuer ${eur(taxNoH)} €/J<button type="button" class="hbtn" data-help="taxCalc">?</button> → ${eur(TAX.hFlatCar)} €/J ab ${dat(hm)}<button type="button" class="hbtn" data-help="hkz">?</button>${s.r34Season ? ` · Saison ${seasonMonths(s)} Mon (${num(seasonTaxFactor(s) * 100, 0)} %)` : ""} · ` +
      `Sprit ${num(gradePrice(s.r34Grade, s), 3)} €/l · ` +
      `<b>Unterhalt ${eur(r34RunAt(s, mBuy, 0))} → ${eur(r34RunAt(s, mLong, 99))} €/M</b>` +
      `<span class="warn">⚠ ${warn.join(" · ")}</span>`;

  const derD = document.getElementById("der_daily");
  if (derD) {
    const ezAbs = (idxFromYm(s.dailyEz) ?? 0) + BASE_ABS;
    const regime =
      ezAbs >= EZ_CO2_START ? "Hubraum + CO₂" : "Hubraum + Schadstoffklasse";
    derD.innerHTML =
      `Steuer ${eur(dailyTaxYear(s))} €/J <span style="opacity:.75">(${regime})</span> · ` +
      `Sprit ${num(gradePrice(s.dailyGrade, s), 3)} €/l · ` +
      `<b>Unterhalt ${eur(dailyRunAt(s, 0, 0))} → ${eur(dailyRunAt(s, 120, 99))} €/M</b>` +
      `<span class="warn">SF-Start ${resolveSf(s, "daily")} · Beitrag ${dailyPremiumBase(s).src === "proof" ? "aus Angebot" : "geschätzt"}</span>`;
  }

  const derI = document.getElementById("der_import");
  if (derI) {
    const c = importCost();
    derI.innerHTML = s.importOn
      ? `Fahrzeug ${eur(c.carEur)} € · Zollwert ${eur(c.cif)} € · Zoll ${num(c.dutyPct, 0)} % = ${eur(c.duty)} € · ` +
        `EUSt ${c.vatPct} % = ${eur(c.vat)} € · Zulassung ${eur(s.impReg)} € · <b>gesamt ${eur(c.total)} €</b>` +
        `<span class="warn">${c.dutyPct === 0 ? 'Als Sammlungsstück gerechnet — Einreihung vorab beim Zoll klären, „30 Jahre alt" allein reicht nicht.' : "Regulär gerechnet. Als Sammlungsstück nach 9705 wären es " + eur(c.total - c.duty - c.vat + c.cif * 0.07) + " €."}</span>`
      : "Aus. Der Kaufpreis oben gilt dann als Preis frei Haus in Deutschland.";
  }
}

/* Bandbreiten, in denen ein Wert realistischerweise schwankt. Daraus fällt die
   Rangliste ab: nicht was theoretisch wichtig ist, sondern was den Termin bewegt. */
const LEVERS = [
  { key: "living", label: "Lebenshaltung", band: 150, unit: "€/M", min: 0 },
  {
    key: "netAfter",
    label: "Netto nach Erhöhung",
    band: 200,
    unit: "€/M",
    min: 0,
  },
  { key: "car", label: "Kaufpreis R34", band: 3000, unit: "€", min: 0 },
  { key: "cap", label: "Startkapital", band: 4000, unit: "€", min: 0 },
  { key: "appr", label: "Wertsteigerung", band: 2, unit: "%/J", min: 0 },
  { key: "netNow", label: "Netto heute", band: 150, unit: "€/M", min: 0 },
  {
    key: "dailyKm",
    label: "Fahrleistung Daily",
    band: 4000,
    unit: "km/J",
    min: 0,
  },
  { key: "inflCost", label: "Kosteninflation", band: 1, unit: "%/J", min: 0 },
  {
    key: "dailyInsY",
    label: "Versicherung Daily",
    band: 200,
    unit: "€/J",
    min: 0,
  },
  { key: "reserve", label: "Rücklage", band: 1500, unit: "€", min: 0 },
  {
    key: "dailyPrice",
    label: "Kaufpreis Daily",
    band: 1000,
    unit: "€",
    min: 0,
  },
  { key: "r34InsY", label: "Versicherung R34", band: 800, unit: "€/J", min: 0 },
  { key: "r34Maint", label: "Wartung R34", band: 400, unit: "€/J", min: 0 },
  { key: "r34Km", label: "Fahrleistung R34", band: 2000, unit: "km/J", min: 0 },
  { key: "r34Garage", label: "Garage R34", band: 40, unit: "€/M", min: 0 },
];

/** Jeden Regler einmal nach unten und nach oben drehen und messen, was passiert. */
function sensitivity() {
  return LEVERS.map((l) => {
    const old = state[l.key];
    let lo, hi;
    try {
      state[l.key] = Math.max(l.min, old - l.band);
      lo = simulate(state);
      state[l.key] = old + l.band;
      hi = simulate(state);
    } finally {
      state[l.key] = old;
    }
    const both = lo.r34Month != null && hi.r34Month != null;
    return {
      ...l,
      months: both ? Math.abs(hi.r34Month - lo.r34Month) : null,
      leftover: Math.abs((hi.leftover ?? 0) - (lo.leftover ?? 0)),
    };
  }).sort(
    (a, b) => (b.months ?? 999) - (a.months ?? 999) || b.leftover - a.leftover,
  );
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function inWords(m) {
  if (m == null) return "";
  const y = Math.floor(m / 12),
    r = m % 12;
  if (m === 0) return "diesen Monat";
  if (!y) return "in " + plural(r, "Monat", "Monaten");
  if (!r) return "in " + plural(y, "Jahr", "Jahren");
  return `in ${plural(y, "Jahr", "Jahren")} und ${plural(r, "Monat", "Monaten")}`;
}

function renderHero(r) {
  const box = document.getElementById("hero");
  if (r.r34Month == null) {
    box.className = "hero bad";
    box.innerHTML = `<div class="hlead">Mit diesen Zahlen reicht es nicht</div>
      <div class="hsub">Es bleibt zu wenig übrig, um den Kaufpreis samt Rücklage je zusammenzubekommen.
        Schau unten, welcher Regler am stärksten zieht — Lebenshaltung und Kaufpreis sind fast immer die Antwort.</div>`;
    return;
  }
  const st = statusOf(r.leftover == null ? -1 : r.leftover);
  const pay =
    r.financed > 0
      ? `Kredit über ${eur(r.financed)} € · ${eur(r.payment)} €/M für ${r.term} Jahre · ${eur(r.interest)} € Zinsen`
      : "Barkauf, kein Kredit nötig";
  const pl = priceFromLedger();
  box.className = "hero";
  box.innerHTML = `
    <div class="hlead">R34 ab <b>${dat(r.r34Month)}</b></div>
    <div class="hsub">${inWords(r.r34Month)} · ${pay}</div>
    <div class="hstats">
      <div><span class="hk">Preis bis dahin</span><span class="hv">${eur(r.priceAtBuy)} €</span>
        <span class="hx">${pl ? `Median aus ${pl.n} Angeboten, +${eur(r.priceAtBuy - r.basePrice)} € Wertsteigerung` : `geschätzt, +${eur(r.priceAtBuy - r.basePrice)} € Wertsteigerung`}</span></div>
      <div><span class="hk">Danach frei im Monat<button type="button" class="hbtn" data-help="leftover">?</button></span><span class="hv">${r.leftover == null ? "—" : eur(r.leftover) + " €"}
        <span class="pill ${st.c}">${st.w}</span></span>
        <span class="hx">engster Monat · später ≈ ${eur(r.leftoverLong)} €</span></div>
      <div><span class="hk">Alltagsauto</span><span class="hv">${dat(r.dailyMonth)}</span>
        <span class="hx">${r.dailyMonth == null ? "kommt in diesem Szenario nicht" : eur(dailyRunAt(state, r.dailyMonth, 0)) + " €/M Unterhalt"}</span></div>
    </div>`;
}

let leverTimer = null;
/** 30 Simulationen sind zu teuer für jeden Tastendruck — kurz sammeln, dann rechnen. */
function scheduleLevers() {
  if (leverTimer) clearTimeout(leverTimer);
  leverTimer = setTimeout(() => {
    leverTimer = null;
    renderLevers();
  }, 140);
}

const miniEl = document.getElementById("mini");
let baseBuyMonth = null,
  settleTimer = null,
  pulseTimer = null;

/** Zeigt beim Scrollen dasselbe Ergebnis unten links, samt Sprung seit der letzten Ruhephase.
 *  Der Bezugspunkt wandert erst nach, wenn zwei Sekunden nichts mehr passiert ist. Sonst würde
 *  beim Tippen von "1100" jeder einzelne Tastendruck sein eigenes Delta melden. */
function renderMini(r) {
  if (r.r34Month == null) {
    miniEl.innerHTML =
      '<span class="mk1">Reicht so nicht</span><span class="mk2">Kaufpreis oder Lebenshaltung anpassen</span>';
    miniEl.classList.remove("pulse");
    baseBuyMonth = null;
    return;
  }
  if (baseBuyMonth == null) baseBuyMonth = r.r34Month;
  const shift = baseBuyMonth - r.r34Month;
  const badge = shift
    ? `<span class="delta ${shift > 0 ? "up" : "down"}">${shift > 0 ? "−" : "+"}${Math.abs(shift)} Mon.</span>`
    : "";
  miniEl.innerHTML =
    `<span class="mk1">R34 ab <b>${dat(r.r34Month)}</b>${badge}</span>` +
    `<span class="mk2">${inWords(r.r34Month)} · danach ${r.leftover == null ? "—" : eur(r.leftover) + " €/M"} frei</span>`;

  if (shift) {
    miniEl.classList.add("pulse");
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => miniEl.classList.remove("pulse"), 900);
  }
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    baseBuyMonth = r.r34Month;
    if (lastRun) renderMini(lastRun);
  }, 2000);
}

/** Sichtbar, sobald der Hero oben aus dem Bild gescrollt ist. */
function syncMini() {
  const hero = document.getElementById("hero");
  miniEl.classList.toggle("on", hero.getBoundingClientRect().bottom < 8);
}

function watchHero() {
  const hero = document.getElementById("hero");
  if (typeof IntersectionObserver === "function") {
    new IntersectionObserver(
      ([e]) => miniEl.classList.toggle("on", !e.isIntersecting),
      { rootMargin: "-8px 0px 0px 0px" },
    ).observe(hero);
  } else {
    window.addEventListener("scroll", syncMini, { passive: true });
    window.addEventListener("resize", syncMini, { passive: true });
    syncMini();
  }
  miniEl.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }),
  );
}

function renderLevers() {
  const rows = sensitivity();
  const movers = rows.filter((r) => r.months >= 1);
  const rest = rows.filter((r) => !(r.months >= 1));
  const max = Math.max(1, ...movers.map((r) => r.months));

  const bars = movers
    .map(
      (r) => `<div class="lev">
      <span class="lname">${r.label}</span>
      <span class="lband">±${eur(r.band)} ${r.unit}</span>
      <span class="lbar"><i style="width:${(r.months / max) * 100}%"></i></span>
      <span class="lval">${r.months} Mon.</span>
    </div>`,
    )
    .join("");

  const tail = rest.length
    ? `<div class="lrest">
      <b>Ohne Einfluss auf den Termin:</b> ${rest.map((r) => r.label).join(", ")}.
      Diese Kosten fallen erst <i>nach</i> dem Kauf an — sie ändern nur, was dir danach im Monat bleibt
      (zusammen bis zu ${eur(rest.reduce((a, r) => a + r.leftover, 0))} €/M).
    </div>`
    : "";

  document.getElementById("levers").innerHTML = movers.length
    ? bars + tail
    : '<div class="empty">Kein Regler bewegt den Termin messbar — vermutlich ist der Kauf durch ein Datum begrenzt, nicht durch Geld.</div>';
}

function renderTimeline(r) {
  const s = state,
    ev = [];
  if (!s.licenseOwned) ev.push({ m: licenceMonth(s), d: "Führerschein" });
  if (r.dailyMonth != null) ev.push({ m: r.dailyMonth, d: "Daily" });
  if (r.r34Month != null)
    ev.push({ m: r.r34Month, d: "R34 gekauft", hi: true });
  if (r.r34Month != null && r.r34Month < hMonth(s))
    ev.push({ m: hMonth(s), d: "H-Kennzeichen" });
  if (
    r.r34Month != null &&
    r.r34Month < age25Month(s) &&
    (s.r34Ins === "Liebhaber" || s.r34Switch25)
  )
    ev.push({ m: age25Month(s), d: "Liebhaber-Tarif" });
  if (r.finance && r.r34Month != null)
    ev.push({ m: r.r34Month + r.term * 12, d: "Kredit getilgt" });
  ev.sort((a, b) => a.m - b.m);

  const box = document.getElementById("tl");
  if (!ev.length || r.r34Month == null) {
    box.innerHTML = '<div class="tl-line"></div>';
    return;
  }
  const end = Math.max(...ev.map((e) => e.m)) + 4;
  let html = `<div class="tl-line"></div><div class="tl-fill" style="width:${(r.r34Month / end) * 100}%"></div>`;
  ev.forEach((e, i) => {
    const x = Math.min(100, (e.m / end) * 100);
    html +=
      `<div class="mk ${i % 2 === 0 ? "up" : "down"} ${e.hi ? "hi" : ""}" style="left:${x}%"><div class="dot"></div>` +
      `<div class="lbl"><div class="d">${dat(e.m)}</div><div class="t">${e.d}</div></div></div>`;
  });
  box.innerHTML = html;
}

/* Nach Hebelwirkung sortiert: was den Kauftermin am stärksten verschiebt, steht oben. */
const OPEN_ITEMS = [
  [
    "car",
    "Kaufpreis R34 — mit Abstand der größte Hebel. Fünf Vergleichsangebote eintragen, dann rechnet das Modell mit dem Median.",
  ],
  [
    "r34InsY",
    "Versicherungsbeitrag R34 — ein echtes Angebot einholen und unten eintragen; die Spanne zwischen Anbietern ist vierstellig.",
  ],
  ["netNow", "Netto heute — aus der letzten Abrechnung übernehmen."],
  ["netAfter", "Netto nach der Erhöhung — steht im Ausbildungsvertrag."],
  [
    "living",
    "Lebenshaltung — aus drei Monaten Kontoauszug rechnen statt zu schätzen. Der größte Hebel überhaupt.",
  ],
  ["dailyInsY", "Versicherungsbeitrag Daily — Angebot einholen."],
  [
    "r34Maint",
    "Wartungsrücklage R34 — Erfahrungswerte aus RB25DET-Foren sind hier besser als jede Faustformel.",
  ],
  ["r34Cons", "Verbrauch R34 — erst nach eigenem Tanken belastbar."],
  [
    "licence",
    "Kosten Führerschein — Angebote von zwei Fahrschulen vor Ort holen.",
  ],
];

function renderAudit() {
  const rows = [],
    counted = new Set();
  OPEN_ITEMS.forEach(([key, text]) => {
    if (prov[key] !== "guess") return;
    counted.add(key);
    rows.push(
      `<li><span class="prov guess">annahme</span><span class="what">${text}</span></li>`,
    );
  });
  if (!priceFromLedger())
    rows.push(
      `<li><span class="prov guess">annahme</span><span class="what">Wertsteigerung — dafür gibt es keinen offenen Preisindex. Sie zu messen heißt, über Monate Angebote zu sammeln und die eigene Reihe auszuwerten.</span></li>`,
    );
  SOURCES.filter((s) => (live[s.id] || {}).state === "fail").forEach((s) =>
    rows.push(
      `<li><span class="prov guess">offline</span><span class="what">${s.label} — nicht erreichbar, es rechnet mit dem Rückfallwert.</span></li>`,
    ),
  );

  const rest = ALLFIELDS.filter(
    (f) => prov[f.key] === "guess" && !f.ro && !counted.has(f.key),
  ).length;
  if (rest)
    rows.push(
      `<li><span class="prov guess">annahme</span><span class="what">${rest} weitere Kleinposten (Stellplatz, Fahrleistung, Nebenkosten) — die verschieben den Termin um Tage, nicht um Monate.</span></li>`,
    );

  document.getElementById("audit").innerHTML = rows.length
    ? `<ul>${rows.join("")}</ul>`
    : '<div class="empty">Nichts mehr offen — jede Zahl ist live, berechnet oder belegt.</div>';
  const sum = document.getElementById("auditSum");
  if (sum)
    sum.textContent = rows.length
      ? `${rows.length} Punkte, nach Hebelwirkung sortiert`
      : "nichts mehr offen";
}

function renderNote() {
  document.getElementById("note").innerHTML =
    `Monat 0 ist <b>${dat(0)}</b> und wandert mit dem Kalender mit — die Datei veraltet nicht. ` +
    `Kfz-Steuer, H-Termin, Alter 25 und der Saisonfaktor werden gerechnet, nicht getippt. ` +
    `Läuft die Seite über <code>file://</code> oder blockt eine Schnittstelle CORS, siehst du das unten unter „Datenquellen"; ` +
    `gerechnet wird dann mit dem letzten Rückfallwert weiter. Alle Angaben ohne Gewähr.`;
}

function applyVisibility(s) {
  ALLFIELDS.forEach((f) => {
    if (!f.showIf && !f.hideIf && !f.showWhen) return;
    const el = document.getElementById("fld_" + f.key);
    if (!el) return;
    const vis =
      (f.showIf ? !!s[f.showIf] : true) &&
      (f.hideIf ? !s[f.hideIf] : true) &&
      (f.showWhen ? !!f.showWhen(s) : true);
    el.style.display = vis ? "" : "none";
  });
}

/** H-Termin und Führerscheintermin sind die sinnvollen Untergrenzen — bis jemand widerspricht. */
function syncEarliest() {
  const set = (key, month) => {
    if (prov[key] === "manual") return;
    state[key] = ymOf(Math.max(0, Math.round(month)));
    prov[key] = "calc";
    const el = document.getElementById("f_" + key);
    if (el && document.activeElement !== el) el.value = state[key];
  };
  set("startYm", hMonth(state));
  set("dailyYm", licenceMonth(state));
}

/** Eine Handeingabe schlägt jede Ableitung — sonst tippt man ins Leere. */
const derivable = (key) => prov[key] !== "manual";

function syncDerivedFields() {
  syncEarliest();
  const pl = derivable("car") ? priceFromLedger() : null;
  if (pl) {
    state.car = Math.round(pl.value);
    prov.car = "proof";
  } else if (state.importOn && derivable("car")) {
    state.car = Math.round(importCost().total);
    prov.car = "calc";
  } else if (prov.car === "proof" || prov.car === "calc") {
    prov.car = "guess";
  }
  const inp = document.getElementById("f_car");
  if (inp && document.activeElement !== inp) inp.value = state.car;

  if (state.impCollector) state.impDuty = 0;
  const di = document.getElementById("f_impDuty");
  if (di && document.activeElement !== di) di.value = state.impDuty;

  if (
    derivable("r34InsY") &&
    premiumFromLedger("insR34", resolveSf(state, "r34"))
  )
    prov.r34InsY = "proof";
  if (
    derivable("dailyInsY") &&
    premiumFromLedger("insDaily", resolveSf(state, "daily"))
  )
    prov.dailyInsY = "proof";
}

function renderChips() {
  ALLFIELDS.forEach((f) => {
    const el = document.getElementById("prov_" + f.key);
    if (el)
      el.outerHTML = `<span id="prov_${f.key}" class="prov ${prov[f.key]}">${PROV_LABEL[prov[f.key]]}</span>`;
  });
}

function renderSummaries(s) {
  GROUPS.forEach((g, i) => {
    if (!g.sum) return;
    const el = document.getElementById("gsum_" + i);
    if (el) el.textContent = g.sum(s);
  });
}

function render() {
  syncDerivedFields();
  applyVisibility(state);
  renderChips();
  const r = simulate(state);
  lastRun = r;
  renderSummaries(state);
  renderDerived(state, r);
  renderHero(r);
  renderMini(r);
  renderTimeline(r);
  renderAudit();
  scheduleLevers();
}

/* ============================================================
   11 — Aufbau der Eingabefelder
   ============================================================ */
function labelHTML(f) {
  const tip = f.tip
    ? ` class="flab tip" data-tip="${esc(f.tip)}"`
    : ' class="flab"';
  const help = f.help
    ? `<button type="button" class="hbtn" data-help="${f.help}" aria-label="Erklärung zu ${esc(f.label)}">?</button>`
    : "";
  return `<span${tip}>${f.label}${help}<span id="prov_${f.key}" class="prov ${f.prov || "guess"}">${PROV_LABEL[f.prov || "guess"]}</span></span>`;
}

function fieldHTML(f) {
  const wrapCls = "fld" + (f.ro ? " ro" : "");
  if (f.type === "seg") {
    const btns = f.opts
      .map(
        (o) =>
          `<button data-v="${esc(o.v)}" data-p="${o.p ?? ""}"${o.tip ? ` class="tip ${o.v === f.def ? "on" : ""}" data-tip="${esc(o.tip)}"` : ` class="${o.v === f.def ? "on" : ""}"`}>${o.v}</button>`,
      )
      .join("");
    return `<div class="fld fld-wide" id="fld_${f.key}">${labelHTML(f)}<div class="seg mini" id="seg_${f.key}">${btns}</div></div>`;
  }
  if (f.type === "toggle") {
    return (
      `<div class="fld fld-wide" id="fld_${f.key}">${labelHTML(f)}<div class="seg mini" id="seg_${f.key}">` +
      `<button data-v="on" class="${f.def ? "on" : ""}">${f.onLabel}</button>` +
      `<button data-v="off" class="${!f.def ? "on" : ""}">${f.offLabel}</button></div></div>`
    );
  }
  if (f.type === "month") {
    return `<label class="${wrapCls}" id="fld_${f.key}">${labelHTML(f)}<span class="finp"><input type="month" id="f_${f.key}" value="${f.def}"></span></label>`;
  }
  if (f.type === "select") {
    const opts = f.opts
      .map(
        ([v, t]) =>
          `<option value="${v}"${v === f.def ? " selected" : ""}>${t}</option>`,
      )
      .join("");
    return (
      `<label class="${wrapCls}" id="fld_${f.key}">${labelHTML(f)}<span class="finp">` +
      `<select id="f_${f.key}" style="flex:1;border:none;background:transparent;color:var(--ink);font-family:inherit;font-size:15px;font-weight:600;padding:9px 10px;outline:none">${opts}</select></span></label>`
    );
  }
  return (
    `<label class="${wrapCls}" id="fld_${f.key}">${labelHTML(f)}<span class="finp">` +
    `<input type="number" id="f_${f.key}" value="${f.def}" step="any"${f.ro ? " readonly" : ""}><span class="unit">${f.unit}</span></span></label>`
  );
}

document.getElementById("core").innerHTML = CORE.map(fieldHTML).join("");

const EFFECT = {
  date: { cls: "eff-date", text: "wirkt auf den Termin" },
  after: { cls: "eff-after", text: "wirkt erst nach dem Kauf" },
};
document.getElementById("inputs").innerHTML = GROUPS.map((g, i) => {
  const body =
    `<div class="grid">${g.fields.map(fieldHTML).join("")}</div>` +
    (g.derived ? `<div class="derived" id="der_${g.derived}"></div>` : "") +
    (g.ledger ? `<div class="ledger" id="led_${g.ledger}"></div>` : "");
  const eff = EFFECT[g.effect];
  return (
    `<details class="grp"${g.open ? " open" : ""}>` +
    `<summary><span class="gname">${g.title}</span>` +
    (eff ? `<span class="eff ${eff.cls}">${eff.text}</span>` : "") +
    `<span class="gsum" id="gsum_${i}"></span></summary>` +
    `<div class="gbody">${body}</div></details>`
  );
}).join("");

function setSeg(id, val) {
  const box = document.getElementById(id);
  if (box)
    [...box.children].forEach((c) =>
      c.classList.toggle("on", c.dataset.v === val),
    );
}

ALLFIELDS.forEach((f) => {
  state[f.key] = f.def;
  prov[f.key] = f.prov || "guess";

  if (f.type === "seg") {
    document.getElementById("seg_" + f.key).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      setSeg("seg_" + f.key, b.dataset.v);
      state[f.key] = b.dataset.v;
      if (f.target && b.dataset.p !== "") {
        const p = parseFloat(b.dataset.p);
        if (
          !isNaN(p) &&
          prov[f.target] !== "proof" &&
          prov[f.target] !== "manual"
        ) {
          state[f.target] = p;
          const inp = document.getElementById("f_" + f.target);
          if (inp) inp.value = p;
        }
      }
      persist();
      render();
    });
  } else if (f.type === "toggle") {
    document.getElementById("seg_" + f.key).addEventListener("click", (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      setSeg("seg_" + f.key, b.dataset.v);
      state[f.key] = b.dataset.v === "on";
      prov[f.key] = "manual";
      persist();
      render();
    });
  } else if (f.type === "month") {
    document.getElementById("f_" + f.key).addEventListener("input", (e) => {
      state[f.key] = e.target.value;
      prov[f.key] = "manual";
      persist();
      render();
    });
  } else if (f.type === "select") {
    document.getElementById("f_" + f.key).addEventListener("change", (e) => {
      state[f.key] = Number(e.target.value);
      prov[f.key] = "manual";
      persist();
      render();
    });
  } else {
    document.getElementById("f_" + f.key).addEventListener("input", (e) => {
      if (f.ro) return;
      const v = parseFloat(e.target.value);
      state[f.key] = isNaN(v) ? 0 : v;
      prov[f.key] = "manual";
      persist();
      render();
    });
  }
});

/* ---- Belege ---- */
function wireLedgers() {
  ["price", "insR34", "insDaily"].forEach(renderLedger);
  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.add,
        def = LEDGERS[id],
        row = { date: ymOf(0) };
      let ok = false;
      def.cols.forEach((c) => {
        const el = document.querySelector(
          `[data-led="${id}"][data-col="${c.key}"]`,
        );
        if (!el) return;
        const raw = el.value;
        row[c.key] = c.type === "number" ? parseFloat(raw) : raw;
        if (c.key === "amt" && isFinite(row.amt) && row.amt > 0) ok = true;
        if (c.type !== "select") el.value = "";
      });
      if (!ok) return;
      if (id === "price" && !row.cur) row.cur = "EUR";
      ledgers[id].push(row);
      // Ein frischer Beleg hebt eine frühere Handeingabe auf
      if (id === "price") prov.car = "proof";
      if (id === "insR34") prov.r34InsY = "proof";
      if (id === "insDaily") prov.dailyInsY = "proof";
      persist();
      wireLedgers();
      render();
    });
  });
  document.querySelectorAll(".ldel").forEach((b) => {
    b.addEventListener("click", () => {
      ledgers[b.dataset.led].splice(Number(b.dataset.i), 1);
      persist();
      wireLedgers();
      render();
    });
  });
}

/* ---- Regler ---- */
const capEl = document.getElementById("cap");
const apprEl = document.getElementById("appr");

capEl.addEventListener("input", () => {
  state.cap = +capEl.value;
  document.getElementById("cap-val").textContent = eur(state.cap) + " €";
  render();
});
apprEl.addEventListener("input", () => {
  state.appr = +apprEl.value;
  document.getElementById("appr-val").textContent = state.appr + " % / Jahr";
  render();
});

function wireSeg(id, key) {
  document.getElementById(id).addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    setSeg(id, b.dataset.v);
    state[key] = b.dataset.v;
    render();
  });
}
wireSeg("strat", "strat");
wireSeg("method", "method");

/* ---- Hilfe ---- */
const backdrop = document.getElementById("backdrop");
function openHelp(key) {
  const h = HELP[key];
  if (!h) return;
  document.getElementById("m-title").textContent = h.t;
  document.getElementById("m-body").innerHTML = h.b;
  document.getElementById("m-links").innerHTML = (h.l || [])
    .map(
      (x) =>
        `<a href="${x.h}" target="_blank" rel="noopener noreferrer">${x.n} ↗</a>`,
    )
    .join("");
  backdrop.hidden = false;
}
const closeHelp = () => {
  backdrop.hidden = true;
};

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".hbtn");
  if (btn) {
    e.preventDefault();
    e.stopPropagation();
    openHelp(btn.dataset.help);
  }
});
document.getElementById("m-close").addEventListener("click", closeHelp);
backdrop.addEventListener("click", (e) => {
  if (e.target === backdrop) closeHelp();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeHelp();
});

document.getElementById("refresh").addEventListener("click", loadSources);

/* ---- Zurücksetzen ---- */
document.getElementById("reset").addEventListener("click", () => {
  ALLFIELDS.forEach((f) => {
    state[f.key] = f.def;
    prov[f.key] = f.prov || "guess";
    if (f.type === "seg") {
      setSeg("seg_" + f.key, f.def);
      if (f.target) {
        const o = f.opts.find((x) => x.v === f.def);
        if (o && o.p != null) {
          state[f.target] = o.p;
          const inp = document.getElementById("f_" + f.target);
          if (inp) inp.value = o.p;
        }
      }
    } else if (f.type === "toggle") {
      setSeg("seg_" + f.key, f.def ? "on" : "off");
    } else {
      const inp = document.getElementById("f_" + f.key);
      if (inp) inp.value = f.def;
    }
  });
  Object.keys(ledgers).forEach((k) => {
    ledgers[k] = [];
  });
  state.cap = 0;
  capEl.value = 0;
  document.getElementById("cap-val").textContent = "0 €";
  state.appr = 5;
  apprEl.value = 5;
  document.getElementById("appr-val").textContent = "5 % / Jahr";
  syncEarliest();
  state.strat = "dailyfirst";
  setSeg("strat", "dailyfirst");
  state.method = "cash";
  setSeg("method", "cash");
  persist();
  wireLedgers();
  adoptLive();
  render();
});

/* ---- Start ---- */
(async () => {
  await restore();
  ALLFIELDS.forEach((f) => {
    const inp = document.getElementById("f_" + f.key);
    if (inp && state[f.key] != null) inp.value = state[f.key];
    if (f.type === "seg") setSeg("seg_" + f.key, state[f.key]);
    if (f.type === "toggle")
      setSeg("seg_" + f.key, state[f.key] ? "on" : "off");
  });
  syncEarliest();
  wireLedgers();
  renderNote();
  render();
  watchHero();
  loadSources();
})();
