import { esc } from "./format.js";
import { STEER, GROUPS } from "./catalog.js";
import { el, helpBtn, provDot } from "./dom.js";

/* ============================================================
   13 — Aufbau der Eingabefelder

   Die Beschriftung steht neben dem Steuerelement, nicht darum herum. Ein
   <select> in einem <label>, das auf genau dieses select zeigt, bekommt den
   Klick zweimal — einmal direkt, einmal über das Label — und das Aufklappen
   wird sofort wieder zurückgenommen. Deshalb <label for="…">, kein Wrapper.
   ============================================================ */
/* Ein Hilfetext, der in derselben Gruppe schon einen Knopf hat, bekommt keinen zweiten.
   „Fahrleistung", „Verbrauch", „Kraftstoff" und die drei Spritpreise zeigten alle
   dieselbe Erklärung — von 65 Fragezeichen an Feldern waren 27 Wiederholungen. Der Text
   bleibt erreichbar, er steht nur ein Feld weiter oben statt fünfmal untereinander. */
let helpSeen = new Set();
const resetHelpScope = () => {
  helpSeen = new Set();
};

function labelHTML(f, forId) {
  const cls = f.tip ? "flab tip" : "flab";
  const tip = f.tip ? ` data-tip="${esc(f.tip)}"` : "";
  const text = forId
    ? `<label for="${forId}">${f.label}</label>`
    : `<span>${f.label}</span>`;
  const first = f.help && !helpSeen.has(f.help);
  if (f.help) helpSeen.add(f.help);
  const help = first
    ? `<button type="button" class="hbtn" data-help="${f.help}" aria-label="Erklärung zu ${esc(f.label)}">?</button>`
    : "";
  return `<span class="${cls}"${tip}>${text}${help}${provDot(f.key)}</span>`;
}

/** Platzhalter für die gemessene Wirkung. Wird nach der ersten Rechnung gefüllt.
 *  `choices` markiert Auswahlfelder, die als Entweder-oder in den Korridor eingehen —
 *  die Schadstoffklasse etwa entscheidet über 450 € Steuer im Jahr. */
const impactSlot = (f) =>
  f.band || f.choices ? `<span class="imp" id="imp_${f.key}"></span>` : "";

/** Auswahlfelder nehmen die ganze Breite ein. Sie tun das nicht mehr über
 *  `grid-column: 1 / -1` — diese Linie löst gegen das explizite Grid auf und
 *  ergab in Kombination mit auto-fit eine Spur ohne Breite. Stattdessen stehen
 *  sie außerhalb des Rasters, als gewöhnliche Blöcke im Fluss. */
const isBlockField = (f) => f.type === "seg" || f.type === "toggle";

function fieldHTML(f) {
  const id = "f_" + f.key;
  const cls =
    "fld" + (f.ro ? " ro" : "") + (isBlockField(f) ? " fld-block" : "");
  const wrap = (inner, forId) =>
    `<div class="${cls}" id="fld_${f.key}">` +
    `${labelHTML(f, forId)}${inner}${impactSlot(f)}</div>`;

  if (f.type === "seg") {
    const btns = f.opts
      .map(
        (o) =>
          `<button type="button" data-v="${esc(o.v)}" data-p="${o.p ?? ""}"` +
          `${o.v === f.def ? ' class="on"' : ""}` +
          `${o.tip ? ` title="${esc(o.tip)}"` : ""}>${esc(o.label || o.v)}</button>`,
      )
      .join("");
    return wrap(
      `<div class="seg seg-sm" id="seg_${f.key}" role="group">${btns}</div>`,
    );
  }
  if (f.type === "toggle")
    return wrap(
      `<div class="seg seg-sm" id="seg_${f.key}" role="group">` +
        `<button type="button" data-v="on"${f.def ? ' class="on"' : ""}>${f.onLabel}</button>` +
        `<button type="button" data-v="off"${!f.def ? ' class="on"' : ""}>${f.offLabel}</button></div>`,
    );
  if (f.type === "month")
    return wrap(
      `<span class="finp"><input type="month" id="${id}" value="${f.def}"></span>`,
      id,
    );
  if (f.type === "select") {
    const opts = f.opts
      .map(
        ([v, t]) =>
          `<option value="${v}"${v === f.def ? " selected" : ""}>${t}</option>`,
      )
      .join("");
    return wrap(
      `<span class="finp"><select id="${id}">${opts}</select></span>`,
      id,
    );
  }
  return wrap(
    `<span class="finp"><input type="number" id="${id}" value="${f.def}" step="any"${
      f.ro ? " readonly" : ""
    }><span class="unit">${f.unit}</span></span>`,
    id,
  );
}

const EFFECT = {
  /* Auf den Termin wirken sechs von sieben Gruppen — ein Etikett, das fast überall
     steht, trägt keine Information mehr und erzeugt nur Fläche. Beschriftet wird
     deshalb nur die Ausnahme. */
  date: null,
  after: { cls: "eff-after", text: "wirkt erst nach dem Kauf" },
};

/** Lange Gruppen bekommen Zwischenüberschriften, sonst gehen die Wahlmöglichkeiten
 *  zwischen den technischen Feldern unter. Felder ohne `section` stehen oben. */
function groupBodyHTML(g) {
  // Jede Gruppe beginnt neu — der Hilfetext soll in jedem Bereich einmal erreichbar sein
  resetHelpScope();
  const sections = [];
  const byTitle = new Map();
  g.fields.forEach((f) => {
    const title = f.section || null;
    // Nach Titel bündeln statt nur zusammenhängende Läufe zu bilden — sonst taucht
    // dieselbe Überschrift mehrfach auf, wenn die Felder verstreut im Katalog stehen.
    let sec = byTitle.get(title);
    if (!sec) {
      sec = { title, fields: [] };
      byTitle.set(title, sec);
      sections.push(sec);
    }
    sec.fields.push(f);
  });
  return sections
    .map(
      (sec) =>
        (sec.title ? `<div class="fsec">${sec.title}</div>` : "") +
        fieldRunHTML(sec.fields),
    )
    .join("");
}

/** Aufeinanderfolgende schmale Felder kommen in ein Raster, breite stehen für sich.
 *  So bleibt das Raster ein reines Raster und braucht keine Sonderregel. */
function fieldRunHTML(fields) {
  const out = [];
  let row = [];
  const flushRow = () => {
    if (!row.length) return;
    out.push(`<div class="grid">${row.map(fieldHTML).join("")}</div>`);
    row = [];
  };
  fields.forEach((f) => {
    if (isBlockField(f)) {
      flushRow();
      out.push(fieldHTML(f));
    } else row.push(f);
  });
  flushRow();
  return out.join("");
}

function buildFields() {
  // Oben die Stellschrauben. Preis und Termin eines Autos stehen als Paar zusammen,
  // weil man sie zusammen anfasst.
  const done = new Set();
  resetHelpScope();
  el("steer").innerHTML = STEER.map((f) => {
    if (done.has(f.key)) return "";
    if (!f.pair) return fieldHTML(f);
    const partner = STEER.find((x) => x.key === f.pair);
    if (!partner) return fieldHTML(f);
    done.add(partner.key);
    return `<div class="pair">${fieldHTML(f)}${fieldHTML(partner)}</div>`;
  }).join("");

  el("inputs").innerHTML = GROUPS.map((g) => {
    const eff = EFFECT[g.effect];
    const body =
      groupBodyHTML(g) +
      (g.derived ? `<div class="derived" id="der_${g.derived}"></div>` : "") +
      (g.ledger ? `<div class="ledger" id="led_${g.ledger}"></div>` : "") +
      (g.id === "body"
        ? `<div class="subhead">Limousine oder Coupé${helpBtn("bodyCompare")}</div>` +
          `<div id="bodyCmp"><div class="empty">wird gerechnet …</div></div>`
        : "");
    return (
      `<details class="grp" id="grp_${g.id}"><summary><span class="gname">${g.title}</span>` +
      (eff ? `<span class="eff ${eff.cls}">${eff.text}</span>` : "") +
      `<span class="gsum" id="gsum_${g.id}"></span></summary>` +
      `<div class="gbody"><p class="ghint">${g.hint}</p>${body}</div></details>`
    );
  }).join("");
}

export {
  labelHTML,
  impactSlot,
  isBlockField,
  fieldHTML,
  EFFECT,
  fieldRunHTML,
  groupBodyHTML,
  buildFields,
};
