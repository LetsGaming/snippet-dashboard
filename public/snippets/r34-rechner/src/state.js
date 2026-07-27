import { idxFromYm, ymOf } from "./calendar.js";
import { H_PLATE_YEARS, AGE_CLASSIC_INSURANCE, monthsAfterYm } from "./tax.js";
import { SEASON_MIN, SEASON_MAX, NEVER } from "./config.js";
import { clamp } from "./format.js";
import { ALLFIELDS } from "./catalog.js";
import { ledgers, doneTasks } from "./ledgers.js";

/* ============================================================
   5 — Zustand
   ============================================================ */
const UI_KEYS = [
  "cap",
  "appr",
  "strat",
  "method",
  "restGoal",
  "restAmount",
  "restRate",
  "restTerm",
];

const state = {
  cap: 0,
  appr: 4,
  strat: "dailyfirst",
  method: "cash",
  restGoal: "date",
  restYm: ymOf(24),
  restAmount: 10000,
  restRate: 350,
  restTerm: 3,
};
const prov = {};

function initState() {
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
const raiseMonth = (s) => Math.max(0, idxFromYm(s.raiseYm) ?? 0);

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
const runtime = { lastRun: null, lastSpread: null };

export {
  UI_KEYS,
  state,
  prov,
  ledgers,
  doneTasks,
  runtime,
  initState,
  licenceMonth,
  hMonth,
  hMonthKnown,
  age25Month,
  age25Known,
  raiseMonth,
  seasonMonths,
  seasonValid,
  seasonTaxFactor,
  seasonInsFactor,
  gradePrice,
  resolveSf,
};
