import { dat, fmtYm, idxFromYm, ymOf } from "./calendar.js";
import { ALLFIELDS, FIELD_BY_KEY, GROUPS } from "./catalog.js";
import {
  FORECAST_DEBOUNCE_MS,
  HEAVY_DEBOUNCE_MS,
  PROV_META,
  VISIT_KEY,
  VISIT_MIN_DAYS,
  isSolid,
} from "./config.js";
import { el, setInput, setSeg, alle } from "./dom.js";
import { onRefresh } from "./refresh.js";
import { forecast } from "./forecast.js";
import { eur, num, plural } from "./format.js";
import {
  dailyRunAt,
  importCost,
  premiumFromLedger,
  priceFromLedger,
  r34RunAt,
} from "./pricing.js";
import { simulate } from "./simulate.js";
import { sensitivity } from "./spread.js";
import {
  hMonth,
  hMonthKnown,
  ledgers,
  licenceMonth,
  prov,
  resolveSf,
  runtime,
  state,
} from "./state.js";
import { isUnsaved, store } from "./store.js";
import { planSnapshot } from "./snapshot.js";
import { openTasks } from "./tasks.js";
import {
  renderBodyCompare,
  renderRestCompare,
  renderRestSummary,
  renderRestVisibility,
} from "./view/compare.js";
import { renderDerived, wireApprAdopt } from "./view/derived.js";
import { renderHero, renderMini, renderSpread } from "./view/hero.js";
import { renderLevers } from "./view/levers.js";
import { jumpTo, measureTaskGains, renderTasks } from "./view/tasks.js";
import { renderTimeline } from "./view/timeline.js";
import { renderTrack } from "./view/track.js";

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


/* ---- Was sich seit dem letzten Besuch geändert hat ---- */
async function renderVisit(run) {
  const box = el("visit");
  if (!box) return;
  let prev;
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
  alle(box, "[data-jump]").forEach((btn) =>
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
  /* Vorher stand hier `g.sum` — eine Eigenschaft, die der Katalog nicht kennt. Die
     Zusammenfassungen unter GROUP_SUMMARIES wurden damit nie gezeichnet, und die
     Zeile neben jeder Gruppenüberschrift blieb leer. */
  GROUPS.forEach((g) => {
    const node = el("gsum_" + g.id);
    const fasse = GROUP_SUMMARIES[g.id];
    if (node && fasse) node.textContent = fasse(s);
  });
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
    /* Der Bereich wird nur so weit gesammelt, wie die Soll-Ist-Kurve reicht: ein
       Pfad je Lauf kostet, und was niemand sieht, muss nicht gerechnet werden. */
    runtime.lastForecast = forecast(state, {
      bandMonths: Math.min(120, (runtime.lastRun.r34Month ?? 24) + 12),
    });
    renderSpread(runtime.lastRun, runtime.lastSpread);
    renderTrack(runtime.lastRun);
    measureTaskGains();
  }, FORECAST_DEBOUNCE_MS);
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
/* Der Taktgeber trägt sich bei den Blattmodulen ein, statt dass sie ihn
   importieren — sonst zeigt jede Ansicht auf diese Datei zurück. */
onRefresh(render);

export {
  syncDerivedFields,
  renderProvDots,
  renderImpacts,
  applyVisibility,
  renderVisit,
  rememberVisit,
  renderBackup,
  renderSummaries,
  renderNote,
  scheduleHeavy,
  render,
};
