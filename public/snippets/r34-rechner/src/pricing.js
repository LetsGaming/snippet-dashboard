import { idxFromYm } from "./calendar.js";
import { kfzTaxYear } from "./tax.js";
import { BODIES, LIEBHABER_Y, LIEBHABER_FALLBACK_Y, sfAt } from "./config.js";
import { clamp, median, growth, fuelMonth } from "./format.js";
import { toEur, setManualJpy, jpyPerEur, JPY_MIN } from "./currency.js";
import {
  state,
  prov,
  ledgers,
  hMonth,
  age25Month,
  seasonInsFactor,
  seasonTaxFactor,
  gradePrice,
  resolveSf,
} from "./state.js";

/* ============================================================
   6 — Preise: Belege, Karosserie, Import

   Anker ist die Limousine: dafür gibt es Angebote, der Preis ist bekannt.
   Das Coupé wird über den Aufschlag daraus abgeleitet, bis eigene Inserate
   dafür erfasst sind.
   ============================================================ */
/** Alle Inserate einer Karosserie, umgerechnet in Euro, mit Monat des Inserats. */
function ledgerPoints(body) {
  const want = body ?? state.r34Body;
  return ledgers.price
    .filter((r) => want === BODIES.both || !r.body || r.body === want)
    .map((r) => ({ m: idxFromYm(r.date) ?? 0, v: toEur(r.amt, r.cur) }))
    .filter((p) => isFinite(p.v) && p.v > 0);
}

/** Belegter Kaufpreis. Ältere Inserate werden mit der angesetzten Rate auf heute
 *  hochgerechnet — sonst zieht ein halbes Jahr altes Schnäppchen den Median nach unten. */

function priceFromLedger(body) {
  const points = ledgerPoints(body);
  if (!points.length) return null;
  const rate = (state.appr || 0) / 100;
  const values = points.map((p) => p.v * Math.pow(1 + rate, -p.m / 12));
  const months = points.map((p) => p.m);
  return {
    value: median(values),
    n: values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    from: Math.min(...months),
    to: Math.max(...months),
    adjusted: Math.max(...months) > Math.min(...months),
  };
}

const APPR_MIN_ROWS = 4;
const APPR_MIN_SPAN = 4;

/** Die eigene Wertsteigerung aus den gesammelten Inseraten: Regression über den
 *  Logarithmus des Preises, weil Wertentwicklung multiplikativ läuft, nicht additiv. */
function apprFromLedger(body) {
  const points = ledgerPoints(body);
  const months = points.map((p) => p.m);
  const span = points.length ? Math.max(...months) - Math.min(...months) : 0;
  if (points.length < APPR_MIN_ROWS || span < APPR_MIN_SPAN)
    return { ok: false, n: points.length, span };

  const n = points.length;
  const mx = months.reduce((a, m) => a + m, 0) / n;
  const my = points.reduce((a, p) => a + Math.log(p.v), 0) / n;
  let cov = 0;
  let varX = 0;
  points.forEach((p) => {
    cov += (p.m - mx) * (Math.log(p.v) - my);
    varX += (p.m - mx) * (p.m - mx);
  });
  if (varX === 0) return { ok: false, n, span };
  return {
    ok: true,
    value: clamp((Math.exp((cov / varX) * 12) - 1) * 100, -50, 100),
    n,
    span,
    from: Math.min(...months),
    to: Math.max(...months),
  };
}

function bodyPrice(body) {
  const pl = priceFromLedger(body);
  if (pl) return { value: pl.value, n: pl.n, src: "proof" };
  const cur = state.r34Body;
  if (cur === body || cur === BODIES.both)
    return { value: state.car, n: 0, src: prov.car || "guess" };
  const factor = clamp(1 + (state.coupeAdd || 0) / 100, 1, 4);
  return {
    value: body === BODIES.coupe ? state.car * factor : state.car / factor,
    n: 0,
    src: "calc",
  };
}

/** Der Beitrag aus erfassten Angeboten.
 *
 *  Bewusst das Minimum und nicht der Median wie beim Kaufpreis: einen Versicherer
 *  suchst du dir aus, also zählt das günstigste Angebot. Ein Auto kaufst du zum
 *  Marktpreis, deshalb steht dort die Mitte.
 *
 *  Angebote auf Basis „meine SF" werden durch den heutigen SF-Faktor geteilt, damit
 *  in `r34InsAt` derselbe Faktor wieder aufgeschlagen werden kann — sonst stünde der
 *  Anfängerzuschlag zweimal in der Rechnung. */
function premiumFromLedger(which, level) {
  const rows = ledgers[which].filter((r) => isFinite(r.amt) && r.amt > 0);
  if (!rows.length) return null;
  const normed = rows.map((r) =>
    r.basis === "meine SF" ? r.amt / sfAt(level, 0) : r.amt,
  );
  return { value: Math.min(...normed), n: rows.length };
}

function importCost(s = state) {
  setManualJpy(s.jpyRate);
  /* Vorher fiel ein fehlender Kurs auf 1 zurück und rechnete Yen als Euro: das Feld
     klemmt auf `min: 1`, `syncDerivedFields` schreibt `importCost().total` in den
     Kaufpreis, und der stand dann bei 2,8 Mio €. Jetzt greift dieselbe Kette wie in
     `toEur`. */
  const rate = jpyPerEur(s.jpyRate);
  const carEur = (s.impJpy || 0) / rate;
  const cif = carEur + (s.impFreight || 0);
  const dutyPct = s.impCollector ? 0 : s.impDuty || 0;
  const duty = (cif * dutyPct) / 100;
  const vatPct = s.impCollector ? 7 : 19;
  const vat = ((cif + duty) * vatPct) / 100;
  return {
    carEur,
    cif,
    duty,
    dutyPct,
    vat,
    vatPct,
    /* Mit welchem Kurs gerechnet wurde und ob er aus dem Feld kam. Die Anzeige muss
       sagen können, dass hier ein Rückfallkurs steht. */
    rate,
    rateFromField: Number(s.jpyRate) >= JPY_MIN,
    total: cif + duty + vat + (s.impReg || 0),
  };
}

/* ---- laufende Kosten je Monat ---- */
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

/** Das H-Kennzeichen kommt nicht von allein: es muss beantragt werden, setzt ein
 *  Gutachten voraus und schließt starkes Tuning aus. Deshalb ist es eine Wahl. */
const hPlateAt = (s, m) => !!s.hPlateWanted && m >= hMonth(s);

const liebhaberActive = (s, m) =>
  m >= age25Month(s) && (s.r34Ins === "Liebhaber" || s.r34Switch25);

function r34InsAt(s, m, years) {
  const infl = growth(s.inflCost, Math.max(0, m));
  // Liebhabertarife sind bereits saisonal und km-begrenzt kalkuliert — kein zweiter Abschlag.
  if (liebhaberActive(s, m)) return (LIEBHABER_Y * infl) / 12;
  return (
    (r34PremiumBase(s).y *
      seasonInsFactor(s) *
      sfAt(resolveSf(s, "r34"), years) *
      infl) /
    12
  );
}
const r34TaxAt = (s, m) =>
  (kfzTaxYear({
    ez: s.r34Ez,
    ccm: s.r34Ccm,
    co2: s.r34Co2,
    norm: s.r34Norm,
    fuel: "otto",
    hPlate: hPlateAt(s, m),
  }) *
    seasonTaxFactor(s)) /
  12;

function r34RunAt(s, m, years) {
  const infl = growth(s.inflCost, Math.max(0, m));
  return (
    r34InsAt(s, m, years) +
    r34TaxAt(s, m) +
    (s.r34Maint / 12 + (s.r34Garage || 0)) * infl +
    fuelMonth(s.r34Km, s.r34Cons, gradePrice(s.r34Grade, s)) * infl
  );
}

const dailyTaxYear = (s) =>
  kfzTaxYear({
    ez: s.dailyEz,
    ccm: s.dailyCcm,
    co2: s.dailyCo2,
    norm: s.dailyNorm,
    fuel: "otto",
    hPlate: false,
  });

function dailyRunAt(s, m, years) {
  const infl = growth(s.inflCost, Math.max(0, m));
  return (
    (dailyPremiumBase(s).y * sfAt(resolveSf(s, "daily"), years) * infl) / 12 +
    dailyTaxYear(s) / 12 +
    (s.dailyMaint / 12 + (s.dailyGarage || 0)) * infl +
    fuelMonth(s.dailyKm, s.dailyCons, gradePrice(s.dailyGrade, s)) * infl
  );
}

export {
  APPR_MIN_ROWS,
  APPR_MIN_SPAN,
  ledgerPoints,
  priceFromLedger,
  apprFromLedger,
  bodyPrice,
  premiumFromLedger,
  importCost,
  r34PremiumBase,
  dailyPremiumBase,
  liebhaberActive,
  hPlateAt,
  r34InsAt,
  r34TaxAt,
  r34RunAt,
  dailyTaxYear,
  dailyRunAt,
};
