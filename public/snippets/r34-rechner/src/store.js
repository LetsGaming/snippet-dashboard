/* ============================================================
   Speicher

   Sichern und Zurückholen im Browser. Der Plan selbst liegt in snapshot.js,
   die Prüfung fremder Pläne in planguard.js, der Textcode in plancode.js.
   ============================================================ */
import { BACKUP_KEY, PERSIST_DEBOUNCE_MS, STORE_KEY } from "./config.js";
import { applySnapshot, normalizeSnapshot, planSnapshot } from "./snapshot.js";

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
  adoptSnapshot,
  markSaved,
  isUnsaved,
  fingerprint,
  persist,
  persistSoon,
  restore,
};
