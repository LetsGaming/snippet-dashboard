/* ============================================================
   Zwei Ranglisten: Termin und Spielraum danach
   ============================================================ */
import { el } from "../dom.js";
import { eur, plural } from "../format.js";
import { runtime } from "../state.js";


/* ---- Zwei Ranglisten: Termin und Spielraum danach ---- */
function renderLevers(spread) {
  const { rows, byCredit, floor } = spread;
  const movers = rows.filter((r) => r.move == null || r.move >= floor);
  const spares = rows
    .filter((r) => !(r.move == null || r.move >= floor))
    .filter((r) => r.spare >= 1)
    .sort((a, b) => b.spare - a.spare);
  const maxMove = Math.max(1, ...movers.map((r) => r.move ?? 0));
  const maxSpare = Math.max(1, ...spares.map((r) => r.spare));

  el("leversTitle").textContent = byCredit
    ? "Was die Kreditsumme verschiebt"
    : "Was den Termin verschiebt";

  const bar = (r, value, max, text) =>
    `<div class="lev"><span class="lname">${r.label}</span>` +
    // Entweder-oder-Felder haben kein Band; „±— " war schlicht kaputt
    `<span class="lband">${r.choiceLabel ?? `±${eur(r.band)} ${r.unit}`}</span>` +
    `<span class="lbar"><i style="width:${(value / max) * 100}%"></i></span>` +
    `<span class="lval">${text}</span></div>`;

  /* Achtzehn Balken, von denen zehn zwischen einem und vier Monaten liegen und optisch
     nicht unterscheidbar sind, tragen ab Rang sieben nichts mehr bei. Der Rest bleibt
     erreichbar, steht aber nicht mehr im Weg. */
  const SICHTBAR = 6;
  const kurz = movers.slice(0, SICHTBAR);
  const rest = movers.slice(SICHTBAR);
  const zeile = (r) =>
    bar(
      r,
      r.move ?? maxMove,
      maxMove,
      r.move == null ? "kippt" : byCredit ? eur(r.move) + " €" : r.move + " Mon.",
    );
  el("levers").innerHTML = movers.length
    ? kurz.map(zeile).join("") +
      (rest.length
        ? `<details class="levrest"><summary>${plural(rest.length, "weiterer Posten", "weitere Posten")} mit unter ${rest[0].move + 1} ${byCredit ? "€" : "Monaten"} Wirkung</summary>${rest.map(zeile).join("")}</details>`
        : "")
    : `<div class="empty">Kein Regler bewegt ${byCredit ? "die Kreditsumme" : "den Termin"} messbar.</div>`;

  // Die laufenden Kosten des R34 fallen erst ab dem Kaufmonat an. Auf den Termin wirken sie
  // deshalb nicht — auf das, was danach im Monat bleibt, sehr wohl. Bei Finanzierung kommt
  // die Rate dazu, weshalb die Zeile dann ausdrücklich anders formuliert ist.
  const spareBox = el("spares");
  const spareNote = el("sparesNote");
  if (!spares.length) {
    spareBox.innerHTML =
      '<div class="empty">Keine weiteren Posten mit spürbarer Wirkung.</div>';
    spareNote.textContent = "";
    return;
  }
  spareBox.innerHTML = spares
    .map((r) => bar(r, r.spare, maxSpare, eur(r.spare) + " €/M"))
    .join("");
  spareNote.innerHTML =
    runtime.lastRun && runtime.lastRun.financed > 0
      ? `Diese Posten laufen neben der Kreditrate von ${eur(runtime.lastRun.payment)} €/M. Sie verschieben den
         Kauftermin nicht, entscheiden aber darüber, ob die Rate im Alltag trägt — aktuell bleiben im
         engsten Monat ${eur(runtime.lastRun.leftover)} €.`
      : `Diese Posten fallen erst ab dem Kaufmonat an und verschieben den Termin deshalb nicht.
         Sie entscheiden darüber, was dir danach im Monat bleibt — aktuell ${
           runtime.lastRun && runtime.lastRun.leftover != null
             ? eur(runtime.lastRun.leftover) + " €"
             : "—"
         } im engsten Monat.`;
}

export { renderLevers };
