import { ALLFIELDS } from "./catalog.js";
import { el } from "./dom.js";

/* ============================================================
   Selbstprüfung des Layouts

   Ein Bedienelement kann im Dokument stehen, korrekt ausgezeichnet sein und
   trotzdem keinen Raum bekommen — an dieser Stelle enden statische Prüfungen
   und Tests ohne Layout-Engine. Deshalb misst die Seite sich nach dem Aufbau
   selbst und meldet, was ohne Höhe gerendert wurde.
   ============================================================ */

const MIN_USABLE_HEIGHT = 12;
const MIN_USABLE_WIDTH = 40;

/** Eine Zeile je Knopfleiste: was da ist, wie groß es ist, wie es gerechnet wird. */
function measureControls() {
  return ALLFIELDS.filter((f) => f.type === "seg" || f.type === "toggle").map(
    (f) => {
      const field = el("fld_" + f.key);
      const box = el("seg_" + f.key);
      if (!box) return { feld: f.key, status: "nicht im Dokument" };

      const rect = box.getBoundingClientRect();
      const first = box.firstElementChild;
      const btnRect = first ? first.getBoundingClientRect() : null;
      const cs = getComputedStyle(box);
      const bcs = first ? getComputedStyle(first) : null;

      return {
        feld: f.key,
        knöpfe: box.children.length,
        breite: Math.round(rect.width),
        höhe: Math.round(rect.height),
        knopfHöhe: btnRect ? Math.round(btnRect.height) : 0,
        knopfBreite: btnRect ? Math.round(btnRect.width) : 0,
        display: cs.display,
        sichtbarkeit: cs.visibility,
        rahmen: cs.borderTopWidth,
        textfarbe: bcs ? bcs.color : "—",
        hintergrund: cs.backgroundColor,
        feldVersteckt: field ? field.hidden : "?",
      };
    },
  );
}

/** Alles, was im Dokument steht, aber keinen Raum bekommt. */
function findCollapsed(rows = measureControls()) {
  return rows.filter(
    (r) =>
      // Bewusst ausgeblendete Felder — etwa der Import-Rechner, solange er aus ist —
      // haben zwangsläufig keine Ausdehnung und sind kein Befund.
      r.feldVersteckt !== true &&
      (r.status ||
        r.höhe < MIN_USABLE_HEIGHT ||
        r.knopfHöhe < MIN_USABLE_HEIGHT),
  );
}

/** In der Konsole aufrufbar: gibt die vollständige Messung aus. */
function diagnose() {
  const rows = measureControls();
  if (console.table) console.table(rows);
  else console.log(rows);
  const broken = findCollapsed(rows);
  console.log(
    broken.length
      ? `Ohne nutzbare Ausdehnung: ${broken.map((r) => r.feld).join(", ")}`
      : `Alle ${rows.length} Bedienelemente haben Breite und Höhe.`,
  );
  return rows;
}

/** Meldet das Problem dort, wo es auffällt: auf der Seite, nicht in der Konsole. */
function showBanner(broken, rows) {
  const existing = el("layoutAlert");
  if (existing) existing.remove();

  const box = document.createElement("div");
  box.id = "layoutAlert";
  box.className = "layout-alert";
  const sample = broken[0];
  box.innerHTML =
    `<b>${broken.length} von ${rows.length} Bedienelementen bekommen keinen Raum.</b><br>` +
    `Beispiel <code>${sample.feld}</code>: ` +
    (sample.status
      ? sample.status
      : `${sample.knöpfe} Knöpfe, Leiste ${sample.breite}×${sample.höhe} px, ` +
        `erster Knopf ${sample.knopfBreite}×${sample.knopfHöhe} px, ` +
        `display ${sample.display}, position ${sample.position}, ` +
        `Deckkraft ${sample.deckkraft}, Zeiger ${sample.klickbar}`) +
    `<br><span class="la-hint">Für die vollständige Messung <code>r34diagnose()</code> in der Konsole aufrufen.</span>`;

  const anchor = el("hero");
  if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(box, anchor);
}

/** Rechnet diese Umgebung überhaupt Layout? Testumgebungen ohne Layout-Engine
 *  geben für jedes Element Höhe null zurück — dort wäre jede Messung wertlos. */
function hasLayoutEngine() {
  if (typeof document === "undefined" || !document.body) return false;
  return document.body.getBoundingClientRect().height > 0;
}

/** Läuft einmal nach dem Aufbau. Ohne Befund passiert nichts. */
function auditLayout() {
  if (typeof getComputedStyle !== "function" || !hasLayoutEngine()) return [];
  const rows = measureControls();
  const broken = findCollapsed(rows);
  if (broken.length) {
    console.warn("[r34] Bedienelemente ohne nutzbaren Raum:", broken);
    showBanner(broken, rows);
  }
  return broken;
}

if (typeof window !== "undefined") {
  window.r34diagnose = diagnose;
  window.r34audit = auditLayout;
}

export {
  measureControls,
  findCollapsed,
  hasLayoutEngine,
  diagnose,
  auditLayout,
  MIN_USABLE_HEIGHT,
  MIN_USABLE_WIDTH,
};
