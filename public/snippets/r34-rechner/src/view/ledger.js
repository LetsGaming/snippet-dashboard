/* ============================================================
   Beleglisten
   ============================================================ */
import { ymOf } from "../calendar.js";
import { LEDGERS } from "../catalog.js";
import { el, helpBtn } from "../dom.js";
import { esc, eur } from "../format.js";
import { ledgers, state } from "../state.js";


/* ---- Belege ---- */
function renderLedger(id) {
  const box = el("led_" + id);
  if (!box) return;
  const def = LEDGERS[id];
  const rows = ledgers[id];

  const body = rows.length
    ? rows
        .map((row, i) => {
          const value = def.value(row);
          return (
            `<div class="lrow"><div class="lmain">` +
            `<div class="lsrc">${esc(def.label(row))}</div>` +
            `<div class="lmeta">${esc(def.meta(row))}</div></div>` +
            `<div class="lval">${value == null ? "—" : eur(value) + " €"}</div>` +
            `<button type="button" class="ldel" data-led="${id}" data-i="${i}" aria-label="Zeile löschen">×</button></div>`
          );
        })
        .join("")
    : `<div class="empty">${def.empty}</div>`;

  const inputs = def.cols
    .map((c) => {
      if (c.type === "select")
        return `<select data-led="${id}" data-col="${c.key}" aria-label="${esc(c.key)}">${c.opts
          .map((o) => `<option>${esc(o)}</option>`)
          .join("")}</select>`;
      if (c.type === "month")
        return `<input data-led="${id}" data-col="${c.key}" type="month" value="${ymOf(0)}" aria-label="Monat">`;
      return `<input data-led="${id}" data-col="${c.key}" type="${c.type}" placeholder="${esc(c.ph)}"${
        c.type === "number" ? ' step="any"' : ""
      }>`;
    })
    .join("");

  const hints = [];
  if (id === "price") {
    const foreign = rows.filter((r) => r.cur && r.cur !== "EUR").length;
    if (foreign > 0 && foreign < rows.length)
      hints.push(
        "Angebote aus dem Ausland und aus Deutschland im selben Median: der Auslandspreis ist ab Werk, der deutsche frei Haus. Entweder nur eine Sorte erfassen oder den Import-Rechner nutzen.",
      );
    if (rows.length > 0 && foreign === rows.length && !state.importOn)
      hints.push(
        "Alle Angebote sind Auslandspreise ab Werk, der Import-Rechner ist aus. Der Kaufpreis liegt damit um Fracht, Zoll, EUSt und §21 zu niedrig.",
      );
  }

  box.innerHTML =
    `<div class="lhead"><span>${def.title}</span>${helpBtn(def.help)}</div>` +
    body +
    hints.map((h) => `<div class="lhint">⚠ ${h}</div>`).join("") +
    `<div class="ladd">${inputs}<button type="button" data-add="${id}">+ hinzufügen</button></div>`;
}

export { renderLedger };
