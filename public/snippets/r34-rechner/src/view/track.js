/* ============================================================
   Soll-Ist — erfasste Kontostände gegen den simulierten Verlauf
   ============================================================ */
import { refresh } from "../refresh.js";
import { dat, fmtYm, idxFromYm, ymOf } from "../calendar.js";
import { LEDGERS } from "../catalog.js";
import { el, setInput, alle } from "../dom.js";
import { esc, eur, plural } from "../format.js";
import { simulate } from "../simulate.js";
import { ledgers, prov, runtime, state } from "../state.js";
import { persist } from "../store.js";
import { syncTopControls } from "../topcontrols.js";


/* ---- Soll-Ist ---- */
const CHART = { w: 640, h: 230, padL: 56, padR: 10, padT: 10, padB: 28 };


let selectedPoint = null;


function actualPoints() {
  return ledgers.actual
    .map((a) => ({ m: idxFromYm(a.month), v: a.amt, note: a.src }))
    .filter((p) => p.m != null && isFinite(p.v))
    .sort((a, b) => a.m - b.m);
}


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

  /* Der Bereich, in dem die gezogenen Läufe liegen: p10 bis p90 aus der Vorschau.
     Sie läuft entprellt im Hintergrund — beim ersten Zeichnen steht hier noch nichts,
     dann kommt die Kurve allein, und der Bereich schiebt sich nach. */
  const band = (runtime.lastForecast?.band || []).filter(
    (b) => b.m >= x0 && b.m <= x1,
  );
  const values = [
    ...pts.map((p) => p.v),
    0,
    ...planIn.map((p) => p.v),
    ...band.map((b) => b.p90),
    ...band.map((b) => b.p10),
  ];
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
  /* Fläche von p90 hin und p10 zurück, dazu der Mittelwert als dünne Linie. Erst ab
     zwei Stützstellen — eine einzelne ergibt keine Fläche. */
  const fan =
    band.length > 1
      ? `<path class="cfan" d="${band
          .map(
            (b, i) =>
              `${i ? "L" : "M"}${px(b.m).toFixed(1)},${py(b.p90).toFixed(1)}`,
          )
          .join(" ")} ${[...band]
          .reverse()
          .map((b) => `L${px(b.m).toFixed(1)},${py(b.p10).toFixed(1)}`)
          .join(" ")} Z"/>` +
        `<path class="cmid" d="${line(band.map((b) => ({ m: b.m, v: b.p50 })))}"/>`
      : "";

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
  let verdict;
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
    fan +
    buyMark +
    `<path class="cplan" d="${line(planIn)}"/><path class="creal" d="${line(pts)}"/>${dots}</svg></div>` +
    `<div class="clegend"><span class="lp">Plan</span><span class="lr">tatsächlich</span>` +
    (band.length > 1
      ? `<span class="lb">Bereich der Läufe (p10–p90)</span>`
      : "") +
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
  alle(chart, "[data-point]").forEach((node) => {
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
    refresh();
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
    refresh();
  });
  bind("adoptCap", () => {
    state.cap = Math.max(0, Math.round(last.v));
    prov.cap = "proof";
    syncTopControls();
    persist();
    refresh();
  });
}

function clearSelectedPoint() {
  selectedPoint = null;
}


export { actualPoints, trackRates, renderTrack, showPointInfo, wireTrackButtons, clearSelectedPoint };
