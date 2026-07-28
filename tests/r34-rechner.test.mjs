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
const { state, prov } = await import(`${SRC}/state.js`);
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
const { ledgers, doneTasks } = await import(`${SRC}/ledgers.js`);
const { idxFromYm, dat, ymOf } = await import(`${SRC}/calendar.js`);

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

/* ---------------- Sichern und übertragen ---------------- */

const store_ = await import(`${SRC}/store.js`);

/** Ein Plan, wie er nach zwei Jahren Sammeln aussieht. */
function fatPlan() {
  withState({ living: 1234, car: 31000 });
  prov.living = "manual";
  prov.car = "manual";
  ledgers.price.length = 0;
  ledgers.actual.length = 0;
  ledgers.insR34.length = 0;
  for (let i = 0; i < 18; i++)
    ledgers.price.push({
      src: `mobile.de Inserat ${i}`,
      date: `2026-${String((i % 12) + 1).padStart(2, "0")}`,
      body: "Limousine",
      amt: 28000 + i * 350,
      cur: "EUR",
      km: 90000 + i * 1500,
    });
  for (let i = 0; i < 24; i++)
    ledgers.actual.push({
      month: `2026-${String((i % 12) + 1).padStart(2, "0")}`,
      amt: 3000 + i * 820,
      src: "Monatsende",
    });
  ledgers.insR34.push({ src: "OCC", amt: 780, basis: "erfahren" });
  return store_.planSnapshot();
}

test("Plan überlebt den Weg über den Textcode unverändert", async () => {
  const snap = fatPlan();
  const code = await store_.encodeSnapshot(snap);
  assert.match(code, /^R34[01]:[A-Za-z0-9_-]+$/, "Code enthält nur URL-sichere Zeichen");
  assert.deepEqual(await store_.decodeSnapshot(code), snap);
});

test("gepackter Code bleibt für eine Nachricht handhabbar", async () => {
  const snap = fatPlan();
  const code = await store_.encodeSnapshot(snap);
  const plain = JSON.stringify(snap).length;
  assert.ok(code.length < plain * 0.6, `Code ${code.length} zu JSON ${plain}`);
});

test("ungepackte Codes werden ebenfalls gelesen", async () => {
  const snap = fatPlan();
  const bytes = Buffer.from(JSON.stringify(snap));
  const plain = "R340:" + bytes.toString("base64url");
  assert.deepEqual(await store_.decodeSnapshot(plain), snap);
});

test("Codeleser wirft nicht, sondern gibt null zurück", async () => {
  for (const bad of [
    "",
    " ",
    "hallo",
    "R34:abc",
    "R342:abc",
    "R341:!!!",
    "R341:AAAA",
    "R340:aGFsbG8",
    null,
    undefined,
    42,
    {},
  ])
    assert.equal(await store_.decodeSnapshot(bad), null, `bei ${JSON.stringify(bad)}`);
});

test("Umbrüche und Leerraum aus einer Nachricht stören nicht", async () => {
  const code = await store_.encodeSnapshot(fatPlan());
  assert.ok(await store_.decodeSnapshot(`\n  ${code}  \n`));
});

test("Fassungsprüfung nimmt Ältere an und lehnt Neuere ab", () => {
  const snap = fatPlan();
  assert.equal(store_.normalizeSnapshot(snap).ok, true);
  assert.equal(store_.normalizeSnapshot({ ...snap, v: 1 }).ok, true);
  const tooNew = store_.normalizeSnapshot({ ...snap, v: 999 });
  assert.equal(tooNew.ok, false);
  assert.match(tooNew.reason, /neueren Fassung/);
  for (const bad of [null, [], 42, "text", {}, { v: 0 }])
    assert.equal(store_.normalizeSnapshot(bad).ok, false);
});

test("Migration lässt den Ursprung unangetastet und ist wiederholbar", () => {
  const v3 = { v: 3, manual: { sedanDisc: 20, car: 40000 }, ledgers: { price: [] } };
  const once = store_.normalizeSnapshot(v3);
  assert.deepEqual(v3.manual, { sedanDisc: 20, car: 40000 }, "Eingabe wurde verändert");
  assert.equal(once.snap.manual.sedanDisc, undefined);
  assert.equal(once.snap.manual.coupeAdd, 25);
  // Der Coupé-Preis aus v3 ist als Limousinen-Anker falsch und fliegt ohne Belege raus
  assert.equal(once.snap.manual.car, undefined);
  assert.deepEqual(store_.normalizeSnapshot(once.snap).snap, once.snap);
});

test("v3-Preis bleibt, wenn Belege ihn stützen", () => {
  const v3 = {
    v: 3,
    manual: { sedanDisc: 20, car: 40000 },
    ledgers: { price: [{ date: "2026-01", amt: 39000, cur: "EUR" }] },
  };
  assert.equal(store_.normalizeSnapshot(v3).snap.manual.car, 40000);
});

test("Zusammenfassung beschreibt, was man sich einhandelt", () => {
  const text = store_.snapshotSummary(fatPlan());
  assert.match(text, /43 Belege/);
  assert.match(text, /eigene Eingabe/);
  assert.match(text, /gesichert am/);
});

test("Fingerabdruck ignoriert nur den Zeitstempel", () => {
  const a = fatPlan();
  const b = { ...a, saved: new Date(0).toISOString() };
  assert.equal(store_.fingerprint(a), store_.fingerprint(b));
  ledgers.actual.push({ month: "2027-01", amt: 99999 });
  assert.notEqual(store_.fingerprint(a), store_.fingerprint(store_.planSnapshot()));
});

test("Sicherungsstand: nach dem Merken gilt der Plan als gesichert", () => {
  const snap = fatPlan();
  store_.markSaved(snap);
  assert.equal(store_.isUnsaved(), false);
  ledgers.price.push({ src: "neu", date: "2026-07", body: "Limousine", amt: 30000, cur: "EUR" });
  assert.equal(store_.isUnsaved(), true, "eine neue Zeile muss die Erinnerung zurückholen");
});

test("der Schnappschuss deckt alle Module ab, nicht nur eines", async () => {
  const { initState } = await import(`${SRC}/state.js`);
  withState();

  // Ein Plan, der jedes Modul berührt
  const set = (key, value, herkunft) => {
    state[key] = value;
    prov[key] = herkunft;
  };
  set("living", 1111, "proof"); //  aus echten Kontoständen übernommen
  set("saveFixed", 888, "proof"); //  aus dem Soll-Ist übernommen
  set("appr", 7.5, "proof"); //  aus eigenen Inseraten gemessen
  set("r34Km", 4200, "manual"); //  R34-Unterhalt
  set("dailyInsY", 640, "manual"); //  Alltagsauto
  set("impFreight", 2600, "manual"); //  Import
  set("fuelE5", 2.41, "live"); //  Live-Quelle
  set("inflCost", 3.1, "live");
  set("rate", 9.4, "live");
  set("saveRate", 2.05, "derived");
  set("jpyRate", 163, "live");
  state.cap = 12000;
  state.method = "rest";
  state.restTerm = 4;
  ledgers.price.length = 0;
  ledgers.actual.length = 0;
  ledgers.insR34.length = 0;
  ledgers.price.push({ src: "mobile.de", date: "2026-05", body: "Limousine", amt: 29500, cur: "EUR" });
  ledgers.insR34.push({ src: "OCC", amt: 780, basis: "erfahren" });
  ledgers.actual.push({ month: "2026-06", amt: 5200, src: "Monatsende" });
  doneTasks.insR34 = "2026-06-01";

  const watched = [
    "living", "saveFixed", "appr", "r34Km", "dailyInsY", "impFreight",
    "fuelE5", "inflCost", "rate", "saveRate", "jpyRate", "cap", "method", "restTerm",
  ];
  const before = Object.fromEntries(watched.map((k) => [k, state[k]]));
  const snap = structuredClone(store_.planSnapshot());

  // Gerätewechsel: alles auf Anfang, dann den Schnappschuss einlesen
  initState();
  Object.assign(state, {
    cap: 0, appr: 4, strat: "dailyfirst", method: "cash",
    restGoal: "date", restAmount: 10000, restRate: 350, restTerm: 3,
  });
  for (const k of Object.keys(ledgers)) ledgers[k] = [];
  for (const k of Object.keys(doneTasks)) delete doneTasks[k];
  store_.applySnapshot(snap);

  for (const k of watched)
    assert.equal(state[k], before[k], `${k} ging beim Gerätewechsel verloren`);
  assert.equal(prov.living, "proof", "die Herkunft muss mitkommen");
  assert.equal(prov.saveRate, "derived");
  assert.equal(prov.r34Km, "manual");
  assert.equal(ledgers.price.length, 1);
  assert.equal(ledgers.insR34.length, 1);
  assert.equal(ledgers.actual.length, 1);
  assert.equal(doneTasks.insR34, "2026-06-01");
});

test("eine eigene Eingabe schlägt den Rückfall aus der Live-Reihe", () => {
  withState();
  state.rate = 6.9;
  prov.rate = "manual";
  store_.applySnapshot({
    v: 7,
    values: { rate: 6.9 },
    origin: { rate: "manual" },
    fallback: { rate: [11.2, "live"] },
    ui: {},
    ledgers: {},
    doneTasks: {},
  });
  assert.equal(state.rate, 6.9, "der Rückfall darf eine Entscheidung nicht überschreiben");
  assert.equal(prov.rate, "manual");
});

test("Exporte aus Fassung 6 bleiben lesbar", () => {
  withState();
  const alt = {
    v: 6,
    manual: { living: 1080, r34Km: 4400 },
    origin: { living: "manual", r34Km: "manual" },
    ui: { cap: 7000, appr: 5 },
    ledgers: { price: [{ date: "2026-03", amt: 28900, cur: "EUR" }] },
    doneTasks: {},
  };
  const check = store_.normalizeSnapshot(alt);
  assert.equal(check.ok, true);
  assert.deepEqual(check.snap.values, alt.manual, "der Inhalt wandert unter den neuen Namen");
  store_.applySnapshot(check.snap);
  assert.equal(state.living, 1080);
  assert.equal(state.cap, 7000);
  assert.equal(ledgers.price.length, 1);
});

/* ---------------- Führerschein als Zahlungsstrom ---------------- */

test("Führerschein wird über die Ausbildungszeit verteilt, nicht auf einen Monat", () => {
  /* Ohne Zinsen, damit der Abfluss je Monat exakt ablesbar ist: sonst mischt sich die
     Gutschrift auf den Kontostand in die Differenz. */
  const r = simulate(
    withState({
      cap: 20000,
      saveRate: 0,
      licenceYm: "2027-09",
      licenceMonths: 8,
      licence: 3200,
      // Das Alltagsauto wird im selben Monat fällig wie die Prüfung — hier soll aber
      // nur der Führerschein am Konto zu sehen sein.
      dailyPrice: 0,
      dailyExtra: 0,
    }),
    { path: true },
  );
  const licM = idxFromYm("2027-09");
  const rate = 3200 / 8;
  // Der Abfluss muss über acht Monate laufen und mit dem Prüfungstermin enden
  /* Die Fahrschule läuft über die Monatskosten, nicht über das Tagesgeld: sie
     drückt `flow`, nicht den Kontostand direkt. */
  const frei = (m) => r.path[m].flow;
  for (let m = licM - 7; m <= licM; m++)
    assert.ok(
      Math.abs(frei(m - 1) - frei(m) - rate) < 5 || m > licM - 7,
      `Monat ${m}: flow fiel nicht um die Rate`,
    );
  assert.ok(
    Math.abs(frei(licM) + rate - frei(licM + 1)) < 5,
    "nach der Prüfung muss der Spielraum um die Rate zurückkommen",
  );
  assert.ok(
    frei(licM - 8) - frei(licM) > rate - 5,
    "während der Ausbildung muss spürbar weniger übrig sein",
  );
  assert.ok(Math.abs(r.oneOffs.licence - 3200) < 0.01, "die Summe muss gleich bleiben");
});

test("kurzes Restfenster drängt die Summe zusammen, statt sie zu kürzen", () => {
  // Prüfung in vier Monaten, aber acht Monate Ausbildung angesetzt
  const r = simulate(withState({ licenceYm: "2026-11", licenceMonths: 8 }), { path: true });
  assert.ok(Math.abs(r.oneOffs.licence - state.licence) < 0.01, "nichts darf wegfallen");
  const rate = state.licence / 5; // Monate 0 bis 4
  assert.ok(Math.abs(rate - 700) < 1);
});

test("Prüfungstermin in der Vergangenheit lässt die Zahlung nicht ausfallen", () => {
  // Vorher fiel sie komplett aus, weil die Schleife bei null beginnt
  const r = simulate(withState({ licenceYm: "2020-01" }));
  assert.ok(Math.abs(r.oneOffs.licence - state.licence) < 0.01);
});

test("mit vorhandenem Führerschein fließt nichts", () => {
  const r = simulate(withState({ licenseOwned: true }));
  assert.equal(r.oneOffs.licence, 0);
});

test("die Verteilung ändert die Summe nicht, nur den Verlauf", () => {
  const kurz = simulate(withState({ cap: 20000, licenceYm: "2027-09", licenceMonths: 1 }), { path: true });
  const lang = simulate(withState({ cap: 20000, licenceYm: "2027-09", licenceMonths: 12 }), { path: true });
  assert.ok(Math.abs(kurz.oneOffs.licence - lang.oneOffs.licence) < 0.01);
  // Verteilt liegt vor dem Termin weniger auf dem Konto
  const licM = idxFromYm("2027-09");
  assert.ok(lang.path[licM - 4].cap < kurz.path[licM - 4].cap, "verteilt muss früher zehren");
});

/* ---------------- Was zum Leben bleibt ---------------- */

test("freies Geld misst gegen den Dauerauftrag, nicht gegen Einmalzahlungen", () => {
  const r = simulate(withState(), { path: true });
  assert.ok(r.free != null && r.freeAvg != null);
  for (const p of r.path.slice(0, r.r34Month))
    assert.ok(r.free <= p.flow - p.save + 1e-9, "free muss das Minimum sein");
  /* Die Fahrschule wird aus dem Monatsbudget bezahlt und muss den Spielraum
     deshalb drücken. Früher kam sie aus dem Tagesgeld — dann wies ausgerechnet der
     Monat einer Fahrschulrate mehr Spielraum aus als die Monate danach. */
  const mitFahrschule = r.path[0].flow - r.path[0].save;
  const ohne = r.path[7].flow - r.path[7].save;
  assert.ok(
    mitFahrschule < ohne,
    `mit Fahrschule ${mitFahrschule.toFixed(0)} € muss enger sein als ohne ${ohne.toFixed(0)} €`,
  );
});

test("zu hoher Dauerauftrag zeigt sich als negativer Spielraum", () => {
  const knapp = simulate(withState({ saveFixed: 700 }));
  const frei = simulate(withState({ saveFixed: 300 }));
  assert.ok(knapp.free < 0, `engster Monat ${knapp.free?.toFixed(0)} €`);
  assert.ok(frei.free > knapp.free, "weniger Dauerauftrag muss mehr Luft lassen");
});

test("ohne Sparphase gibt es keine Zahl statt einer falschen", () => {
  const r = simulate(withState({ living: 5000 }));
  assert.equal(r.r34Month, null);
  assert.ok(r.free == null || Number.isFinite(r.free));
});

/* ---------------- Gehaltsentwicklung als Liste ---------------- */

const setIncome = (rows) => {
  ledgers.income.length = 0;
  ledgers.income.push(...rows);
};

/** Alle Ausgaben auf null, damit `flow` genau das Nettoeinkommen ist.
 *  Ohne das misst man das Einkommen durch den Unterhalt des Alltagsautos hindurch. */
const incomeOnly = (patch = {}) =>
  withState({
    living: 0,
    inflCost: 0,
    licenseOwned: true,
    dailyPrice: 0,
    dailyExtra: 0,
    dailyInsY: 0,
    dailyMaint: 0,
    dailyGarage: 0,
    dailyKm: 0,
    dailyCcm: 0,
    car: 1e9, // wird nie gekauft, die Sparphase läuft durch
    ...patch,
  });

test("ohne erfasste Schritte wächst das heutige Netto mit der Lohnentwicklung", () => {
  incomeOnly({ netNow: 2000, inflIncome: 3 });
  setIncome([]);
  const r = simulate(state, { path: true });
  assert.ok(Math.abs(r.path[0].flow - 2000) < 1, `m0 ${r.path[0].flow.toFixed(0)}`);
  assert.ok(Math.abs(r.path[12].flow - 2060) < 1, `m12 ${r.path[12].flow.toFixed(0)}`);
});

test("bekannte Beträge schlagen die Fortschreibung", () => {
  incomeOnly({ netNow: 2000, inflIncome: 10 });
  setIncome([
    { month: ymOf(12), amt: 2500, src: "3. Lehrjahr" },
    { month: ymOf(24), amt: 3000, src: "Übernahme" },
  ]);
  const r = simulate(state, { path: true });
  const netAt = (m) => r.path[m].flow;
  // vor dem ersten Schritt: heutiges Netto, unverändert
  assert.ok(Math.abs(netAt(0) - 2000) < 1, `m0 ${netAt(0).toFixed(0)}`);
  assert.ok(Math.abs(netAt(11) - 2000) < 1, `m11 ${netAt(11).toFixed(0)}`);
  // zwischen zwei Schritten: der erfasste Betrag, ohne Aufschlag
  assert.ok(Math.abs(netAt(12) - 2500) < 1, `m12 ${netAt(12).toFixed(0)}`);
  assert.ok(
    Math.abs(netAt(23) - 2500) < 1,
    `m23 ${netAt(23).toFixed(0)} — die Lohnentwicklung darf hier nicht aufschlagen`,
  );
  // ab dem letzten Schritt greift sie
  assert.ok(Math.abs(netAt(24) - 3000) < 1, `m24 ${netAt(24).toFixed(0)}`);
  assert.ok(Math.abs(netAt(36) - 3300) < 2, `m36 ${netAt(36).toFixed(0)}`);
});

test("Reihenfolge der Eingabe ist egal", () => {
  incomeOnly({ netNow: 2000, inflIncome: 0 });
  setIncome([
    { month: ymOf(24), amt: 3000 },
    { month: ymOf(12), amt: 2500 },
  ]);
  const r = simulate(state, { path: true });
  assert.ok(Math.abs(r.path[12].flow - 2500) < 1);
  assert.ok(Math.abs(r.path[24].flow - 3000) < 1);
});

test("beliebig viele Schritte, auch dicht beieinander", () => {
  incomeOnly({ netNow: 1900, inflIncome: 0 });
  const rows = [];
  for (let i = 1; i <= 6; i++) rows.push({ month: ymOf(i * 3), amt: 1900 + i * 120 });
  setIncome(rows);
  const r = simulate(state, { path: true });
  for (let i = 1; i <= 6; i++)
    assert.ok(
      Math.abs(r.path[i * 3].flow - (1900 + i * 120)) < 1,
      `Schritt ${i}: ${r.path[i * 3].flow.toFixed(0)}`,
    );
});

test("Schritte in der Vergangenheit gelten ab sofort statt zu verschwinden", () => {
  incomeOnly({ netNow: 1500, inflIncome: 0 });
  setIncome([{ month: "2020-01", amt: 2400, src: "längst gültig" }]);
  const r = simulate(state, { path: true });
  assert.ok(Math.abs(r.path[0].flow - 2400) < 1, `m0 ${r.path[0].flow.toFixed(0)}`);
});

test("unbrauchbare Zeilen werden übergangen, nicht gerechnet", () => {
  incomeOnly({ netNow: 2000, inflIncome: 0 });
  setIncome([
    { month: "", amt: 9999 },
    { month: ymOf(6), amt: 0 },
    { month: ymOf(6), amt: NaN },
    { month: ymOf(12), amt: 2600 },
  ]);
  const r = simulate(state, { path: true });
  assert.ok(Math.abs(r.path[0].flow - 2000) < 1);
  assert.ok(Math.abs(r.path[6].flow - 2000) < 1, "0 € und NaN dürfen nichts auslösen");
  assert.ok(Math.abs(r.path[12].flow - 2600) < 1);
});

test("mehr Gehaltsschritte kaufen nie später", () => {
  withState();
  setIncome([]);
  const ohne = simulate(state).r34Month;
  setIncome([{ month: ymOf(12), amt: state.netNow + 400 }]);
  const mit = simulate(state).r34Month;
  assert.ok(mit <= ohne, `ohne ${ohne}, mit ${mit}`);
  setIncome([]);
});

test("Verschiebung der Einkommensreihe wirkt nur auf erfasste Schritte", () => {
  withState();
  setIncome([]);
  assert.equal(
    simulate({ ...state, incomeShift: -20 }).r34Month,
    simulate({ ...state, incomeShift: 0 }).r34Month,
    "ohne Schritte darf die Verschiebung nichts tun",
  );
  setIncome([{ month: ymOf(12), amt: 2400 }]);
  const runter = simulate({ ...state, incomeShift: -20 }).r34Month;
  const normal = simulate({ ...state, incomeShift: 0 }).r34Month;
  assert.ok(runter > normal, `${runter} muss später sein als ${normal}`);
  setIncome([]);
});

test("Migration hebt das alte Feldpaar in die Liste", () => {
  const alt = {
    v: 7,
    values: { netAfter: 2246, raiseYm: "2027-07", living: 1000 },
    origin: { netAfter: "manual", raiseYm: "manual", living: "manual" },
    ui: {},
    ledgers: { price: [] },
    doneTasks: {},
  };
  const chk = store_.normalizeSnapshot(alt);
  assert.equal(chk.ok, true);
  assert.deepEqual(chk.snap.ledgers.income, [
    { month: "2027-07", amt: 2246, src: "Erhöhung" },
  ]);
  assert.equal(chk.snap.values.netAfter, undefined, "das alte Feld muss weg sein");
  assert.equal(chk.snap.origin.raiseYm, undefined);
  // und wiederholbar
  assert.deepEqual(store_.normalizeSnapshot(chk.snap).snap.ledgers.income, chk.snap.ledgers.income);
});

test("das laufende Konto trägt nichts über den Monat hinaus", () => {
  const r = simulate(withState({ saveFixed: 1500 }), { path: true });
  for (const p of r.path)
    assert.ok(
      p.giro <= 0.01,
      `Girostand ${p.giro.toFixed(0)} € wurde mitgeschleppt, gilt aber als verbraucht`,
    );
});

/* ---------------- Vorschau: gezogene Verteilung ---------------- */

const { forecast, EVENTS } = await import(`${SRC}/forecast.js`);

test("Vorschau liefert eine geordnete Verteilung", () => {
  const f = forecast(withState(), { draws: 200 });
  assert.ok(f.n > 150, `nur ${f.n} von 200 Läufen brauchbar`);
  const q = f.months;
  assert.ok(q.p10 <= q.p25 && q.p25 <= q.p50 && q.p50 <= q.p75 && q.p75 <= q.p90,
    `Quantile nicht monoton: ${JSON.stringify(q)}`);
  assert.ok(q.p10 < q.p90, "die Spanne darf nicht entarten");
  assert.ok(f.spare.p10 <= f.spare.p50 && f.spare.p50 <= f.spare.p90);
  assert.ok(f.neverShare >= 0 && f.neverShare <= 1);
});

test("gleiche Eingabe ergibt dieselbe Vorschau", () => {
  withState();
  assert.deepEqual(forecast(state, { draws: 120 }), forecast(state, { draws: 120 }));
  assert.notDeepEqual(
    forecast(state, { draws: 120, seed: 1 }).months,
    forecast(state, { draws: 120, seed: 2 }).months,
    "verschiedene Startwerte müssen verschiedene Ziehungen ergeben",
  );
});

test("belegte Zahlen machen die Spanne schmaler", () => {
  withState();
  const weit = forecast(state, { draws: 250 });
  // dieselben Werte, aber als belegt markiert
  for (const k of ["car", "living", "netNow", "r34InsY", "dailyInsY", "r34Maint"])
    prov[k] = "proof";
  const eng = forecast(state, { draws: 250 });
  for (const k of ["car", "living", "netNow", "r34InsY", "dailyInsY", "r34Maint"])
    prov[k] = "guess";
  const breite = (f) => f.months.p90 - f.months.p10;
  assert.ok(breite(eng) < breite(weit),
    `belegt ${breite(eng)} Mon. muss enger sein als geraten ${breite(weit)} Mon.`);
});

test("die Mitte liegt nicht vor der Punktrechnung", () => {
  withState();
  const punkt = simulate(state).r34Month;
  const f = forecast(state, { draws: 300 });
  // Schiefe Kosten und Ereignisse ziehen nach hinten, nie nach vorn
  assert.ok(f.months.p50 >= punkt,
    `Median ${f.months.p50} liegt vor der Punktrechnung ${punkt}`);
});

test("mehr Ziehungen verschieben das Ergebnis nur wenig", () => {
  withState();
  const klein = forecast(state, { draws: 150 }).months.p50;
  const gross = forecast(state, { draws: 800 }).months.p50;
  assert.ok(Math.abs(klein - gross) <= 3,
    `Median wandert von ${klein} auf ${gross} — zu wenige Ziehungen`);
});

test("Schocks und Einkommenslücke gehen in die Simulation ein", () => {
  withState({ cap: 30000 });
  const ohne = simulate(state);
  const mitSchock = simulate(state, { events: [{ m: 3, cost: 8000 }] });
  assert.ok(mitSchock.r34Month >= ohne.r34Month, "eine Reparatur darf nicht beschleunigen");
  assert.ok(mitSchock.capAtBuy < ohne.capAtBuy + 1);
  const mitLuecke = simulate(state, { incomeGap: { from: 2, months: 6, factor: 0.5 } });
  assert.ok(mitLuecke.r34Month >= ohne.r34Month, "ein Einkommensausfall darf nicht beschleunigen");
});

test("Ereigniswahrscheinlichkeiten stehen an einer Stelle und sind plausibel", () => {
  assert.ok(EVENTS.length >= 2);
  for (const e of EVENTS) {
    assert.ok(e.perYear > 0 && e.perYear < 0.5, `${e.id}: ${e.perYear}`);
    assert.ok(e.label && e.id);
  }
});

test("aussichtslose Lage bricht die Vorschau nicht", () => {
  const f = forecast(withState({ living: 5000 }), { draws: 60 });
  assert.equal(f.months, null);
  assert.ok(f.neverShare > 0.9);
});

test("Pläne aus Fassung 2 gehen beim Wechsel nicht verloren", () => {
  withState();
  // v2 kannte kein Fassungsfeld und keinen ui-Abschnitt
  const v2 = {
    manual: { living: 1180, reserve: 0, r34Norm: "ohne Einstufung", startYm: "2029-07" },
    ledgers: { price: [{ date: "2026-04", amt: 27900, cur: "EUR", body: "Limousine" }] },
    keys: [["hicp", "M.DE.N.000000.4.ANR"]],
  };
  const alsSnapshot = {
    v: 2,
    values: v2.manual,
    origin: Object.fromEntries(Object.keys(v2.manual).map((k) => [k, "manual"])),
    ledgers: v2.ledgers,
    doneTasks: {},
    keys: v2.keys,
  };
  const chk = store_.normalizeSnapshot(alsSnapshot);
  assert.equal(chk.ok, true, "ein v2-Plan muss angenommen werden");
  store_.applySnapshot(chk.snap);
  assert.equal(state.living, 1180);
  assert.equal(state.reserve, 0);
  assert.equal(ledgers.price.length, 1);
  assert.equal(prov.living, "manual");
});

/* ---------------- Aufteilung und gemessener Aufgabennutzen ---------------- */

const { STEER, GROUPS } = await import(`${SRC}/catalog.js`);
const { narrowingBy } = await import(`${SRC}/forecast.js`);
const { openTasks } = await import(`${SRC}/tasks.js`);

test("die stärksten Hebel stehen in den Stellschrauben", () => {
  withState();
  const oben = new Set(STEER.map((f) => f.key).concat(["cap", "appr"]));
  const stark = sensitivity(simulate(state))
    .rows.filter((r) => r.move > 0)
    .slice(0, 5);
  const draussen = stark.filter((r) => !oben.has(r.key));
  assert.ok(
    draussen.length <= 1,
    `nicht oben: ${draussen.map((r) => `${r.label} (${r.move} Mon.)`).join(", ")}`,
  );
});

test("jedes Feld steht genau einmal", () => {
  const alle = STEER.map((f) => f.key).concat(
    GROUPS.flatMap((g) => g.fields.map((f) => f.key)),
  );
  const doppelt = alle.filter((k, i) => alle.indexOf(k) !== i);
  assert.deepEqual(doppelt, [], `doppelt vergeben: ${doppelt.join(", ")}`);
});

test("der Dauerauftrag verschwindet, wenn er nicht gilt", () => {
  const f = STEER.find((x) => x.key === "saveFixed");
  assert.equal(f.showWhen({ saveMode: "fixed" }), true);
  assert.equal(f.showWhen({ saveMode: "auto" }), false);
});

test("jede Aufgabe springt an eine Stelle, die es gibt", () => {
  const ziele = new Set(
    GROUPS.map((g) => "grp_" + g.id).concat([
      "trackPanel",
      "backupPanel",
      "steer",
      "tasksPanel",
      "srcPanel",
    ]),
  );
  withState();
  for (const t of openTasks())
    assert.ok(ziele.has(t.jump), `${t.id} springt nach ${t.jump}`);
});

test("Aufgabennutzen wird gemessen, nicht behauptet", () => {
  withState();
  setIncome([]);
  const preis = narrowingBy(state, ["car"]);
  assert.ok(preis && preis.months > 0, `Kaufpreis brachte ${JSON.stringify(preis)}`);
  const nichts = narrowingBy(state, ["superPlusAdd"]);
  assert.ok(nichts && nichts.months === 0, "ein Kleinposten darf nichts bringen");
});

test("belegte Zahlen bringen nichts mehr", () => {
  withState();
  for (const k of ["car"]) prov[k] = "proof";
  const g = narrowingBy(state, ["car"]);
  for (const k of ["car"]) prov[k] = "guess";
  assert.ok(g.months <= 1, `schon belegt, brachte aber ${g.months} Monate`);
});

test("Zahlen ohne Wirkung auf den Termin verengen den Spielraum danach", () => {
  withState();
  const g = narrowingBy(state, ["r34InsY"]);
  assert.ok(g, "Messung fehlgeschlagen");
  assert.ok(g.spare != null, "die zweite Kennzahl muss vorhanden sein");
});

test("die Messung lässt die Herkunft unverändert zurück", () => {
  withState();
  const vorher = { ...prov };
  narrowingBy(state, ["car", "living", "netNow"]);
  assert.deepEqual({ ...prov }, vorher);
});

test("ein früherer Führerschein macht den Plan nicht reicher", () => {
  /* Solange die Fahrschule aus dem Tagesgeld bezahlt wurde, landete ihre Rate auf dem
     laufenden Konto, wenn dort noch nichts lag — und wurde aus dem Haushaltsüberschuss
     getilgt, der sonst als verbraucht gilt. Ein früher Schein war dadurch billiger als
     ein später, und das Kapital verlief U-förmig statt monoton. */
  const capBei = (licenceYm) =>
    simulate({ ...withState({ dailyYm: "2027-05", car: 1e9 }), licenceYm }, { path: true })
      .path[60].cap;
  const reihe = ["2026-08", "2026-11", "2027-01", "2027-04", "2027-08"].map(capBei);
  for (let i = 1; i < reihe.length; i++)
    assert.ok(
      reihe[i] >= reihe[i - 1] - 1,
      `später bezahlt muss mehr übrig lassen: ${reihe.map(Math.round).join(" → ")}`,
    );
});

test("die Fahrschule geht nicht zusätzlich vom Tagesgeld ab", () => {
  const r = simulate(withState(), { path: true });
  assert.equal(r.preBuy.licence, 0, "sie steckt schon in den Monatskosten");
  assert.ok(Math.abs(r.oneOffs.licence - state.licence) < 0.01, "die Summe stimmt weiter");
  // Aufstellung muss trotzdem exakt aufgehen
  const sum =
    state.cap + r.savedTotal + r.interestEarned - r.preBuy.licence - r.preBuy.daily - r.giroCover;
  assert.ok(Math.abs(sum - r.capAtBuy) < 0.01);
});

test("reicht der Monat nicht, springt weiterhin das Tagesgeld ein", () => {
  // Hohe Rate, knappes Netto: der Ausgleich muss greifen
  const r = simulate(withState({ cap: 20000, licence: 9000, licenceMonths: 3 }), { path: true });
  assert.ok(r.negMonths > 0 || r.giroCover > 0, "der Engpass muss sichtbar werden");
  assert.ok(Math.abs(r.oneOffs.licence - 9000) < 0.01);
});

/* ---------------- Fuzz: Invarianten über zufällige Zustände ---------------- */

test("Invarianten halten über 1500 zufällige Zustände", () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const n = (lo, hi) => lo + rnd() * (hi - lo);
  const brueche = [];

  for (let i = 0; i < 1500; i++) {
    const s = withState({
      netNow: n(600, 6000), living: n(200, 3000), car: n(5000, 90000),
      cap: rnd() < 0.3 ? 0 : n(0, 60000), appr: n(-5, 12), reserve: n(0, 15000),
      saveMode: pick(["fixed", "auto"]), saveFixed: n(0, 2500), saveSurplus: n(0, 100),
      saveRate: n(0, 8), rate: n(0, 20), inflCost: n(-2, 8), inflIncome: n(-2, 8),
      method: pick(["cash", "fin2", "fin3", "rest"]),
      restGoal: pick(["date", "amount", "rate"]), restTerm: Math.round(n(2, 5)),
      restAmount: n(0, 40000), restRate: n(50, 900),
      strat: pick(["dailyfirst", "r34first"]),
      licenseOwned: rnd() < 0.3, licence: n(0, 9000),
      licenceMonths: Math.round(n(1, 24)), licenceYm: ymOf(Math.round(n(-12, 40))),
      startYm: ymOf(Math.round(n(0, 90))), dailyYm: ymOf(Math.round(n(0, 40))),
      dailyPrice: n(0, 15000), dailyExtra: n(0, 3000), r34Extra: n(0, 5000),
      r34Season: rnd() < 0.5, hPlateWanted: rnd() < 0.5,
      r34Km: n(0, 40000), dailyKm: n(0, 60000), incomeShift: n(-40, 40),
    });
    const r = simulate(s, { path: true });
    const bruch = (was) => brueche.push(`${was} · Lauf ${i}`);

    for (const k of ["financed", "deposited", "payment", "interest", "savedTotal",
      "interestEarned", "capAtBuy", "giroCover", "minGiro", "priceAtBuy"])
      if (!Number.isFinite(r[k])) bruch(`${k} ist ${r[k]}`);
    if (Math.min(...r.path.map((p) => p.cap)) < -0.01) bruch("Tagesgeld negativ");
    if (r.r34Month != null) {
      const summe = s.cap + r.savedTotal + r.interestEarned - r.preBuy.licence
        - r.preBuy.daily - r.giroCover;
      if (Math.abs(summe - r.capAtBuy) > 0.02)
        bruch(`Aufstellung um ${(summe - r.capAtBuy).toFixed(2)} € daneben`);
    }
    if (r.financed > 0) {
      if (Math.abs(r.deposited + r.financed - r.priceAtBuy) > 0.02) bruch("Anzahlung+Kredit≠Preis");
      if (Math.abs(r.payment * r.term * 12 - r.financed - r.interest) > 0.02) bruch("Rate×n−Kredit≠Zinsen");
    }
    if (s.method === "rest" && r.r34Month != null) {
      if (s.restGoal === "amount" && r.financed > s.restAmount + 0.02) bruch("Kreditsumme über Vorgabe");
      if (s.restGoal === "rate" && r.payment > s.restRate + 0.02) bruch("Rate über Vorgabe");
    }
    if (!s.licenseOwned && Math.abs(r.oneOffs.licence - s.licence) > 0.02)
      bruch("Führerscheinsumme unvollständig");
    if (s.method === "cash" && r.r34Month != null
      && r.capAtBuy - r.deposited - r.sideAtBuy < -0.02) bruch("Rücklage unterschritten");
  }
  assert.deepEqual(brueche.slice(0, 5), [], `${brueche.length} Verletzungen`);
});

test("echter Dispo und zu hoher Dauerauftrag sind zwei verschiedene Zahlen", () => {
  const r = simulate(withState(), { path: true });
  assert.equal(
    r.overdraftMonths,
    r.path.filter((p) => p.giro < -1).length,
    "overdraftMonths muss zählen, was nach dem Ausgleich übrig bleibt",
  );
  assert.ok(r.negMonths >= r.overdraftMonths);
  // Bei den Vorgaben deckt das Tagesgeld alles ab — es gibt keinen Dispo
  assert.equal(r.overdraftMonths, 0);
  assert.ok(r.negMonths > 0, "der zu hohe Dauerauftrag muss trotzdem sichtbar bleiben");
});
