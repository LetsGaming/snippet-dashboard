/* ============================================================
   Zeitleiste der Termine
   ============================================================ */
import { dat } from "../calendar.js";
import { el } from "../dom.js";
import { clamp } from "../format.js";
import { spreadWindow } from "../spread.js";
import {
  age25Known,
  age25Month,
  hMonth,
  hMonthKnown,
  licenceMonth,
  runtime,
  state,
} from "../state.js";


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
  /* Ohne Erstzulassung bzw. ohne Geburtsdatum liefern beide Termine NEVER (1e6).
     Ungeprüft übernommen zieht ein einziger Marker das Ende der Leiste auf Monat
     1.000.000: alle übrigen Marken kollabieren bei 0 %, und im Etikett steht das
     Jahr 85359. `syncDerivedFields` guarded genau diesen Fall, die Leiste nicht. */
  if (r.r34Month != null && hMonthKnown(s) && r.r34Month < hMonth(s))
    events.push({ m: hMonth(s), d: "H-Kennzeichen" });
  if (
    r.r34Month != null &&
    age25Known(s) &&
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

export { renderTimeline };
