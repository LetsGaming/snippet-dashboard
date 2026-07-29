/* ============================================================
   3 — Konstanten
   ============================================================ */
const SIM_HORIZON_MONTHS = 480;
const SIM_TAIL_MONTHS = 24;
const DAILY_FORCE_AFTER = 6;
const LIEBHABER_Y = 800;
const LIEBHABER_FALLBACK_Y = 1540;
/* Der Schlüssel bleibt v4: die Form des Schnappschusses ist unverändert, nur die
   Fassung zählt hoch. Ein neuer Schlüssel würde jeden gespeicherten Plan verwerfen. */
const STORE_KEY = "r34planer:v4";
const SNAPSHOT_VERSION = 8;
const FETCH_TIMEOUT_MS = 8000;
const PERSIST_DEBOUNCE_MS = 400;
const HEAVY_DEBOUNCE_MS = 160;
/* Die Vorschau zieht ein paar hundert Simulationen — sie wartet länger als der Rest. */
const FORECAST_DEBOUNCE_MS = 450;
const MINI_SETTLE_MS = 2000;
const LEFTOVER_TIGHT = 150;
const VISIT_KEY = "r34planer:lastVisit";
/* Fingerabdruck des zuletzt gesicherten Plans — daran hängt die Erinnerung ans Sichern. */
const BACKUP_KEY = "r34planer:lastBackup";
const VISIT_MIN_DAYS = 3;

/** Saisonkennzeichen ist auf 2 bis 11 Monate begrenzt. */
const SEASON_MIN = 2;
const SEASON_MAX = 11;

/** „Tritt nie ein" für abgeleitete Termine, wenn das zugrunde liegende Datum fehlt.
 *  Als Vergleichswert in der Simulation brauchbar, als Datum nicht — wer daraus ein
 *  Feld befüllt, landet im Jahr 85359. Deshalb immer erst gegen NEVER prüfen. */
const NEVER = 1e6;

/* Länger als ein Jahr vor der Prüfung zahlt niemand Fahrschulgebühren — die
   Theorieprüfung verfällt nach zwölf Monaten, und so lange hält auch keine Fahrschule
   den Vertrag offen. Steht die Prüfung weiter weg, beginnt die Ausbildung eben später
   statt heute. */
const LICENCE_MAX_MONTHS = 12;

const SF_CURVES = {
  Fahranfänger: [2.3, 1.8, 1.5, 1.3, 1.15],
  Zweitwagen: [1.3, 1.2, 1.1],
  Erfahren: [1.0],
};
const sfAt = (level, years) => {
  const c = SF_CURVES[level] ?? [1];
  const y = Math.max(0, years);
  return y < c.length ? c[y] : 1.0;
};

/* Wie stark eine Zahl streut, hängt daran, woher sie kommt. Eine belegte Zahl kann
   sich noch ändern, aber nicht mehr um ihre volle Bandbreite. Grundlage des Korridors. */
const BAND_WEIGHT = {
  guess: 1,
  preset: 0.8,
  derived: 0.8,
  live: 0.6,
  manual: 0.4,
  proof: 0.25,
  calc: 0,
};

/* Zwei Ebenen statt fünf Etiketten: steht die Zahl, oder ist sie noch offen?
   Das Detail — woher genau — steckt im Tooltip, nicht im Feld. */
const PROV_META = {
  live: {
    solid: true,
    short: "live",
    long: "kommt live aus einer offenen Schnittstelle",
  },
  /* Für Zahlen, die aus einer Live-Reihe über eine Faustregel entstehen: der HVPI
     als Lohnentwicklung, der Einlagesatz minus 0,25 als Tagesgeldzins. Die Quelle
     ist gemessen, die Übertragung nicht — das Etikett „live" hätte hier ein
     Bandgewicht von 0,6 gerechtfertigt, das die Regel nicht verdient. */
  derived: {
    solid: false,
    short: "abgeleitet",
    long: "folgt über eine Faustregel aus einer Live-Reihe, die etwas anderes misst",
  },
  calc: {
    solid: true,
    short: "berechnet",
    long: "wird aus Gesetz, Datum oder anderen Feldern gerechnet",
  },
  proof: {
    solid: true,
    short: "belegt",
    long: "stammt aus einem echten Angebot oder aus erfassten Kontoständen",
  },
  manual: { solid: true, short: "von dir", long: "hast du selbst eingetragen" },
  preset: {
    solid: false,
    short: "Vorgabe",
    long: "ist voreingestellt und noch nicht von dir geprüft — schau einmal drüber",
  },
  guess: {
    solid: false,
    short: "geschätzt",
    long: "ist noch geraten — belegen macht den Korridor schmaler",
  },
};
const isSolid = (p) => !!(PROV_META[p] && PROV_META[p].solid);

const NORMS = [
  "Euro 3+",
  "Euro 2",
  "Euro 1",
  "Euro 0 bedingt",
  "ohne Einstufung",
];
const MONTHS = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];
const BODIES = { sedan: "Limousine", coupe: "Coupé", both: "beide" };

export {
  SIM_HORIZON_MONTHS,
  SIM_TAIL_MONTHS,
  DAILY_FORCE_AFTER,
  LIEBHABER_Y,
  LIEBHABER_FALLBACK_Y,
  STORE_KEY,
  SNAPSHOT_VERSION,
  FETCH_TIMEOUT_MS,
  PERSIST_DEBOUNCE_MS,
  HEAVY_DEBOUNCE_MS,
  FORECAST_DEBOUNCE_MS,
  MINI_SETTLE_MS,
  LEFTOVER_TIGHT,
  VISIT_KEY,
  BACKUP_KEY,
  VISIT_MIN_DAYS,
  SEASON_MIN,
  SEASON_MAX,
  NEVER,
  LICENCE_MAX_MONTHS,
  SF_CURVES,
  sfAt,
  BAND_WEIGHT,
  PROV_META,
  isSolid,
  NORMS,
  MONTHS,
  BODIES,
};
