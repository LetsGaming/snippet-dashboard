import { BASE_ABS, absMonths, idxFromYm } from "./calendar.js";

/* ============================================================
   2 — Kfz-Steuer nach §§ 8, 9 KraftStG (Stand Juli 2026)
   Kein Schätzwert, sondern der Tarif selbst.
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
const AGE_CLASSIC_INSURANCE = 25;

function co2Component(co2, ezAbs) {
  // Auch im Übergangsfenster ab 11/2008 nötig: dort wird gegen den CO2-Tarif verglichen.
  if (ezAbs < EZ_CO2_WINDOW || !isFinite(co2) || co2 <= 0) return 0;
  const free =
    ezAbs < absMonths(2012, 1) ? 120 : ezAbs < absMonths(2014, 1) ? 110 : 95;
  const over = Math.max(0, co2 - free);
  if (over === 0) return 0;
  if (ezAbs < EZ_TIERS_START) return over * 2.0;
  let sum = 0;
  let from = free;
  for (const [upTo, rate] of TAX.co2Tiers) {
    sum += Math.max(0, Math.min(co2, upTo) - Math.max(from, free)) * rate;
    from = upTo;
    if (co2 <= upTo) break;
  }
  return sum;
}

/** Jahressteuer in € für ein Fahrzeug. hPlate schlägt alles andere.
 *
 *  Die errechnete Steuer wird nach § 11 Abs. 4 Nr. 1 KraftStG auf volle Euro
 *  abgerundet. Beim R34 gehen die Rechnungen glatt auf (25 × 25,36 = 634), bei
 *  anderen Hubräumen nicht: 19 × 16,05 = 304,95 → 304 €. Die Oldtimerpauschale ist
 *  ein gesetzter Betrag und wird nicht gerundet. */
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
  if (ezAbs < EZ_CO2_WINDOW) return Math.floor(oldWay);
  // Für EZ 05.11.2008 bis 30.06.2009 gilt dauerhaft die Günstigerprüfung
  // (§ 18 Abs. 4a KraftStG) — sie ist nicht befristet.
  if (ezAbs < EZ_CO2_START) return Math.floor(Math.min(oldWay, newWay));
  return Math.floor(newWay);
}

const monthsAfterYm = (ym, years) => {
  const i = idxFromYm(ym);
  return i == null ? null : i + years * 12;
};

export {
  TAX,
  EZ_CO2_START,
  EZ_CO2_WINDOW,
  EZ_TIERS_START,
  H_PLATE_YEARS,
  AGE_CLASSIC_INSURANCE,
  co2Component,
  kfzTaxYear,
  monthsAfterYm,
};
