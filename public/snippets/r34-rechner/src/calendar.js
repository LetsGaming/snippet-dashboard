/* ============================================================
   1 — Kalender
   ============================================================ */
const NOW = new Date();
const BASE_ABS = NOW.getFullYear() * 12 + NOW.getMonth();

const absMonths = (y, m) => y * 12 + (m - 1);

/** '1998-06' → Monatsindex relativ zu heute (negativ = Vergangenheit) */
function idxFromYm(ym) {
  if (typeof ym !== "string") return null;
  const [y, m] = ym.split("-").map(Number);
  return !y || !m || m < 1 || m > 12 ? null : absMonths(y, m) - BASE_ABS;
}
/** Monatsindex → '06/2028' */
function dat(i) {
  if (i == null || !isFinite(i)) return "—";
  const a = BASE_ABS + Math.round(i);
  return String((a % 12) + 1).padStart(2, "0") + "/" + Math.floor(a / 12);
}
/** Monatsindex → '2028-06' */
function ymOf(i) {
  const a = BASE_ABS + Math.round(i);
  return Math.floor(a / 12) + "-" + String((a % 12) + 1).padStart(2, "0");
}
const fmtYm = (ym) =>
  typeof ym === "string" && ym.includes("-")
    ? ym.split("-")[1] + "/" + ym.split("-")[0]
    : "—";

export { NOW, BASE_ABS, absMonths, idxFromYm, dat, ymOf, fmtYm };
