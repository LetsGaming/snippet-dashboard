import { idxFromYm, ymOf } from "./calendar.js";
import { BAND_WEIGHT } from "./config.js";
import { ALLFIELDS } from "./catalog.js";
import { state, prov, licenceMonth } from "./state.js";
import { simulate } from "./simulate.js";

/* ============================================================
   8 — Korridor

   Die Hebel stehen nicht in einer eigenen Liste, sondern fallen aus dem
   Feldkatalog heraus: jedes Feld mit `band` ist einer. Damit speist dieselbe
   Zahl die Wirkungsangabe am Feld, beide Ranglisten und den Korridor.
   ============================================================ */
const SLIDER_LEVERS = [
  /* Der frühere Hebel hing am Feld „Netto nach der Erhöhung". Das gibt es nicht mehr;
     die Unsicherheit steckt jetzt in der ganzen künftigen Reihe. `incomeShift`
     verschiebt sie prozentual — heutiges Netto bleibt davon unberührt, das ist bekannt. */
  {
    key: "incomeShift",
    label: "Künftiges Gehalt",
    band: 8,
    unit: "%",
    min: -60,
  },
  { key: "cap", label: "Startkapital", band: 4000, unit: "€", min: 0 },
  { key: "appr", label: "Wertsteigerung", band: 2, unit: "%/J", min: 0 },
];

/**
 * Ein Regler des Korridors. Felder mit `band` schwanken stetig, Felder mit `choices`
 * kennen nur zwei Ausgänge — beide Formen liegen in derselben Liste, und die Vorschau
 * unterscheidet sie an genau diesen Feldern.
 *
 * @typedef {object} Lever
 * @property {string} key
 * @property {string} label
 * @property {number} [band]
 * @property {any[]} [choices]
 * @property {number} [choiceRisk]
 * @property {string} [choiceLabel]
 * @property {string} unit
 * @property {number} min
 * @property {boolean} [isMonth]
 */

/** @type {Lever[]} */
const LEVERS = [
  ...ALLFIELDS.filter((f) => f.band || f.choices).map((f) => ({
    key: f.key,
    label: f.label,
    band: f.band,
    choices: f.choices,
    choiceRisk: f.choiceRisk,
    choiceLabel: f.choiceLabel,
    unit: f.bandUnit || f.unit || "",
    min: 0,
    isMonth: f.type === "month",
  })),
  ...SLIDER_LEVERS,
];

/** Einen Wert um sein Band verschieben — Monatsfelder in Monaten, alles andere im
 *  Betrag. Felder mit `choices` sind kein Band, sondern ein Entweder-oder: sie
 *  springen zwischen den beiden hinterlegten Werten. Ohne sie blieben die größten
 *  offenen Fragen eines JDM-Imports — Schadstoffklasse, H-Kennzeichen, Klassikertarif —
 *  komplett außerhalb des Korridors, obwohl sie vierstellig wirken. */
function shifted(lever, value, direction) {
  if (lever.choices) return lever.choices[direction < 0 ? 0 : 1];
  if (lever.isMonth) {
    const idx = idxFromYm(value);
    return idx == null ? value : ymOf(idx + direction * lever.band);
  }
  return Math.max(lever.min, value + direction * lever.band);
}

const targetIsCredit = (s) => s.method === "rest" && s.restGoal === "date";

/** Jeden Regler einmal nach unten und nach oben drehen und messen, was passiert. */
function sensitivity(base) {
  const byCredit = targetIsCredit(state);
  const pick = (r) => (byCredit ? r.financed : r.r34Month);
  const anchor = base && base.r34Month != null ? pick(base) : null;

  const rows = LEVERS.map((l) => {
    const old = state[l.key];
    const weight = BAND_WEIGHT[prov[l.key] ?? "guess"] ?? 1;
    let lo;
    let hi;
    try {
      state[l.key] = shifted(l, old, -1);
      lo = simulate(state);
      state[l.key] = shifted(l, old, +1);
      hi = simulate(state);
    } finally {
      state[l.key] = old;
    }

    const usable = lo.r34Month != null && hi.r34Month != null;
    const move = usable ? Math.abs(pick(hi) - pick(lo)) : null;

    let down = 0;
    let up = 0;
    if (usable && anchor != null) {
      const deltas = [pick(lo) - anchor, pick(hi) - anchor];
      down = Math.min(0, ...deltas) * weight;
      up = Math.max(0, ...deltas) * weight;
    }
    return {
      ...l,
      weight,
      prov: prov[l.key] ?? "guess",
      move,
      down,
      up,
      spare: Math.abs((hi.leftover ?? 0) - (lo.leftover ?? 0)),
    };
  });

  rows.sort((a, b) => (b.move ?? 1e12) - (a.move ?? 1e12) || b.spare - a.spare);

  // Quadratisch addiert: dass alle Abweichungen gleichzeitig ins Extrem laufen, ist kein
  // Normalfall. Die Wurzel ist immer positiv, die untere Grenze wird deshalb negiert.
  const rss = (get) =>
    Math.sqrt(rows.reduce((sum, r) => sum + Math.pow(get(r), 2), 0));
  const sum = (get) => rows.reduce((acc, r) => acc + get(r), 0);

  return {
    rows,
    byCredit,
    floor: byCredit ? 50 : 1,
    anchor,
    down: -Math.round(rss((r) => r.down)),
    up: Math.round(rss((r) => r.up)),
    // Der Fall, in dem wirklich alles gleichzeitig danebengeht — nur zum Vergleich
    extremeDown: Math.round(sum((r) => r.down)),
    extremeUp: Math.round(sum((r) => r.up)),
  };
}

/** Aus der Streuung ein anzeigbares Fenster machen. */
function spreadWindow(run, spread) {
  if (!run || run.r34Month == null || !spread) return null;
  if (spread.byCredit) {
    return {
      kind: "credit",
      from: Math.max(0, run.financed + spread.down),
      to: run.financed + spread.up,
      base: run.financed,
      ok: spread.up - spread.down >= 100,
    };
  }
  const floor = Math.max(0, licenceMonth(state), idxFromYm(state.startYm) ?? 0);
  return {
    kind: "date",
    from: Math.max(floor, run.r34Month + spread.down),
    to: run.r34Month + spread.up,
    base: run.r34Month,
    ok: spread.up - spread.down >= 1,
  };
}

export {
  SLIDER_LEVERS,
  LEVERS,
  shifted,
  targetIsCredit,
  sensitivity,
  spreadWindow,
};
