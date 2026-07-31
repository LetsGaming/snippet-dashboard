import { idxFromYm, ymOf } from "./calendar.js";
import { H_PLATE_YEARS, AGE_CLASSIC_INSURANCE, monthsAfterYm } from "./tax.js";
import { SEASON_MIN, SEASON_MAX, NEVER } from "./config.js";
import { clamp } from "./format.js";
import { ALLFIELDS } from "./catalog.js";
import { ledgers, doneTasks, INTERNAL_LEDGER_COLS } from "./ledgers.js";

/* ============================================================
   5 — Zustand
   ============================================================ */
/** Die Startwerte der Bedienelemente über dem Feldkatalog.
 *
 *  Eine Fabrik, weil `restYm` vom laufenden Monat abhängt und beim Zurücksetzen neu
 *  fallen muss. Vor allem aber stehen die Werte damit an genau einer Stelle: „Alles
 *  zurücksetzen" hat die Liste vorher ein zweites Mal aufgezählt und dabei
 *  `incomeShift` vergessen — der Regler blieb stehen, während alles andere auf
 *  Anfang ging. Ein neues Bedienelement kann jetzt nicht mehr vergessen werden. */
const uiDefaults = () => ({
  cap: 0,
  appr: 4,
  /* Prozentuale Verschiebung aller bekannten künftigen Gehaltsschritte. Trägt die
     Unsicherheit der Einkommensreihe im Korridor; das heutige Netto bleibt außen vor,
     das hat sein eigenes Band. */
  incomeShift: 0,
  strat: "dailyfirst",
  method: "cash",
  restGoal: "date",
  restYm: ymOf(24),
  restAmount: 10000,
  restRate: 350,
  restTerm: 3,
});

/* Gesichert wird jeder dieser Werte außer `restYm`: der folgt aus dem laufenden Monat
   und wandert nur in den Schnappschuss, wenn er von Hand gesetzt wurde. */
const UI_KEYS = Object.keys(uiDefaults()).filter((k) => k !== "restYm");

const state = {};
const prov = {};

/** Der einzige Weg auf Anfang — Katalogwerte und Bedienelemente in einem Schritt. */
function initState() {
  Object.assign(state, uiDefaults());
  ALLFIELDS.forEach((f) => {
    state[f.key] = f.def;
    prov[f.key] = f.prov || "guess";
  });
  prov.cap = "preset";
  prov.appr = "preset";
  prov.restYm = "calc";
}
initState();

/* ---- abgeleitete Termine ---- */
const licenceMonth = (s) =>
  s.licenseOwned
    ? (idxFromYm(s.licenseSince) ?? 0)
    : (idxFromYm(s.licenceYm) ?? 0);
const hMonth = (s) => monthsAfterYm(s.r34Ez, H_PLATE_YEARS) ?? NEVER;
const age25Month = (s) => monthsAfterYm(s.birth, AGE_CLASSIC_INSURANCE) ?? NEVER;
/** Ob der Termin überhaupt bekannt ist. Wer das nicht prüft und hMonth in ein
 *  Datumsfeld schreibt, macht aus einer leeren Erstzulassung stillschweigend einen
 *  Kauftermin im Jahr 85359 — und der Plan meldet dann „reicht so nicht". */
const hMonthKnown = (s) => monthsAfterYm(s.r34Ez, H_PLATE_YEARS) != null;
const age25Known = (s) => monthsAfterYm(s.birth, AGE_CLASSIC_INSURANCE) != null;
/** Die bekannten Gehaltsschritte, aufsteigend nach Monat, ohne Müll.
 *
 *  Ersetzt das frühere Paar aus „Netto nach der Erhöhung" und „Erhöhung ab". Das
 *  konnte genau einen Sprung abbilden — wer im zweiten Lehrjahr schon weiß, was das
 *  dritte bringt, oder in vier Monaten den Arbeitgeber wechselt, konnte das nicht
 *  eintragen. Schritte in der Vergangenheit sind kein Fehler: sie beschreiben, was
 *  bereits gilt, und werden deshalb auf den laufenden Monat gezogen. */
/* Ohne Parameter: die Schritte stehen in den Belegen, nicht im Zustand. Die Signatur
   `incomeSteps(s)` hat das Gegenteil behauptet und ihr Argument verworfen. */
const incomeSteps = () =>
  (ledgers.income || [])
    .map((r) => ({
      m: Math.max(0, idxFromYm(r.month) ?? NaN),
      amt: Number(r.amt),
      note: r.src || "",
    }))
    .filter((x) => Number.isFinite(x.m) && Number.isFinite(x.amt) && x.amt > 0)
    .sort((a, b) => a.m - b.m);

/** Der letzte bekannte Punkt der Einkommensreihe. Ab hier — und nur ab hier —
 *  greift die allgemeine Lohnentwicklung; zwischen bekannten Schritten wären es
 *  die Zahlen aus dem Vertrag, die schon eine Erhöhung enthalten. */
const incomeAnchor = (s) => {
  const steps = incomeSteps();
  return steps.length ? steps[steps.length - 1] : { m: 0, amt: s.netNow };
};

/** Erster Schritt, falls vorhanden — für Beschriftungen in Verlauf und Zeitleiste. */
const firstRaise = () => incomeSteps()[0] ?? null;

function seasonMonths(s) {
  if (!s.r34Season) return 12;
  const a = Number(s.r34SeasonFrom);
  const b = Number(s.r34SeasonTo);
  const len = b >= a ? b - a + 1 : 12 - a + 1 + b;
  return clamp(len, SEASON_MIN, SEASON_MAX);
}
const seasonValid = (s) => {
  if (!s.r34Season) return true;
  const a = Number(s.r34SeasonFrom);
  const b = Number(s.r34SeasonTo);
  const len = b >= a ? b - a + 1 : 12 - a + 1 + b;
  return len >= SEASON_MIN && len <= SEASON_MAX;
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

const resolveSf = (s, which) => {
  const sel = which === "r34" ? s.r34Sf : s.dailySf;
  if (sel !== "Automatisch") return sel;
  const firstCar = s.strat === "dailyfirst" ? "daily" : "r34";
  return which === firstCar ? "Fahranfänger" : "Zweitwagen";
};

/** Das letzte Simulationsergebnis und die letzte Streuungsmessung. Beides wird von
 *  render.js gesetzt und von Zusammenfassungen gelesen. */
const runtime = { lastRun: null, lastSpread: null, lastForecast: null,
  /** Aufgaben-Kennung → gemessene Verengung der Spanne */
  taskGain: {},
};

export {
  uiDefaults,
  UI_KEYS,
  state,
  prov,
  ledgers,
  doneTasks,
  INTERNAL_LEDGER_COLS,
  runtime,
  initState,
  licenceMonth,
  hMonth,
  hMonthKnown,
  age25Month,
  age25Known,
  incomeSteps,
  incomeAnchor,
  firstRaise,
  seasonMonths,
  seasonValid,
  seasonTaxFactor,
  seasonInsFactor,
  gradePrice,
  resolveSf,
};
