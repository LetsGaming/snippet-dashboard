/* ============================================================
   Wechselkurse

   Ohne Abhängigkeiten, damit Katalog und Preise beide darauf zugreifen können.
   RATE_CACHE füllen die Live-Quellen, der Handwert kommt aus dem Import-Rechner.
   ============================================================ */
const RATE_CACHE = { EUR: 1, USD: null, GBP: null, JPY: null };

let manualJpy = 170;
const setManualJpy = (v) => {
  if (isFinite(v) && v > 0) manualJpy = v;
};

/** Fremdwährung in Euro. Live-Kurs schlägt den Handwert. */
function toEur(amount, cur) {
  if (!isFinite(amount)) return null;
  if (!cur || cur === "EUR") return amount;
  const rate = cur === "JPY" ? (RATE_CACHE.JPY ?? manualJpy) : RATE_CACHE[cur];
  return isFinite(rate) && rate > 0 ? amount / rate : null;
}

export { RATE_CACHE, toEur, setManualJpy };
