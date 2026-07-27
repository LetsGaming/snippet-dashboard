import { idxFromYm } from "./calendar.js";
import {
  SIM_HORIZON_MONTHS,
  SIM_TAIL_MONTHS,
  DAILY_FORCE_AFTER,
} from "./config.js";
import { clamp, annuity, growth } from "./format.js";
import { dat } from "./calendar.js";
import { licenceMonth, hMonth, age25Month, raiseMonth } from "./state.js";
import { hPlateAt, r34RunAt, dailyRunAt } from "./pricing.js";

/* ============================================================
   7 — Simulation

   Zwei Töpfe statt einem. Das Tagesgeldkonto (`cap`) ist das Geld, das für den
   Kauf zurückgelegt wird und verzinst wird. Das laufende Konto (`giro`) ist der
   Alltagspuffer. Bei einem Dauerauftrag geht der feste Betrag jeden Monat
   aufs Tagesgeld, auch wenn es eng wird — genau dann rutscht das Girokonto ins
   Minus, und das soll sichtbar werden statt im Gesamttopf zu verschwinden.

   Alle Stände gelten zum Monatsende: nach Gehalt, nach Kosten, nach Dauerauftrag.

   ov variiert einen Lauf, ohne den Zustand anzufassen:
     carPrice / appr   — anderer Grundpreis, andere Wertsteigerung
     restGoal / restYm — andere Vorgabe (Termin-Vergleichstabelle)
     path              — Kontostände je Monat mitschreiben
   ============================================================ */
function simulate(s, ov = {}) {
  const isRest = s.method === "rest";
  const goal = isRest ? (ov.restGoal ?? s.restGoal) : null;
  const finance = s.method !== "cash";
  const term = isRest
    ? clamp(Number(s.restTerm) || 3, 2, 5)
    : s.method === "fin2"
      ? 2
      : 3;
  const appr = ov.appr ?? s.appr;
  const basePrice = ov.carPrice ?? s.car;
  const collectPath = !!ov.path;

  const dailyFirst = s.strat === "dailyfirst";
  const raiseM = raiseMonth(s);
  const licM = licenceMonth(s);
  const hm = hMonth(s);
  const dailyEarliest = Math.max(0, licM, idxFromYm(s.dailyYm) ?? 0);
  const wishM = goal === "date" ? idxFromYm(ov.restYm ?? s.restYm) : null;
  const r34Earliest = Math.max(
    0,
    licM,
    wishM != null ? wishM : (idxFromYm(s.startYm) ?? 0),
  );

  const net = (m) =>
    m < raiseM ? s.netNow : s.netAfter * growth(s.inflIncome, m - raiseM);
  const household = (m) => s.living * growth(s.inflCost, m);
  const yearsSince = (buy, m) => Math.floor((m - buy) / 12);

  let cap = s.cap;
  let giro = 0;
  let dailyMonth = null;
  let r34Month = null;
  let leftoverMin = null;
  let financed = 0;
  let deposited = 0;
  let payment = 0;
  let interest = 0;
  let priceAtBuy = 0;
  let sideAtBuy = 0;
  let extrasPaid = 0;
  let minGiro = 0;
  let negMonths = 0;
  let savedTotal = 0;
  let interestEarned = 0;
  let capAtBuy = 0;
  let giroCover = 0;
  let coverThisMonth = 0;
  const oneOffs = { licence: 0, daily: 0, r34Extra: 0, hCert: 0 };
  const path = collectPath ? [] : null;

  /* Nur das Tagesgeld zählt als Kaufkraft. Was auf dem laufenden Konto liegen bleibt,
     gilt im Modell als verbraucht — sonst wäre der Dauerauftrag wirkungslos, weil das
     Geld ja trotzdem irgendwo läge. Diese Annahme ist bewusst konservativ.

     Ein Tagesgeldkonto geht nicht ins Minus. Was eine Einmalzahlung nicht deckt, geht
     aufs laufende Konto und taucht dort als Minus auf — dort wird es gezählt und
     gewarnt. Vorher verschwand der Fehlbetrag zinsfrei im Tagesgeld. */
  const spend = (amount) => {
    const fromCap = Math.min(Math.max(0, cap), amount);
    cap -= fromCap;
    const rest = amount - fromCap;
    if (rest === 0) return;
    giro -= rest;
    if (r34Month == null) giroCover -= rest;
  };
  /** Ein negatives laufendes Konto holt man sich früher oder später vom Tagesgeld zurück.
   *  Der Betrag wird mitgeschrieben: sonst zählt er als Einzahlung, die nie liegen bleibt. */
  const settle = () => {
    if (giro >= 0 || cap <= 0) return;
    const cover = Math.min(cap, -giro);
    cap -= cover;
    giro += cover;
    coverThisMonth += cover;
    if (r34Month == null) giroCover += cover;
  };

  for (let m = 0; m < SIM_HORIZON_MONTHS; m++) {
    const settled =
      r34Month != null &&
      dailyMonth != null &&
      m > Math.max(r34Month + (finance ? term * 12 : 0), hm) + SIM_TAIL_MONTHS;
    if (settled) break;

    coverThisMonth = 0;

    if (cap > 0) {
      const credit = (cap * (s.saveRate || 0)) / 100 / 12;
      cap += credit;
      if (r34Month == null) interestEarned += credit;
    }

    if (!s.licenseOwned && m === licM) {
      spend(s.licence);
      oneOffs.licence += s.licence;
    }

    /* Käufe stehen vor den Kosten dieses Monats: wer im Monat m zulässt, zahlt ab m
       auch Versicherung, Steuer und Sprit. Vorher lief der Kaufmonat kostenlos.
       Gekauft wird aus dem Stand des Vormonats — das Gehalt kommt erst danach. */

    // Alltagsauto
    if (dailyMonth == null && m >= dailyEarliest) {
      const needed = s.dailyPrice + (s.dailyExtra || 0);
      const forced = dailyFirst && m >= dailyEarliest + DAILY_FORCE_AFTER;
      const affordable = dailyFirst
        ? cap >= needed
        : r34Month != null && m > r34Month && cap - needed >= s.reserve;
      if (affordable || forced) {
        spend(needed);
        dailyMonth = m;
        extrasPaid += s.dailyExtra || 0;
        oneOffs.daily += needed;
      }
    }

    // R34
    if (r34Month == null && m >= r34Earliest) {
      const price = basePrice * Math.pow(1 + appr / 100, m / 12);
      const side = (s.r34Extra || 0) + (hPlateAt(s, m) ? s.hCert || 0 : 0);
      if (finance) {
        const room = cap - s.reserve - side;
        const deposit = clamp(room, 0, price);
        const need = price - deposit;
        const pay = annuity(need, term, s.rate / 100);
        const wait =
          (goal === "amount" && need > s.restAmount) ||
          (goal === "rate" && pay > s.restRate);
        if (!wait) {
          capAtBuy = cap;
          priceAtBuy = price;
          deposited = deposit;
          sideAtBuy = side;
          financed = need;
          payment = pay;
          interest = pay * term * 12 - need;
          spend(deposit + side);
          extrasPaid += side;
          oneOffs.r34Extra += s.r34Extra || 0;
          if (hPlateAt(s, m)) oneOffs.hCert += s.hCert || 0;
          r34Month = m;
        }
      } else if (cap >= price + side + s.reserve) {
        capAtBuy = cap;
        priceAtBuy = price;
        deposited = price;
        sideAtBuy = side;
        spend(price + side);
        extrasPaid += side;
        oneOffs.r34Extra += s.r34Extra || 0;
        if (hPlateAt(s, m)) oneOffs.hCert += s.hCert || 0;
        r34Month = m;
      }
    }

    // Gutachten, wenn die 30 Jahre erst nach dem Kauf erreicht werden
    if (s.hPlateWanted && r34Month != null && m === hm && m > r34Month) {
      spend(s.hCert || 0);
      extrasPaid += s.hCert || 0;
      oneOffs.hCert += s.hCert || 0;
    }

    let cost = household(m);
    if (dailyMonth != null) cost += dailyRunAt(s, m, yearsSince(dailyMonth, m));
    if (r34Month != null) {
      cost += r34RunAt(s, m, yearsSince(r34Month, m));
      if (finance && m < r34Month + term * 12) cost += payment;
    }
    const flow = net(m) - cost;
    if (r34Month != null && (leftoverMin == null || flow < leftoverMin))
      leftoverMin = flow;

    // Aufteilung auf die beiden Töpfe. Nach dem R34-Kauf endet der Dauerauftrag.
    const stillSaving = r34Month == null;
    let toSavings;
    if (stillSaving && s.saveMode === "fixed") {
      const surplus = Math.max(0, flow - s.saveFixed);
      toSavings = s.saveFixed + (surplus * (s.saveSurplus || 0)) / 100;
    } else {
      toSavings = Math.max(0, flow);
    }
    cap += toSavings;
    giro += flow - toSavings;
    if (stillSaving) savedTotal += toSavings;
    // Erst messen, dann ausgleichen — sonst bliebe eine zu hohe Sparrate unsichtbar.
    if (giro < minGiro) minGiro = giro;
    if (giro < -1) negMonths++;
    settle();

    if (path)
      path.push({
        m,
        cap,
        giro,
        flow,
        save: toSavings,
        // Was nach dem Ausgleich tatsächlich liegen bleibt. Der Dauerauftrag weist an,
        // das laufende Konto holt sich zurück, was es zum Leben braucht.
        net: toSavings - coverThisMonth,
      });
  }

  let leftoverLong = null;
  if (r34Month != null) {
    const mLong = Math.max(r34Month, age25Month(s), hm) + 120;
    leftoverLong =
      s.netAfter * growth(s.inflIncome, mLong - raiseM) -
      household(mLong) -
      dailyRunAt(s, mLong, 99) -
      r34RunAt(s, mLong, 99);
  }

  return {
    r34Month,
    dailyMonth,
    bothMonth:
      r34Month != null && dailyMonth != null
        ? Math.max(r34Month, dailyMonth)
        : null,
    financed,
    deposited,
    payment,
    interest,
    extrasPaid,
    savedTotal,
    interestEarned,
    capAtBuy,
    // Netto ans laufende Konto abgeflossen, bis zum Kauf. Positiv: das Tagesgeld hat
    // den Dauerauftrag teilweise wieder hergegeben. Negativ: das laufende Konto hat
    // eine Einmalzahlung vorgestreckt.
    giroCover,
    oneOffs,
    /* Was bis zum Kauftermin aus dem Tagesgeld ging — nur das gehört in die
       Aufstellung „wohin das Geld fließt". Bei der Reihenfolge „R34 zuerst" kommt
       das Alltagsauto danach und zählt dort nicht mit. Der Führerschein liegt
       immer davor, weil r34Earliest den Führerscheinmonat einschließt. */
    preBuy: {
      licence: oneOffs.licence,
      daily:
        dailyMonth != null && r34Month != null && dailyMonth <= r34Month
          ? oneOffs.daily
          : 0,
    },
    leftover: leftoverMin,
    leftoverLong,
    priceAtBuy,
    // Nebenkosten, die im Kaufmonat selbst fällig wurden. Ein H-Gutachten, das erst
    // später kommt, steckt in oneOffs.hCert, aber nicht hier.
    sideAtBuy,
    finance,
    term,
    basePrice,
    goal,
    isRest,
    minGiro,
    negMonths,
    path,
  };
}

const statusOf = (v) =>
  v >= 400
    ? { w: "komfortabel", c: "ok" }
    : v >= 200
      ? { w: "solide", c: "ok" }
      : v >= 100
        ? { w: "eng", c: "warn" }
        : { w: "kritisch", c: "bad" };

/* Die Sparrate ist keine Konstante: sie fällt mit dem Kauf des Alltagsautos und steigt
   mit der Lohnerhöhung. Eine Momentaufnahme für den laufenden Monat wäre irreführend,
   deshalb stehen hier die Stützstellen des Verlaufs. */
function savingMarks(s, r) {
  if (!r.path || !r.path.length) return [];
  const raise = raiseMonth(s);
  const wanted = [{ m: 0, label: "heute" }];
  if (r.dailyMonth != null && r.dailyMonth + 1 < r.path.length)
    wanted.push({
      m: r.dailyMonth + 1,
      label: `ab Alltagsauto ${dat(r.dailyMonth)}`,
    });
  if (raise > 0) wanted.push({ m: raise, label: `ab Erhöhung ${dat(raise)}` });
  if (r.r34Month != null && r.r34Month > 0)
    wanted.push({ m: r.r34Month - 1, label: "kurz vor dem Kauf" });

  const seen = new Set();
  return wanted
    .filter(
      (x) => x.m >= 0 && x.m < r.path.length && !seen.has(x.m) && seen.add(x.m),
    )
    .sort((a, b) => a.m - b.m)
    .map((x) => ({ ...x, ...r.path[x.m] }));
}

export { simulate, statusOf, savingMarks };
