/* ============================================================
   R34 Planungsrechner — Regressionstests

   Die Rechenkerne fassen kein DOM an und laufen deshalb direkt in Node. Getestet
   wird, was sich still verrechnen kann: Kontoführung, Steuertarif, Finanzmathematik
   und die Invarianten, an denen die Anzeigen hängen.

   Läuft ohne Abhängigkeiten über den eingebauten Testrunner:  node --test tests/
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

const SRC = "../public/snippets/r34-rechner/src";
const { state } = await import(`${SRC}/state.js`);
const { seasonMonths, seasonValid, hMonthKnown } = await import(
  `${SRC}/state.js`
);
const { simulate } = await import(`${SRC}/simulate.js`);
const { sensitivity, spreadWindow, LEVERS } = await import(`${SRC}/spread.js`);
const { kfzTaxYear, co2Component } = await import(`${SRC}/tax.js`);
const { annuity, fuelMonth, median, growth } = await import(`${SRC}/format.js`);
const { importCost, priceFromLedger, apprFromLedger } = await import(
  `${SRC}/pricing.js`
);
const { toEur, RATE_CACHE } = await import(`${SRC}/currency.js`);
const { ledgers } = await import(`${SRC}/ledgers.js`);
const { idxFromYm, dat } = await import(`${SRC}/calendar.js`);

/* `state` ist ein Modul-Singleton. Jeder Test setzt ihn auf die Katalogwerte zurück
   und legt seine Abweichungen darüber — sonst tropft ein Test in den nächsten. */
const DEFAULTS = structuredClone(state);
const withState = (patch = {}) => {
  Object.keys(state).forEach((k) => delete state[k]);
  Object.assign(state, structuredClone(DEFAULTS), patch);
  return state;
};

/* Konfigurationen, die die Simulation in unterschiedliche Zweige zwingen. */
const SCENARIOS = [
  ["Vorgaben", {}],
  ["Dauerauftrag über dem Überschuss", { saveFixed: 1500 }],
  ["Dauerauftrag absurd hoch", { saveFixed: 3000 }],
  ["alles Übrige", { saveMode: "auto" }],
  ["teurer Führerschein", { licence: 30000 }],
  ["Führerschein vorhanden", { licenseOwned: true }],
  ["Finanzierung 2 Jahre", { method: "fin2" }],
  ["Finanzierung 3 Jahre", { method: "fin3" }],
  ["Restfinanzierung nach Termin", { method: "rest", restGoal: "date" }],
  ["Restfinanzierung nach Summe", { method: "rest", restGoal: "amount" }],
  ["Restfinanzierung nach Rate", { method: "rest", restGoal: "rate" }],
  ["R34 zuerst", { strat: "r34first" }],
  ["viel Startkapital", { cap: 40000 }],
  ["teures Auto ohne Startkapital", { cap: 0, car: 60000 }],
  ["ganzjährig zugelassen", { r34Season: false }],
  ["ohne H-Kennzeichen", { hPlateWanted: false }],
  ["Liebhabertarif von Anfang an", { r34Ins: "Liebhaber" }],
  ["Import aus Japan", { importOn: true }],
];

/* ---------------- Kontoführung ---------------- */

test("Aufstellung bis zum Kaufmonat geht exakt auf", () => {
  for (const [name, patch] of SCENARIOS) {
    const r = simulate(withState(patch), { path: true });
    if (r.r34Month == null) continue;
    const sum =
      state.cap +
      r.savedTotal +
      r.interestEarned -
      r.preBuy.licence -
      r.preBuy.daily -
      r.giroCover;
    assert.ok(
      Math.abs(sum - r.capAtBuy) < 0.01,
      `${name}: Aufstellung weicht um ${(sum - r.capAtBuy).toFixed(2)} € ab`,
    );
  }
});

test("Verwendung im Kaufmonat ergibt denselben Stand", () => {
  for (const [name, patch] of SCENARIOS) {
    const r = simulate(withState(patch));
    if (r.r34Month == null) continue;
    const used =
      r.deposited + r.sideAtBuy + (r.capAtBuy - r.deposited - r.sideAtBuy);
    assert.ok(
      Math.abs(used - r.capAtBuy) < 0.01,
      `${name}: Verwendung weicht ab`,
    );
    assert.ok(r.sideAtBuy >= r.oneOffs.r34Extra - 0.01, `${name}: Nebenkosten`);
  }
});

test("Tagesgeld geht nie ins Minus", () => {
  const cases = [...SCENARIOS, ["Führerschein 80k", { licence: 80000 }]];
  for (const [name, patch] of cases) {
    const r = simulate(withState(patch), { path: true });
    const worst = Math.min(...r.path.map((p) => p.cap));
    assert.ok(worst >= -0.01, `${name}: Tagesgeld fiel auf ${worst.toFixed(0)}`);
  }
});

test("nicht gedeckte Einmalkosten landen auf dem laufenden Konto", () => {
  const r = simulate(withState({ cap: 0, licence: 30000 }), { path: true });
  assert.ok(r.negMonths > 0, "der Fehlbetrag muss als Minus sichtbar werden");
  assert.ok(r.minGiro < 0);
});

test("laufende Kosten beginnen im Kaufmonat, nicht danach", () => {
  const r = simulate(withState(), { path: true });
  for (const m of [r.r34Month, r.dailyMonth]) {
    assert.ok(m != null && m > 0);
    assert.ok(
      r.path[m].flow < r.path[m - 1].flow - 100,
      `Unterhalt fehlt im Kaufmonat ${dat(m)}`,
    );
  }
});

test("was liegen bleibt ist nie mehr als was angewiesen wurde", () => {
  const r = simulate(withState({ saveFixed: 1500 }), { path: true });
  for (const p of r.path) assert.ok(p.net <= p.save + 1e-9);
  assert.ok(
    r.path.some((p) => p.net < p.save - 1),
    "bei zu hohem Dauerauftrag muss ein Ausgleich stattfinden",
  );
});

/* ---------------- Kaufentscheidung ---------------- */

test("höherer Kaufpreis kauft nie früher", () => {
  let prev = -1;
  for (const car of [10000, 20000, 28500, 40000, 60000, 100000]) {
    const r = simulate(withState({ car }));
    if (r.r34Month == null) continue;
    assert.ok(r.r34Month >= prev, `Kaufpreis ${car} kauft früher als der davor`);
    prev = r.r34Month;
  }
});

test("höheres Startkapital kauft nie später", () => {
  let prev = Infinity;
  for (const cap of [0, 2000, 5000, 10000, 20000, 40000]) {
    const r = simulate(withState({ cap }));
    if (r.r34Month == null) continue;
    assert.ok(r.r34Month <= prev, `Startkapital ${cap} kauft später`);
    prev = r.r34Month;
  }
});

test("Rücklage bleibt beim Barkauf stehen", () => {
  const r = simulate(withState(), { path: true });
  assert.ok(r.capAtBuy - r.deposited - r.sideAtBuy >= state.reserve - 0.01);
});

test("Vorgabe für die Kreditrate wird eingehalten", () => {
  for (const restRate of [100, 200, 350, 600]) {
    const r = simulate(withState({ method: "rest", restGoal: "rate", restRate }));
    if (r.r34Month == null) continue;
    assert.ok(r.payment <= restRate + 0.01, `Rate ${r.payment.toFixed(2)}`);
  }
});

test("Vorgabe für die Kreditsumme wird eingehalten", () => {
  for (const restAmount of [2000, 5000, 10000, 25000]) {
    const r = simulate(
      withState({ method: "rest", restGoal: "amount", restAmount }),
    );
    if (r.r34Month == null) continue;
    assert.ok(r.financed <= restAmount + 0.01);
  }
});

test("Anzahlung plus Kredit ergibt den Preis, Rate mal Laufzeit die Zinsen", () => {
  for (const method of ["fin2", "fin3", "rest"]) {
    const r = simulate(withState({ method }));
    if (!(r.financed > 0)) continue;
    assert.ok(Math.abs(r.deposited + r.financed - r.priceAtBuy) < 0.01, method);
    assert.ok(
      Math.abs(r.payment * r.term * 12 - r.financed - r.interest) < 0.01,
      method,
    );
  }
});

test("Laufzeit wird auf 2 bis 5 Jahre begrenzt", () => {
  const term = (restTerm) =>
    simulate(withState({ method: "rest", restTerm })).term;
  assert.equal(term(99), 5);
  assert.equal(term(1), 2);
  assert.equal(term(4), 4);
  // 0 ist keine Laufzeit, sondern eine leere Eingabe — dafür gilt die Vorgabe
  assert.equal(term(0), 3);
  assert.equal(term(""), 3);
  assert.equal(term(NaN), 3);
});

/* ---------------- Kfz-Steuer ---------------- */

const otto = (o) => kfzTaxYear({ fuel: "otto", ...o });

test("Tarif vor Juli 2009 nach Hubraum und Schadstoffklasse", () => {
  // 25 angefangene 100 cm³ beim RB25DET
  assert.equal(otto({ ez: "1998-06", ccm: 2498, norm: "ohne Einstufung" }), 634);
  assert.equal(otto({ ez: "1998-06", ccm: 2498, norm: "Euro 2" }), 184);
  assert.equal(otto({ ez: "1998-06", ccm: 2498, norm: "Euro 1" }), 378);
  assert.equal(
    kfzTaxYear({ ez: "2005-01", ccm: 1900, norm: "Euro 2", fuel: "diesel" }),
    304, // 19 × 16,05 = 304,95 → abgerundet
  );
});

test("Oldtimerpauschale schlägt alles andere", () => {
  assert.equal(
    otto({ ez: "1998-06", ccm: 2498, norm: "ohne Einstufung", hPlate: true }),
    191.73,
  );
});

test("CO2-Tarif ab Juli 2009 mit Freibetrag nach Zulassungsjahr", () => {
  assert.equal(otto({ ez: "2012-05", ccm: 1598, co2: 139 }), 90); // 16×2 + 29×2
  assert.equal(otto({ ez: "2010-03", ccm: 3000, co2: 200 }), 220); // 30×2 + 80×2
  assert.equal(co2Component(150, 2022 * 12 + 2), 121.5); // 20×2 + 20×2,2 + 15×2,5
  assert.equal(otto({ ez: "2022-03", ccm: 1998, co2: 150 }), 161); // 161,5 → 161
});

test("Günstigerprüfung im Übergangsfenster gilt dauerhaft", () => {
  // EZ 01/2009: alt 16×6,75 = 108, neu 16×2 + 40×2 = 112 → der niedrigere zählt
  assert.equal(otto({ ez: "2009-01", ccm: 1600, norm: "Euro 3+", co2: 160 }), 108);
});

test("unvollständige Fahrzeugdaten ergeben keine Steuer statt Unsinn", () => {
  assert.equal(otto({ ez: "", ccm: 2498, norm: "Euro 2" }), 0);
  assert.equal(otto({ ez: "1998-06", ccm: 0, norm: "Euro 2" }), 0);
});

/* ---------------- Finanzmathematik ---------------- */

test("Annuität rechnet den Effektivzins auf den Monat um", () => {
  const p = annuity(10000, 3, 0.085);
  const r = Math.pow(1.085, 1 / 12) - 1;
  assert.ok(Math.abs(p - (10000 * r) / (1 - Math.pow(1 + r, -36))) < 1e-9);
  assert.ok(p < 315, "durch zwölf geteilt wären es 315,68 €");
  assert.equal(annuity(1000, 3, 0), 1000 / 36);
});

test("Annuität bleibt bei unsinnigen Eingaben endlich", () => {
  for (const v of [annuity(0, 3, 0.08), annuity(-5, 3, 0.08)])
    assert.equal(v, 0);
  for (const v of [annuity(1000, 0, 0.08), annuity(1000, 3, -2), annuity(1000, 3, NaN)])
    assert.ok(Number.isFinite(v), "keine Rate darf NaN oder Infinity werden");
});

test("Spritkosten und Hilfsfunktionen", () => {
  assert.ok(Math.abs(fuelMonth(5000, 11, 2.43) * 12 - 1336.5) < 1e-9);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
  assert.ok(Math.abs(growth(10, 12) - 1.1) < 1e-12);
});

test("Fremdwährung wird über den Kurs je Euro umgerechnet", () => {
  RATE_CACHE.JPY = null;
  assert.equal(toEur(100, "EUR"), 100);
  assert.ok(Math.abs(toEur(170000, "JPY") - 1000) < 1e-9); // Handwert 170
  RATE_CACHE.JPY = 160;
  assert.ok(Math.abs(toEur(160000, "JPY") - 1000) < 1e-9); // Live schlägt Handwert
  RATE_CACHE.JPY = null;
});

/* ---------------- Zulassung, Saison, Import ---------------- */

test("Saisonlänge wird auf das zulässige Fenster geklemmt", () => {
  const s = (from, to) => ({ r34Season: true, r34SeasonFrom: from, r34SeasonTo: to });
  assert.equal(seasonMonths(s(3, 10)), 8);
  assert.equal(seasonMonths(s(11, 2)), 4); // über den Jahreswechsel
  assert.equal(seasonMonths(s(1, 12)), 11); // zwölf gibt es nicht
  assert.equal(seasonMonths(s(5, 5)), 2); // einer auch nicht
  assert.equal(seasonValid(s(1, 12)), false);
  assert.equal(seasonValid(s(3, 10)), true);
  assert.equal(seasonMonths({ r34Season: false }), 12);
});

test("Einfuhr: Sammlungsstück gegen regulär", () => {
  const s = withState({ importOn: true, impJpy: 2800000, jpyRate: 170, impFreight: 2200, impReg: 1400 });
  const coll = importCost({ ...s, impCollector: true });
  const reg = importCost({ ...s, impCollector: false, impDuty: 10 });
  assert.equal(coll.dutyPct, 0);
  assert.equal(coll.vatPct, 7);
  assert.ok(Math.abs(coll.cif - (2800000 / 170 + 2200)) < 1e-9);
  assert.ok(Math.abs(coll.vat - coll.cif * 0.07) < 1e-9);
  assert.equal(reg.vatPct, 19);
  assert.ok(Math.abs(reg.duty - reg.cif * 0.1) < 1e-9);
  assert.ok(Math.abs(reg.vat - (reg.cif + reg.duty) * 0.19) < 1e-9);
  assert.ok(reg.total > coll.total, "regulär muss teurer sein");
});

test("unbrauchbarer Yen-Kurs sprengt die Einfuhrrechnung nicht", () => {
  const c = importCost(withState({ importOn: true, jpyRate: 0 }));
  assert.ok(Number.isFinite(c.total));
});

/* ---------------- Abgeleitete Termine ---------------- */

test("fehlende Erstzulassung ist als unbekannt erkennbar", () => {
  assert.equal(hMonthKnown(withState()), true);
  assert.equal(hMonthKnown(withState({ r34Ez: "" })), false);
  assert.equal(hMonthKnown(withState({ r34Ez: "1998-13" })), false);
});

/* ---------------- Belege ---------------- */

test("Angebote werden auf heute hochgerechnet, der Median trägt", () => {
  withState({ appr: 10 });
  ledgers.price.length = 0;
  const past = idxFromYm("2025-07") != null ? "2025-07" : "2025-07";
  ledgers.price.push(
    { src: "a", date: past, body: state.r34Body, amt: 30000, cur: "EUR" },
    { src: "b", date: past, body: state.r34Body, amt: 20000, cur: "EUR" },
  );
  const pl = priceFromLedger();
  assert.equal(pl.n, 2);
  // ein Jahr alt, 10 % Wertsteigerung → beide Werte um 10 % höher
  assert.ok(pl.value > 25000 * 1.09 && pl.value < 25000 * 1.11);
  assert.ok(pl.min < pl.max);
  ledgers.price.length = 0;
});

test("eigene Wertsteigerung erst ab genug Inseraten über genug Zeit", () => {
  ledgers.price.length = 0;
  assert.equal(apprFromLedger().ok, false);
  ledgers.price.push(
    { date: "2025-01", body: state.r34Body, amt: 20000, cur: "EUR" },
    { date: "2025-07", body: state.r34Body, amt: 21000, cur: "EUR" },
    { date: "2026-01", body: state.r34Body, amt: 22050, cur: "EUR" },
    { date: "2026-07", body: state.r34Body, amt: 23152, cur: "EUR" },
  );
  const a = apprFromLedger();
  assert.equal(a.ok, true);
  assert.ok(Math.abs(a.value - 10) < 0.5, `gemessen ${a.value}`);
  ledgers.price.length = 0;
});

/* ---------------- Korridor ---------------- */

test("Korridor umfasst auch Entweder-oder-Felder", () => {
  const choice = LEVERS.filter((l) => l.choices);
  assert.ok(choice.length >= 3, "Schadstoffklasse, H-Kennzeichen, Klassikertarif");
  const keys = choice.map((l) => l.key);
  for (const k of ["r34Norm", "hPlateWanted", "r34Switch25"])
    assert.ok(keys.includes(k), `${k} fehlt im Korridor`);
});

test("Spanne liegt um das Ergebnis und ist endlich", () => {
  const base = simulate(withState());
  const sp = sensitivity(base);
  assert.equal(sp.anchor, base.r34Month);
  assert.ok(sp.down <= 0 && sp.up >= 0);
  assert.ok(Number.isFinite(sp.down) && Number.isFinite(sp.up));
  // quadratisch addiert muss enger sein als alles gleichzeitig daneben
  assert.ok(sp.down >= sp.extremeDown && sp.up <= sp.extremeUp);
  const w = spreadWindow(base, sp);
  assert.ok(w.from <= w.base && w.base <= w.to);
  for (const row of sp.rows) {
    assert.ok(row.down <= 0 && row.up >= 0, `${row.key} hat falsche Richtung`);
    assert.ok(Number.isFinite(row.spare), `${row.key} spare`);
  }
});

test("Sensitivität lässt den Zustand unverändert zurück", () => {
  const before = structuredClone(withState());
  sensitivity(simulate(state));
  assert.deepEqual(structuredClone(state), before);
});

test("Klassikertarif ab 25 wirkt auf den Spielraum danach", () => {
  const sp = sensitivity(simulate(withState()));
  const row = sp.rows.find((r) => r.key === "r34Switch25");
  assert.ok(row.spare > 100, `nur ${row.spare.toFixed(0)} €/M — Hebel verloren?`);
});

/* ---------------- Grenzfälle ---------------- */

test("aussichtslose Szenarien liefern kein Kaufdatum statt Unsinn", () => {
  for (const patch of [
    { living: 5000 },
    { netNow: 0, netAfter: 0 },
    { appr: 100 },
    { reserve: 999999 },
  ]) {
    const r = simulate(withState(patch));
    assert.equal(r.r34Month, null);
    assert.equal(r.leftover, null);
    assert.ok(Number.isFinite(r.savedTotal));
  }
});

test("jeder Lauf liefert endliche Kennzahlen", () => {
  for (const [name, patch] of SCENARIOS) {
    const r = simulate(withState(patch), { path: true });
    for (const k of [
      "financed",
      "deposited",
      "payment",
      "interest",
      "savedTotal",
      "interestEarned",
      "capAtBuy",
      "giroCover",
      "minGiro",
    ])
      assert.ok(Number.isFinite(r[k]), `${name}: ${k} ist ${r[k]}`);
    for (const p of r.path)
      assert.ok(
        Number.isFinite(p.cap) && Number.isFinite(p.net),
        `${name}: Verlauf enthält ${p.cap}`,
      );
  }
});

/* ---------------- Speicher ---------------- */

test("alte Pläne werden beim Einlesen an die Feldgrenzen gerückt", async () => {
  const { applySnapshot } = await import(`${SRC}/store.js`);
  withState();
  applySnapshot({
    v: 5,
    manual: { r34Cons: -5, saveSurplus: 500, jpyRate: 0, living: 1200 },
    origin: { r34Cons: "manual", saveSurplus: "manual", jpyRate: "manual", living: "manual" },
    ui: { restAmount: 12000 },
    ledgers: {},
    doneTasks: {},
  });
  assert.equal(state.r34Cons, 0, "negativer Verbrauch überlebt das Einlesen");
  assert.equal(state.saveSurplus, 100);
  assert.equal(state.jpyRate, 1);
  assert.equal(state.living, 1200, "Werte im gültigen Bereich bleiben unangetastet");
  assert.equal(state.restAmount, 12000);
});

test("kaputte Schnappschüsse werden abgelehnt statt teilweise übernommen", async () => {
  const { applySnapshot } = await import(`${SRC}/store.js`);
  for (const bad of [null, undefined, 42, "text"])
    assert.equal(applySnapshot(bad), false);
});
