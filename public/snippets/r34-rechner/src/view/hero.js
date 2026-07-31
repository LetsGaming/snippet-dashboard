/* ============================================================
   Kopfbereich — Ergebnis, Spanne und die Leiste darüber

   Der Balken oben (`resultbar`) hält seinen eigenen Vergleichswert: er soll
   zeigen, wohin sich der Termin seit der letzten Änderung bewegt hat.
   ============================================================ */
import { dat } from "../calendar.js";
import { MINI_SETTLE_MS } from "../config.js";
import { el, helpBtn, inWords } from "../dom.js";
import { eur, plural } from "../format.js";
import { dailyRunAt, priceFromLedger } from "../pricing.js";
import { mittleresSparen, statusOf } from "../simulate.js";
import { spreadWindow, targetIsCredit } from "../spread.js";
import { runtime, state } from "../state.js";


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
  /* „Wie viel landet eigentlich auf dem Tagesgeld?" stand bis hierher an vier Stellen
     und nirgends vollständig: oben der Dauerauftrag (die Anweisung, nicht der Zufluss),
     im Sparverlauf vier Stichproben, in der Geldflusstabelle nur Summen bis zum Kauf. */
  cards.push(
    statCard(
      "Aufs Tagesgeld",
      `${eur(mittleresSparen(r))} €/M`,
      `im Schnitt · insgesamt ${eur(r.savedTotal)} €`,
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
    r.overdrawn
      ? `<div class="hwarn">⚠ Dieser Plan setzt eine Überziehung von <b>${eur(-r.overdraftPeak)} €</b> voraus.
         Banken räumen zwei bis drei Monatsnettos ein — der Termin oben ist damit nicht erreichbar.
         Setz den Dauerauftrag herunter oder die Lebenshaltung realistisch an.</div>`
      : r.overdraftMonths > 0
      ? `<div class="hwarn">⚠ Das laufende Konto steht <b>${plural(r.overdraftMonths, "Monat", "Monate")}</b>
         im Minus, tiefstens <b>${eur(r.overdraftPeak)} €</b> — das kostet <b>${eur(r.overdraftCost)} €</b>
         Dispozinsen bis zum Kauf. Vom Tagesgeld kommt nichts zurück: was dort liegt, gehört dem R34.</div>`
      : r.negMonths > 0
        ? `<div class="hwarn">⚠ In <b>${plural(r.negMonths, "Monat", "Monaten")}</b> gibt der Monat
           den Dauerauftrag von ${eur(state.saveFixed)} € nicht her.</div>`
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


/** baseMetric und selectedPoint sind modulinterner Zustand. Wer sie von außen
 *  zurücksetzen muss (Moduswechsel, Zurücksetzen), tut das über diese beiden. */
function resetMiniBaseline() {
  baseMetric = null;
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

export { renderSpread, renderHero, spreadModalHTML, renderMini, resetMiniBaseline, watchHero };
