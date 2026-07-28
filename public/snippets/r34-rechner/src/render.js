import { idxFromYm, dat, ymOf, fmtYm, BASE_ABS } from "./calendar.js";
import { TAX, kfzTaxYear, EZ_CO2_START } from "./tax.js";
import {
  MONTHS,
  SEASON_MIN,
  SEASON_MAX,
  BODIES,
  PROV_META,
  isSolid,
  LEFTOVER_TIGHT,
  HEAVY_DEBOUNCE_MS,
  FORECAST_DEBOUNCE_MS,
  MINI_SETTLE_MS,
  VISIT_KEY,
  VISIT_MIN_DAYS,
} from "./config.js";
import { eur, num, esc, clamp, plural } from "./format.js";
import { ALLFIELDS, GROUPS, LEDGERS, FIELD_BY_KEY } from "./catalog.js";
import {
  state,
  prov,
  ledgers,
  doneTasks,
  runtime,
  licenceMonth,
  hMonth,
  hMonthKnown,
  age25Month,
  age25Known,
  seasonMonths,
  seasonValid,
  seasonTaxFactor,
  gradePrice,
  resolveSf,
} from "./state.js";
import {
  APPR_MIN_ROWS,
  APPR_MIN_SPAN,
  priceFromLedger,
  apprFromLedger,
  bodyPrice,
  premiumFromLedger,
  importCost,
  r34PremiumBase,
  dailyPremiumBase,
  r34RunAt,
  dailyTaxYear,
  dailyRunAt,
} from "./pricing.js";
import { simulate, statusOf, savingMarks } from "./simulate.js";
import { sensitivity, spreadWindow, targetIsCredit } from "./spread.js";
import { forecast, narrowingBy } from "./forecast.js";
import { openTasks } from "./tasks.js";
import { SOURCES, live, adoptLive, firstUsable } from "./sources.js";
import { store, persist, isUnsaved, planSnapshot } from "./store.js";
import { syncTopControls } from "./wire.js";
import { el, helpBtn, setSeg, setInput, inWords } from "./dom.js";

/* ---- Ableitungen ---- */
const derivable = (key) => prov[key] !== "manual";

function syncDerivedFields() {
  const setMonth = (key, month) => {
    if (!derivable(key)) return;
    state[key] = ymOf(Math.max(0, Math.round(month)));
    prov[key] = "calc";
    setInput("f_" + key, state[key]);
  };
  /* Der früheste R34-Termin hängt am H-Kennzeichen — aber nur, wenn eines beantragt
     werden soll und die Erstzulassung überhaupt bekannt ist. Ohne diese beiden
     Bedingungen ist der Führerschein die einzige echte Schranke. Vorher wurde der
     H-Termin unbesehen übernommen: wer das H-Kennzeichen abwählte, wartete trotzdem
     bis 30 Jahre nach Erstzulassung, und ein leeres Erstzulassungsfeld schob den
     Termin auf das Jahr 85359. */
  const earliestR34 =
    state.hPlateWanted && hMonthKnown(state)
      ? hMonth(state)
      : licenceMonth(state);
  setMonth("startYm", earliestR34);
  setMonth("dailyYm", licenceMonth(state));
  if (derivable("restYm")) {
    state.restYm = ymOf(Math.max(0, Math.round(earliestR34)));
    prov.restYm = "calc";
    setInput("f_restYm", state.restYm);
  }

  const fromLedger = derivable("car") ? priceFromLedger() : null;
  if (fromLedger) {
    state.car = Math.round(fromLedger.value);
    prov.car = "proof";
  } else if (state.importOn && derivable("car")) {
    state.car = Math.round(importCost(state).total);
    prov.car = "calc";
  } else if (prov.car === "proof" || prov.car === "calc") {
    prov.car = "guess";
  }
  setInput("f_car", state.car);

  if (derivable("impCollector")) {
    const buy =
      runtime.lastRun?.r34Month ?? Math.max(0, idxFromYm(state.startYm) ?? 0);
    // Ohne bekannte Erstzulassung lässt sich der Sammlungsstück-Status nicht
    // behaupten — dann gilt der reguläre Satz, das ist die teurere Annahme.
    state.impCollector = hMonthKnown(state) && buy >= hMonth(state);
    setSeg("seg_impCollector", state.impCollector ? "on" : "off");
  }
  if (state.impCollector) state.impDuty = 0;
  setInput("f_impDuty", state.impDuty);

  /* Beides mit else-Zweig: Wer alle Angebote wieder löscht, soll nicht auf einem
     gefüllten Herkunftspunkt sitzen bleiben, während im Hintergrund längst wieder
     geschätzt wird. Bei `car` gab es diesen Rückweg schon, hier fehlte er. */
  const insProof = (key, ledger, which) => {
    if (!derivable(key)) return;
    if (premiumFromLedger(ledger, resolveSf(state, which))) prov[key] = "proof";
    else if (prov[key] === "proof")
      prov[key] = FIELD_BY_KEY[key]?.prov || "guess";
  };
  insProof("r34InsY", "insR34", "r34");
  insProof("dailyInsY", "insDaily", "daily");
}

function renderProvDots() {
  [...ALLFIELDS.map((f) => f.key), "restYm"].forEach((key) => {
    const node = el("pdot_" + key);
    if (!node) return;
    const p = prov[key] || "guess";
    const meta = PROV_META[p] || PROV_META.guess;
    node.className = `pdot ${isSolid(p) ? "solid" : "open"} tip`;
    node.dataset.tip = meta.short + " — " + meta.long;
    node.setAttribute("aria-label", meta.short);

    // Eine ungeprüfte Auswahl wird am Bedienelement selbst markiert. Ohne das ist
    // sie von einer getroffenen Entscheidung nicht zu unterscheiden.
    const field = FIELD_BY_KEY[key];
    const box = el("fld_" + key);
    if (box && field && (field.type === "seg" || field.type === "toggle"))
      box.classList.toggle("unchecked", p === "preset");
  });
}

/** Was ein Feld bewirkt — dieselbe Messung, die auch den Korridor speist. */
function renderImpacts(spread) {
  const byKey = Object.fromEntries(spread.rows.map((r) => [r.key, r]));
  ALLFIELDS.forEach((f) => {
    const node = el("imp_" + f.key);
    if (!node) return;
    const row = byKey[f.key];
    if (!row) {
      node.textContent = "";
      return;
    }
    const unit = spread.byCredit ? "€" : "Mon.";
    const strong = row.move != null && row.move >= (spread.byCredit ? 500 : 3);
    // Ein Band ist eine Spanne, ein Entweder-oder nicht — beides braucht seine
    // eigene Beschriftung, sonst steht am Auswahlfeld „±— “.
    const swing = f.choiceLabel ?? `±${eur(row.band)} ${row.unit}`;
    if (row.move == null) {
      node.className = "imp strong";
      node.textContent = `${swing} → Plan kippt`;
    } else if (row.move > 0) {
      node.className = "imp" + (strong ? " strong" : "");
      node.textContent = `${swing} → ${spread.byCredit ? eur(row.move) : row.move} ${unit}`;
    } else if (row.spare >= 5) {
      node.className = "imp after";
      node.textContent = `${swing} → ${eur(row.spare)} €/M danach`;
    } else {
      node.className = "imp";
      node.textContent = `${swing} → kaum Wirkung`;
    }
  });
}

function applyVisibility(s) {
  ALLFIELDS.forEach((f) => {
    if (!f.showIf && !f.hideIf && !f.showWhen) return;
    const node = el("fld_" + f.key);
    if (!node) return;
    node.hidden = !(
      (f.showIf ? !!s[f.showIf] : true) &&
      (f.hideIf ? !s[f.hideIf] : true) &&
      (f.showWhen ? !!f.showWhen(s) : true)
    );
  });
}

/* ---- Ergebnis oben ---- */
/** Anteil als gerundeter Prozentsatz. */
const share = (x) => Math.round(x * 100) + " %";

function renderSpread(run, spread) {
  const node = el("spread");
  if (!node) return;

  /* Liegt eine Vorschau vor, kommt die Spanne aus ihr: gezogene Verteilung statt
     quadratisch addierter Einzelausschläge. Die Faustformel bleibt als Rückfall für
     den ersten Render und für den Fall, dass der Termin an der Kreditsumme hängt. */
  const fc = runtime.lastForecast;
  if (fc && fc.months && run.r34Month != null && !(spread && spread.byCredit)) {
    const risk = [];
    if (fc.neverShare >= 0.02)
      risk.push(`in ${share(fc.neverShare)} der Fälle reicht es gar nicht`);
    if (fc.tightShare >= 0.15)
      risk.push(`in ${share(fc.tightShare)} bleiben danach unter 100 €/M`);
    /* Die Mitte der Verteilung steht bewusst NICHT als dritte gleichrangige Zahl neben
       der Überschrift. Vorher standen „R34 ab 10/2031" und „Mitte 07/2032" acht Zentimeter
       auseinander, beide ohne Kommentar — das liest sich als „der Rechner weiß es selbst
       nicht" und war der Hauptgrund, warum die Rechnung misstrauisch macht. Es gibt eine
       Antwort: deine Zahlen. Die Mitte erklärt den Abstand dazu, statt mit ihr zu
       konkurrieren. */
    const drift = fc.months.p50 - run.r34Month;
    node.innerHTML =
      `<div class="sp-row">` +
      `<span class="sp-cell good"><span class="sp-k">jeder zehnte Durchlauf früher</span><span class="sp-v">${dat(fc.months.p10)}</span></span>` +
      `<span class="sp-cell base"><span class="sp-k">deine Zahlen wörtlich</span><span class="sp-v">${dat(run.r34Month)}</span></span>` +
      `<span class="sp-cell bad"><span class="sp-k">jeder zehnte Durchlauf später</span><span class="sp-v">${dat(fc.months.p90)}</span></span>` +
      `</div>` +
      `<div class="sp-mid">Mitte aller Durchläufe: <b>${dat(fc.months.p50)}</b>` +
      (drift > 1
        ? ` — ${plural(drift, "Monat", "Monate")} später als deine Rechnung, weil Kosten nach oben mehr Luft haben als nach unten und Rückschläge dazukommen.`
        : drift < -1
          ? ` — ${plural(-drift, "Monat", "Monate")} früher als deine Rechnung.`
          : ` — deckt sich mit deiner Rechnung.`) +
      `</div>` +
      (risk.length ? `<div class="sp-risk">${risk.join(" · ")}</div>` : "") +
      `<button type="button" class="sp-more" data-modal="spread">Woher die Spanne kommt</button>`;
    return;
  }

  const w = spreadWindow(run, spread);
  if (!w || !w.ok) {
    node.innerHTML = `<span class="sp-none">${
      spread && spread.byCredit
        ? "Die Kreditsumme streut kaum."
        : "Der Termin hängt an einem Datum, nicht am Geld — er streut nicht."
    }</span>`;
    return;
  }
  const fmt = (v) => (w.kind === "credit" ? eur(v) + " €" : dat(v));
  // Die Spanne beschreibt nicht den Verlauf des Lebens, sondern wie die offenen
  // Schätzungen ausgelegt werden. Die Mitte ist die Rechnung mit den eingetragenen
  // Zahlen — das muss dranstehen, sonst liest man links als "alles läuft gut".
  node.innerHTML =
    `<div class="sp-row">` +
    `<span class="sp-cell good"><span class="sp-k">optimistisch</span><span class="sp-v">${fmt(w.from)}</span></span>` +
    `<span class="sp-cell base"><span class="sp-k">mit deinen Zahlen</span><span class="sp-v">${fmt(w.base)}</span></span>` +
    `<span class="sp-cell bad"><span class="sp-k">pessimistisch</span><span class="sp-v">${fmt(w.to)}</span></span>` +
    `</div><button type="button" class="sp-more" data-modal="spread">Woher die Spanne kommt</button>`;
}

function statCard(label, value, note, help) {
  return (
    `<div><span class="hk">${label}${help ? helpBtn(help) : ""}</span>` +
    `<span class="hv">${value}</span><span class="hx">${note}</span></div>`
  );
}

function renderHero(r) {
  const box = el("hero");
  if (r.r34Month == null) {
    box.className = "hero bad";
    box.innerHTML =
      r.goal === "amount" || r.goal === "rate"
        ? `<div class="hlead">Diese Vorgabe wird nie erreicht</div>
           <div class="hsub">${
             r.goal === "amount"
               ? "Die Kreditsumme fällt nie unter " +
                 eur(state.restAmount) +
                 " €"
               : "Die Rate fällt nie unter " + eur(state.restRate) + " €"
           } — der Preis steigt schneller, als du ansparst. Vorgabe lockern, Laufzeit verlängern,
             oder unten schauen, welcher Regler am stärksten zieht.</div>`
        : `<div class="hlead">Mit diesen Zahlen reicht es nicht</div>
           <div class="hsub">Es bleibt zu wenig übrig, um Kaufpreis, Nebenkosten und Rücklage je zusammenzubekommen.
             Schau unten, welcher Regler am stärksten zieht — Lebenshaltung und Kaufpreis sind fast immer die Antwort.</div>`;
    return;
  }

  const st = statusOf(r.leftover == null ? -1 : r.leftover);
  const pl = priceFromLedger();
  // Das Pluszeichen darf nicht fest verdrahtet sein: bei negativer Wertsteigerung
  // stand hier „+-3.012 € Wertsteigerung".
  const delta = r.priceAtBuy - r.basePrice;
  const wert =
    delta >= 0
      ? `+${eur(delta)} € Wertsteigerung`
      : `${eur(delta)} € Wertverlust`;
  const cards = [
    statCard(
      "Preis bis dahin",
      `${eur(r.priceAtBuy)} €`,
      pl
        ? `${state.r34Body}, Median aus ${pl.n}, ${wert}`
        : `${state.r34Body}, geschätzt, ${wert}`,
    ),
  ];

  if (r.isRest) {
    cards.push(
      /* Was liegen bleibt, ist nicht immer die eingestellte Rücklage: reicht das
         Tagesgeld nicht für Rücklage plus Nebenkosten, bleibt weniger übrig, und wer
         bar zahlen könnte, behält mehr. Die Zahl kommt deshalb aus dem Lauf. */
      statCard(
        "Anzahlung",
        `${eur(r.deposited)} €`,
        `${eur(Math.max(0, r.capAtBuy - r.deposited - r.sideAtBuy))} € bleiben liegen` +
          (r.capAtBuy - r.deposited - r.sideAtBuy < state.reserve - 1
            ? ` statt ${eur(state.reserve)} €`
            : ""),
      ),
      statCard(
        "Monatsrate",
        r.financed > 0 ? `${eur(r.payment)} €` : "—",
        r.financed > 0
          ? `${r.term} Jahre · getilgt ${dat(r.r34Month + r.term * 12)}`
          : "kein Kredit nötig",
      ),
    );
  } else {
    cards.push(
      statCard(
        "Alltagsauto",
        dat(r.dailyMonth),
        r.dailyMonth == null
          ? "kommt in diesem Szenario nicht"
          : `${eur(dailyRunAt(state, r.dailyMonth, 0))} €/M Unterhalt`,
      ),
    );
  }
  /* „Wie viel landet eigentlich auf dem Tagesgeld?" war bis hierher an vier Stellen
     verteilt und nirgends vollständig: oben stand der Dauerauftrag (die Anweisung, nicht
     der Zufluss), im Sparverlauf vier Stichproben, in der Geldflusstabelle nur Summen bis
     zum Kauf. Die Kette angewiesen → zurückgeholt → liegen geblieben gab es an keiner
     Stelle am Stück. */
  const bis = r.r34Month ?? 0;
  const wege = r.path ? r.path.slice(0, bis) : [];
  const mittelNetto = wege.length
    ? wege.reduce((a, p) => a + p.net, 0) / wege.length
    : 0;
  const mittelBrutto = wege.length
    ? wege.reduce((a, p) => a + p.save, 0) / wege.length
    : 0;
  cards.push(
    statCard(
      "Aufs Tagesgeld",
      `${eur(mittelNetto)} €/M`,
      mittelBrutto > mittelNetto + 1
        ? `im Schnitt · angewiesen ${eur(mittelBrutto)} €, davon ${eur(mittelBrutto - mittelNetto)} € zurückgeholt`
        : `im Schnitt · insgesamt ${eur(r.savedTotal - Math.max(0, r.giroCover))} €`,
      "tagesgeld",
    ),
  );

  cards.push(
    /* Die Sparphase ist die längere Zeit, hatte aber keine eigene Zahl. „Danach frei"
       beantwortet nicht, wovon man bis dahin lebt — und genau da wird es eng. */
    /* Dieselbe Behandlung wie „Danach frei": eine Zahl ohne Einordnung neben einer mit
       Einordnung liest sich, als sei die eine wichtig und die andere nicht. Ein Minus
       während der Fahrschulzeit ist vorübergehend und kein kaputter Plan — das trennt
       die Beschriftung, statt beides rot zu färben. */
    statCard(
      "Bis dahin frei",
      `${r.free == null ? "—" : eur(r.free) + " €"}` +
        (r.free == null
          ? ""
          : r.free >= 0
            ? `<span class="pill ${statusOf(r.free).c}">${statusOf(r.free).w}</span>`
            : r.licenceUntil != null && r.freeMonth <= r.licenceUntil
              ? `<span class="pill warn">vorübergehend</span>`
              : `<span class="pill bad">zu knapp</span>`),
      r.free == null
        ? "keine Sparphase"
        : r.free >= 0
          ? `engster Monat · Schnitt ${eur(r.freeAvg)} €`
          : r.licenceUntil != null && r.freeMonth <= r.licenceUntil
            ? `engster Monat · Fahrschule läuft bis ${dat(r.licenceUntil)} mit`
            : `engster Monat · Dauerauftrag ${eur(-r.free)} € zu hoch`,
      "freeSaving",
    ),
    statCard(
      "Danach frei im Monat",
      `${r.leftover == null ? "—" : eur(r.leftover) + " €"}<span class="pill ${st.c}">${st.w}</span>`,
      `engster Monat · später ≈ ${eur(r.leftoverLong)} €`,
      "leftover",
    ),
  );

  const lead = r.isRest
    ? r.financed > 0
      ? `Zum <b>${dat(r.r34Month)}</b> fehlen <b>${eur(r.financed)} €</b>`
      : `Zum <b>${dat(r.r34Month)}</b> reicht es bar`
    : `R34 ab <b>${dat(r.r34Month)}</b>`;

  const sub = r.isRest
    ? `${inWords(r.r34Month)} · ${
        r.financed > 0
          ? `Rate ${eur(r.payment)} €/M über ${r.term} Jahre · ${eur(r.interest)} € Zinsen`
          : `${eur(r.deposited)} € angezahlt`
      }`
    : `${inWords(r.r34Month)} · ${
        r.financed > 0
          ? `Kredit über ${eur(r.financed)} € · ${eur(r.payment)} €/M für ${r.term} Jahre`
          : "Barkauf, kein Kredit nötig"
      }`;

  /* Zwei getrennte Aussagen, die vorher zu einer verschmolzen waren. Der frühere Text
     behauptete einen Dispo samt Zinsen — dabei holt sich der Ausgleich das Geld im
     selben Monat vom Tagesgeld, und das Konto steht am Monatsende auf null. Eine
     Warnung, die etwas Falsches behauptet, kostet mehr Vertrauen als sie einbringt. */
  const warn =
    r.overdraftMonths > 0
      ? `<div class="hwarn">⚠ In <b>${plural(r.overdraftMonths, "Monat", "Monaten")}</b> reicht
         auch das Tagesgeld nicht, tiefstens <b>${eur(r.minGiro)} €</b>. Dispozinsen sind nicht gerechnet.</div>`
      : r.negMonths > 0
        ? `<div class="hwarn">⚠ In <b>${plural(r.negMonths, "Monat", "Monaten")}</b> gibt der Monat
           den Dauerauftrag nicht her — bis zu <b>${eur(-r.minGiro)} €</b> kommen dann vom Tagesgeld
           zurück. Der Termin ändert sich dadurch nicht, aber ${eur(state.saveFixed)} € sind nicht
           der Betrag, den du wirklich zurücklegen kannst.</div>`
      : "";

  box.className = "hero";
  box.innerHTML =
    `<div class="hlead">${lead}</div><div class="hsub">${sub}</div>` +
    `<div class="hspread" id="spread"></div>` +
    warn +
    `<div class="hstats">${cards.join("")}</div>` +
    `<button type="button" class="sp-more hfunds" data-modal="funds">Wohin das Geld bis dahin fließt</button>`;
  renderSpread(r, runtime.lastSpread);
}

/* ---- Korridor-Aufschlüsselung ---- */
/* Die Aufschlüsselung der Spanne.

   Bewusst als Diagramm statt als Tabelle: die Frage ist nicht "welcher Posten hat
   welchen Zahlenwert", sondern "welcher Posten zieht die Spanne auseinander". Das
   beantwortet eine Balkenlänge auf einen Blick, eine Zahlenspalte nicht. */
function spreadModalHTML() {
  const sp = runtime.lastSpread;
  const run = runtime.lastRun;
  const w = spreadWindow(run, sp);
  if (!sp || !w) return "<p>Es liegt noch keine Rechnung vor.</p>";

  const isCredit = w.kind === "credit";
  const fmtAbs = (v) => (isCredit ? eur(v) + " €" : dat(v));
  const unit = isCredit ? "€" : "Mon.";
  const early = isCredit ? "senkt die Summe" : "zieht nach vorn";
  const late = isCredit ? "erhöht die Summe" : "schiebt nach hinten";

  const rows = sp.rows
    .filter((r) => r.down !== 0 || r.up !== 0)
    .map((r) => ({ ...r, down: Math.round(r.down), up: Math.round(r.up) }))
    .sort((a, b) => b.up - a.up || a.down - b.down);
  const scale = Math.max(
    1,
    ...rows.map((r) => Math.max(Math.abs(r.down), r.up)),
  );
  const pct = (v) => (Math.abs(v) / scale) * 50;

  const bars = rows
    .map(
      (r) =>
        `<div class="tor"><span class="tor-name">${r.label}</span>` +
        `<span class="tor-band">±${eur(r.band)} ${r.unit}</span>` +
        `<span class="tor-track">` +
        `<i class="tor-neg" style="width:${pct(r.down).toFixed(1)}%"></i>` +
        `<i class="tor-pos" style="width:${pct(r.up).toFixed(1)}%"></i>` +
        `</span>` +
        `<span class="tor-val"><b class="neg">${r.down ? (isCredit ? eur(r.down) : r.down) : "—"}</b>` +
        `<b class="pos">${r.up ? "+" + (isCredit ? eur(r.up) : r.up) : "—"}</b></span></div>`,
    )
    .join("");

  return (
    `<div class="axis">
       <div class="axis-line"><i class="axis-dot left"></i><i class="axis-dot mid"></i><i class="axis-dot right"></i></div>
       <div class="axis-marks">
         <div class="axis-mark good"><b>${fmtAbs(w.from)}</b><span>optimistisch</span></div>
         <div class="axis-mark base"><b>${fmtAbs(w.base)}</b><span>mit deinen Zahlen</span></div>
         <div class="axis-mark bad"><b>${fmtAbs(w.to)}</b><span>pessimistisch</span></div>
       </div>
     </div>` +
    `<div class="keycards">
       <div class="kc base"><b>Die Mitte</b> ist die Rechnung mit genau den Zahlen, die eingetragen sind — nichts geschönt, nichts verschärft.</div>
       <div class="kc good"><b>Links</b> steht, wo du landest, wenn die noch offenen Schätzungen sich als zu vorsichtig erweisen.</div>
       <div class="kc bad"><b>Rechts</b>, wenn sie sich als zu großzügig erweisen.</div>
     </div>` +
    `<p class="mlead">Die Spanne beschreibt <b>nicht</b>, wie dein Leben läuft, sondern wie genau
       deine Annahmen sind. Jeder Balken zeigt, wie weit ein einzelner Posten den Termin zieht,
       wenn <i>nur er</i> um seine Bandbreite danebenliegt.</p>` +
    `<div class="tor-head"><span>Posten</span><span>Bandbreite</span>
       <span class="tor-legend"><b><i class="lg-neg"></i>${early}</b><b><i class="lg-pos"></i>${late}</b></span>
       <span class="tor-unit">${unit}</span></div>` +
    bars +
    `<div class="mfacts">
       <div><b>Warum nicht addiert?</b> Liefen alle Posten gleichzeitig ins Extrem, käme
         ${fmtAbs(w.base + sp.extremeDown)} bis ${fmtAbs(w.base + sp.extremeUp)} heraus. Dass
         Spritpreis, Miete, Kaufpreis und Zins alle zusammen am ungünstigsten Rand landen, ist
         kein Normalfall.</div>
       <div><b>Woher die Spanne oben kommt.</b> Die Balken hier zeigen jeden Posten einzeln.
         Die Spanne im Ergebnis entsteht anders: der Rechner zieht ein paar hundert vollständige
         Durchläufe, in denen alle offenen Zahlen gleichzeitig neu ausgewürfelt werden — die
         Inflationsabhängigen gemeinsam, weil sie zusammenhängen, Kosten schief nach oben, dazu
         Rückschläge wie eine große Reparatur oder ein Einkommensausfall. Deshalb liegt die
         Mitte dieser Durchläufe hinter deiner Punktrechnung.</div>
       <div><b>Belegen verkürzt die Balken.</b> Eine geschätzte Zahl zählt voll, eine live
         bezogene zu 60 %, eine von dir gesetzte zu 40 %, eine belegte nur zu 25 %. Eine
         gerechnete Größe wie die Kfz-Steuer streut gar nicht.</div>
       <div class="mnote">Kein statistisches Konfidenzintervall — die Bandbreiten sind selbst
         geschätzt. Eine belastbare Größenordnung, kein Versprechen.</div>
     </div>`
  );
}

/* ---- mitlaufendes Ergebnis ---- */
let baseMetric = null;
let settleTimer = null;
let pulseTimer = null;

function renderMini(r) {
  const box = el("resultbar");
  if (r.r34Month == null) {
    box.innerHTML =
      '<span class="mk1">Reicht so nicht</span><span class="mk2">Vorgabe lockern oder Kaufpreis anpassen</span>';
    box.classList.remove("pulse");
    baseMetric = null;
    return;
  }
  const byCredit = targetIsCredit(state);
  const current = byCredit ? Math.round(r.financed) : r.r34Month;
  if (baseMetric == null) baseMetric = current;

  const shift = baseMetric - current;
  const notable = byCredit ? Math.abs(shift) >= 50 : shift !== 0;
  const badge = notable
    ? `<span class="delta ${shift > 0 ? "up" : "down"}">${shift > 0 ? "−" : "+"}${
        byCredit ? eur(Math.abs(shift)) + " €" : Math.abs(shift) + " Mon."
      }</span>`
    : "";
  const frei = r.leftover == null ? "—" : eur(r.leftover) + " €/M";

  box.innerHTML = byCredit
    ? `<span class="mk1">Kredit <b>${eur(r.financed)} €</b>${badge}</span>` +
      `<span class="mk2">${dat(r.r34Month)} · Rate ${eur(r.payment)} €/M · danach ${frei} frei</span>`
    : `<span class="mk1">R34 ab <b>${dat(r.r34Month)}</b>${badge}</span>` +
      `<span class="mk2">${inWords(r.r34Month)} · danach ${frei} frei</span>`;

  if (notable) {
    box.classList.add("pulse");
    clearTimeout(pulseTimer);
    pulseTimer = setTimeout(() => box.classList.remove("pulse"), 900);
  }
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => {
    const moved = baseMetric !== current;
    baseMetric = current;
    const status = el("liveStatus");
    if (status && runtime.lastRun && runtime.lastRun.r34Month != null) {
      status.textContent = byCredit
        ? `Kreditsumme ${eur(runtime.lastRun.financed)} Euro`
        : `Kauftermin ${dat(runtime.lastRun.r34Month)}`;
    }
    // Ohne diese Bedingung würde sich renderMini alle zwei Sekunden endlos selbst aufrufen.
    if (moved && runtime.lastRun) renderMini(runtime.lastRun);
  }, MINI_SETTLE_MS);
}

/* ---- Zeitleiste ---- */
function renderTimeline(r) {
  const s = state;
  const box = el("tl");
  if (!box) return;
  const events = [];
  if (!s.licenseOwned) events.push({ m: licenceMonth(s), d: "Führerschein" });
  if (r.dailyMonth != null) events.push({ m: r.dailyMonth, d: "Alltagsauto" });
  if (r.r34Month != null)
    events.push({ m: r.r34Month, d: "R34 gekauft", hi: true });
  if (r.r34Month != null && r.r34Month < hMonth(s))
    events.push({ m: hMonth(s), d: "H-Kennzeichen" });
  if (
    r.r34Month != null &&
    r.r34Month < age25Month(s) &&
    (s.r34Ins === "Liebhaber" || s.r34Switch25)
  )
    events.push({ m: age25Month(s), d: "Liebhaber-Tarif" });
  if (r.finance && r.financed > 0 && r.r34Month != null)
    events.push({ m: r.r34Month + r.term * 12, d: "Kredit getilgt" });
  events.sort((a, b) => a.m - b.m);

  if (!events.length || r.r34Month == null) {
    box.innerHTML = '<div class="tl-line"></div>';
    return;
  }

  const w = spreadWindow(r, runtime.lastSpread);
  const end =
    Math.max(...events.map((e) => e.m), w && w.kind === "date" ? w.to : 0) + 4;
  const pct = (m) => clamp((m / end) * 100, 0, 100);

  let html = `<div class="tl-line"></div><div class="tl-fill" style="width:${pct(r.r34Month)}%"></div>`;
  if (w && w.ok && w.kind === "date") {
    const x1 = pct(w.from);
    html +=
      `<div class="tl-band tip" style="left:${x1}%;width:${Math.max(0.6, pct(w.to) - x1)}%" ` +
      `data-tip="Spanne ${dat(w.from)} bis ${dat(w.to)} — je nachdem, wie die offenen Annahmen ausgehen"></div>`;
  }
  events.forEach((e, i) => {
    html +=
      `<div class="mk ${i % 2 === 0 ? "up" : "down"} ${e.hi ? "hi" : ""}" style="left:${pct(e.m)}%">` +
      `<div class="dot"></div><div class="lbl"><div class="d">${dat(e.m)}</div>` +
      `<div class="t">${e.d}</div></div></div>`;
  });
  box.innerHTML = html;
}

/* ---- Zwei Ranglisten: Termin und Spielraum danach ---- */
function renderLevers(spread) {
  const { rows, byCredit, floor } = spread;
  const movers = rows.filter((r) => r.move == null || r.move >= floor);
  const spares = rows
    .filter((r) => !(r.move == null || r.move >= floor))
    .filter((r) => r.spare >= 1)
    .sort((a, b) => b.spare - a.spare);
  const maxMove = Math.max(1, ...movers.map((r) => r.move ?? 0));
  const maxSpare = Math.max(1, ...spares.map((r) => r.spare));

  el("leversTitle").textContent = byCredit
    ? "Was die Kreditsumme verschiebt"
    : "Was den Termin verschiebt";

  const bar = (r, value, max, text) =>
    `<div class="lev"><span class="lname">${r.label}</span>` +
    // Entweder-oder-Felder haben kein Band; „±— " war schlicht kaputt
    `<span class="lband">${r.choiceLabel ?? `±${eur(r.band)} ${r.unit}`}</span>` +
    `<span class="lbar"><i style="width:${(value / max) * 100}%"></i></span>` +
    `<span class="lval">${text}</span></div>`;

  /* Achtzehn Balken, von denen zehn zwischen einem und vier Monaten liegen und optisch
     nicht unterscheidbar sind, tragen ab Rang sieben nichts mehr bei. Der Rest bleibt
     erreichbar, steht aber nicht mehr im Weg. */
  const SICHTBAR = 6;
  const kurz = movers.slice(0, SICHTBAR);
  const rest = movers.slice(SICHTBAR);
  const zeile = (r) =>
    bar(
      r,
      r.move ?? maxMove,
      maxMove,
      r.move == null ? "kippt" : byCredit ? eur(r.move) + " €" : r.move + " Mon.",
    );
  el("levers").innerHTML = movers.length
    ? kurz.map(zeile).join("") +
      (rest.length
        ? `<details class="levrest"><summary>${plural(rest.length, "weiterer Posten", "weitere Posten")} mit unter ${rest[0].move + 1} ${byCredit ? "€" : "Monaten"} Wirkung</summary>${rest.map(zeile).join("")}</details>`
        : "")
    : `<div class="empty">Kein Regler bewegt ${byCredit ? "die Kreditsumme" : "den Termin"} messbar.</div>`;

  // Die laufenden Kosten des R34 fallen erst ab dem Kaufmonat an. Auf den Termin wirken sie
  // deshalb nicht — auf das, was danach im Monat bleibt, sehr wohl. Bei Finanzierung kommt
  // die Rate dazu, weshalb die Zeile dann ausdrücklich anders formuliert ist.
  const spareBox = el("spares");
  const spareNote = el("sparesNote");
  if (!spares.length) {
    spareBox.innerHTML =
      '<div class="empty">Keine weiteren Posten mit spürbarer Wirkung.</div>';
    spareNote.textContent = "";
    return;
  }
  spareBox.innerHTML = spares
    .map((r) => bar(r, r.spare, maxSpare, eur(r.spare) + " €/M"))
    .join("");
  spareNote.innerHTML =
    runtime.lastRun && runtime.lastRun.financed > 0
      ? `Diese Posten laufen neben der Kreditrate von ${eur(runtime.lastRun.payment)} €/M. Sie verschieben den
         Kauftermin nicht, entscheiden aber darüber, ob die Rate im Alltag trägt — aktuell bleiben im
         engsten Monat ${eur(runtime.lastRun.leftover)} €.`
      : `Diese Posten fallen erst ab dem Kaufmonat an und verschieben den Termin deshalb nicht.
         Sie entscheiden darüber, was dir danach im Monat bleibt — aktuell ${
           runtime.lastRun && runtime.lastRun.leftover != null
             ? eur(runtime.lastRun.leftover) + " €"
             : "—"
         } im engsten Monat.`;
}

/* ---- Karosserie-Vergleich ---- */
function renderBodyCompare() {
  const box = el("bodyCmp");
  if (!box) return;

  /* Die typisierten 3 %/5 % gelten nur, solange die Wertsteigerung offen ist. Steht
     sie — selbst eingetragen oder aus eigenen Inseraten gemessen —, wird sie für beide
     Varianten benutzt. Vorher schützte nur „manual", und eine über „übernehmen"
     gemessene Rate (`proof`) wurde hier stillschweigend verworfen. Dann rechnete diese
     Tabelle mit einer anderen Wertsteigerung als das Ergebnis oben. */
  const apprStands = isSolid(prov.appr);
  const variants = [BODIES.sedan, BODIES.coupe].map((body) => {
    const price = bodyPrice(body);
    const appr = apprStands ? state.appr : body === BODIES.coupe ? 5 : 3;
    return {
      body,
      price,
      appr,
      run: simulate(state, { carPrice: price.value, appr }),
    };
  });

  const [sedan, coupe] = variants;
  const gap = coupe.price.value - sedan.price.value;
  const months =
    coupe.run.r34Month != null && sedan.run.r34Month != null
      ? coupe.run.r34Month - sedan.run.r34Month
      : null;

  const verdict =
    months == null
      ? "Eine der beiden Varianten kommt in diesem Szenario gar nicht zustande."
      : months <= 0
        ? "Das Coupé kostet dich keine Zeit — bei diesen Zahlen kannst du es nehmen."
        : months <= 6
          ? `Das Coupé kostet ${eur(gap)} € mehr und ${plural(months, "Monat", "Monate")} Wartezeit. Das ist überschaubar.`
          : `Das Coupé kostet ${eur(gap)} € mehr und ${plural(months, "Monat", "Monate")} Wartezeit. Dafür braucht es einen guten Grund.`;

  const thin = variants.some((v) => v.price.n === 0);
  box.innerHTML =
    `<div class="cmpwrap"><table class="cmp"><thead><tr>` +
    `<th>Variante</th><th>Preis heute</th><th>Grundlage</th><th>Wertst.</th><th>Kauf</th>` +
    `</tr></thead><tbody>` +
    variants
      .map(
        (v) =>
          `<tr class="${v.body === state.r34Body ? "now" : ""}">` +
          `<td>${v.body}${v.body === state.r34Body ? ' <span class="tag">gewählt</span>' : ""}</td>` +
          `<td>${eur(v.price.value)} €</td>` +
          `<td>${v.price.n ? "Median aus " + v.price.n : v.price.src === "calc" ? "abgeleitet" : "Schätzung"}</td>` +
          `<td>${num(v.appr, 0)} %</td><td>${dat(v.run.r34Month)}</td></tr>`,
      )
      .join("") +
    `</tbody></table></div><div class="lrest">${verdict}` +
    (thin
      ? " Solange für eine Variante keine Angebote erfasst sind, vergleichst du eine Schätzung mit einer Schätzung."
      : "") +
    `</div>`;
}

/* ---- Restfinanzierung ---- */
const REST_OFFSETS = [0, -3, 3, -6, 6, -12, 12];

/** Was ein früherer oder späterer Kauftermin an der Kreditsumme ändert.
 *
 *  Alle Zeilen werden nach derselben Regel gerechnet: fester Termin, Rest über Kredit.
 *  Auch die gewählte. Vorher stammte die markierte Zeile aus dem Lauf mit der echten
 *  Vorgabe („Kreditsumme höchstens X") und die Nachbarzeilen aus Terminläufen — die
 *  Spalten waren dann nicht vergleichbar und der Trendsatz darunter zog daraus einen
 *  falschen Schluss. */
function restRows(base) {
  if (base.r34Month == null) return [];
  const seen = new Set();
  const out = [];
  REST_OFFSETS.forEach((off) => {
    const m = base.r34Month + off;
    if (m < 0) return;
    const run =
      off === 0 && base.goal === "date"
        ? base
        : simulate(state, { restGoal: "date", restYm: ymOf(m) });
    if (run.r34Month == null || seen.has(run.r34Month)) return;
    seen.add(run.r34Month);
    out.push({ off, run });
  });
  return out.sort((a, b) => a.run.r34Month - b.run.r34Month);
}

/** Ein- und Ausblenden muss sofort passieren — ein Klick darf nicht nachhängen. */
function renderRestVisibility() {
  const active = state.method === "rest";
  el("restBox").hidden = !active;
  el("restCmpPanel").hidden = !active;
  el("fld_restYm").hidden = state.restGoal !== "date";
  el("fld_restAmount").hidden = state.restGoal !== "amount";
  el("fld_restRate").hidden = state.restGoal !== "rate";
  return active;
}

function renderRestSummary(r) {
  const der = el("der_rest");
  if (r.r34Month == null) {
    der.innerHTML = "Mit dieser Vorgabe kommt kein Kauf zustande.";
    return;
  }
  if (r.financed <= 0) {
    der.innerHTML = `Zum ${dat(r.r34Month)} deckt das Ersparte den Preis von ${eur(r.priceAtBuy)} € — es entsteht kein Kredit.`;
    return;
  }
  der.innerHTML =
    `Preis ${eur(r.priceAtBuy)} € − Anzahlung ${eur(r.deposited)} € = <b>Kredit ${eur(r.financed)} €</b> · ` +
    `${eur(r.payment)} €/M über ${r.term} Jahre · ${eur(r.interest)} € Zinsen` +
    (r.leftover != null && r.leftover < LEFTOVER_TIGHT
      ? `<span class="warn">⚠ Im engsten Monat bleiben nur ${eur(r.leftover)} € — die Rate passt rechnerisch, im Alltag kaum.</span>`
      : "");
}

function renderRestCompare(r) {
  const rows = restRows(r);
  const box = el("restCmp");
  if (!rows.length) {
    box.innerHTML =
      '<div class="empty">Kein vergleichbarer Termin — der Kauf hängt an einer Datumsgrenze.</div>';
    return;
  }
  const first = rows[0].run;
  const last = rows[rows.length - 1].run;
  const trend =
    last.r34Month > first.r34Month ? last.financed - first.financed : 0;
  const hint =
    trend < -50
      ? `Warten senkt die Kreditsumme — über die ganze Spanne um ${eur(-trend)} €. Du legst mehr zurück, als das Auto teurer wird.`
      : trend > 50
        ? `Warten macht es teurer — über die Spanne steigt die Kreditsumme um ${eur(trend)} €. Bei ${num(state.appr, 0)} % Wertsteigerung wächst der Preis schneller als dein Erspartes.`
        : "Warten ändert an der Kreditsumme kaum etwas — Wertsteigerung und Sparrate halten sich die Waage.";

  box.innerHTML =
    `<div class="cmpwrap"><table class="cmp"><thead><tr>` +
    `<th>Kauf</th><th>Preis</th><th>Anzahlung</th><th>Kredit</th><th>Rate</th><th>frei/M</th>` +
    `</tr></thead><tbody>` +
    rows
      .map(
        ({ off, run }) =>
          `<tr class="${off === 0 ? "now" : ""}">` +
          `<td>${dat(run.r34Month)}${off === 0 ? ' <span class="tag">gewählt</span>' : ""}</td>` +
          `<td>${eur(run.priceAtBuy)} €</td><td>${eur(run.deposited)} €</td>` +
          `<td>${run.financed > 0 ? eur(run.financed) + " €" : "—"}</td>` +
          `<td>${run.financed > 0 ? eur(run.payment) + " €" : "bar"}</td>` +
          `<td class="${run.leftover != null && run.leftover < LEFTOVER_TIGHT ? "neg" : ""}">` +
          `${run.leftover == null ? "—" : eur(run.leftover) + " €"}</td></tr>`,
      )
      .join("") +
    `</tbody></table></div><div class="lrest">${hint}</div>`;
}

/* ---- Soll-Ist ---- */
const CHART = { w: 640, h: 230, padL: 56, padR: 10, padT: 10, padB: 28 };

function actualPoints() {
  return ledgers.actual
    .map((a) => ({ m: idxFromYm(a.month), v: a.amt, note: a.src }))
    .filter((p) => p.m != null && isFinite(p.v))
    .sort((a, b) => a.m - b.m);
}

let selectedPoint = null;

/** Gemessene gegen geplante Sparrate über dasselbe Fenster.
 *
 *  Verglichen werden Kontostandsänderungen, nicht Einzahlungen: der erfasste Stand
 *  enthält Zinsen, der simulierte auch. Alles, was in beiden Reihen gleich läuft,
 *  kürzt sich in `diff` heraus — genau das macht die Zahl als Korrektur brauchbar.
 *  Gibt null zurück, wenn das Fenster nicht im simulierten Verlauf liegt. */
function trackRates(pts, plan) {
  if (pts.length < 2 || !plan.length) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const span = last.m - first.m;
  if (span <= 0) return null;
  const planAt = (m) => plan.find((p) => p.m === m);
  const a = planAt(first.m);
  const b = planAt(last.m);
  if (!a || !b) return null;
  const realRate = (last.v - first.v) / span;
  const plannedRate = (b.v - a.v) / span;
  return { realRate, plannedRate, diff: realRate - plannedRate, span };
}

function renderTrack(r) {
  const box = el("track");
  const sum = el("trackSum");
  if (!box) return;
  const pts = actualPoints();
  if (sum)
    sum.textContent = pts.length
      ? plural(pts.length, "Eintrag", "Einträge")
      : "noch nichts erfasst";

  if (pts.length < 1) {
    box.innerHTML = `<div class="empty">${LEDGERS.actual.empty}</div>`;
    return;
  }

  const plan = (r.path || simulate(state, { path: true }).path || []).map(
    (p) => ({ m: p.m, v: p.cap }),
  );
  const x0 = Math.min(0, pts[0].m);
  const x1 = Math.max(
    pts[pts.length - 1].m,
    Math.min(plan.length - 1, (r.r34Month ?? 24) + 1),
  );
  const planIn = plan.filter((p) => p.m >= x0 && p.m <= x1);
  const values = [...pts.map((p) => p.v), 0, ...planIn.map((p) => p.v)];
  const yMax = Math.max(1000, ...values) * 1.05;
  const yMin = Math.min(0, ...values);

  const { w, h, padL, padR, padT, padB } = CHART;
  const px = (m) =>
    padL + ((m - x0) / Math.max(1, x1 - x0)) * (w - padL - padR);
  const py = (v) =>
    h - padB - ((v - yMin) / Math.max(1, yMax - yMin)) * (h - padT - padB);

  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => {
    const v = yMin + ((yMax - yMin) / ticks) * i;
    const y = py(v);
    return (
      `<line class="cgrid" x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}"/>` +
      `<text class="cax" x="${padL - 8}" y="${(y + 3.5).toFixed(1)}" text-anchor="end">${
        Math.abs(v) >= 1000 ? Math.round(v / 1000) + "k" : Math.round(v)
      }</text>`
    );
  }).join("");

  const step = Math.max(1, Math.ceil((x1 - x0) / 6));
  const xLabels = [];
  for (let m = x0; m <= x1; m += step)
    xLabels.push(
      `<text class="cax" x="${px(m).toFixed(1)}" y="${h - padB + 16}" text-anchor="middle">${dat(m)}</text>`,
    );

  const line = (arr) =>
    arr
      .map(
        (p, i) => `${i ? "L" : "M"}${px(p.m).toFixed(1)},${py(p.v).toFixed(1)}`,
      )
      .join(" ");
  const dots = pts
    .map(
      (p) =>
        `<circle class="cdot${selectedPoint === p.m ? " sel" : ""}" cx="${px(p.m).toFixed(1)}" ` +
        `cy="${py(p.v).toFixed(1)}" r="4.5" data-point="${p.m}"><title>${dat(p.m)}: ${eur(p.v)} €</title></circle>`,
    )
    .join("");

  const buyMark =
    r.r34Month != null && r.r34Month >= x0 && r.r34Month <= x1
      ? `<line class="cbuy" x1="${px(r.r34Month).toFixed(1)}" y1="${padT}" x2="${px(r.r34Month).toFixed(1)}" y2="${h - padB}"/>` +
        `<text class="cax buy" x="${px(r.r34Month).toFixed(1)}" y="${padT + 10}" text-anchor="middle">Kauf</text>`
      : "";

  /* Beide Seiten sind Kontostandsänderungen über dasselbe Fenster: erfasster Stand
     gegen simulierten Stand. Damit fallen Zinsen, Gehaltserhöhung, Inflation und der
     Unterhalt des Alltagsautos auf beiden Seiten gleich aus und kürzen sich in der
     Differenz heraus. Die frühere Formel `netNow − living` war eine Konstante ohne
     Autounterhalt und lag ab dem Kauf des Alltagsautos rund 200 €/M daneben. */
  const rates = trackRates(pts, plan);
  let verdict = "";
  if (!rates) {
    verdict =
      pts.length < 2
        ? "Ab dem zweiten Eintrag vergleicht der Plan deine tatsächliche Sparrate mit der geplanten."
        : "Für den Vergleich fehlt der geplante Stand zu diesen Monaten — trag einen Stand ab dem laufenden Monat ein.";
  } else {
    const { realRate, plannedRate, diff, span } = rates;
    verdict =
      Math.abs(diff) < 40
        ? `Du liegst auf Kurs: real ${eur(realRate)} €/M gegenüber ${eur(plannedRate)} €/M im Plan, gemessen über ${plural(span, "Monat", "Monate")}.`
        : `Du legst <b>${eur(Math.abs(diff))} € ${diff > 0 ? "mehr" : "weniger"}</b> im Monat zurück als geplant
           (${eur(realRate)} statt ${eur(plannedRate)} €), gemessen über ${plural(span, "Monat", "Monate")}.` +
          (state.saveMode === "fixed"
            ? ` <button type="button" class="act" id="adoptFixed">Dauerauftrag auf ${eur(Math.max(0, state.saveFixed + diff))} € setzen</button>`
            : ` Bei sonst gleichen Annahmen entspricht das einer Lebenshaltung von <b>${eur(Math.max(0, state.living - diff))} €</b>.
               <button type="button" class="act" id="adoptLiving">übernehmen</button>`);
  }

  const lastPt = pts[pts.length - 1];
  const capOffer =
    lastPt.m === 0 && Math.round(lastPt.v) !== Math.round(state.cap)
      ? ` Dein Stand für ${fmtYm(ymOf(0))} weicht vom Startkapital oben ab.
          <button type="button" class="act" id="adoptCap">${eur(lastPt.v)} € übernehmen</button>`
      : "";

  box.innerHTML =
    `<div class="chart"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Verlauf Tagesgeldkonto">` +
    grid +
    xLabels.join("") +
    buyMark +
    `<path class="cplan" d="${line(planIn)}"/><path class="creal" d="${line(pts)}"/>${dots}</svg></div>` +
    `<div class="clegend"><span class="lp">Plan</span><span class="lr">tatsächlich</span>` +
    `<span class="lx">Stände jeweils zum Monatsende</span></div>` +
    `<div id="pointInfo" class="pointinfo"${selectedPoint == null ? " hidden" : ""}></div>` +
    `<div class="lrest">${verdict}${capOffer}</div>`;

  if (selectedPoint != null) showPointInfo(selectedPoint, plan);
  wireTrackButtons(pts, plan);
}

function showPointInfo(m, plan) {
  const node = el("pointInfo");
  if (!node) return;
  const pt = actualPoints().find((p) => p.m === m);
  const planPt = plan.find((p) => p.m === m);
  if (!pt) {
    node.hidden = true;
    return;
  }
  const diff = planPt ? pt.v - planPt.v : null;
  node.hidden = false;
  node.innerHTML =
    `<b>${dat(m)}</b> · tatsächlich <b>${eur(pt.v)} €</b>` +
    (planPt
      ? ` · Plan ${eur(planPt.v)} € · <span class="${diff >= 0 ? "pos" : "neg"}">${
          diff >= 0 ? "+" : "−"
        }${eur(Math.abs(diff))} €</span>`
      : ` · <span class="mute">liegt vor dem Planbeginn ${dat(0)}, kein Plan-Vergleich möglich</span>`) +
    (pt.note ? ` · ${esc(pt.note)}` : "") +
    `<button type="button" class="pclose" data-point="clear" aria-label="Auswahl aufheben">×</button>`;
}

function wireTrackButtons(pts, plan) {
  const chart = el("track");
  if (!chart) return;
  chart.querySelectorAll("[data-point]").forEach((node) => {
    node.addEventListener("click", () => {
      const raw = node.dataset.point;
      selectedPoint = raw === "clear" ? null : Number(raw);
      renderTrack(runtime.lastRun);
    });
  });

  const last = pts[pts.length - 1];
  const bind = (id, fn) => {
    const node = el(id);
    if (node) node.addEventListener("click", fn);
  };
  /* Beide Knöpfe verschieben ihr Feld um die gemessene Abweichung. Die Differenz
     zweier Kontostandsverläufe ist die richtige Korrekturgröße; `netNow − realRate`
     hätte den gesamten Autounterhalt der Lebenshaltung zugeschlagen. */
  const rates = trackRates(pts, plan);
  bind("adoptLiving", () => {
    if (!rates) return;
    state.living = Math.max(0, Math.round(state.living - rates.diff));
    prov.living = "proof"; // aus echten Kontoständen abgeleitet, keine Schätzung mehr
    setInput("f_living", state.living);
    persist();
    render();
  });
  bind("adoptFixed", () => {
    if (!rates) return;
    state.saveFixed = Math.max(
      0,
      Math.round(state.saveFixed + rates.diff),
    );
    prov.saveFixed = "proof";
    setInput("f_saveFixed", state.saveFixed);
    persist();
    render();
  });
  bind("adoptCap", () => {
    state.cap = Math.max(0, Math.round(last.v));
    prov.cap = "proof";
    syncTopControls();
    persist();
    render();
  });
}

/* ---- Nächste Schritte ---- */
/** Was die Aufgabe bringt — gemessen, wenn möglich, sonst der Satz aus dem Katalog.
 *
 *  Die handgeschriebene Begründung war eine Behauptung („ist der größte Hebel").
 *  Die Messung sagt, wie viel Unsicherheit tatsächlich verschwindet, und rechtfertigt
 *  damit den Aufwand daneben. Zahlen ohne Wirkung auf den Termin verengen trotzdem den
 *  Spielraum danach — das muss dranstehen, sonst liest man „0" als „sinnlos". */
function taskGainText(t) {
  const g = (runtime.taskGain || {})[t.id];
  if (!g) return t.gain();
  if (g.months > 0)
    return `<b>Spanne −${g.months} ${g.months === 1 ? "Monat" : "Monate"}</b> · ${t.gain()}`;
  if (g.spare > 0)
    return `<b>Spielraum danach ±${eur(g.spare)} € genauer</b> · ${t.gain()}`;
  return t.gain();
}

function renderTasks() {
  const box = el("tasks");
  const sum = el("tasksSum");
  if (!box) return;
  /* Nach gemessener Wirkung sortiert, nicht nach Reihenfolge im Katalog. Was noch
     nicht gemessen ist, bleibt an seinem Platz — die Zahlen tröpfeln nach. */
  const gain = runtime.taskGain || {};
  const rank = (t) => {
    const g = gain[t.id];
    return g ? g.months * 100 + (g.spare ?? 0) : -1;
  };
  const open = openTasks().sort((a, b) => rank(b) - rank(a));
  if (sum)
    sum.textContent = open.length ? `${open.length} offen` : "nichts offen";

  if (!open.length) {
    box.innerHTML =
      '<div class="empty">Nichts offen. Sobald ein neuer Monat beginnt oder sich etwas ändert, taucht hier wieder etwas auf.</div>';
    return;
  }
  box.innerHTML = open
    .map(
      (t) =>
        `<div class="task"><button type="button" class="tcheck" data-task="${t.id}" aria-label="erledigt">○</button>` +
        `<div class="tbody"><div class="ttext">${t.text}<span class="teffort">${t.effort}</span></div>` +
        `<div class="tgain">${taskGainText(t)}</div></div>` +
        `<button type="button" class="tjump" data-jump="${t.jump}">hin →</button></div>`,
    )
    .join("");

  box.querySelectorAll("[data-task]").forEach((btn) =>
    btn.addEventListener("click", () => {
      doneTasks[btn.dataset.task] = new Date().toISOString();
      persist();
      renderTasks();
    }),
  );
  box
    .querySelectorAll("[data-jump]")
    .forEach((btn) =>
      btn.addEventListener("click", () => jumpTo(btn.dataset.jump)),
    );
}

function jumpTo(id) {
  const target = el(id);
  if (!target) return;
  let node = target;
  while (node) {
    if (node.tagName === "DETAILS") node.open = true;
    node = node.parentElement;
  }
  if (typeof target.scrollIntoView === "function")
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("flash");
  setTimeout(() => target.classList.remove("flash"), 1200);
}

/* ---- Was sich seit dem letzten Besuch geändert hat ---- */
async function renderVisit(run) {
  const box = el("visit");
  if (!box) return;
  let prev = null;
  try {
    prev = JSON.parse((await store.get(VISIT_KEY)) || "null");
  } catch {
    prev = null;
  }
  if (!prev || run.r34Month == null || prev.r34Month == null) return;

  const days = Math.round(
    (Date.now() - new Date(prev.at).getTime()) / 86400000,
  );
  if (days < VISIT_MIN_DAYS) return;

  const shift = prev.r34Month - run.r34Month;
  const parts = [];
  if (shift !== 0)
    parts.push(
      `Der Termin ist um <b>${plural(Math.abs(shift), "Monat", "Monate")}</b> nach ${shift > 0 ? "vorn" : "hinten"} gerutscht (${dat(prev.r34Month)} → ${dat(run.r34Month)}).`,
    );
  const priceDiff = Math.round(state.car - (prev.car ?? state.car));
  if (Math.abs(priceDiff) >= 200)
    parts.push(
      `Der Kaufpreis liegt ${priceDiff > 0 ? "höher" : "niedriger"} als damals (${priceDiff > 0 ? "+" : "−"}${eur(Math.abs(priceDiff))} €).`,
    );
  if (!parts.length) parts.push("Am Termin hat sich nichts geändert.");

  const next = openTasks()[0];
  box.hidden = false;
  box.innerHTML =
    `<div class="vhead">Seit deinem letzten Besuch vor ${plural(days, "Tag", "Tagen")}</div>` +
    `<div class="vbody">${parts.join(" ")}</div>` +
    (next
      ? `<div class="vnext">Als Nächstes: <b>${next.text}</b> — ${next.gain()}.
         <button type="button" class="act" data-jump="${next.jump}">hin →</button></div>`
      : "") +
    `<button type="button" class="vclose" id="visitClose" aria-label="Hinweis schließen">×</button>`;

  const close = el("visitClose");
  if (close) close.addEventListener("click", () => (box.hidden = true));
  box
    .querySelectorAll("[data-jump]")
    .forEach((btn) =>
      btn.addEventListener("click", () => jumpTo(btn.dataset.jump)),
    );
}

function rememberVisit() {
  if (!runtime.lastRun) return;
  store.set(
    VISIT_KEY,
    JSON.stringify({
      at: new Date().toISOString(),
      r34Month: runtime.lastRun.r34Month,
      financed: Math.round(runtime.lastRun.financed),
      car: Math.round(state.car),
      method: state.method,
    }),
  );
}

/* ---- abgeleitete Zeilen ---- */
function renderDerived(s, r) {
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
  /* Der Dauerauftrag weist an, das laufende Konto holt sich zurück, was es zum Leben
     braucht. Ohne diese Zeile stand hier eine Differenz von bis zu fünf Stellen, die
     als „Rundungsdifferenz" beschriftet war. */
  if (Math.round(r.giroCover) > 0)
    inflow.push(["davon ans laufende Konto zurück", -r.giroCover]);
  else if (Math.round(r.giroCover) < 0)
    inflow.push(["vom laufenden Konto vorgestreckt", -r.giroCover]);
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

  const line = ([label, v], cls = "") =>
    `<tr class="${cls}"><td>${label}</td><td>${v < 0 ? "−" : ""}${eur(Math.abs(v))} €</td></tr>`;
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
    render();
  });
}

function savingPhasesHTML(s, r) {
  const marks = savingMarks(s, r);
  if (!marks.length)
    return `Heute bleiben ${eur(s.netNow - s.living)} € übrig. Sobald ein Kauftermin zustande kommt, steht hier der Verlauf.`;

  /* Alle drei Spalten auf derselben Grundlage, damit die Zeile nachrechenbar ist:
     übrig − aufs Tagesgeld = zum Leben, immer. Vorher stand in der mittleren Spalte der
     Stand NACH dem Ausgleich und rechts die Differenz DAVOR — 660 − 660 ergab dann −40,
     und eine Tabelle, die sich nicht aufaddieren lässt, wirkt kaputt, auch wenn jede
     Zahl für sich stimmt. Was der Ausgleich zurückholt, steht als Hinweis dahinter. */
  const rows = marks
    .map((x) => {
      const free = x.flow - x.save;
      const zurueck = x.save - x.net;
      return (
        `<tr class="${free < 0 ? "neg" : ""}"><td>${x.label}</td>` +
        `<td>${eur(x.flow)} €</td><td>${eur(x.save)} €</td>` +
        `<td>${eur(free)} €${
          zurueck > 1
            ? ` <span class="mute">davon ${eur(zurueck)} € vom Tagesgeld</span>`
            : ""
        }</td></tr>`
      );
    })
    .join("");

  /* Der Durchschnitt zählt, was liegen bleibt, nicht was angewiesen wird. Vorher stand
     hier `savedTotal / r34Month` — und savedTotal enthielt auch die Beträge, die das
     laufende Konto im selben Monat wieder zurückholte. */
  const upto = r.path ? r.path.slice(0, r.r34Month || 0) : [];
  const avg = upto.length
    ? upto.reduce((a, p) => a + p.net, 0) / upto.length
    : 0;
  return (
    `<div class="cmpwrap"><table class="cmp phases"><thead><tr>` +
    `<th>Zeitpunkt</th><th>übrig</th><th>aufs Tagesgeld</th><th>zum Leben</th></tr></thead>` +
    `<tbody>${rows}` +
    `<tr class="sumline"><td>Durchschnitt bis ${dat(r.r34Month)}</td>` +
    `<td>${eur(avg + (r.freeAvg ?? 0))} €</td><td>${eur(avg)} €</td>` +
    `<td>${eur(r.freeAvg ?? 0)} €</td></tr></tbody></table></div>` +
    (s.saveMode === "fixed"
      ? `<span class="warn">Der Dauerauftrag von ${eur(s.saveFixed)} € läuft unverändert weiter, auch wenn nach dem Kauf des Alltagsautos weniger übrig bleibt. Was fehlt, holt sich das Modell vom Tagesgeld zurück.` +
        /* Liegt der Dauerauftrag dauerhaft über dem, was übrig bleibt, hebt der
           Ausgleich ihn jeden Monat wieder auf: der Regler bewegt den Termin dann
           nicht mehr, obwohl die angewiesene Summe weiter wächst. */
        (avg < s.saveFixed - 1
          ? ` Im Schnitt bleiben nur ${eur(avg)} € liegen — über diesem Betrag verschiebt der Dauerauftrag den Termin nicht mehr.`
          : "") +
        `</span>`
      : `<span class="warn">Es wandert immer alles Übrige aufs Tagesgeld — die Rate schwankt deshalb mit den laufenden Kosten und dem Netto.</span>`)
  );
}

/** Was im Plan steckt und ob es gesichert ist.
 *
 *  Der Zähler zählt bewusst über alle Belegarten und Handeingaben, nicht über ein
 *  einzelnes Modul: gesichert wird der ganze Plan, und die Anzeige soll das zeigen. */
function renderBackup() {
  const snap = planSnapshot();
  const led = snap.ledgers || {};
  const rows = ["price", "insR34", "insDaily", "actual"].reduce(
    (a, k) => a + (led[k]?.length ?? 0),
    0,
  );
  const own = Object.keys(snap.values || {}).length;
  const worth = rows + own;
  const unsaved = worth > 0 && isUnsaved();

  const sum = el("backupSum");
  if (sum) {
    sum.textContent = unsaved ? "nicht gesichert" : worth ? "gesichert" : "";
    sum.className = "psum" + (unsaved ? " warnsum" : "");
  }

  const box = el("backupState");
  if (!box) return;
  if (!worth) {
    box.textContent =
      "Noch nichts einzutragen, was verloren gehen könnte. Sobald Angebote oder Kontostände dazukommen, lohnt das Sichern.";
    return;
  }
  const parts = [
    plural(rows, "Beleg", "Belege"),
    plural(own, "eigene Zahl", "eigene Zahlen"),
  ];
  box.innerHTML =
    `<b>${parts.join(" · ")}</b> im Plan. ` +
    (unsaved
      ? `<span class="warn">Seit der letzten Sicherung hat sich etwas geändert.</span>`
      : "Der aktuelle Stand ist gesichert.");
}

function renderSummaries(s) {
  GROUPS.forEach((g) => {
    const node = el("gsum_" + g.id);
    if (node && g.sum) node.textContent = g.sum(s);
  });
}

/* ---- Belege ---- */
function renderLedger(id) {
  const box = el("led_" + id);
  if (!box) return;
  const def = LEDGERS[id];
  const rows = ledgers[id];

  const body = rows.length
    ? rows
        .map((row, i) => {
          const value = def.value(row);
          return (
            `<div class="lrow"><div class="lmain">` +
            `<div class="lsrc">${esc(def.label(row))}</div>` +
            `<div class="lmeta">${esc(def.meta(row))}</div></div>` +
            `<div class="lval">${value == null ? "—" : eur(value) + " €"}</div>` +
            `<button type="button" class="ldel" data-led="${id}" data-i="${i}" aria-label="Zeile löschen">×</button></div>`
          );
        })
        .join("")
    : `<div class="empty">${def.empty}</div>`;

  const inputs = def.cols
    .map((c) => {
      if (c.type === "select")
        return `<select data-led="${id}" data-col="${c.key}" aria-label="${esc(c.key)}">${c.opts
          .map((o) => `<option>${esc(o)}</option>`)
          .join("")}</select>`;
      if (c.type === "month")
        return `<input data-led="${id}" data-col="${c.key}" type="month" value="${ymOf(0)}" aria-label="Monat">`;
      return `<input data-led="${id}" data-col="${c.key}" type="${c.type}" placeholder="${esc(c.ph)}"${
        c.type === "number" ? ' step="any"' : ""
      }>`;
    })
    .join("");

  const hints = [];
  if (id === "price") {
    const foreign = rows.filter((r) => r.cur && r.cur !== "EUR").length;
    if (foreign > 0 && foreign < rows.length)
      hints.push(
        "Angebote aus dem Ausland und aus Deutschland im selben Median: der Auslandspreis ist ab Werk, der deutsche frei Haus. Entweder nur eine Sorte erfassen oder den Import-Rechner nutzen.",
      );
    if (rows.length > 0 && foreign === rows.length && !state.importOn)
      hints.push(
        "Alle Angebote sind Auslandspreise ab Werk, der Import-Rechner ist aus. Der Kaufpreis liegt damit um Fracht, Zoll, EUSt und §21 zu niedrig.",
      );
  }

  box.innerHTML =
    `<div class="lhead"><span>${def.title}</span>${helpBtn(def.help)}</div>` +
    body +
    hints.map((h) => `<div class="lhint">⚠ ${h}</div>`).join("") +
    `<div class="ladd">${inputs}<button type="button" data-add="${id}">+ hinzufügen</button></div>`;
}

/* ---- Datenquellen ---- */
function renderSources() {
  const count = (st) =>
    SOURCES.filter((s) => (live[s.id] || {}).state === st).length;
  const ok = count("ok");
  const bad = count("fail");
  const busy = count("load");

  const sum = el("srcSum");
  if (sum) {
    sum.textContent = busy
      ? "wird geladen …"
      : bad
        ? `${ok} live · ${bad} offline, Rückfallwerte aktiv`
        : `alle ${ok} live`;
    sum.classList.toggle("warn", !busy && bad > 0);
  }

  el("sources").innerHTML = SOURCES.map((s) => {
    const st = live[s.id] || { state: "load" };
    const dot =
      st.state === "ok" ? "live" : st.state === "fail" ? "fail" : "load";
    const value =
      st.state === "ok"
        ? s.fmt(st.data)
        : st.state === "fail"
          ? `nicht erreichbar — ${esc(st.error)}, es gilt der Rückfallwert`
          : "wird geladen …";
    const stamp =
      st.state === "ok" && st.data.asOf ? ` · Stand ${esc(st.data.asOf)}` : "";
    const key = s.editable
      ? `<input class="skey" data-src="${s.id}" value="${esc(s.key)}" spellcheck="false" aria-label="Reihenschlüssel ${esc(s.label)}">`
      : "";
    return (
      `<div class="src"><div class="sdot ${dot}"></div><div class="sbody">` +
      `<div class="sname">${s.label}</div><div class="sval">${value}${stamp}</div>` +
      `<div class="smeta">${s.note}${
        s.docs
          ? ` · <a href="${s.docs}" target="_blank" rel="noopener noreferrer">Quelle ↗</a>`
          : ""
      }</div>${key}</div></div>`
    );
  }).join("");

  document.querySelectorAll(".skey").forEach((node) => {
    node.addEventListener("change", (e) => {
      const s = SOURCES.find((x) => x.id === e.target.dataset.src);
      if (!s) return;
      s.key = e.target.value.trim();
      persist();
      loadSources();
    });
  });
}

async function loadSources() {
  SOURCES.forEach((s) => {
    live[s.id] = { state: "load" };
  });
  renderSources();
  await Promise.all(
    SOURCES.map(async (s) => {
      const r = await firstUsable(s.urls(s), s.parse);
      live[s.id] = r.ok
        ? { state: "ok", data: r.value, at: new Date() }
        : { state: "fail", error: r.error, at: new Date() };
      renderSources();
    }),
  );
  adoptLive();
  ALLFIELDS.forEach((f) => setInput("f_" + f.key, state[f.key]));
  render();
}

function renderNote() {
  el("note").innerHTML =
    `Monat 0 ist <b>${dat(0)}</b> und wandert mit dem Kalender mit — die Datei veraltet nicht. ` +
    `Alle Kontostände gelten zum <b>Monatsende</b>, nach Gehalt, Kosten und Dauerauftrag. ` +
    `Kfz-Steuer, H-Termin, Alter 25 und der Saisonfaktor werden gerechnet, nicht getippt. ` +
    `Läuft die Seite über <code>file://</code> oder blockt eine Schnittstelle CORS, siehst du das unter „Datenquellen"; ` +
    `gerechnet wird dann mit dem hinterlegten Rückfallwert weiter. Alle Angaben ohne Gewähr.`;
}

/* ---- Taktgeber ---- */
let heavyTimer = null;
function scheduleHeavy() {
  clearTimeout(heavyTimer);
  heavyTimer = setTimeout(() => {
    heavyTimer = null;
    if (!runtime.lastRun) return;
    runtime.lastSpread = sensitivity(runtime.lastRun);
    renderSpread(runtime.lastRun, runtime.lastSpread);
    renderLevers(runtime.lastSpread);
    renderImpacts(runtime.lastSpread);
    renderTimeline(runtime.lastRun);
    renderBodyCompare();
    if (state.method === "rest") renderRestCompare(runtime.lastRun);
    renderTrack(runtime.lastRun);
    renderTasks();
    scheduleForecast();
  }, HEAVY_DEBOUNCE_MS);
}

let forecastTimer = null;
/** Ein paar hundert vollständige Simulationen kosten mehr als der gesamte übrige
 *  Renderlauf. Sie laufen deshalb erst, wenn eine Weile nichts mehr passiert ist —
 *  bis dahin steht die Spanne aus der Faustformel. */
function scheduleForecast() {
  clearTimeout(forecastTimer);
  forecastTimer = setTimeout(() => {
    forecastTimer = null;
    if (!runtime.lastRun || runtime.lastRun.r34Month == null) return;
    runtime.lastForecast = forecast(state);
    renderSpread(runtime.lastRun, runtime.lastSpread);
    measureTaskGains();
  }, FORECAST_DEBOUNCE_MS);
}

/** Was jede offene Aufgabe an Unsicherheit wegnimmt — eine Messung je Durchgang.
 *
 *  Nacheinander statt am Stück: eine Aufgabe kostet rund 30 ms, sechs am Stück wären
 *  ein spürbarer Hänger. So gibt der Hauptthread zwischendurch ab, und die Zahlen
 *  tröpfeln in die Liste. */
function measureTaskGains() {
  const offen = openTasks().filter((t) => t.proves);
  runtime.taskGain = runtime.taskGain || {};
  let i = 0;
  const step = () => {
    if (i >= offen.length) {
      renderTasks();
      return;
    }
    const t = offen[i++];
    try {
      runtime.taskGain[t.id] = narrowingBy(state, t.proves);
    } catch {
      runtime.taskGain[t.id] = null;
    }
    setTimeout(step, 0);
  };
  step();
}

function render() {
  syncDerivedFields();
  applyVisibility(state);
  renderProvDots();

  const run = simulate(state, { path: true });
  runtime.lastRun = run;

  renderSummaries(state);
  renderDerived(state, run);
  renderBackup();
  wireApprAdopt();
  if (renderRestVisibility()) renderRestSummary(run);
  renderHero(run);
  renderMini(run);
  renderTimeline(run);
  scheduleHeavy();
}

/** Die Zusammenfassung einer Gruppe braucht Laufzeitzustand und steht deshalb hier
 *  statt im Katalog — das hält catalog.js frei von Abhängigkeiten. */
const GROUP_SUMMARIES = {
  frame: (s) =>
    `R34 ab ${fmtYm(s.startYm)} · ${eur(s.reserve)} € Rücklage`,
  facts: (s) =>
    (s.licenseOwned ? "Schein da" : "Schein " + dat(licenceMonth(s))) +
    ` · ${plural(ledgers.income.length, "Gehaltsschritt", "Gehaltsschritte")}`,
  saving: (s) =>
    `${num(s.saveRate, 2)} % Tagesgeld · ${num(s.inflCost, 1)} % Inflation`,
  body: () => {
    const n = ledgers.price.length;
    return n
      ? `${plural(n, "Angebot", "Angebote")} · ${state.r34Body}`
      : `${state.r34Body} · keine Angebote`;
  },
  r34: (s) => {
    const m =
      runtime.lastRun?.r34Month ?? Math.max(0, idxFromYm(s.startYm) ?? 0);
    return `${eur(r34RunAt(s, m, 0))} €/M Unterhalt`;
  },
  daily: (s) =>
    `${eur(dailyRunAt(s, runtime.lastRun?.dailyMonth ?? 0, 0))} €/M Unterhalt`,
  import: (s) =>
    s.importOn ? `${eur(importCost(s).total)} € an der Rampe` : "aus",
};

/** baseMetric und selectedPoint sind modulinterner Zustand. Wer sie von außen
 *  zurücksetzen muss (Moduswechsel, Zurücksetzen), tut das über diese beiden. */
function resetMiniBaseline() {
  baseMetric = null;
}
function clearSelectedPoint() {
  selectedPoint = null;
}

export {
  GROUP_SUMMARIES,
  resetMiniBaseline,
  clearSelectedPoint,
  syncDerivedFields,
  renderProvDots,
  renderImpacts,
  applyVisibility,
  renderSpread,
  renderHero,
  spreadModalHTML,
  fundsTableHTML,
  renderMini,
  renderTimeline,
  renderLevers,
  renderBodyCompare,
  renderRestVisibility,
  renderRestSummary,
  renderRestCompare,
  actualPoints,
  renderTrack,
  renderBackup,
  renderTasks,
  jumpTo,
  renderVisit,
  rememberVisit,
  renderDerived,
  renderSummaries,
  renderLedger,
  renderSources,
  loadSources,
  renderNote,
  scheduleHeavy,
  render,
};
