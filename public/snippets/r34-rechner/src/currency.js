/* ============================================================
   Wechselkurse

   Ohne Abhängigkeiten, damit Katalog und Preise beide darauf zugreifen können.
   RATE_CACHE füllen die Live-Quellen, der Handwert kommt aus dem Import-Rechner.
   ============================================================ */
const RATE_CACHE = { EUR: 1, USD: null, GBP: null, JPY: null };

const JPY_FALLBACK = 170;
/* Untergrenze für einen brauchbaren Yen-Kurs. Das Eingabefeld klemmt auf `min: 1`,
   und mit 1 gerechnet wären Yen gleich Euro: aus 2.800.000 ¥ würden 2,8 Mio €. Der
   Euro hat nie bei 2 ¥ gestanden, ein Wert darunter ist deshalb kein Kurs, sondern
   ein leeres Feld. */
const JPY_MIN = 2;

let manualJpy = JPY_FALLBACK;
const setManualJpy = (v) => {
  if (Number(v) >= JPY_MIN) manualJpy = Number(v);
};

/** Yen je Euro: der eingetragene Kurs, sonst der Live-Kurs, sonst der letzte
 *  brauchbare Handwert. Nie 1 — siehe `JPY_MIN`. */
function jpyPerEur(entered) {
  const eigen = Number(entered);
  if (eigen >= JPY_MIN) return eigen;
  const live = Number(RATE_CACHE.JPY);
  return live >= JPY_MIN ? live : manualJpy;
}

/** Fremdwährung in Euro. Live-Kurs schlägt den Handwert. */
function toEur(amount, cur) {
  if (!isFinite(amount)) return null;
  if (!cur || cur === "EUR") return amount;
  const rate = cur === "JPY" ? (RATE_CACHE.JPY ?? manualJpy) : RATE_CACHE[cur];
  return isFinite(rate) && rate > 0 ? amount / rate : null;
}

export { RATE_CACHE, toEur, setManualJpy, jpyPerEur, JPY_MIN, JPY_FALLBACK };
