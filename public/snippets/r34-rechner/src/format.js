/* ============================================================
   Formatierung und Finanzmathematik — ohne Zustand, ohne DOM
   ============================================================ */
/* ---- Formatierung ---- */
const eur = (n) => (isFinite(n) ? Math.round(n).toLocaleString("de-DE") : "—");
const num = (n, d = 2) => (isFinite(n) ? n.toFixed(d).replace(".", ",") : "—");
const esc = (t) =>
  String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* ---- Finanzmathematik ---- */
/** Monatsrate eines Annuitätendarlehens.
 *
 *  `effRate` ist ein Effektivzins pro Jahr — die EZB-Reihe hinter dem Feld liefert den
 *  annualisierten Jahreszinssatz. Der zugehörige Monatszins ist die zwölfte Wurzel,
 *  nicht der zwölfte Teil: `effRate/12` unterstellt einen Nominalzins und liefert eine
 *  zu hohe Rate (bei 10.000 € über 3 Jahre zu 8,5 % rund 1,45 € im Monat). */
const annuity = (principal, years, effRate) => {
  if (!(principal > 0) || !(years > 0)) return 0;
  const n = years * 12;
  if (!isFinite(effRate) || effRate <= -1) return principal / n;
  const r = Math.pow(1 + effRate, 1 / 12) - 1;
  return Math.abs(r) < 1e-12
    ? principal / n
    : (principal * r) / (1 - Math.pow(1 + r, -n));
};
const growth = (pct, months) => Math.pow(1 + (pct || 0) / 100, months / 12);
const fuelMonth = (km, cons, price) => (((km * cons) / 100) * price) / 12;
const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

export { eur, num, esc, clamp, plural, annuity, growth, fuelMonth, median };
