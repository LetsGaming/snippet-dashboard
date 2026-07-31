/* ============================================================
   Hilfetexte und Modale
   ============================================================ */
import { el, von } from "../dom.js";
import { HELP } from "../help.js";
import { runtime, state } from "../state.js";
import { fundsTableHTML } from "../view/derived.js";
import { spreadModalHTML } from "../view/hero.js";



/* ---- Hilfe und Erklär-Modal ---- */
const MODALS = {
  spread: { t: "Woher die Spanne kommt", html: spreadModalHTML },
  funds: {
    t: "Wohin das Geld fließt",
    html: () => fundsTableHTML(state, runtime.lastRun),
  },
};


function wireHelp() {
  const backdrop = el("backdrop");
  const closeHelp = () => {
    backdrop.hidden = true;
  };
  const open = (title, body, links) => {
    el("m-title").textContent = title;
    el("m-body").innerHTML = body;
    el("m-links").innerHTML = (links || [])
      .map(
        (x) =>
          `<a href="${x.h}" target="_blank" rel="noopener noreferrer">${x.n} ↗</a>`,
      )
      .join("");
    backdrop.hidden = false;
    el("m-close").focus();
  };

  document.addEventListener("click", (e) => {
    const dyn = /** @type {HTMLElement} */ (von(e).closest("[data-modal]"));
    if (dyn) {
      e.preventDefault();
      const m = MODALS[dyn.dataset.modal];
      if (m) open(m.t, m.html());
      return;
    }
    const btn = /** @type {HTMLElement} */ (von(e).closest(".hbtn"));
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const h = HELP[btn.dataset.help];
    if (h) open(h.t, h.b, h.l);
  });

  el("m-close").addEventListener("click", closeHelp);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeHelp();
  });
}
export { wireHelp };
