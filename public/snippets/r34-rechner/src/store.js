import { STORE_KEY, SNAPSHOT_VERSION, PERSIST_DEBOUNCE_MS } from "./config.js";
import { clamp } from "./format.js";
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
  const manual = {};
  const origin = {};
  Object.keys(prov).forEach((k) => {
    if (prov[k] === "proof") origin[k] = "proof";
    if (prov[k] !== "manual") return;
    // Ein Wert, der dem Standard entspricht, ist keine Entscheidung, die es zu sichern gilt
    if (isDefaultValue(k, state[k])) return;
    manual[k] = state[k];
    origin[k] = "manual";
  });
  const ui = {};
  UI_KEYS.forEach((k) => {
    ui[k] = state[k];
  });
  if (prov.restYm === "manual") manual.restYm = state.restYm;
  return {
    v: SNAPSHOT_VERSION,
    saved: new Date().toISOString(),
    manual,
    origin,
    ui,
    ledgers,
    doneTasks,
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
  const origin = snap.origin || null;
  Object.entries(snap.manual || {}).forEach(([k, v]) => {
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

let persistTimer = null;
async function persist() {
  await store.set(STORE_KEY, JSON.stringify(planSnapshot()));
}
/** Tastendruck-Pfade schreiben nicht bei jedem Zeichen in einen ratenbegrenzten Speicher. */
function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, PERSIST_DEBOUNCE_MS);
}
/** v3 verankerte den Preis am Coupé und leitete die Limousine über einen Abschlag ab.
 *  Seit v4 ist es umgekehrt. Belege bleiben gültig, nur die beiden Felder wandern. */
function migrateV3(snap) {
  const m = snap.manual || {};
  if (typeof m.sedanDisc === "number") {
    const disc = clamp(m.sedanDisc, 0, 95) / 100;
    m.coupeAdd = Math.round((1 / Math.max(0.05, 1 - disc) - 1) * 100);
    delete m.sedanDisc;
  }
  // Der frühere Standardpreis war ein Coupé-Preis. Ohne Belege ist er als Limousinen-Anker falsch.
  if (m.car == null && (snap.ledgers?.price || []).length === 0) delete m.car;
  snap.v = SNAPSHOT_VERSION;
  return snap;
}

async function restore() {
  let raw = await store.get(STORE_KEY);
  let legacy = false;
  if (!raw) {
    raw = await store.get("r34planer:v3");
    legacy = !!raw;
  }
  if (!raw) return;
  try {
    const snap = JSON.parse(raw);
    applySnapshot(legacy ? migrateV3(snap) : snap);
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
  persist,
  persistSoon,
  restore,
  migrateV3,
};
