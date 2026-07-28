import { ymOf } from "./calendar.js";
import { state, prov } from "./state.js";
import { ledgers, doneTasks } from "./ledgers.js";
import { priceFromLedger } from "./pricing.js";
import { isUnsaved } from "./store.js";

const DONE_HIDE_DAYS = 30;

/* Wiederkehrende Schritte. `when` entscheidet, ob der Punkt gerade ansteht;
   `gain` beschreibt, was er bringt. Erledigtes bleibt bis zum nächsten Fällig-Werden weg. */
const TASKS = [
  {
    id: "priceLedger",
    proves: ["car"],
    text: "Fünf Inserate für die gewählte Karosserie erfassen",
    effort: "20 Min.",
    when: () => priceFromLedger() == null || priceFromLedger().n < 5,
    gain: () => {
      const pl = priceFromLedger();
      return pl
        ? `${pl.n} von 5 erfasst — der Median trägt ab fünf Zeilen`
        : "Der Kaufpreis ist der größte einzelne Hebel und noch komplett geschätzt";
    },
    jump: "grp_body",
  },
  {
    id: "livingProof",
    proves: ["living"],
    text: "Lebenshaltung aus echten Kontoständen ableiten",
    effort: "5 Min. im Monat",
    when: () => prov.living === "guess",
    gain: () =>
      "Zwei erfasste Monatsstände genügen, dann rechnet der Plan sie selbst aus",
    jump: "trackPanel",
  },
  {
    id: "trackMonthly",
    text: "Kontostand für diesen Monat eintragen",
    effort: "1 Min.",
    when: () => !ledgers.actual.some((r) => r.month === ymOf(0)),
    gain: () => {
      const n = ledgers.actual.length;
      return n < 2
        ? `${n} von 2 Ständen — ab dem zweiten misst der Plan deine echte Sparrate`
        : "Hält den Soll-Ist-Vergleich aktuell";
    },
    jump: "trackPanel",
  },
  {
    id: "insR34",
    proves: ["r34InsY"],
    text: "Versicherungsangebot für den R34 einholen",
    effort: "30 Min.",
    when: () => prov.r34InsY !== "proof",
    gain: () =>
      "Die Spanne zwischen Anbietern ist vierstellig — das entscheidet über den Spielraum danach",
    jump: "grp_r34",
  },
  {
    id: "insDaily",
    proves: ["dailyInsY"],
    text: "Versicherungsangebot fürs Alltagsauto einholen",
    effort: "20 Min.",
    when: () => prov.dailyInsY !== "proof",
    gain: () =>
      "Läuft die ganze Sparphase mit und wirkt damit direkt auf den Termin",
    jump: "grp_daily",
  },
  {
    id: "netProof",
    proves: ["netNow"],
    text: "Netto aus der letzten Abrechnung übernehmen",
    effort: "2 Min.",
    when: () => prov.netNow === "guess" || !ledgers.income.length,
    gain: () => "Zweitstärkster Hebel nach der Lebenshaltung",
    jump: "grp_facts",
  },
  {
    id: "licence",
    proves: ["licence"],
    text: "Zwei Fahrschulangebote vergleichen",
    effort: "20 Min.",
    when: () => !state.licenseOwned && prov.licence === "guess",
    gain: () => "Einmalig fällig, verschiebt den Termin um etwa einen Monat",
    jump: "grp_facts",
  },
  {
    id: "backup",
    text: "Plan sichern oder aufs andere Gerät holen",
    effort: "10 Sek.",
    /* Nicht „einmal erledigt und dann dreißig Tage Ruhe": der Punkt kommt zurück,
       sobald sich der Plan seit der letzten Sicherung inhaltlich bewegt hat. */
    when: () => ledgers.price.length + ledgers.actual.length >= 3 && isUnsaved(),
    gain: () =>
      "Der Browserspeicher überlebt keinen geleerten Cache und keinen Gerätewechsel. Der Code überträgt den ganzen Plan in einer Nachricht an dich selbst",
    jump: "backupPanel",
  },
];

/** Offene Schritte: was gerade ansteht und nicht kürzlich abgehakt wurde. */
function openTasks() {
  const now = Date.now();
  return TASKS.filter((t) => {
    const done = doneTasks[t.id];
    if (done && (now - new Date(done).getTime()) / 86400000 < DONE_HIDE_DAYS)
      return false;
    return t.when();
  });
}

export { TASKS, openTasks, DONE_HIDE_DAYS };
