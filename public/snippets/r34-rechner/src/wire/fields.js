/* ============================================================
   Felder: Eingabe, Auswahl, Schalter
   ============================================================ */
import { ALLFIELDS } from "../catalog.js";
import { BODIES, isSolid } from "../config.js";
import { el, setInput, setSeg, von } from "../dom.js";
import { clamp } from "../format.js";
import { render } from "../render.js";
import { prov, state } from "../state.js";
import { persistSoon } from "../store.js";
import { syncTopControls } from "../topcontrols.js";

function wireFields() {
  ALLFIELDS.forEach((f) => {
    if (f.type === "seg") {
      el("seg_" + f.key).addEventListener("click", (e) => {
        const btn = von(e).closest("button");
        if (!btn) return;
        setSeg("seg_" + f.key, btn.dataset.v);
        state[f.key] = btn.dataset.v;
        prov[f.key] = "manual";

        if (f.target && btn.dataset.p !== "") {
          const preset = parseFloat(btn.dataset.p);
          if (
            isFinite(preset) &&
            prov[f.target] !== "proof" &&
            prov[f.target] !== "manual"
          ) {
            state[f.target] = preset;
            setInput("f_" + f.target, preset);
          }
        }
        /* Die Wertsteigerung folgt der Karosserie, solange sie offen ist. Sobald sie
           steht — selbst eingetragen oder aus eigenen Inseraten übernommen —, bleibt
           sie stehen. Die frühere Bedingung prüfte nur auf „manual" und warf eine
           gemessene Rate beim nächsten Karosseriewechsel weg. */
        if (f.key === "r34Body" && !isSolid(prov.appr)) {
          state.appr = btn.dataset.v === BODIES.coupe ? 5 : 3;
          syncTopControls();
        }
        persistSoon();
        render();
      });
      return;
    }

    if (f.type === "toggle") {
      el("seg_" + f.key).addEventListener("click", (e) => {
        const btn = von(e).closest("button");
        if (!btn) return;
        setSeg("seg_" + f.key, btn.dataset.v);
        state[f.key] = btn.dataset.v === "on";
        prov[f.key] = "manual";
        persistSoon();
        render();
      });
      return;
    }

    const node = el("f_" + f.key);
    if (!node) return;

    /* Nur eine echte Änderung ist eine Entscheidung. Vorher setzte jeder Tastendruck
       die Herkunft auf „von dir" — denselben Schätzwert noch einmal einzutippen senkte
       das Bandgewicht von 1,0 auf 0,4 und machte den Korridor schmaler, ohne dass eine
       Information dazugekommen wäre. */
    const take = (key, next) => {
      if (next !== state[key]) prov[key] = "manual";
      state[key] = next;
      persistSoon();
      render();
    };

    if (f.type === "month") {
      node.addEventListener("input", (e) => take(f.key, von(e).value));
      return;
    }
    if (f.type === "select") {
      node.addEventListener("change", (e) => take(f.key, Number(von(e).value)));
      return;
    }
    node.addEventListener("input", (e) => {
      if (f.ro) return;
      const v = parseFloat(von(e).value);
      /* Grenzen aus dem Katalog, Vorgabe ist „nicht negativ". Ohne das erzeugte ein
         negativer Verbrauch negative Spritkosten und damit Spielraum aus dem Nichts.
         Das Eingabefeld selbst wird nicht überschrieben, solange es den Fokus hat —
         darum kümmert sich setInput beim nächsten Render. */
      take(f.key, clamp(isNaN(v) ? 0 : v, f.min ?? 0, f.max ?? Infinity));
    });
  });
}
export { wireFields };
