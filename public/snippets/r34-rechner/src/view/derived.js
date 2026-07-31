/* ============================================================
   Abgeleitete Zahlen — was aus den Eingaben folgt, Zeile für Zeile
   ============================================================ */
import { refresh } from "../refresh.js";
import { BASE_ABS, dat, idxFromYm } from "../calendar.js";
import { LICENCE_MAX_MONTHS, MONTHS, SEASON_MAX, SEASON_MIN } from "../config.js";
import { el, helpBtn } from "../dom.js";
import { esc, eur, num, plural } from "../format.js";
import {
  APPR_MIN_ROWS,
  APPR_MIN_SPAN,
  apprFromLedger,
  dailyPremiumBase,
  dailyRunAt,
  dailyTaxYear,
  importCost,
  priceFromLedger,
  r34PremiumBase,
  r34RunAt,
} from "../pricing.js";
import { mittleresSparen, savingMarks } from "../simulate.js";
import {
  age25Month,
  gradePrice,
  hMonth,
  licenceMonth,
  prov,
  resolveSf,
  seasonMonths,
  seasonTaxFactor,
  seasonValid,
  state,
} from "../state.js";
import { persist } from "../store.js";
import { EZ_CO2_START, TAX, kfzTaxYear } from "../tax.js";
import { syncTopControls } from "../topcontrols.js";


/* ---- abgeleitete Zeilen ---- */
function renderDerived(s, r) {
  /* Der Zahlungszeitraum der Fahrschule ist abgeleitet, nicht eingegeben — das war
     vorher ein eigenes Feld und ist eine Frage, deren Antwort schon im Prüfungstermin
     steht. Genau deshalb muss die Annahme sichtbar sein: eine Zahl, die niemand mehr
     eintippt und auch nirgends liest, ist eine Falle. */
  const derF = el("der_facts");
  if (derF) {
    const licM = Math.max(0, licenceMonth(s));
    const spanne = Math.max(1, Math.min(licM + 1, LICENCE_MAX_MONTHS));
    derF.innerHTML = s.licenseOwned
      ? "Führerschein vorhanden — keine Ausbildungskosten im Plan."
      : `Fahrschule: <b>${eur(s.licence)} €</b> über ${plural(spanne, "Monat", "Monate")} bis ${dat(licM)} = <b>${eur(s.licence / spanne)} €/M</b>` +
        `<span class="mute">Gerechnet wird von heute bis zur Prüfung — bis dahin ist die Ausbildung bezahlt. ` +
        (licM + 1 > LICENCE_MAX_MONTHS
          ? `Bei einem Termin so weit voraus beginnt die Fahrschule erst ${dat(licM - LICENCE_MAX_MONTHS + 1)}.`
          : "Läuft die Ausbildung schon, trag oben nur ein, was noch offen ist.") +
        "</span>";
  }

  const buyMonth = r.r34Month ?? Math.max(0, idxFromYm(s.startYm) ?? 0);
  const longMonth = Math.max(buyMonth, age25Month(s), hMonth(s)) + 120;
  const hm = hMonth(s);
  const a25 = age25Month(s);

  const taxNoH = kfzTaxYear({
    ez: s.r34Ez,
    ccm: s.r34Ccm,
    co2: s.r34Co2,
    norm: s.r34Norm,
    fuel: "otto",
    hPlate: false,
  });

  const warn = [];
  if (!s.hPlateWanted)
    warn.push(
      `Ohne H-Kennzeichen bleibt es dauerhaft bei ${eur(taxNoH)} €/J statt ${eur(TAX.hFlatCar)} €/J ab ${dat(hm)}`,
    );
  else if (buyMonth < hm)
    warn.push(
      `Kauf vor ${dat(hm)}: bis dahin ${eur(taxNoH)} €/J statt ${eur(TAX.hFlatCar)} €/J`,
    );
  if (s.r34Ins === "Liebhaber" && buyMonth < a25)
    warn.push(
      `Liebhaber erst ab ${dat(a25)} — bis dahin mit Haftpfl.+TK gerechnet`,
    );
  if (s.r34Ins !== "Liebhaber" && s.r34Switch25 && buyMonth < a25)
    warn.push(`ab ${dat(a25)} auf Liebhaber gewechselt`);
  if (!seasonValid(s))
    warn.push(
      `Saison ${MONTHS[s.r34SeasonFrom - 1]}–${MONTHS[s.r34SeasonTo - 1]} ist unzulässig — zulässig sind ${SEASON_MIN} bis ${SEASON_MAX} Monate, gerechnet wird mit ${seasonMonths(s)}`,
    );
  warn.push(
    `SF-Start ${resolveSf(s, "r34")}${s.r34Sf === "Automatisch" ? " (automatisch)" : ""} · ` +
      `Beitrag ${r34PremiumBase(s).src === "proof" ? "aus Angebot" : "geschätzt"}`,
  );

  const derR34 = el("der_r34");
  if (derR34)
    derR34.innerHTML =
      `Steuer ${eur(taxNoH)} €/J${helpBtn("taxCalc")}` +
      (s.hPlateWanted
        ? ` → ${eur(TAX.hFlatCar)} €/J ab ${dat(hm)}${helpBtn("hkz")}`
        : "") +
      (s.r34Season
        ? ` · Saison ${seasonMonths(s)} Mon (${num(seasonTaxFactor(s) * 100, 0)} %)`
        : "") +
      ` · Sprit ${num(gradePrice(s.r34Grade, s), 3)} €/l · ` +
      `<b>Unterhalt ${eur(r34RunAt(s, buyMonth, 0))} → ${eur(r34RunAt(s, longMonth, 99))} €/M</b>` +
      `<span class="warn">⚠ ${warn.join(" · ")}</span>`;

  const derDaily = el("der_daily");
  if (derDaily) {
    const ezAbs = (idxFromYm(s.dailyEz) ?? 0) + BASE_ABS;
    const regime =
      ezAbs >= EZ_CO2_START ? "Hubraum + CO₂" : "Hubraum + Schadstoffklasse";
    derDaily.innerHTML =
      `Steuer ${eur(dailyTaxYear(s))} €/J <span class="mute">(${regime})</span> · ` +
      `Sprit ${num(gradePrice(s.dailyGrade, s), 3)} €/l · Kauf inkl. Nebenkosten ${eur(s.dailyPrice + (s.dailyExtra || 0))} € · ` +
      `<b>Unterhalt ${eur(dailyRunAt(s, 0, 0))} → ${eur(dailyRunAt(s, 120, 99))} €/M</b>` +
      `<span class="warn">SF-Start ${resolveSf(s, "daily")} · Beitrag ${
        dailyPremiumBase(s).src === "proof" ? "aus Angebot" : "geschätzt"
      }</span>`;
  }

  const derSaving = el("der_saving");
  if (derSaving) derSaving.innerHTML = savingPhasesHTML(s, r);

  const derBody = el("der_body");
  if (derBody) {
    const pl = priceFromLedger();
    const measured = apprFromLedger();
    const trend = measured.ok
      ? `<span class="trend">Aus ${plural(measured.n, "Inserat", "Inseraten")} über ${plural(measured.span, "Monat", "Monate")}
         gemessen: <b>${num(measured.value, 1)} % im Jahr</b>${
           Math.abs(measured.value - s.appr) >= 0.5
             ? ` · eingestellt sind ${num(s.appr, 0)} %
                 <button type="button" class="act" id="adoptAppr">übernehmen</button>`
             : " — deckt sich mit der Einstellung"
         }</span>`
      : `<span class="trend mute">Eigene Wertsteigerung messbar ab ${APPR_MIN_ROWS} Inseraten über
         mindestens ${APPR_MIN_SPAN} Monate — bisher ${measured.n} über ${plural(measured.span, "Monat", "Monate")}.</span>`;
    derBody.innerHTML =
      `<b>${s.r34Body}</b> für ${eur(s.car)} € · Nebenkosten ${eur(s.r34Extra)} €` +
      (s.hPlateWanted
        ? buyMonth < hm
          ? ` · H-Gutachten ${eur(s.hCert)} € ab ${dat(hm)}`
          : ` · inkl. H-Gutachten ${eur(s.hCert)} €`
        : " · ohne H-Kennzeichen") +
      `<span class="warn">${
        pl
          ? `Median aus ${plural(pl.n, "Angebot", "Angeboten")}, Spanne ${eur(pl.min)} – ${eur(pl.max)} €` +
            (pl.adjusted
              ? ` · Inserate von ${dat(pl.from)} bis ${dat(pl.to)}, auf heute hochgerechnet`
              : "")
          : "Noch kein Angebot für diese Variante erfasst — der Preis ist eine Schätzung."
      }</span>` +
      trend;
  }

  const derImport = el("der_import");
  if (derImport) {
    if (!s.importOn) {
      derImport.innerHTML =
        "Aus. Der Kaufpreis gilt als Preis frei Haus in Deutschland.";
    } else {
      const c = importCost(s);
      const regular = importCost({
        ...s,
        impCollector: false,
        impDuty: s.impDuty || 10,
      });
      const collector = importCost({ ...s, impCollector: true });
      const tooYoung = buyMonth < hm;
      derImport.innerHTML =
        /* Steht im Feld kein brauchbarer Kurs, rechnet der Rückfall weiter — aber
           nicht stillschweigend: aus dieser Zeile hängt der ganze Kaufpreis. */
        (c.rateFromField
          ? ""
          : `<span class="warn">⚠ Kein brauchbarer Kurs im Feld — gerechnet wird mit ${num(c.rate, 0)} ¥ je Euro.</span>`) +
        `Fahrzeug ${eur(c.carEur)} € · Zollwert ${eur(c.cif)} € · Zoll ${num(c.dutyPct, 0)} % = ${eur(c.duty)} € · ` +
        `EUSt ${c.vatPct} % = ${eur(c.vat)} € · Zulassung ${eur(s.impReg)} € · <b>gesamt ${eur(c.total)} €</b>` +
        `<span class="warn">${
          s.impCollector
            ? (tooYoung
                ? `⚠ Zum Kaufmonat ${dat(buyMonth)} sind die 30 Jahre noch nicht erreicht (${dat(hm)}) — Position 9705 greift dann nicht. Regulär wären es ${eur(regular.total)} €. `
                : "") +
              "Einreihung vorab beim Zoll klären, das Alter allein reicht nicht."
            : `Regulär gerechnet. Als Sammlungsstück nach 9705 wären es ${eur(collector.total)} €.`
        }</span>` +
        /* Der Landepreis enthält bereits §21 und Zulassung. „Nebenkosten Kauf" ist für
           den Kauf in Deutschland gedacht und kommt in der Simulation obendrauf — bei
           aktivem Import überschneiden sich die beiden. */
        (s.r34Extra > 0
          ? `<span class="warn">⚠ ${eur(s.impReg)} € für §21 und Zulassung stecken schon in diesem Betrag. Die
             ${eur(s.r34Extra)} € „Nebenkosten Kauf" kommen im Plan trotzdem dazu — gerechnet wird also mit
             ${eur(c.total + s.r34Extra)} €. Prüf, ob du die Nebenkosten hier kürzen willst.</span>`
          : "") +
        /* Die Wertsteigerung greift am ganzen Landepreis an. Für den Fahrzeugwert und
           die daran hängende EUSt stimmt das, für Fracht und Zulassung nicht. */
        `<span class="mute">Die Wertsteigerung von ${num(state.appr, 1)} %/J läuft auf den vollen Betrag.
         Für Fahrzeugwert, Zoll und EUSt passt das, für Fracht (${eur(s.impFreight)} €) und Zulassung
         (${eur(s.impReg)} €) nicht — insoweit ist der künftige Preis leicht zu hoch.</span>`;
    }
  }
}


/** Wohin das Geld bis zum Kaufmonat fließt — Zeile für Zeile nachrechenbar.
 *  Die Einzahlungen enden mit dem Kauf; alles danach gehört nicht in diese Rechnung. */
function fundsTableHTML(s, r) {
  if (!r || r.r34Month == null)
    return '<div class="empty">Ohne Kauftermin gibt es nichts aufzuschlüsseln.</div>';

  const inflow = [
    ["Startkapital heute", s.cap],
    [
      r.oneOffs.licence > 0
        ? `angewiesen bis ${dat(r.r34Month)}, nach Fahrschule`
        : `angewiesen bis ${dat(r.r34Month)}`,
      r.savedTotal,
    ],
    ["Zinsen auf das Tagesgeld", r.interestEarned],
  ];
  /* Deckt das Tagesgeld eine Einmalzahlung nicht, streckt das laufende Konto den Rest
     vor. Ohne diese Zeile stand hier eine Differenz von bis zu fünf Stellen, die als
     „Rundungsdifferenz" beschriftet war. Zurück fließt nichts, `giroFronted` ist
     deshalb immer ≤ 0. */
  if (Math.round(r.giroFronted) < 0)
    inflow.push(["vom laufenden Konto vorgestreckt", -r.giroFronted]);
  if (r.preBuy.daily)
    inflow.push(["Alltagsauto inkl. Nebenkosten", -r.preBuy.daily]);
  const sum = inflow.reduce((a, [, v]) => a + v, 0);

  /* Die „davon"-Zeilen müssen den Stand im Kaufmonat ergeben — der Kredit gehört
     deshalb nicht hinein, er kommt von der Bank und nicht vom Tagesgeld. Er steht
     als eigene Zeile darunter. */
  const outflow = [["Kaufpreis R34, davon angezahlt", r.deposited]];
  outflow.push(["Nebenkosten des Kaufs", r.oneOffs.r34Extra]);
  // Nur ein Gutachten, das im Kaufmonat schon fällig war. Kommt es erst später,
  // gehört es nicht in eine Aufstellung, die im Kaufmonat endet.
  const hCertAtBuy = r.sideAtBuy - r.oneOffs.r34Extra;
  if (hCertAtBuy > 0) outflow.push(["H-Gutachten", hCertAtBuy]);
  outflow.push([
    "Rücklage bleibt liegen",
    Math.max(0, r.capAtBuy - r.deposited - r.sideAtBuy),
  ]);

  /** @param {any[]} zeile Beschriftung und Betrag @param {string} [cls] */
  const line = (zeile, cls = "") => {
    const [label, v] = zeile;
    return `<tr class="${cls}"><td>${label}</td><td>${v < 0 ? "−" : ""}${eur(Math.abs(v))} €</td></tr>`;
  };
  // Beide Seiten werden geprüft: die Zuflüsse gegen den Stand im Kaufmonat und die
  // Verwendung gegen denselben Stand.
  const gap = Math.max(
    Math.abs(sum - r.capAtBuy),
    Math.abs(outflow.reduce((a, [, v]) => a + v, 0) - r.capAtBuy),
  );

  return (
    `<div class="cmpwrap"><table class="cmp funds"><tbody>` +
    inflow.map((row) => line(row)).join("") +
    line(["Tagesgeld im Kaufmonat", r.capAtBuy], "sumline") +
    `<tr class="spacer"><td colspan="2">davon</td></tr>` +
    outflow.map((row) => line(row)).join("") +
    (r.financed > 0
      ? `<tr class="spacer"><td colspan="2">dazu von der Bank</td></tr>` +
        line([`Kredit über ${r.term} Jahre`, r.financed])
      : "") +
    `</tbody></table></div>` +
    // Die Zeilen oben müssen den Stand im Kaufmonat exakt ergeben. Bleibt etwas übrig,
    // fehlt der Aufstellung ein Posten — das ist kein Rundungsartefakt und darf sich
    // auch nicht als solches ausgeben.
    (gap > 2
      ? `<div class="lhint">⚠ Die Aufstellung geht um ${eur(gap)} € nicht auf. Bitte melden.</div>`
      : "")
  );
}


/** Der Knopf entsteht bei jedem Render neu und wird deshalb hier gebunden. */
function wireApprAdopt() {
  const btn = el("adoptAppr");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const measured = apprFromLedger();
    if (!measured.ok) return;
    state.appr = Math.round(measured.value * 10) / 10;
    prov.appr = "proof"; // aus eigenen Inseraten gemessen, keine Annahme mehr
    syncTopControls();
    persist();
    refresh();
  });
}


function savingPhasesHTML(s, r) {
  const marks = savingMarks(r);
  if (!marks.length)
    return `Heute bleiben ${eur(s.netNow - s.living)} € übrig. Sobald ein Kauftermin zustande kommt, steht hier der Verlauf.`;

  /* Alle drei Spalten auf derselben Grundlage, damit die Zeile nachrechenbar ist:
     übrig − aufs Tagesgeld = zum Leben, immer. Ein Minus in der letzten Spalte heißt,
     dass der Dauerauftrag mehr wollte als der Monat hergab — die Zeile wird rot und
     das laufende Konto rutscht ins Minus. */
  const rows = marks
    .map((x) => {
      const free = x.flow - x.save;
      return (
        /* Die Beschriftung trägt den Freitext der Ledger-Spalte `src` — der kommt
           aus Plan-Codes und JSON-Importen und ist damit Fremdtext. */
        `<tr class="${free < 0 ? "neg" : ""}"><td>${esc(x.label)}</td>` +
        `<td>${eur(x.flow)} €</td><td>${eur(x.save)} €</td>` +
        `<td>${eur(free)} €</td></tr>`
      );
    })
    .join("");

  const avg = mittleresSparen(r);
  return (
    `<div class="cmpwrap"><table class="cmp phases"><thead><tr>` +
    `<th>Zeitpunkt</th><th>übrig</th><th>aufs Tagesgeld</th><th>zum Leben</th></tr></thead>` +
    `<tbody>${rows}` +
    `<tr class="sumline"><td>Durchschnitt bis ${dat(r.r34Month)}</td>` +
    `<td>${eur(avg + (r.freeAvg ?? 0))} €</td><td>${eur(avg)} €</td>` +
    `<td>${eur(r.freeAvg ?? 0)} €</td></tr></tbody></table></div>` +
    (s.saveMode === "fixed"
      ? `<span class="warn">Der Dauerauftrag von ${eur(s.saveFixed)} € läuft unverändert weiter, auch wenn nach dem Kauf des Alltagsautos weniger übrig bleibt. Was der Monat nicht hergibt, steht als Minus auf dem laufenden Konto und kostet Dispozinsen.` +
        (r.overdraftMonths > 0
          ? ` In ${plural(r.overdraftMonths, "Monat", "Monaten")} passiert das in diesem Plan.`
          : "") +
        `</span>`
      : `<span class="warn">Es wandert immer alles Übrige aufs Tagesgeld — die Rate schwankt deshalb mit den laufenden Kosten und dem Netto.</span>`)
  );
}

export { renderDerived, fundsTableHTML, wireApprAdopt, savingPhasesHTML };
