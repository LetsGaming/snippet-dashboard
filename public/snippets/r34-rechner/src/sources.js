import { FETCH_TIMEOUT_MS } from "./config.js";
import { num } from "./format.js";
import { state, prov } from "./state.js";
import { RATE_CACHE } from "./currency.js";

/* ============================================================
   9 — Adapter für offene Schnittstellen
   Kein Schlüssel, kein Konto. Jede Quelle: Timeout, typisierter Fehler,
   Rückfall auf den hinterlegten Wert.
   ============================================================ */
async function getText(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctl.signal, cache: "no-store" });
    if (!res.ok) return { ok: false, error: "HTTP " + res.status };
    return { ok: true, value: await res.text() };
  } catch (e) {
    const aborted = e && e.name === "AbortError";
    return {
      ok: false,
      error: aborted ? "Zeitüberschreitung" : "Netz oder CORS blockiert",
    };
  } finally {
    clearTimeout(timer);
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

function splitCsv(line) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

/** SDMX-CSV der EZB → letzter Beobachtungswert. Spalten über Namen, nicht Position. */
function parseEcbCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return null;
  const head = splitCsv(lines[0]);
  const iTime = head.indexOf("TIME_PERIOD");
  const iValue = head.indexOf("OBS_VALUE");
  if (iTime < 0 || iValue < 0) return null;
  for (let i = lines.length - 1; i > 0; i--) {
    const row = splitCsv(lines[i]);
    const value = parseFloat(row[iValue]);
    if (isFinite(value)) return { value, asOf: row[iTime] };
  }
  return null;
}

const ecbUrl = (flow, key) =>
  `https://data-api.ecb.europa.eu/service/data/${flow}/${key}?lastNObservations=1&format=csvdata&detail=dataonly`;

const ecbSource = (id, label, flow, key, docs, note) => ({
  id,
  label,
  flow,
  key,
  docs,
  note,
  editable: true,
  urls: (s) => [ecbUrl(s.flow, s.key)],
  parse: parseEcbCsv,
  fmt: (v) => num(v.value) + " %",
});

const SOURCES = [
  {
    id: "fx",
    label: "Wechselkurse EUR → JPY / USD / GBP",
    note: "EZB-Referenzkurs über Frankfurter, werktags gegen 16:00 MEZ",
    docs: "https://frankfurter.dev/",
    urls: () => [
      "https://api.frankfurter.dev/v1/latest?base=EUR&symbols=JPY,USD,GBP",
      "https://api.frankfurter.app/latest?from=EUR&to=JPY,USD,GBP",
    ],
    parse(text) {
      const j = JSON.parse(text);
      const rates = j && j.rates;
      if (!rates || !isFinite(rates.JPY)) return null;
      return { asOf: j.date, jpy: rates.JPY, usd: rates.USD, gbp: rates.GBP };
    },
    fmt: (v) =>
      `1 € = ${num(v.jpy)} ¥` +
      (isFinite(v.usd) ? ` · ${num(v.usd)} $` : "") +
      (isFinite(v.gbp) ? ` · ${num(v.gbp)} £` : ""),
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

/** Live-Werte in den Zustand ziehen — aber nie über eine Handeingabe oder einen Beleg. */
function adoptLive() {
  const set = (key, value, from) => {
    if (!isFinite(value) || prov[key] === "manual" || prov[key] === "proof")
      return;
    state[key] = Math.round(value * 1000) / 1000;
    prov[key] = from;
  };
  const hicp = live.hicp;
  if (hicp && hicp.state === "ok") {
    set("inflCost", hicp.data.value, "live");
    // Der HVPI misst Preise, nicht Löhne. Ihn als Lohnentwicklung zu übernehmen heißt
    // „konstante Reallöhne annehmen" — eine brauchbare Annahme, aber eben eine.
    set("inflIncome", hicp.data.value, "derived");
  }
  if (live.credit && live.credit.state === "ok")
    set("rate", live.credit.data.value, "live");
  // Tagesgeld liegt erfahrungsgemäß knapp unter dem Einlagesatz — Faustregel, keine
  // Messung. Deshalb „abgeleitet" und nicht „live".
  if (live.depo && live.depo.state === "ok")
    set("saveRate", Math.max(0, live.depo.data.value - 0.25), "derived");
  const fx = live.fx;
  if (fx && fx.state === "ok") {
    RATE_CACHE.JPY = fx.data.jpy;
    RATE_CACHE.USD = fx.data.usd;
    RATE_CACHE.GBP = fx.data.gbp;
    set("jpyRate", fx.data.jpy, "live");
  }
}

export {
  getText,
  firstUsable,
  splitCsv,
  parseEcbCsv,
  ecbUrl,
  SOURCES,
  live,
  adoptLive,
};
