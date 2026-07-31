/* ============================================================
   Alles zurücksetzen
   ============================================================ */
import { ALLFIELDS } from "../catalog.js";
import { el, setInput, setSeg } from "../dom.js";
import { render } from "../render.js";
import { adoptLive } from "../sources.js";
import { doneTasks, initState, ledgers, state } from "../state.js";
import { persist } from "../store.js";
import { syncTopControls } from "../topcontrols.js";
import { resetMiniBaseline } from "../view/hero.js";
import { clearSelectedPoint } from "../view/track.js";
import { wireLedgers } from "./ledgers.js";


/* ---- Zurücksetzen ---- */
function wireReset() {
  el("reset").addEventListener("click", () => {
    if (
      !confirm("Alle Eingaben, Belege und erfassten Kontostände zurücksetzen?")
    )
      return;

    // initState() setzt Katalogwerte *und* Bedienelemente zurück; eine zweite
    // Aufzählung hier hat genau deshalb `incomeShift` stehen gelassen.
    initState();
    Object.keys(ledgers).forEach((k) => {
      ledgers[k] = [];
    });
    Object.keys(doneTasks).forEach((k) => delete doneTasks[k]);
    resetMiniBaseline();
    clearSelectedPoint();

    ALLFIELDS.forEach((f) => {
      if (f.type === "seg") setSeg("seg_" + f.key, f.def);
      else if (f.type === "toggle")
        setSeg("seg_" + f.key, f.def ? "on" : "off");
      else setInput("f_" + f.key, f.def);
    });
    syncTopControls();
    adoptLive();
    ALLFIELDS.forEach((f) => setInput("f_" + f.key, state[f.key]));
    persist();
    wireLedgers();
    render();
  });
}

export { wireReset };
