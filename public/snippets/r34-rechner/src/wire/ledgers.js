/* ============================================================
   Beleglisten: Zeile anlegen, ändern, löschen
   ============================================================ */
import { ymOf } from "../calendar.js";
import { LEDGERS } from "../catalog.js";
import { render } from "../render.js";
import { ledgers, prov } from "../state.js";
import { persist } from "../store.js";
import { renderLedger } from "../view/ledger.js";
import { alle, eins } from "../dom.js";


/* ---- Belege ---- */
function wireLedgers() {
  Object.keys(LEDGERS).forEach(renderLedger);

  alle(document, "[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.add;
      const def = LEDGERS[id];
      const row = { date: ymOf(0) };

      def.cols.forEach((c) => {
        const node = eins(
          document,
          `[data-led="${id}"][data-col="${c.key}"]`,
        );
        if (!node) return;
        row[c.key] = c.type === "number" ? parseFloat(node.value) : node.value;
        if (c.type === "text" || c.type === "number") node.value = "";
      });

      const valid = def.valid
        ? def.valid(row)
        : isFinite(row.amt) && (def.allowNegative || row.amt > 0);
      if (!valid) return;
      if (id === "price" && !row.cur) row.cur = "EUR";
      ledgers[id].push(row);

      // Ein frischer Beleg hebt eine frühere Handeingabe auf
      if (id === "price") prov.car = "proof";
      if (id === "insR34") prov.r34InsY = "proof";
      if (id === "insDaily") prov.dailyInsY = "proof";

      persist();
      wireLedgers();
      render();
    });
  });

  alle(document, ".ldel").forEach((btn) => {
    btn.addEventListener("click", () => {
      ledgers[btn.dataset.led].splice(Number(btn.dataset.i), 1);
      persist();
      wireLedgers();
      render();
    });
  });
}
export { wireLedgers };
