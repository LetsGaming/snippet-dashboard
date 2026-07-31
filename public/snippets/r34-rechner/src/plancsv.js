/* ============================================================
   Monatswerte als Tabelle

   Zum Weiterrechnen außerhalb: eine Zeile je Monat, daneben der erfasste Stand aus
   den Belegen und der Bereich aus der Vorschau. Wer im Tabellenprogramm nachrechnen
   will, soll Plan und Wirklichkeit nebeneinander haben.

   Semikolon und Dezimalkomma, dazu ein BOM: so öffnet Excel in deutscher Einstellung
   die Datei ohne Rückfrage und mit richtigen Umlauten.
   ============================================================ */
import { ymOf } from "./calendar.js";
import { ledgers } from "./state.js";

const CSV_SEP = ";";

const SPALTEN = [
  "Monat",
  "Index",
  "Tagesgeld",
  "Laufendes Konto",
  "Übrig im Monat",
  "Aufs Tagesgeld",
  "Erfasster Stand",
  "Bereich p10",
  "Bereich p50",
  "Bereich p90",
  "Anmerkung",
];

/** Zahl mit Dezimalkomma, auf zwei Stellen. Leer, wenn nichts da ist. */
const zahl = (v) =>
  v == null || !isFinite(v) ? "" : v.toFixed(2).replace(".", ",");

/** Feld quoten, sobald es das Trennzeichen, ein Anführungszeichen oder einen
 *  Umbruch enthält — sonst zerfällt die Zeile beim Einlesen. */
const feld = (s) =>
  /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

/**
 * Die Monatswerte eines Laufs als CSV.
 *
 * @param {{path?: any[], r34Month?: number|null}} run Lauf mit Pfad
 * @param {{band?: any[]|null}|null} [forecast] Vorschau, falls schon gerechnet
 * @returns {string}
 */
function planCsv(run, forecast = null) {
  const pfad = run?.path || [];
  /* Erfasste Stände nach Monat, damit die Zeile ohne Suche im Belegstapel auskommt. */
  const erfasst = new Map(
    (ledgers.actual || []).filter((a) => a && a.month).map((a) => [a.month, a]),
  );
  const bereich = new Map((forecast?.band || []).map((b) => [b.m, b]));

  const zeilen = pfad.map((p) => {
    const ym = ymOf(p.m);
    const b = bereich.get(p.m);
    return [
      ym,
      String(p.m),
      zahl(p.cap),
      zahl(p.giro),
      zahl(p.flow),
      zahl(p.save),
      zahl(erfasst.get(ym)?.amt),
      zahl(b?.p10),
      zahl(b?.p50),
      zahl(b?.p90),
      String(erfasst.get(ym)?.src ?? ""),
    ]
      .map(feld)
      .join(CSV_SEP);
  });

  // BOM voran, sonst zeigt Excel „Übrig" als „Ãbrig"
  return "\ufeff" + [SPALTEN.join(CSV_SEP), ...zeilen].join("\r\n") + "\r\n";
}

export { planCsv, CSV_SEP, SPALTEN };
