/* ============================================================
   Der Plan als Dokument

   Was gesichert wird, wie es zurückkommt und wie ältere Stände nachgezogen werden.
   Gesichert wird nur, was von Hand gesetzt wurde — Vorgaben stehen im Katalog.
   ============================================================ */
import { FIELD_BY_KEY } from "./catalog.js";
import { SNAPSHOT_VERSION } from "./config.js";
import { clamp, plural } from "./format.js";
import { sanitizeSnapshot } from "./planguard.js";
import { SOURCES } from "./sources.js";
import { UI_KEYS, doneTasks, ledgers, prov, state } from "./state.js";


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


/* ============================================================
   Fremde Pläne prüfen

   Ein Plan kommt aus einer Datei, einem Textcode oder dem Browserspeicher — in jedem
   Fall aus einer Quelle, die nicht dieser Code ist. Vorher wanderte der Inhalt
   ungeprüft in lebende Objekte: `state[k] = v` für jeden Schlüssel, den die Datei
   nannte, und `ledgers[k] = rows` als Referenz auf ein fremdes Array. Zwei Folgen:

   1. `__proto__` ist nach `JSON.parse` ein gewöhnlicher Schlüssel, `obj[k] = v` damit
      aber ein Schreibzugriff auf den Prototyp.
   2. Freitext beliebiger Länge und beliebiger Form landete in Tabellen, die er später
      gerendert bekommt. Das Escaping an der Render-Stelle ist die zweite Verteidigung,
      diese hier ist die erste.

   Geprüft wird an einer Stelle. `normalizeSnapshot` (Datei, Code, Speicher) und
   `applySnapshot` laufen beide hier durch; die Prüfung ist mehrfach anwendbar.
   ============================================================ */


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


function applySnapshot(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  /* Auch hier geprüft, nicht nur in `normalizeSnapshot`: Aufrufer sollen sich nicht
     merken müssen, welcher Weg vorher schon gelaufen ist. Die Prüfung ist billig und
     mehrfach anwendbar. */
  const snap = sanitizeSnapshot(raw);

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
  /* Die geprüften Zeilen sind neu gebaut, keine Referenz auf das fremde Array — ein
     bereits erstellter Export ändert sich damit nicht nachträglich mit. */
  Object.entries(snap.ledgers).forEach(([k, rows]) => {
    if (ledgers[k]) ledgers[k] = rows;
  });
  Object.entries(snap.doneTasks).forEach(([k, v]) => {
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
  return { ok: true, snap: sanitizeSnapshot(migrate(structuredClone(raw))) };
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
export { isDefaultValue, planSnapshot, applySnapshot, migrate, normalizeSnapshot, snapshotSummary };
