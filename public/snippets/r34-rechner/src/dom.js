import { PROV_META, isSolid } from "./config.js";
import { esc, plural } from "./format.js";
import { prov } from "./state.js";

/* ============================================================
   DOM-Helfer — bewusst klein gehalten
   ============================================================ */
/**
 * Ein Element per Kennung.
 *
 * Der Rückgabetyp ist bewusst `HTMLInputElement` und nicht `HTMLElement`: die Seite
 * besteht überwiegend aus Eingabefeldern, und `.value`, `.files` und `.select()`
 * stünden sonst an über vierzig Stellen unter einer Ausnahme. Die Unschärfe sitzt
 * damit an einer geprüften Stelle statt verteilt über jede Aufrufstelle.
 *
 * @param {string} id
 * @returns {HTMLInputElement}
 */
const el = (id) =>
  /** @type {HTMLInputElement} */ (document.getElementById(id));

/**
 * Das auslösende Element eines Ereignisses, typisiert.
 * @param {Event} e
 * @returns {HTMLInputElement}
 */
/**
 * Alle passenden Elemente als Feld, typisiert wie `el`. Gibt ein Feld zurück und
 * keine NodeList — `map` und `filter` stehen damit ohne Umweg zur Verfügung.
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLInputElement[]}
 */
const alle = (root, sel) =>
  /** @type {HTMLInputElement[]} */ ([...root.querySelectorAll(sel)]);

/**
 * Das erste passende Element, typisiert wie `el`.
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLInputElement}
 */
const eins = (root, sel) =>
  /** @type {HTMLInputElement} */ (root.querySelector(sel));

const von = (e) => /** @type {HTMLInputElement} */ (e.target);
const helpBtn = (key) =>
  `<button type="button" class="hbtn" data-help="${key}">?</button>`;

/** Ein Punkt statt eines Etiketts. Gefüllt heißt: die Zahl steht. */
function provDot(key) {
  const p = prov[key] || "guess";
  const meta = PROV_META[p] || PROV_META.guess;
  return (
    `<span class="pdot ${isSolid(p) ? "solid" : "open"} tip" id="pdot_${key}" ` +
    `data-tip="${esc(meta.short + " — " + meta.long)}" aria-label="${esc(meta.short)}"></span>`
  );
}

function setSeg(id, val) {
  const box = el(id);
  if (box)
    /** @type {HTMLInputElement[]} */ ([...box.children]).forEach((c) =>
      c.classList.toggle("on", c.dataset.v === String(val)),
    );
}
function setInput(id, value) {
  const node = el(id);
  if (node && document.activeElement !== node) node.value = value;
}

function inWords(m) {
  if (m == null) return "";
  const y = Math.floor(m / 12);
  const r = m % 12;
  if (m === 0) return "diesen Monat";
  if (!y) return "in " + plural(r, "Monat", "Monaten");
  if (!r) return "in " + plural(y, "Jahr", "Jahren");
  return `in ${plural(y, "Jahr", "Jahren")} und ${plural(r, "Monat", "Monaten")}`;
}

export { el, von, alle, eins, helpBtn, provDot, setSeg, setInput, inWords };
