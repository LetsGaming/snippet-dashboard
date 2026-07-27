import { PROV_META, isSolid } from "./config.js";
import { esc, plural } from "./format.js";
import { prov } from "./state.js";

/* ============================================================
   DOM-Helfer — bewusst klein gehalten
   ============================================================ */
const el = (id) => document.getElementById(id);
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
    [...box.children].forEach((c) =>
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

export { el, helpBtn, provDot, setSeg, setInput, inWords };
