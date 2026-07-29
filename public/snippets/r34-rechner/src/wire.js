import { ymOf, fmtYm } from "./calendar.js";
import { BODIES, STORE_KEY, isSolid } from "./config.js";
import { eur, num, clamp, plural, esc } from "./format.js";
import { readStatement, combine, mergeBalances } from "./statement.js";
import { summarise, derive } from "./spending.js";
import { ALLFIELDS, LEDGERS } from "./catalog.js";
import {
  state,
  prov,
  ledgers,
  doneTasks,
  initState,
  runtime,
} from "./state.js";
import {
  store,
  persist,
  persistSoon,
  planSnapshot,
  normalizeSnapshot,
  snapshotSummary,
  encodeSnapshot,
  decodeSnapshot,
  adoptSnapshot,
  markSaved,
} from "./store.js";
import { adoptLive } from "./sources.js";
import { HELP } from "./help.js";
import { el, setSeg, setInput } from "./dom.js";
import {
  render,
  renderLedger,
  loadSources,
  resetMiniBaseline,
  clearSelectedPoint,
  spreadModalHTML,
  fundsTableHTML,
} from "./render.js";

/* ---- Feld-Verdrahtung ---- */
function wireFields() {
  ALLFIELDS.forEach((f) => {
    if (f.type === "seg") {
      el("seg_" + f.key).addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        setSeg("seg_" + f.key, btn.dataset.v);
        state[f.key] = btn.dataset.v;
        prov[f.key] = "manual";

        if (f.target && btn.dataset.p !== "") {
          const preset = parseFloat(btn.dataset.p);
          if (
            isFinite(preset) &&
            prov[f.target] !== "proof" &&
            prov[f.target] !== "manual"
          ) {
            state[f.target] = preset;
            setInput("f_" + f.target, preset);
          }
        }
        /* Die Wertsteigerung folgt der Karosserie, solange sie offen ist. Sobald sie
           steht — selbst eingetragen oder aus eigenen Inseraten übernommen —, bleibt
           sie stehen. Die frühere Bedingung prüfte nur auf „manual" und warf eine
           gemessene Rate beim nächsten Karosseriewechsel weg. */
        if (f.key === "r34Body" && !isSolid(prov.appr)) {
          state.appr = btn.dataset.v === BODIES.coupe ? 5 : 3;
          syncTopControls();
        }
        persistSoon();
        render();
      });
      return;
    }

    if (f.type === "toggle") {
      el("seg_" + f.key).addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        setSeg("seg_" + f.key, btn.dataset.v);
        state[f.key] = btn.dataset.v === "on";
        prov[f.key] = "manual";
        persistSoon();
        render();
      });
      return;
    }

    const node = el("f_" + f.key);
    if (!node) return;

    /* Nur eine echte Änderung ist eine Entscheidung. Vorher setzte jeder Tastendruck
       die Herkunft auf „von dir" — denselben Schätzwert noch einmal einzutippen senkte
       das Bandgewicht von 1,0 auf 0,4 und machte den Korridor schmaler, ohne dass eine
       Information dazugekommen wäre. */
    const take = (key, next) => {
      if (next !== state[key]) prov[key] = "manual";
      state[key] = next;
      persistSoon();
      render();
    };

    if (f.type === "month") {
      node.addEventListener("input", (e) => take(f.key, e.target.value));
      return;
    }
    if (f.type === "select") {
      node.addEventListener("change", (e) => take(f.key, Number(e.target.value)));
      return;
    }
    node.addEventListener("input", (e) => {
      if (f.ro) return;
      const v = parseFloat(e.target.value);
      /* Grenzen aus dem Katalog, Vorgabe ist „nicht negativ". Ohne das erzeugte ein
         negativer Verbrauch negative Spritkosten und damit Spielraum aus dem Nichts.
         Das Eingabefeld selbst wird nicht überschrieben, solange es den Fokus hat —
         darum kümmert sich setInput beim nächsten Render. */
      take(f.key, clamp(isNaN(v) ? 0 : v, f.min ?? 0, f.max ?? Infinity));
    });
  });
}

/* ---- Belege ---- */
function wireLedgers() {
  Object.keys(LEDGERS).forEach(renderLedger);

  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.add;
      const def = LEDGERS[id];
      const row = { date: ymOf(0) };

      def.cols.forEach((c) => {
        const node = document.querySelector(
          `[data-led="${id}"][data-col="${c.key}"]`,
        );
        if (!node) return;
        row[c.key] = c.type === "number" ? parseFloat(node.value) : node.value;
        if (c.type === "text" || c.type === "number") node.value = "";
      });

      const valid = def.valid
        ? def.valid(row)
        : isFinite(row.amt) && (def.allowNegative || row.amt > 0);
      if (!valid) return;
      if (id === "price" && !row.cur) row.cur = "EUR";
      ledgers[id].push(row);

      // Ein frischer Beleg hebt eine frühere Handeingabe auf
      if (id === "price") prov.car = "proof";
      if (id === "insR34") prov.r34InsY = "proof";
      if (id === "insDaily") prov.dailyInsY = "proof";

      persist();
      wireLedgers();
      render();
    });
  });

  document.querySelectorAll(".ldel").forEach((btn) => {
    btn.addEventListener("click", () => {
      ledgers[btn.dataset.led].splice(Number(btn.dataset.i), 1);
      persist();
      wireLedgers();
      render();
    });
  });
}

/* ---- Bedienelemente außerhalb des Feldkatalogs ---- */
function syncTopControls() {
  el("cap").value = state.cap;
  el("cap-val").textContent = eur(state.cap) + " €";
  el("appr").value = state.appr;
  el("appr-val").textContent = num(state.appr, 1) + " % / Jahr";
  setSeg("strat", state.strat);
  setSeg("method", state.method);
  setSeg("restGoal", state.restGoal);
  setSeg("seg_restTerm", state.restTerm);
  setInput("f_restYm", state.restYm);
  setInput("f_restAmount", state.restAmount);
  setInput("f_restRate", state.restRate);
}

function wireTopControls() {
  el("cap").addEventListener("input", (e) => {
    state.cap = Number(e.target.value);
    prov.cap = "manual";
    el("cap-val").textContent = eur(state.cap) + " €";
    persistSoon();
    render();
  });
  el("appr").addEventListener("input", (e) => {
    state.appr = Number(e.target.value);
    prov.appr = "manual";
    el("appr-val").textContent = num(state.appr, 1) + " % / Jahr";
    persistSoon();
    render();
  });

  const wireSeg = (id, key, after) => {
    el(id).addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      setSeg(id, btn.dataset.v);
      state[key] = btn.dataset.v;
      if (after) after();
      persistSoon();
      render();
    });
  };
  // Nach einem Moduswechsel passt der Bezugspunkt der Ergebnisleiste nicht mehr zur Zielgröße
  wireSeg("strat", "strat");
  wireSeg("method", "method", () => {
    resetMiniBaseline();
  });
  wireSeg("restGoal", "restGoal", () => {
    resetMiniBaseline();
  });

  el("seg_restTerm").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    setSeg("seg_restTerm", btn.dataset.v);
    state.restTerm = Number(btn.dataset.v);
    persistSoon();
    render();
  });

  el("refresh").addEventListener("click", loadSources);

  el("f_restYm").addEventListener("input", (e) => {
    state.restYm = e.target.value;
    prov.restYm = "manual";
    persistSoon();
    render();
  });
  [
    ["f_restAmount", "restAmount"],
    ["f_restRate", "restRate"],
  ].forEach(([id, key]) => {
    el(id).addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      state[key] = isNaN(v) ? 0 : v;
      persistSoon();
      render();
    });
  });
}

/* ---- Sichern und übertragen ---- */
/* ---- Sichern und übertragen ----

   Zwei Wege für zwei Lagen: eine Datei am Rechner, ein Textcode zwischen Handy und
   Rechner. Beide laufen durch dieselbe Prüfung, damit der Import nicht andere
   Vorstellungen vom Format hat als das Laden beim Start. */
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
    const blob = new Blob([JSON.stringify(snap, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `r34-plan-${ymOf(0)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    markSaved(snap);
    render();
  });

  el("importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      await take(JSON.parse(await file.text()), "der Datei");
    } catch {
      openBox("in");
      say("Die Datei ließ sich nicht lesen. Erwartet wird ein Export dieses Rechners.", true);
    } finally {
      e.target.value = "";
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
      copied = false;
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
let offeneBuchungen = [];
let kontoTyp = "giro";

/** Monatswerte, offene Posten und der abgeleitete Vorschlag. */
/* Eine kurze Rückmeldung, die beim nächsten Zeichnen wieder verschwindet. */
let meldung = "";
const melde = (text) => {
  meldung = text;
};

function zeigeUmsaetze() {
  const box = el("stmtSpend");
  if (!box) return;
  const bestaetigung = meldung
    ? `<div class="stmt-ok">${esc(meldung)}</div>`
    : "";
  meldung = "";
  const s = summarise(offeneBuchungen, ledgers.rules);
  const ab = derive(s);

  const monate = s.months
    .map(
      (m) =>
        `<tr><td>${fmtYm(m.month)}</td><td>${eur(m.leben)} €</td><td>${eur(m.auto)} €</td>` +
        `<td>${eur(m.einkommen)} €</td><td class="${m.offen > 0 ? "neg" : ""}">${eur(m.offen)} €</td></tr>`,
    )
    .join("");

  const knopf = (k, g, t) =>
    `<button type="button" class="act sm" data-cat="${k}" data-grp="${esc(g)}">${t}</button>`;
  /* Dreiundzwanzig Zeilen mit je vier Knöpfen sind keine Frage, sondern eine Wand.
     Gezeigt werden die sechs, die etwas ausmachen; der Rest steht als eine Zahl da und
     lässt sich aufklappen, wenn jemand ihn wirklich sortieren will. */
  const SICHTBAR = 6;
  const zeile = (g) =>
    `<div class="stmt-open"><span class="so-name">${esc(g.name)}</span>` +
    `<span class="so-meta">${plural(g.n, "Buchung", "Buchungen")} · ${eur(g.summe)} €</span>` +
    `<span class="so-acts">${knopf("leben", g.key, "Leben")}${knopf("auto", g.key, "Auto")}` +
    `${knopf("einmalig", g.key, "einmalig")}${knopf("umbuchung", g.key, "Umbuchung")}` +
    `${knopf("ignorieren", g.key, "egal")}</span></div>`;
  const rest = s.open.slice(SICHTBAR);
  const offen =
    s.open.slice(0, SICHTBAR).map(zeile).join("") +
    (rest.length
      ? `<details class="levrest"><summary>${plural(rest.length, "weiterer Posten", "weitere Posten")}, zusammen ${eur(rest.reduce((a, g) => a + g.summe, 0))} €</summary>${rest.map(zeile).join("")}</details>`
      : "");

  box.innerHTML =
    bestaetigung +
    `<div class="stmt-found"><b>${plural(offeneBuchungen.length, "Buchung", "Buchungen")}</b> gelesen` +
    `<table><thead><tr><th>Monat</th><th>Leben</th><th>Auto</th><th>Einkommen</th><th>offen</th></tr></thead>` +
    `<tbody>${monate}</tbody></table></div>` +
    (s.open.length
      ? `<div class="stmt-found">Diese Empfänger kennt der Rechner nicht. Einmal einsortieren, dann merkt er sie sich.` +
        `<button type="button" class="hbtn" data-help="kategorien">?</button></div>${offen}`
      : `<div class="stmt-found">Alles zugeordnet.</div>`) +
    (ab.ok ? kapazitaet(ab) : "") +
    (!ab.ok
      ? `<div class="stmt-hint">${esc(ab.reason)}</div>`
      : Math.abs(Math.round(ab.living) - state.living) < 1
        ? /* Steht der Wert schon, ist ein Knopf, der nichts tut, schlimmer als keiner —
             man klickt ihn, nichts passiert, und beim nächsten Einlesen wieder. */
          `<div class="stmt-hint">Die Lebenshaltung steht bereits auf ${eur(state.living)} € — Median aus ${plural(ab.months, "vollem Monat", "vollen Monaten")}.</div>`
        : `<div class="stmt-actions"><button type="button" class="act" id="spendApply">Lebenshaltung ${eur(state.living)} € → <b>${eur(ab.living)} €</b></button>` +
          `<span class="stmt-hint">Median aus ${plural(ab.months, "vollem Monat", "vollen Monaten")}, ohne einmalige Ausgaben</span></div>`);

  box.querySelectorAll("[data-cat]").forEach((btn) =>
    btn.addEventListener("click", () => {
      /* Aus der Antwort wird eine Regel. Der Gruppenschlüssel ist der normalisierte
         Empfängername — genau der Text, an dem die nächste Buchung wiedererkannt wird. */
      ledgers.rules.unshift({ pat: btn.dataset.grp, cat: btn.dataset.cat });
      persist();
      zeigeUmsaetze();
    }),
  );

  const rate = el("rateApply");
  if (rate)
    rate.addEventListener("click", () => {
      state.saveMode = "fixed";
      state.saveFixed = Number(rate.dataset.betrag);
      merkeImport();
      prov.saveFixed = "proof"; // aus echten Kontobewegungen, keine Schätzung
      setSeg("seg_saveMode", "fixed");
      setInput("f_saveFixed", state.saveFixed);
      merkeImport();
      persist();
      render();
      melde(`Dauerauftrag auf ${eur(state.saveFixed)} € gesetzt.`);
      zeigeUmsaetze();
    });

  const setzen = el("spendApply");
  if (setzen)
    setzen.addEventListener("click", () => {
      const frisch = derive(summarise(offeneBuchungen, ledgers.rules));
      if (!frisch.ok) return;
      state.living = Math.round(frisch.living);
      merkeImport();
      prov.living = "proof"; // aus echten Buchungen, keine Schätzung mehr
      setInput("f_living", state.living);
      persist();
      render();
      /* Neu zeichnen statt ersetzen. Vorher wurde der ganze Schritt durch eine
         Bestätigungszeile überschrieben — die eingelesenen Buchungen lagen noch im
         Speicher, aber man kam nicht mehr an sie heran und konnte weder den
         Dauerauftrag setzen noch weiter einsortieren. */
      melde(`Lebenshaltung auf ${eur(state.living)} € gesetzt.`);
      zeigeUmsaetze();
    });
}

/** Was sich realistisch überweisen lässt — und was davon jeden Monat trägt.
 *
 *  Der Median sagt, wie es im Normalfall aussieht; der schwächste Monat sagt, was ein
 *  Dauerauftrag verträgt. Seit das Tagesgeld eine Einbahnstraße ist, ist das kein
 *  Detail: ein Betrag über dem schwächsten Monat bedeutet Dispozinsen. */
/** Was auf dem Etikett steht. Die Fassungsnummer (052 gegen 053) hilft beim Lesen
 *  nicht und war im Zweifel falsch geraten — der Sparkassen-Export ist camt.052. */
const formatName = (f) =>
  f === "camt" ? "CAMT" : f === "csv" ? "CSV-CAMT" : "MT940";

/* Was von diesem Zeitraum schon einmal eingelesen wurde. Gemerkt werden Konto und
   Spanne, nie eine Buchung — es geht nur darum, nicht zum dritten Mal dieselbe
   Neuigkeit zu melden. */
let letzteEinlesung = null;

function bekannt(gelesen) {
  const konto = gelesen.accounts[0] || "";
  const frueher = (ledgers.imports || []).filter(
    (i) =>
      i.account === konto && !(i.to < gelesen.from || i.from > gelesen.to),
  );
  letzteEinlesung = {
    account: konto,
    from: gelesen.from,
    to: gelesen.to,
    at: new Date().toISOString().slice(0, 10),
  };
  if (!frueher.length) return "";
  const wann = frueher[frueher.length - 1].at;
  return `<div class="stmt-hint">Diesen Zeitraum hast du am ${wann.split("-").reverse().join(".")} schon einmal ausgewertet. Was du unten einsortierst, gilt weiterhin.</div>`;
}

/** Erst beim Übernehmen wird die Einlesung vermerkt — Ansehen allein zählt nicht. */
function merkeImport() {
  if (!letzteEinlesung) return;
  ledgers.imports = (ledgers.imports || []).filter(
    (i) =>
      !(
        i.account === letzteEinlesung.account &&
        i.from === letzteEinlesung.from &&
        i.to === letzteEinlesung.to
      ),
  );
  ledgers.imports.push(letzteEinlesung);
}

function kapazitaet(ab) {
  const k = ab.capacity;
  if (!k) return "";
  const sicher = Math.floor(Math.max(0, k.min) / 10) * 10;
  const offen = ab.openShare > 0.1;

  /* Vorher standen hier fünf Zahlen und ein Halbsatz. Wer das liest, weiß danach nicht,
     was er tun soll. Jetzt: ein Satz, was die Lage ist, ein Satz, was daraus folgt. */
  const lage = offen
    ? `Noch nicht belastbar: <b>${Math.round(ab.openShare * 100)} %</b> der Abflüsse sind nicht einsortiert. Die Zahlen unten zählen sie vorsichtshalber als Ausgabe — sortier oben ein, dann stimmen sie.`
    : sicher > 0
      ? `In jedem der ${plural(k.months, "erfassten Monate", "erfassten Monate")} blieben mindestens <b>${eur(k.min)} €</b> übrig. So viel trägt ein Dauerauftrag, ohne dass das Konto ins Minus geht.`
      : `In mindestens einem Monat blieb nichts übrig (${eur(k.min)} €). Ein fester Dauerauftrag würde dort ins Minus führen und Dispozinsen kosten — „alles Übrige" passt sich an.`;

  const zahlen =
    `<table class="stmt-nums"><tbody>` +
    `<tr><td>im Median übrig</td><td>${eur(k.median)} €</td></tr>` +
    `<tr><td>schwächster Monat</td><td>${eur(k.min)} €</td></tr>` +
    `<tr><td>bester Monat</td><td>${eur(k.max)} €</td></tr>` +
    (ab.oneOff && ab.oneOff.summe > 0
      ? `<tr><td>davon einmalig, nicht monatlich</td><td>${eur(ab.oneOff.summe)} €</td></tr>`
      : "") +
    `</tbody></table>`;

  return (
    `<div class="stmt-found"><b>Was übrig bleibt</b> — Einnahmen minus alles, was abfließt.` +
    zahlen +
    `<div class="stmt-lage">${lage}</div></div>` +
    (!offen && sicher > 0
      ? `<div class="stmt-actions"><button type="button" class="act" id="rateApply" data-betrag="${sicher}">Dauerauftrag auf ${eur(sicher)} € setzen</button></div>`
      : "")
  );
}

function wireStatement() {
  const input = el("stmtFile");
  const out = el("stmtResult");
  if (!input || !out) return;

  const zeigeFehler = (text) => {
    out.innerHTML = `<div class="stmt-bad">${esc(text)}</div>`;
  };

  /* Der CSV-Export der Sparkasse kommt in ISO-8859-1. `file.text()` nimmt UTF-8 an
     und macht aus „Begünstigter" Kauderwelsch — im Verwendungszweck bricht das die
     Erkennung. Deshalb wird streng als UTF-8 versucht und bei Fehlern umgeschaltet. */
  const lies = async (datei) => {
    const puffer = await datei.arrayBuffer();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(puffer);
    } catch {
      return new TextDecoder("windows-1252").decode(puffer);
    }
  };

  input.addEventListener("change", async (e) => {
    const dateien = [...e.target.files];
    e.target.value = ""; // dieselbe Auswahl soll erneut möglich sein
    if (!dateien.length) return;
    out.innerHTML = `<div class="stmt-found">${plural(dateien.length, "Datei wird gelesen", "Dateien werden gelesen")} …</div>`;

    let gelesen;
    try {
      const einzeln = [];
      for (const d of dateien) einzeln.push(readStatement(await lies(d)));
      gelesen = einzeln.length === 1 ? einzeln[0] : combine(einzeln);
    } catch {
      zeigeFehler("Die Dateien ließen sich nicht öffnen.");
      return;
    }
    if (!gelesen.ok) {
      zeigeFehler(gelesen.reason);
      return;
    }

    /* Vorschau gegen den vorhandenen Bestand: was ist neu, was ersetzt einen Wert, was
       steht schon genauso da. Sonst bestätigt man blind. */
    /* Welches Konto ist das? Die Frage ist nicht kosmetisch: das Soll-Ist führt den
       **Tagesgeldstand**, und ein Girokonto-Saldo dort wäre schlicht die falsche Zahl.
       Umgekehrt sind die Umsätze nur auf dem Girokonto interessant — aufs Tagesgeld
       geht nichts als Überträge.

       Geraten wird nach der Zahl der Buchungen je Monat: ein Girokonto hat Dutzende,
       ein Tagesgeldkonto zwei bis drei. Die Vermutung steht zur Korrektur bereit. */
    const monate = new Set(gelesen.entries.map((e) => e.month)).size || 1;
    kontoTyp = gelesen.entries.length / monate > 6 ? "giro" : "tagesgeld";

    if (!gelesen.balances.length) {
      out.innerHTML =
        `<div class="stmt-found"><b>${formatName(gelesen.format)}</b> · ` +
        `${plural(gelesen.entries.length, "Buchung", "Buchungen")} gelesen, keine Kontostände enthalten.</div>` +
        `<div class="stmt-actions"><button type="button" class="act" id="stmtCancel">verwerfen</button></div>`;
      offeneBuchungen = gelesen.entries || [];
      if (offeneBuchungen.length) zeigeUmsaetze();
      el("stmtCancel").addEventListener("click", () => {
        out.innerHTML = "";
        offeneBuchungen = [];
      });
      return;
    }
    const probe = mergeBalances(ledgers.actual, gelesen.balances);
    const vorhandeneStaende = new Map(ledgers.actual.map((r) => [r.month, Number(r.amt)]));
    const zeilen = gelesen.balances
      .map((b) => {
        const alt = vorhandeneStaende.get(b.month);
        const gleich = alt != null && Math.abs(alt - b.amt) < 0.005;
        const note = gleich
          ? "steht schon so"
          : alt != null
            ? `ersetzt ${eur(alt)} €`
            : "neu";
        return `<tr class="${gleich ? "dup" : ""}"><td>${fmtYm(b.month)}</td><td>${note}</td><td>${eur(b.amt)} €</td></tr>`;
      })
      .join("");

    const hinweise = gelesen.warnings.length
      ? `<div class="stmt-bad">${gelesen.warnings.map(esc).join(" ")}</div>`
      : "";
    const anzuwenden = probe.neu + probe.ersetzt;
    /* Der Ablauf hat vier Schritte, also steht er auch als vier Schritte da. Vorher war
       das ein durchgehender Block aus Tabelle, Frage, Tabelle, Liste und zwei Absätzen
       Text — sachlich richtig und trotzdem nicht zu lesen, weil nirgends stand, was
       gerade dran ist.

       Beide Kontoarten bekommen ihre eigenen Schritte 3 und 4; umgeschaltet wird durch
       Ein- und Ausblenden, damit die Auswertung beim Wechsel nicht neu rechnen muss. */
    out.innerHTML =
      `<ol class="steps">` +
      `<li><h4>Datei gelesen</h4><div class="stmt-found">` +
      `<b>${formatName(gelesen.format)}</b> · ${fmtYm(gelesen.from)} bis ${fmtYm(gelesen.to)}` +
      (gelesen.files > 1 ? ` · ${plural(gelesen.files, "Datei", "Dateien")}` : "") +
      (gelesen.accounts.length === 1 ? ` · ${esc(gelesen.accounts[0])}` : "") +
      bekannt(gelesen) +
      `</div>${hinweise}</li>` +

      /* Das Soll-Ist führt den Tagesgeldstand. Ein Girokonto-Saldo gehört dort nicht
         hinein: er schwankt mit Miete und Gehalt und sagt über das Ersparte nichts.
         Umgekehrt sind die Umsätze nur auf dem Girokonto interessant.

         Geraten wird nach Buchungen je Monat: ein Girokonto hat Dutzende, ein
         Tagesgeldkonto zwei bis drei. Die Vermutung steht zur Korrektur. */
      `<li><h4>Welches Konto ist das?</h4>` +
      `<span class="seg seg-sm" id="stmtTyp">` +
      `<button type="button" data-t="giro"${kontoTyp === "giro" ? ' class="on"' : ""}>Girokonto</button>` +
      `<button type="button" data-t="tagesgeld"${kontoTyp === "tagesgeld" ? ' class="on"' : ""}>Tagesgeld</button>` +
      `</span>` +
      `<div class="stmt-hint" id="stmtGiroNote">Der Rechner liest daraus die Ausgaben. Die Kontostände bleiben außen vor — das Soll-Ist misst das Tagesgeld.</div>` +
      `<div class="stmt-hint" id="stmtTgNote">Die Monatsstände wandern ins Soll-Ist, daran misst sich der Plan.</div></li>` +

      `<li id="stepGiro"><h4>Buchungen einsortieren</h4><div id="stmtSpend"></div></li>` +

      `<li id="stepTg"><h4>Stände prüfen und übernehmen</h4>` +
      `<div class="stmt-found"><table><tbody>${zeilen}</tbody></table></div>` +
      `<div class="stmt-actions">` +
      (anzuwenden
        ? `<button type="button" class="act" id="stmtApply">${plural(anzuwenden, "Stand übernehmen", "Stände übernehmen")}</button>`
        : `<span class="stmt-hint">Alles steht bereits so im Plan.</span>`) +
      `</div></li>` +
      `</ol>` +
      `<div class="stmt-actions"><button type="button" class="act" id="stmtCancel">verwerfen</button></div>`;

    /* Umschalten blendet nur um — die Vorschau selbst bleibt stehen, damit man den
       Vergleich der Monatsstände nicht verliert. */
    const zeigeTyp = () => {
      const giro = kontoTyp === "giro";
      for (const [id, zeigen] of [
        ["stmtGiroNote", giro],
        ["stmtTgNote", !giro],
        ["stepGiro", giro],
        ["stepTg", !giro],
      ]) {
        const n = el(id);
        if (n) n.hidden = !zeigen;
      }
    };
    el("stmtTyp").addEventListener("click", (ev) => {
      const b = ev.target.closest("button");
      if (!b) return;
      kontoTyp = b.dataset.t;
      setSeg("stmtTyp", kontoTyp);
      zeigeTyp();
    });
    zeigeTyp();

    offeneBuchungen = gelesen.entries || [];
    if (offeneBuchungen.length) zeigeUmsaetze();

    const apply = el("stmtApply");
    if (apply)
      apply.addEventListener("click", () => {
        const { rows } = mergeBalances(ledgers.actual, gelesen.balances);
        ledgers.actual.length = 0;
        ledgers.actual.push(...rows);
        merkeImport();
        const schritt = el("stepTg");
        if (schritt)
          schritt.innerHTML =
            `<h4>Stände prüfen und übernehmen</h4>` +
            `<div class="stmt-ok">${plural(anzuwenden, "Stand übernommen", "Stände übernommen")}. Der Plan misst sich ab jetzt daran.</div>`;
        persist();
        renderLedger("actual");
        render();
      });
    el("stmtCancel").addEventListener("click", () => {
      out.innerHTML = "";
      offeneBuchungen = [];
    });
  });
}

/** Ob diese Ansicht überhaupt Dateien herausgeben darf.
 *
 *  Snippets laufen in einem iframe mit `sandbox`-Liste. Fehlt dort `allow-downloads`,
 *  verweigert der Browser den Download wortlos — kein Fehler, kein Ereignis, nur eine
 *  Zeile in der Konsole. Die Liste lässt sich am eigenen Rahmen ablesen, solange er
 *  denselben Ursprung hat.
 *
 *  Ist der Rahmen unlesbar, ist er von fremdem Ursprung abgeschottet — dann gilt die
 *  Sperre erst recht. Kein Rahmen heißt eigener Tab, dort geht alles. */
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


/* ---- Hilfe und Erklär-Modal ---- */
const MODALS = {
  spread: { t: "Woher die Spanne kommt", html: spreadModalHTML },
  funds: {
    t: "Wohin das Geld fließt",
    html: () => fundsTableHTML(state, runtime.lastRun),
  },
};

function wireHelp() {
  const backdrop = el("backdrop");
  const closeHelp = () => {
    backdrop.hidden = true;
  };
  const open = (title, body, links) => {
    el("m-title").textContent = title;
    el("m-body").innerHTML = body;
    el("m-links").innerHTML = (links || [])
      .map(
        (x) =>
          `<a href="${x.h}" target="_blank" rel="noopener noreferrer">${x.n} ↗</a>`,
      )
      .join("");
    backdrop.hidden = false;
    el("m-close").focus();
  };

  document.addEventListener("click", (e) => {
    const dyn = e.target.closest("[data-modal]");
    if (dyn) {
      e.preventDefault();
      const m = MODALS[dyn.dataset.modal];
      if (m) open(m.t, m.html());
      return;
    }
    const btn = e.target.closest(".hbtn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const h = HELP[btn.dataset.help];
    if (h) open(h.t, h.b, h.l);
  });

  el("m-close").addEventListener("click", closeHelp);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeHelp();
  });
}

/* ---- Ergebnisleiste beim Scrollen ---- */
function watchHero() {
  const hero = el("hero");
  const mini = el("resultbar");
  const sync = () =>
    mini.classList.toggle("on", hero.getBoundingClientRect().bottom < 8);

  if (typeof IntersectionObserver === "function") {
    new IntersectionObserver(
      ([entry]) => mini.classList.toggle("on", !entry.isIntersecting),
      {
        rootMargin: "-8px 0px 0px 0px",
      },
    ).observe(hero);
  } else {
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    sync();
  }
  mini.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }),
  );
}

/* ---- Zurücksetzen ---- */
function wireReset() {
  el("reset").addEventListener("click", () => {
    if (
      !confirm("Alle Eingaben, Belege und erfassten Kontostände zurücksetzen?")
    )
      return;

    initState();
    Object.keys(ledgers).forEach((k) => {
      ledgers[k] = [];
    });
    Object.keys(doneTasks).forEach((k) => delete doneTasks[k]);
    Object.assign(state, {
      cap: 0,
      appr: 4,
      strat: "dailyfirst",
      method: "cash",
      restGoal: "date",
      restTerm: 3,
      restAmount: 10000,
      restRate: 350,
    });
    resetMiniBaseline();
    clearSelectedPoint();

    ALLFIELDS.forEach((f) => {
      if (f.type === "seg") setSeg("seg_" + f.key, f.def);
      else if (f.type === "toggle")
        setSeg("seg_" + f.key, f.def ? "on" : "off");
      else setInput("f_" + f.key, f.def);
    });
    syncTopControls();
    adoptLive();
    ALLFIELDS.forEach((f) => setInput("f_" + f.key, state[f.key]));
    persist();
    wireLedgers();
    render();
  });
}

export {
  wireFields,
  wireLedgers,
  syncTopControls,
  wireTopControls,
  wireBackup,
  wireStatement,
  MODALS,
  wireHelp,
  watchHero,
  wireReset,
};
