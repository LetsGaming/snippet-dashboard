/* ============================================================
   Die Stellschrauben über dem Katalog

   Steht allein, weil zwei Seiten darauf zugreifen: die Verdrahtung setzt die Werte,
   und zwei Ansichten schreiben sie nach einer Übernahme zurück. Lag die Funktion in
   wire.js, importierte render.js aus wire.js und wire.js aus render.js — ein
   Ladezyklus, der nur dank ESM-Hoisting nicht auffiel.
   ============================================================ */
import { eur, num } from "./format.js";
import { state } from "./state.js";
import { el, setSeg, setInput } from "./dom.js";

function syncTopControls() {
  el("cap").value = state.cap;
  el("cap-val").textContent = eur(state.cap) + " €";
  el("appr").value = state.appr;
  el("appr-val").textContent = num(state.appr, 1) + " % / Jahr";
  setSeg("strat", state.strat);
  setSeg("method", state.method);
  setSeg("restGoal", state.restGoal);
  setSeg("seg_restTerm", state.restTerm);
  setInput("f_restYm", state.restYm);
  setInput("f_restAmount", state.restAmount);
  setInput("f_restRate", state.restRate);
}

export { syncTopControls };
