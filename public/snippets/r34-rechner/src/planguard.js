/* ============================================================
   Fremde Pläne prüfen

   Hier tritt Fremdes ein: Dateien, Textcodes, alles von außen. Was hier durchgeht,
   gilt danach als Plan — also geht nur durch, was der Feldkatalog kennt, in der Form,
   die er vorgibt, und in Mengen, die eine Anzeige verträgt.
   ============================================================ */
import { FIELD_BY_KEY, LEDGERS } from "./catalog.js";
import { PROV_META, SNAPSHOT_VERSION } from "./config.js";
import { INTERNAL_LEDGER_COLS, UI_KEYS, ledgers, state } from "./state.js";

const MAX_TEXT_LEN = 200;

const MAX_ROWS = 500;

const MAX_KEY_LEN = 64;


/* Drei Namen, die nie ein Feld sind, als Schlüssel aber den Prototyp treffen. */
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

const isSafeKey = (k) =>
  typeof k === "string" &&
  k.length > 0 &&
  k.length <= MAX_KEY_LEN &&
  !FORBIDDEN_KEYS.has(k);


/** Welche Schlüssel überhaupt in den Zustand dürfen: der Feldkatalog, die
 *  Bedienelemente darüber und `restYm`, das gesondert gesichert wird. */
const STATE_KEYS = new Set([
  ...Object.keys(FIELD_BY_KEY),
  ...UI_KEYS,
  "restYm",
]);


/** Passt der Wert zum Feld? Geprüft wird der Grundtyp, nicht der Bereich — das Klemmen
 *  an die Feldgrenzen macht `sanitize`. Ein String in einem Zahlenfeld rechnet sonst
 *  irgendwo weiter unten „1200" + 1 = „12001". */
function fitsField(key, value) {
  const f = FIELD_BY_KEY[key];
  const soll = f ? typeof f.def : typeof state[key];
  if (soll === "number")
    return typeof value === "number" && Number.isFinite(value);
  if (soll === "boolean") return typeof value === "boolean";
  if (soll === "string")
    return typeof value === "string" && value.length <= MAX_TEXT_LEN;
  return false;
}


/** Die Spalten einer Beleg-Liste. Unbekannte Listen haben keine und fallen weg. */
const ledgerCols = (name) =>
  LEDGERS[name]
    ? LEDGERS[name].cols.map((c) => c.key)
    : (INTERNAL_LEDGER_COLS[name] ?? null);


/** Eine Zeile feldweise übernehmen. Nur bekannte Spalten, nur Grundtypen, Strings
 *  gekürzt — verschachtelte Werte und fremde Spalten kommen nicht mit. */
function cleanRow(row, cols) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const out = {};
  for (const col of cols) {
    const v = row[col];
    if (typeof v === "number") out[col] = Number.isFinite(v) ? v : 0;
    else if (typeof v === "boolean") out[col] = v;
    else if (typeof v === "string") out[col] = v.slice(0, MAX_TEXT_LEN);
  }
  return Object.keys(out).length ? out : null;
}

/* Über die bekannten Listen in ihrer festen Reihenfolge, nicht über die der Datei:
   damit ergibt ein geprüfter Plan denselben Fingerabdruck wie ein selbst erzeugter. */

function cleanLedgers(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const out = {};
  for (const name of Object.keys(ledgers)) {
    const rows = src[name];
    const cols = ledgerCols(name);
    out[name] = Array.isArray(rows)
      ? rows
          .slice(0, MAX_ROWS)
          .map((r) => cleanRow(r, cols))
          .filter(Boolean)
      : [];
  }
  return out;
}


function cleanDoneTasks(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw && typeof raw === "object" ? raw : {}))
    if (isSafeKey(k) && typeof v === "string" && v.length <= 32) out[k] = v;
  return out;
}


function cleanSourceKeys(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter(
      (e) =>
        Array.isArray(e) && typeof e[0] === "string" && typeof e[1] === "string",
    )
    .map(([id, key]) => [id.slice(0, MAX_KEY_LEN), key.slice(0, MAX_TEXT_LEN)]);
}


/** Ein geprüfter Schnappschuss in kanonischer Form. Die Reihenfolge der Schlüssel
 *  folgt `planSnapshot` — daran hängt der Fingerabdruck und damit die Erinnerung ans
 *  Sichern. */
function sanitizeSnapshot(snap) {
  const values = {};
  for (const [k, v] of Object.entries(snap.values || snap.manual || {}))
    if (isSafeKey(k) && STATE_KEYS.has(k) && fitsField(k, v)) values[k] = v;

  const origin = {};
  for (const [k, p] of Object.entries(snap.origin || {}))
    if (isSafeKey(k) && STATE_KEYS.has(k) && PROV_META[p]) origin[k] = p;

  const fallback = {};
  for (const [k, entry] of Object.entries(snap.fallback || {})) {
    if (!isSafeKey(k) || !STATE_KEYS.has(k)) continue;
    const [v, p] = Array.isArray(entry) ? entry : [entry, "live"];
    if (fitsField(k, v) && PROV_META[p]) fallback[k] = [v, p];
  }

  const ui = {};
  for (const k of UI_KEYS)
    if (fitsField(k, snap.ui?.[k])) ui[k] = snap.ui[k];

  return {
    v: SNAPSHOT_VERSION,
    saved: typeof snap.saved === "string" ? snap.saved.slice(0, 40) : null,
    values,
    fallback,
    // Zweitname für ältere Fassungen des Rechners, siehe planSnapshot
    manual: values,
    origin,
    ui,
    ledgers: cleanLedgers(snap.ledgers),
    doneTasks: cleanDoneTasks(snap.doneTasks),
    keys: cleanSourceKeys(snap.keys),
  };
}
export { sanitizeSnapshot, STATE_KEYS };
