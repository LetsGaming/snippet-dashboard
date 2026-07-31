/* ============================================================
   Verdrahtung — Verbundstelle

   Die Verdrahtung selbst liegt in `wire/`, ein Modul je Bereich. Hier steht nur
   noch, in welcher Reihenfolge sie einmal beim Start läuft: Felder vor Belegen,
   Belege vor den Stellschrauben, alles vor dem ersten Zeichnen.
   ============================================================ */
import { wireFields } from "./wire/fields.js";
import { wireLedgers } from "./wire/ledgers.js";
import { wireTopControls } from "./wire/controls.js";
import { wireBackup } from "./wire/backup.js";
import { wireStatement } from "./wire/statement.js";
import { wireHelp } from "./wire/help.js";
import { wireReset } from "./wire/reset.js";

/** Alles einmal verdrahten. Ein Aufruf, damit kein Aufrufer eine Zeile vergisst. */
function wireAll() {
  wireFields();
  wireTopControls();
  wireLedgers();
  wireBackup();
  wireStatement();
  wireHelp();
  wireReset();
}

export { wireAll };
