/* ============================================================
   Vergleiche — Karosserie gegen Karosserie, Termin gegen Kreditsumme
   ============================================================ */
import { dat, ymOf } from "../calendar.js";
import { BODIES, LEFTOVER_TIGHT, isSolid } from "../config.js";
import { el } from "../dom.js";
import { eur, num, plural } from "../format.js";
import { bodyPrice } from "../pricing.js";
import { simulate } from "../simulate.js";
import { prov, state } from "../state.js";


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

export { renderBodyCompare, restRows, renderRestVisibility, renderRestSummary, renderRestCompare };
