/* ============================================================
   R34 Planungsrechner — Einstiegspunkt

   Die Rechenkerne (calendar, tax, format, catalog, state, pricing, simulate,
   spread, tasks) fassen kein DOM an und lassen sich einzeln in Node testen.
   Alles Sichtbare liegt in dom, fields, render und wire.
   ============================================================ */
import { ALLFIELDS } from "./src/catalog.js";
import { state } from "./src/state.js";
import { restore } from "./src/store.js";

import { buildFields } from "./src/fields.js";
import { setSeg, setInput } from "./src/dom.js";
import {
  render,
  renderNote,
  renderVisit,
  rememberVisit,
  loadSources,
} from "./src/render.js";
import { runtime } from "./src/state.js";
import {
  wireFields,
  wireLedgers,
  wireTopControls,
  wireBackup,
  wireStatement,
  wireHelp,
  wireReset,
  syncTopControls,
  watchHero,
} from "./src/wire.js";
import { auditLayout } from "./src/selfcheck.js";

async function boot() {
  buildFields();
  await restore();

  ALLFIELDS.forEach((f) => {
    if (state[f.key] == null) return;
    if (f.type === "seg") setSeg("seg_" + f.key, state[f.key]);
    else if (f.type === "toggle")
      setSeg("seg_" + f.key, state[f.key] ? "on" : "off");
    else setInput("f_" + f.key, state[f.key]);
  });

  wireFields();
  wireTopControls();
  wireLedgers();
  wireBackup();
  wireStatement();
  wireHelp();
  wireReset();
  syncTopControls();
  renderNote();
  render();
  watchHero();

  await renderVisit(runtime.lastRun);
  // Der Schnappschuss entsteht beim Weggehen: pagehide ist die einzige Zusage,
  // die mobile Browser einhalten.
  window.addEventListener("pagehide", rememberVisit);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") rememberVisit();
  });

  // Erst wenn das Layout steht, lässt sich messen, ob die Bedienelemente tragen
  const afterPaint =
    typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (fn) => setTimeout(fn, 0);
  afterPaint(() => auditLayout());

  loadSources();
}

boot();
