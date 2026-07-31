/* ============================================================
   Kontoauszug einlesen

   Die Datei wird gelesen, gezeigt und erst nach Bestätigung übernommen. Die
   gelesenen Buchungen leben nur so lange, wie der Bereich offen ist — gemerkt
   wird am Ende die Regel, nie die Buchung.
   ============================================================ */
import { fmtYm } from "../calendar.js";
import { el, setInput, setSeg, alle, von } from "../dom.js";
import { esc, eur, plural } from "../format.js";
import { render } from "../render.js";
import { derive, summarise } from "../spending.js";
import { ledgers, prov, state } from "../state.js";
import { combine, mergeBalances, readStatement } from "../statement.js";
import { persist } from "../store.js";
import { renderLedger } from "../view/ledger.js";

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

  alle(box, "[data-cat]").forEach((btn) =>
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
    const dateien = [...von(e).files];
    von(e).value = ""; // dieselbe Auswahl soll erneut möglich sein
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
      /* `data-v`, nicht `data-t`: setSeg vergleicht genau dieses Attribut. Mit `data-t`
         verloren nach dem Klick beide Knöpfe die Markierung. */
      `<button type="button" data-v="giro"${kontoTyp === "giro" ? ' class="on"' : ""}>Girokonto</button>` +
      `<button type="button" data-v="tagesgeld"${kontoTyp === "tagesgeld" ? ' class="on"' : ""}>Tagesgeld</button>` +
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
      for (const [id, zeigen] of /** @type {[string, boolean][]} */ ([
        ["stmtGiroNote", giro],
        ["stmtTgNote", !giro],
        ["stepGiro", giro],
        ["stepTg", !giro],
      ])) {
        const n = el(id);
        if (n) n.hidden = !zeigen;
      }
    };
    el("stmtTyp").addEventListener("click", (ev) => {
      const b = von(ev).closest("button");
      if (!b) return;
      kontoTyp = b.dataset.v;
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
export { wireStatement };
