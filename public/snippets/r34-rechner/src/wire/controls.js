/* ============================================================
   Die Stellschrauben über dem Katalog
   ============================================================ */
import { el, setSeg, von } from "../dom.js";
import { eur, num } from "../format.js";
import { render } from "../render.js";
import { prov, state } from "../state.js";
import { persistSoon } from "../store.js";
import { resetMiniBaseline } from "../view/hero.js";
import { loadSources } from "../view/sources.js";


/* ---- Bedienelemente außerhalb des Feldkatalogs ---- */
function wireTopControls() {
  el("cap").addEventListener("input", (e) => {
    state.cap = Number(von(e).value);
    prov.cap = "manual";
    el("cap-val").textContent = eur(state.cap) + " €";
    persistSoon();
    render();
  });
  el("appr").addEventListener("input", (e) => {
    state.appr = Number(von(e).value);
    prov.appr = "manual";
    el("appr-val").textContent = num(state.appr, 1) + " % / Jahr";
    persistSoon();
    render();
  });

  const wireSeg = (id, key, after) => {
    el(id).addEventListener("click", (e) => {
      const btn = von(e).closest("button");
      if (!btn) return;
      setSeg(id, btn.dataset.v);
      state[key] = btn.dataset.v;
      if (after) after();
      persistSoon();
      render();
    });
  };
  // Nach einem Moduswechsel passt der Bezugspunkt der Ergebnisleiste nicht mehr zur Zielgröße
  wireSeg("strat", "strat");
  wireSeg("method", "method", () => {
    resetMiniBaseline();
  });
  wireSeg("restGoal", "restGoal", () => {
    resetMiniBaseline();
  });

  el("seg_restTerm").addEventListener("click", (e) => {
    const btn = von(e).closest("button");
    if (!btn) return;
    setSeg("seg_restTerm", btn.dataset.v);
    state.restTerm = Number(btn.dataset.v);
    persistSoon();
    render();
  });

  el("refresh").addEventListener("click", loadSources);

  el("f_restYm").addEventListener("input", (e) => {
    state.restYm = von(e).value;
    prov.restYm = "manual";
    persistSoon();
    render();
  });
  [
    ["f_restAmount", "restAmount"],
    ["f_restRate", "restRate"],
  ].forEach(([id, key]) => {
    el(id).addEventListener("input", (e) => {
      const v = parseFloat(von(e).value);
      state[key] = isNaN(v) ? 0 : v;
      persistSoon();
      render();
    });
  });
}

/* ---- Sichern und übertragen ---- */
/* ---- Sichern und übertragen ----

   Zwei Wege für zwei Lagen: eine Datei am Rechner, ein Textcode zwischen Handy und
   Rechner. Beide laufen durch dieselbe Prüfung, damit der Import nicht andere
   Vorstellungen vom Format hat als das Laden beim Start. */
export { wireTopControls };
