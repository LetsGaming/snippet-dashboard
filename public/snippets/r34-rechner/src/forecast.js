/* ============================================================
   Vorschau — die Unsicherheit als Verteilung statt als Faustformel

   Die Sensitivität nebenan beantwortet „welche Zahl bewegt den Termin am meisten".
   Das ist Zuordnung, keine Prognose. Für die Spanne war daraus bisher eine
   quadratische Addition einseitiger Ausschläge gebildet — eine Heuristik mit drei
   eingebauten Fehlern:

   1. Sie unterstellt Unabhängigkeit. Lebenshaltung, Wartung, Versicherung und Sprit
      hängen aber alle an derselben Inflation. Der Korridor wurde dadurch zu schmal.
   2. Sie unterstellt Symmetrie. Kosten sind rechtsschief — eine Reparatur kann das
      Fünffache der Schätzung kosten, aber nie negativ werden.
   3. Sie kennt nur stetige Felder. Ein Motorschaden oder drei Monate ohne Einkommen
      kamen gar nicht vor, obwohl sie größer wirken als jede Bandbreite.

   Hier wird stattdessen gezogen: ein Schock je Risikogruppe, ein eigener je Feld,
   dazu Ereignisse mit Jahreswahrscheinlichkeit. Ein Lauf kostet rund 0,16 ms, ein
   paar hundert Ziehungen bleiben damit unter einer Zehntelsekunde.
   ============================================================ */
import { LEVERS } from "./spread.js";
import { simulate } from "./simulate.js";
import { prov } from "./state.js";
import { BAND_WEIGHT, SIM_HORIZON_MONTHS } from "./config.js";
import { idxFromYm, ymOf } from "./calendar.js";

/* Was gemeinsam schwankt, wird gemeinsam gezogen. Die Gruppe trägt `RHO` des
   Ausschlags, der Rest ist feldeigen. Ohne das wäre der Korridor zu schmal. */
const RISK_GROUP = {
  inflCost: "preise",
  inflIncome: "preise",
  r34Maint: "preise",
  dailyMaint: "preise",
  r34Garage: "preise",
  dailyGarage: "preise",
  r34InsY: "versicherung",
  dailyInsY: "versicherung",
  car: "markt",
  appr: "markt",
  coupeAdd: "markt",
  netNow: "person",
  incomeShift: "person",
  living: "person",
  saveFixed: "person",
  saveSurplus: "person",
};
const RHO = 0.6;

/* Rechtsschiefe Felder: nach unten begrenzt, nach oben offen. Multiplikativ gezogen,
   damit „doppelt so teuer" möglich bleibt und „negativ" nicht. */
const SKEWED = new Set([
  "living",
  "car",
  "coupeAdd",
  "r34Maint",
  "dailyMaint",
  "r34InsY",
  "dailyInsY",
  "r34Extra",
  "dailyExtra",
  "licence",
  "r34Km",
  "dailyKm",
]);

/* Rückschläge, die im Modell sonst nicht vorkommen. Die Wahrscheinlichkeiten sind
   Annahmen und stehen bewusst hier, nicht verstreut im Code — sie gehören diskutiert. */
const EVENTS = [
  {
    id: "repair",
    label: "Große Reparatur am Alltagsauto",
    perYear: 0.1,
    typical: 1400,
    spread: 0.7,
  },
  {
    id: "gap",
    label: "Einkommen fällt zeitweise aus",
    perYear: 0.03,
    months: 3,
    factor: 0.6,
  },
];

/** Deterministischer Zufall — sonst springt die Anzeige bei jedem Render. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Standardnormal über Box-Muller. */
function gauss(rnd) {
  const u = Math.max(1e-12, rnd());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rnd());
}

/** Ein gezogener Zustand. Das Band gilt als eine Standardabweichung — belegte Zahlen
 *  haben über `BAND_WEIGHT` ein kleineres, geratene das volle. */
function drawState(base, rnd) {
  const s = { ...base };
  const groupShock = {};
  for (const l of LEVERS) {
    const g = RISK_GROUP[l.key];
    if (g && groupShock[g] === undefined) groupShock[g] = gauss(rnd);
    const own = gauss(rnd);
    const z = g
      ? RHO * groupShock[g] + Math.sqrt(1 - RHO * RHO) * own
      : own;

    if (l.choices) {
      // Entweder-oder: mit der hinterlegten Wahrscheinlichkeit fällt es ungünstig aus
      s[l.key] = rnd() < (l.choiceRisk ?? 0.3) ? l.choices[1] : l.choices[0];
      continue;
    }
    const weight = BAND_WEIGHT[prov[l.key]] ?? 1;
    const band = (l.band ?? 0) * weight;
    if (!band) continue;

    const v0 = base[l.key];
    if (l.isMonth) {
      const idx = idxFromYm(v0);
      if (idx != null) s[l.key] = ymOf(idx + Math.round(band * z));
      continue;
    }
    if (!Number.isFinite(v0)) continue;
    s[l.key] =
      SKEWED.has(l.key) && v0 > 0
        ? v0 * Math.exp(Math.log(1 + band / v0) * z)
        : Math.max(l.min ?? -Infinity, v0 + band * z);
  }
  return s;
}

/** Ereignisse für einen Lauf würfeln. Monatlich geprüft, damit sie über die ganze
 *  Sparphase verteilt auftreten können und nicht nur einmal. */
function drawEvents(rnd, horizon) {
  const events = [];
  let incomeGap = null;
  for (const e of EVENTS) {
    const perMonth = 1 - Math.pow(1 - e.perYear, 1 / 12);
    for (let m = 0; m < horizon; m++) {
      if (rnd() >= perMonth) continue;
      if (e.id === "gap") {
        if (!incomeGap) incomeGap = { from: m, months: e.months, factor: e.factor };
      } else {
        events.push({
          m,
          cost: e.typical * Math.exp(e.spread * gauss(rnd)),
          id: e.id,
        });
      }
    }
  }
  return { events, incomeGap };
}

const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
};

/**
 * Verteilung des Kauftermins und des Spielraums danach.
 *
 * `draws` ist ein Kompromiss: 400 Ziehungen liegen bei rund 60 ms und schwanken
 * zwischen zwei Renderläufen um höchstens einen Monat. Der Zufall ist gesetzt,
 * damit dieselbe Eingabe dieselbe Anzeige ergibt.
 */
function forecast(base, { draws = 400, seed = 20260728 } = {}) {
  const rnd = rng(seed);
  const horizon = Math.min(SIM_HORIZON_MONTHS, 180);
  const months = [];
  const spare = [];
  let never = 0;
  let tight = 0;

  for (let i = 0; i < draws; i++) {
    const s = drawState(base, rnd);
    const { events, incomeGap } = drawEvents(rnd, horizon);
    let r;
    try {
      r = simulate(s, { events, incomeGap });
    } catch {
      continue; // ein gezogener Zustand darf die Anzeige nicht abschießen
    }
    if (r.r34Month == null) {
      never++;
      continue;
    }
    months.push(r.r34Month);
    if (r.leftover != null) {
      spare.push(r.leftover);
      if (r.leftover < 100) tight++;
    }
  }

  months.sort((a, b) => a - b);
  spare.sort((a, b) => a - b);
  const n = months.length;
  return {
    draws,
    n,
    /** Anteil der Läufe, in denen es gar nicht reicht. */
    neverShare: draws ? never / draws : 0,
    /** Anteil der Läufe, in denen nach dem Kauf unter 100 €/M bleiben. */
    tightShare: n ? tight / n : 0,
    months: n
      ? {
          p10: Math.round(quantile(months, 0.1)),
          p25: Math.round(quantile(months, 0.25)),
          p50: Math.round(quantile(months, 0.5)),
          p75: Math.round(quantile(months, 0.75)),
          p90: Math.round(quantile(months, 0.9)),
        }
      : null,
    spare: spare.length
      ? {
          p10: quantile(spare, 0.1),
          p50: quantile(spare, 0.5),
          p90: quantile(spare, 0.9),
        }
      : null,
  };
}

/**
 * Um wie viele Monate die Spanne schrumpft, wenn die genannten Zahlen belegt wären.
 *
 * Das ist die einzige Zahl, die den Aufwand rechtfertigt: „zwei Stunden Inserate
 * sammeln halbieren deine Unsicherheit" wiegt anders als „ist wichtig". Gerechnet
 * wird durch kurzzeitiges Umsetzen der Herkunft — belegte Zahlen bekommen über
 * BAND_WEIGHT ein schmaleres Band, und genau das schlägt auf die Streuung durch.
 *
 * Wenig Ziehungen, weil das je Aufgabe einmal läuft. Derselbe Startwert für beide
 * Seiten, sonst misst man Rauschen statt Wirkung.
 */
function narrowingBy(base, keys, { draws = 90, seed = 7331 } = {}) {
  const before = forecast(base, { draws, seed });
  if (!before.months) return null;
  const saved = keys.map((k) => [k, prov[k]]);
  let after;
  try {
    for (const k of keys) prov[k] = "proof";
    after = forecast(base, { draws, seed });
  } finally {
    for (const [k, v] of saved) prov[k] = v;
  }
  if (!after.months) return null;
  const w = (f) => f.months.p90 - f.months.p10;
  const sp = (f) => (f.spare ? f.spare.p90 - f.spare.p10 : null);
  /* Zwei Zahlen, weil nicht jede Zahl auf den Termin wirkt: Versicherung und Wartung
     des R34 fallen erst nach dem Kauf an und verengen nur den Spielraum danach. Wer
     dort „0 Monate" liest, hält die Aufgabe für sinnlos. */
  return {
    months: Math.max(0, Math.round(w(before) - w(after))),
    spare:
      sp(before) != null && sp(after) != null
        ? Math.max(0, Math.round(sp(before) - sp(after)))
        : null,
  };
}

export { forecast, narrowingBy, EVENTS, RISK_GROUP, SKEWED, RHO };
