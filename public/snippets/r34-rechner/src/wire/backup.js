/* ============================================================
   Sichern und übertragen: Datei, Textcode, Zwischenablage
   ============================================================ */
import { ymOf } from "../calendar.js";
import { el, von } from "../dom.js";
import { plural } from "../format.js";
import { render } from "../render.js";
import { adoptSnapshot, markSaved } from "../store.js";
import { normalizeSnapshot, planSnapshot, snapshotSummary } from "../snapshot.js";
import { decodeSnapshot, encodeSnapshot } from "../plancode.js";
import { runtime } from "../state.js";
import { planCsv } from "../plancsv.js";

function wireBackup() {
  const box = el("codeBox");
  const area = el("codeText");
  const hint = el("codeHint");

  const say = (text, bad = false) => {
    if (!hint) return;
    hint.textContent = text;
    hint.className = bad ? "lhint bad" : "lhint";
  };
  const openBox = (mode) => {
    box.hidden = false;
    box.dataset.mode = mode;
    el("codeApply").hidden = mode !== "in";
  };
  const closeBox = () => {
    box.hidden = true;
    area.value = "";
    say("");
  };

  /** Einen geprüften Plan übernehmen — mit Rückfrage, weil er den aktuellen ersetzt. */
  const take = async (raw, quelle) => {
    const check = normalizeSnapshot(raw);
    if (!check.ok) {
      say(check.reason, true);
      return false;
    }
    const ok = window.confirm(
      `Plan aus ${quelle} übernehmen?\n\n${snapshotSummary(check.snap)}\n\n` +
        "Der Plan auf diesem Gerät wird dabei ersetzt.",
    );
    if (!ok) return false;
    await adoptSnapshot(check.snap);
    location.reload();
    return true;
  };

  /* Die Monatswerte sind Beiwerk, kein Plan: sie lassen sich nicht zurücklesen, und
     der Sicherungsstand ändert sich durch den Export nicht. */
  el("exportCsv").addEventListener("click", () => {
    if (downloadsBlocked()) {
      say("Dateien sind in dieser Ansicht gesperrt. Öffne den Rechner in einem eigenen Tab.");
      return;
    }
    const run = runtime.lastRun;
    if (!run?.path?.length) {
      say("Noch kein gerechneter Verlauf — ändere eine Zahl, dann steht die Tabelle bereit.");
      return;
    }
    lade(
      `r34-monatswerte-${ymOf(0)}.csv`,
      new Blob([planCsv(run, runtime.lastForecast)], {
        type: "text/csv;charset=utf-8",
      }),
    );
    say(`${run.path.length} Monatszeilen als Tabelle gespeichert.`);
  });

  el("export").addEventListener("click", async () => {
    const snap = planSnapshot();
    /* Ein blockierter Download wirft nichts: der Browser verweigert ihn und schreibt
       nur in die Konsole. Der Klick sieht aus, als hätte er gewirkt, und es passiert
       nichts. Deshalb wird vorher gefragt, statt hinterher zu hoffen. */
    if (downloadsBlocked()) {
      const code = await encodeSnapshot(snap);
      openBox("out");
      area.value = code;
      area.select();
      markSaved(snap);
      say(
        "Dateien sind in dieser Ansicht gesperrt. Nimm den Code — er enthält denselben Plan.",
      );
      render();
      return;
    }
    lade(
      `r34-plan-${ymOf(0)}.json`,
      new Blob([JSON.stringify(snap, null, 2)], { type: "application/json" }),
    );
    markSaved(snap);
    render();
  });

  el("importFile").addEventListener("change", async (e) => {
    const file = von(e).files[0];
    if (!file) return;
    try {
      await take(JSON.parse(await file.text()), "der Datei");
    } catch {
      openBox("in");
      say("Die Datei ließ sich nicht lesen. Erwartet wird ein Export dieses Rechners.", true);
    } finally {
      von(e).value = "";
    }
  });

  el("copyCode").addEventListener("click", async () => {
    const snap = planSnapshot();
    const code = await encodeSnapshot(snap);
    openBox("out");
    area.value = code;
    area.focus();
    area.select();
    /* Die Zwischenablage ist nicht überall erlaubt — in unsicherem Kontext und in
       manchen mobilen Browsern gar nicht. Deshalb steht der Code immer sichtbar im
       Feld, und das Kopieren ist die Zugabe, nicht der Weg. */
    let copied = false;
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
    } catch {
      /* bleibt bei false — der Code steht sichtbar im Feld */
    }
    markSaved(snap);
    say(
      copied
        ? `Kopiert — ${plural(code.length, "Zeichen", "Zeichen")}. Schick ihn dir selbst und füg ihn auf dem anderen Gerät ein.`
        : "Markiert. Kopier den Code von Hand und füg ihn auf dem anderen Gerät ein.",
    );
    render();
  });

  el("pasteCode").addEventListener("click", async () => {
    openBox("in");
    area.value = "";
    say("Code hier einfügen, dann übernehmen.");
    area.focus();
    try {
      const text = await navigator.clipboard.readText();
      if (CODE_LOOKS_RIGHT.test(text)) {
        area.value = text.trim();
        say("Code aus der Zwischenablage eingesetzt. Übernehmen?");
      }
    } catch {
      /* Lesen aus der Zwischenablage ist fast überall gesperrt — das ist der Normalfall */
    }
  });

  el("codeApply").addEventListener("click", async () => {
    /* Angenommen wird beides: der kurze Code und der Inhalt einer exportierten
       JSON-Datei. Wer eine Datei nicht hochladen kann — gesperrter Dateidialog,
       Datei liegt in einer Chat-App —, macht sie auf und fügt den Text ein. */
    const text = area.value.trim();
    let snap = await decodeSnapshot(text);
    if (!snap && text.startsWith("{")) {
      try {
        snap = JSON.parse(text);
      } catch {
        snap = null;
      }
    }
    if (!snap) {
      say(
        "Das ist weder ein Plan-Code noch ein exportierter Plan. Der Code beginnt mit R34, die Datei mit einer geschweiften Klammer.",
        true,
      );
      return;
    }
    await take(snap, "der Eingabe");
  });

  el("codeClose").addEventListener("click", closeBox);
}


const CODE_LOOKS_RIGHT = /^\s*R34[01]:/;

/* ---- Kontoauszug einlesen ----

   Die Datei wird gelesen, gezeigt und erst nach Bestätigung übernommen. Ohne die
   Zwischenstufe wüsste niemand, was gleich in seinen Plan wandert — und ein Auszug mit
   dem falschen Konto fällt sonst erst Wochen später auf. */
/* Die gelesenen Buchungen leben nur so lange, wie der Bereich offen ist. Sie werden
   nicht gespeichert — gemerkt wird am Ende die Regel, nicht die Buchung. */


/** Ob diese Ansicht überhaupt Dateien herausgeben darf.
 *
 *  Snippets laufen in einem iframe mit `sandbox`-Liste. Fehlt dort `allow-downloads`,
 *  verweigert der Browser den Download wortlos — kein Fehler, kein Ereignis, nur eine
 *  Zeile in der Konsole. Die Liste lässt sich am eigenen Rahmen ablesen, solange er
 *  denselben Ursprung hat.
 *
 *  Ist der Rahmen unlesbar, ist er von fremdem Ursprung abgeschottet — dann gilt die
 *  Sperre erst recht. Kein Rahmen heißt eigener Tab, dort geht alles. */
/** Eine Datei anbieten. Steht einmal da, weil es zwei Knöpfe gibt. */
function lade(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


function downloadsBlocked() {
  try {
    const frame = window.frameElement;
    if (!frame) return false;
    /* Gelesen wird das Attribut, nicht `frame.sandbox`: die Spiegelung als
       DOMTokenList fehlt in manchen Umgebungen, das Attribut steht immer da.
       Ein leeres `sandbox=""` ist die schärfste Stufe und sperrt ebenfalls. */
    if (!frame.hasAttribute("sandbox")) return false;
    const tokens = (frame.getAttribute("sandbox") || "")
      .toLowerCase()
      .split(/\s+/);
    return !tokens.includes("allow-downloads");
  } catch {
    return true;
  }
}
export { wireBackup };
