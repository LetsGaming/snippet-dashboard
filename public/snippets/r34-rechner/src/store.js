import {
  STORE_KEY,
  BACKUP_KEY,
  SNAPSHOT_VERSION,
  PERSIST_DEBOUNCE_MS,
} from "./config.js";
import { clamp, plural } from "./format.js";
import { UI_KEYS, state, prov, ledgers, doneTasks } from "./state.js";
import { FIELD_BY_KEY } from "./catalog.js";
import { SOURCES } from "./sources.js";

/* ============================================================
   10 — Speicher
   ============================================================ */
const store = (() => {
  const mem = {};
  const ws =
    typeof window !== "undefined" && window.storage ? window.storage : null;
  let ls = null;
  try {
    localStorage.setItem("__probe", "1");
    localStorage.removeItem("__probe");
    ls = localStorage;
  } catch {
    /* gesperrt oder nicht vorhanden */
  }
  return {
    async get(k) {
      if (ws) {
        try {
          const r = await ws.get(k);
          return r ? r.value : null;
        } catch {
          return null;
        }
      }
      if (ls) return ls.getItem(k);
      return mem[k] ?? null;
    },
    async set(k, v) {
      if (ws) {
        try {
          await ws.set(k, v);
          return;
        } catch {
          /* weiter unten */
        }
      }
      if (ls) {
        try {
          ls.setItem(k, v);
          return;
        } catch {
          /* voll */
        }
      }
      mem[k] = v;
    },
  };
})();

/** Der vollständige Plan als einfaches Objekt — Grundlage für Speicher und Export. */
/** Vergleich gegen den Katalogwert — Zahlen mit Toleranz, alles andere strikt. */
function isDefaultValue(key, value) {
  const f = FIELD_BY_KEY[key];
  if (!f) return false;
  if (typeof f.def === "number" && typeof value === "number")
    return Math.abs(f.def - value) < 1e-9;
  return f.def === value;
}

function planSnapshot() {
  /* Gesichert wird jeder Wert, der nicht aus dem Katalog oder aus einer anderen Zahl
     folgt — also alles, was verloren wäre, wenn der Browserspeicher wegfällt.

     Bis Fassung 6 waren das nur Handeingaben. Damit fielen ausgerechnet die Zahlen
     durchs Raster, die am meisten Arbeit gekostet haben: eine aus echten Kontoständen
     abgeleitete Lebenshaltung, ein aus eigenen Inseraten gemessener Wertzuwachs, ein
     an der Wirklichkeit ausgerichteter Dauerauftrag. Sie tragen `proof`, und davon
     wurde nur das Etikett gespeichert, nicht der Wert — auf dem neuen Gerät stand
     dann der Katalogwert unter einem Punkt, der „belegt" behauptete. */
  const values = {};
  const origin = {};
  Object.keys(prov).forEach((k) => {
    const p = prov[k];
    if (p !== "manual" && p !== "proof") return;
    // Eine Handeingabe, die dem Katalogwert entspricht, ist keine Entscheidung.
    // Eine Messung, die zufällig darauf fällt, sehr wohl.
    if (p === "manual" && isDefaultValue(k, state[k])) return;
    values[k] = state[k];
    origin[k] = p;
  });

  /* Live geholte Zahlen als Rückfall. Sie werden beim nächsten Start neu abgefragt und
     überschreiben das hier — aber nur, wenn die Schnittstelle antwortet. Ohne diesen
     Rückfall rechnet ein Gerät ohne Netz mit Spritpreisen und Zinsen aus dem Katalog
     und kommt zu einem anderen Ergebnis als das Gerät, von dem der Plan stammt. */
  const fallback = {};
  Object.keys(prov).forEach((k) => {
    if (prov[k] === "live" || prov[k] === "derived")
      fallback[k] = [state[k], prov[k]];
  });

  const ui = {};
  UI_KEYS.forEach((k) => {
    ui[k] = state[k];
  });
  if (prov.restYm === "manual") {
    values.restYm = state.restYm;
    origin.restYm = "manual";
  }
  return {
    v: SNAPSHOT_VERSION,
    saved: new Date().toISOString(),
    values,
    fallback,
    // Bis Fassung 6 hieß das Feld `manual` und enthielt nur Handeingaben. Ältere
    // Fassungen des Rechners lesen wenigstens die noch, statt gar nichts zu finden.
    manual: values,
    origin,
    ui,
    /* Kopie, nicht Referenz. `ledgers` und `doneTasks` sind lebende Objekte: gäbe der
       Schnappschuss sie direkt heraus, änderte sich ein bereits erstellter Export
       nachträglich mit. Beim Sichern fiele das nicht auf, weil sofort serialisiert
       wird — beim Fingerabdruck nach dem Kodieren aber schon: der Code enthielte den
       alten Stand, der Merker den neuen, und der Plan gälte fälschlich als gesichert. */
    ledgers: structuredClone(ledgers),
    doneTasks: structuredClone(doneTasks),
    keys: SOURCES.filter((s) => s.editable).map((s) => [s.id, s.key]),
  };
}

/** Einen gespeicherten Wert an die Kataloggrenzen anpassen.
 *
 *  Fassungen bis 5 kannten keine Grenzen: dort konnte ein Verbrauch von −5 oder ein
 *  Überschussanteil von 500 % landen. Beim Einlesen wird das zurechtgerückt, sonst
 *  rechnet ein alter Plan weiter mit Werten, die die Eingabe längst nicht mehr
 *  zulässt. */
function sanitize(key, value) {
  const f = FIELD_BY_KEY[key];
  if (!f || typeof value !== "number" || !isFinite(value)) return value;
  if (f.min == null && f.max == null) return value;
  return clamp(value, f.min ?? 0, f.max ?? Infinity);
}

function applySnapshot(snap) {
  if (!snap || typeof snap !== "object") return false;

  // Bis Fassung 4 landete jede Vorgabe als "manuell" im Speicher, auch wenn sie nie
  // angefasst wurde. Ohne Herkunftsangabe wird deshalb am Wert entschieden: was dem
  // Katalogwert entspricht, war keine Eingabe.
  // Seit Fassung 7 heißt das Feld `values` und enthält auch belegte Werte; `manual`
  // bleibt als Zweitname stehen, damit ältere Exporte weiter einlesbar sind.
  const origin = snap.origin || null;
  Object.entries(snap.values || snap.manual || {}).forEach(([k, v]) => {
    state[k] = sanitize(k, v);
    const f = FIELD_BY_KEY[k];
    if (origin && origin[k]) prov[k] = origin[k];
    else if (f && isDefaultValue(k, v)) prov[k] = f.prov || "guess";
    else prov[k] = "manual";
  });
  if (origin)
    Object.entries(origin).forEach(([k, p]) => {
      if (p === "proof") prov[k] = "proof";
    });

  /* Rückfall für live geholte Zahlen. Eine eigene Entscheidung schlägt ihn — deshalb
     läuft er nach den Werten oben und lässt manual und proof in Ruhe. Antwortet die
     Schnittstelle beim Start, überschreibt adoptLive das hier ohnehin wieder. */
  Object.entries(snap.fallback || {}).forEach(([k, entry]) => {
    if (prov[k] === "manual" || prov[k] === "proof") return;
    const [v, p] = Array.isArray(entry) ? entry : [entry, "live"];
    if (v == null) return;
    state[k] = sanitize(k, v);
    prov[k] = p === "derived" ? "derived" : "live";
  });
  Object.entries(snap.ui || {}).forEach(([k, v]) => {
    if (UI_KEYS.includes(k) && v != null) state[k] = sanitize(k, v);
  });
  Object.entries(snap.ledgers || {}).forEach(([k, rows]) => {
    if (ledgers[k] && Array.isArray(rows)) ledgers[k] = rows;
  });
  Object.entries(snap.doneTasks || {}).forEach(([k, v]) => {
    doneTasks[k] = v;
  });
  (snap.keys || []).forEach(([id, key]) => {
    const s = SOURCES.find((x) => x.id === id);
    if (s && key) s.key = key;
  });
  return true;
}

/* ============================================================
   Übertragung zwischen Geräten

   Eine Datei ist am Rechner richtig, zwischen Handy und Rechner aber umständlich.
   Deshalb zusätzlich ein Textcode: kopieren, sich selbst schicken, drüben einfügen.

   Format `R34<n>:<base64url>` — `n` sagt, ob der Inhalt gepackt ist. Gepackt wird
   über CompressionStream, wenn der Browser es kann; sonst steht das JSON im Klartext
   hinter der Kodierung. Beim Lesen werden beide Formen erkannt, ein Code von einem
   alten Browser lässt sich also auf einem neuen einlesen und umgekehrt.

   base64url statt base64, damit `+` und `/` nicht daran scheitern, dass ein
   Messenger den Code als Link erkennt.
   ============================================================ */
const CODE_RE = /^\s*R34([01]):([A-Za-z0-9_-]+)\s*$/;

function toBase64Url(bytes) {
  let s = "";
  // In Blöcken, sonst sprengt ein langer Plan das Argumentlimit von String.fromCharCode
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const s = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function through(bytes, transform) {
  const stream = new Blob([bytes]).stream().pipeThrough(transform);
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Den Plan als Textcode. Fällt auf ungepackt zurück, wenn der Browser nicht packen kann. */
async function encodeSnapshot(snap = planSnapshot()) {
  const bytes = new TextEncoder().encode(JSON.stringify(snap));
  try {
    if (typeof CompressionStream !== "function") throw new Error("kein Packer");
    const packed = await through(bytes, new CompressionStream("gzip"));
    return "R341:" + toBase64Url(packed);
  } catch {
    return "R340:" + toBase64Url(bytes);
  }
}

/** Einen Textcode zurück in einen Schnappschuss. Wirft nicht, sondern gibt null. */
async function decodeSnapshot(text) {
  const m = CODE_RE.exec(String(text ?? ""));
  if (!m) return null;
  try {
    let bytes = fromBase64Url(m[2]);
    if (m[1] === "1")
      bytes = await through(bytes, new DecompressionStream("gzip"));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/* ---- Merken, ob der aktuelle Stand schon gesichert ist ---- */

/** Billiger Fingerabdruck über den Schnappschuss. Reicht, um „seit dem letzten
 *  Export hat sich etwas geändert" zu beantworten; keine Prüfsumme gegen Absicht. */
function fingerprint(snap) {
  const json = JSON.stringify({ ...snap, saved: null });
  let h = 5381;
  for (let i = 0; i < json.length; i++) h = ((h * 33) ^ json.charCodeAt(i)) >>> 0;
  return `${json.length}-${h.toString(36)}`;
}

let lastSaved = null;
const markSaved = (snap) => {
  lastSaved = fingerprint(snap);
  store.set(BACKUP_KEY, lastSaved);
};
/** Ob der Plan seit dem letzten Export oder Import inhaltlich weitergewandert ist. */
const isUnsaved = () => lastSaved !== fingerprint(planSnapshot());

/** Einen geprüften Schnappschuss übernehmen. Einziger Weg in den Speicher, den
 *  Datei- und Code-Import teilen. */
async function adoptSnapshot(snap) {
  await store.set(STORE_KEY, JSON.stringify(snap));
  markSaved(snap);
}

let persistTimer = null;
async function persist() {
  await store.set(STORE_KEY, JSON.stringify(planSnapshot()));
}
/** Tastendruck-Pfade schreiben nicht bei jedem Zeichen in einen ratenbegrenzten Speicher. */
function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, PERSIST_DEBOUNCE_MS);
}
/** Bringt einen Schnappschuss beliebigen Alters auf die aktuelle Form.
 *
 *  Läuft inhaltsgesteuert und ist damit gefahrlos mehrfach anwendbar — die Fassung
 *  im Feld `v` taugt nicht als alleiniger Auslöser, weil sie nicht im Gleichschritt
 *  mit dem Speicherschlüssel hochgezählt wurde.
 *
 *  v3 verankerte den Preis am Coupé und leitete die Limousine über einen Abschlag ab.
 *  Seit v4 ist es umgekehrt. Belege bleiben gültig, nur die beiden Felder wandern. */
function migrate(snap) {
  const m = snap.manual || {};
  if (typeof m.sedanDisc === "number") {
    const disc = clamp(m.sedanDisc, 0, 95) / 100;
    m.coupeAdd = Math.round((1 / Math.max(0.05, 1 - disc) - 1) * 100);
    delete m.sedanDisc;
    /* Der frühere Standardpreis war ein Coupé-Preis und als Limousinen-Anker zu hoch.
       Ohne Belege, die ihn stützen, fliegt er raus und der Katalogwert greift.
       Die Bedingung stand auf `m.car == null` und löschte damit einen Schlüssel, den
       es ohnehin nicht gab — der stale Coupé-Preis überlebte jede Migration. */
    if (m.car != null && (snap.ledgers?.price || []).length === 0) delete m.car;
  }
  // Fassungen bis 6 kannten nur `manual`. Der Name wandert, der Inhalt bleibt gültig.
  if (!snap.values && snap.manual) snap.values = snap.manual;

  /* Bis Fassung 7 gab es genau einen Gehaltssprung, abgelegt als Feldpaar. Er wird
     zum ersten Eintrag der Schrittliste — der Wert bleibt, nur die Form ändert sich.
     Ohne diese Umschreibung fiele die Erhöhung ersatzlos weg und der Plan würde
     dauerhaft mit dem Ausbildungsnetto rechnen. */
  const v = snap.values || {};
  if (v.netAfter != null || v.raiseYm != null) {
    snap.ledgers = snap.ledgers || {};
    if (!Array.isArray(snap.ledgers.income) || !snap.ledgers.income.length)
      snap.ledgers.income = [
        {
          month: v.raiseYm || "2027-07",
          amt: Number(v.netAfter) || 0,
          src: "Erhöhung",
        },
      ].filter((r) => r.amt > 0);
    delete v.netAfter;
    delete v.raiseYm;
    if (snap.origin) {
      delete snap.origin.netAfter;
      delete snap.origin.raiseYm;
    }
  }
  snap.v = SNAPSHOT_VERSION;
  return snap;
}

/** Prüft einen Schnappschuss aus beliebiger Quelle und bringt ihn auf Stand.
 *  Datei, Textcode und Speicher laufen alle hier durch — sonst hat der Import eine
 *  andere Vorstellung vom Format als das Laden beim Start. */
function normalizeSnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    return { ok: false, reason: "Das ist kein Plan dieses Rechners." };
  const v = Number(raw.v);
  if (!Number.isFinite(v) || v < 1)
    return { ok: false, reason: "Dem Plan fehlt die Fassungsangabe." };
  if (v > SNAPSHOT_VERSION)
    return {
      ok: false,
      reason: `Der Plan stammt aus einer neueren Fassung des Rechners (${v} statt ${SNAPSHOT_VERSION}). Aktualisiere erst die Seite.`,
    };
  return { ok: true, snap: migrate(structuredClone(raw)) };
}

/** Was in einem Schnappschuss steckt, in einem Satz — damit man vor dem Überschreiben
 *  sieht, was man sich einhandelt. */
function snapshotSummary(snap) {
  const parts = [];
  const when = snap.saved ? new Date(snap.saved) : null;
  if (when && !Number.isNaN(when.getTime()))
    parts.push(`gesichert am ${when.toLocaleDateString("de-DE")}`);
  const led = snap.ledgers || {};
  const rows = ["price", "insR34", "insDaily", "actual"].reduce(
    (a, k) => a + (Array.isArray(led[k]) ? led[k].length : 0),
    0,
  );
  parts.push(plural(rows, "Beleg", "Belege"));
  parts.push(
    plural(
      Object.keys(snap.values || snap.manual || {}).length,
      "eigene Eingabe",
      "eigene Eingaben",
    ),
  );
  return parts.join(" · ");
}

async function restore() {
  lastSaved = (await store.get(BACKUP_KEY)) ?? null;
  let raw = await store.get(STORE_KEY);
  let legacy = false;
  /* Ältere Schlüssel der Reihe nach. `v2` kannte noch kein Fassungsfeld und keinen
     `ui`-Abschnitt — es wird beim Lesen in die heutige Form gebracht, sonst würde
     die Prüfung es als „kein Plan dieses Rechners" abweisen und ein Wechsel von v2
     auf heute den ganzen Plan stillschweigend verwerfen. */
  for (const key of ["r34planer:v3", "r34planer:v2"]) {
    if (raw) break;
    raw = await store.get(key);
    legacy = !!raw;
  }
  if (!raw) return;
  try {
    let parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && parsed.v == null && parsed.manual)
      parsed = {
        v: 2,
        values: parsed.manual,
        origin: Object.fromEntries(
          Object.keys(parsed.manual).map((k) => [k, "manual"]),
        ),
        ledgers: parsed.ledgers || {},
        doneTasks: {},
        keys: parsed.keys || [],
      };
    // Derselbe Weg wie beim Import: prüfen, migrieren, anwenden.
    const check = normalizeSnapshot(parsed);
    if (!check.ok) return;
    applySnapshot(check.snap);
    if (legacy) await persist();
  } catch {
    /* kaputter Eintrag wird ignoriert */
  }
}

export {
  store,
  isDefaultValue,
  planSnapshot,
  applySnapshot,
  normalizeSnapshot,
  snapshotSummary,
  encodeSnapshot,
  decodeSnapshot,
  adoptSnapshot,
  markSaved,
  isUnsaved,
  fingerprint,
  persist,
  persistSoon,
  restore,
  migrate,
};
