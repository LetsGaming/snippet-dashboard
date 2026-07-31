import { idxFromYm } from "./calendar.js";
import {
  SIM_HORIZON_MONTHS,
  SIM_TAIL_MONTHS,
  DAILY_FORCE_AFTER,
  LICENCE_MAX_MONTHS,
} from "./config.js";
import { clamp, annuity, growth } from "./format.js";
import { dat } from "./calendar.js";
import {
  licenceMonth,
  hMonth,
  age25Month,
  incomeSteps,
  incomeAnchor,
  firstRaise,
} from "./state.js";
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
  const steps = incomeSteps();
  const anchor = incomeAnchor(s);
  const licM = licenceMonth(s);
  const hm = hMonth(s);
  const dailyEarliest = Math.max(0, licM, idxFromYm(s.dailyYm) ?? 0);
  const wishM = goal === "date" ? idxFromYm(ov.restYm ?? s.restYm) : null;
  const r34Earliest = Math.max(
    0,
    licM,
    wishM != null ? wishM : (idxFromYm(s.startYm) ?? 0),
  );

  /* Bekannte Beträge schlagen jede Fortschreibung: zwischen zwei erfassten Schritten
     gilt der erfasste Wert, weil er die Erhöhung schon enthält. Erst hinter dem
     letzten bekannten Punkt greift die allgemeine Lohnentwicklung — sonst würde sie
     auf Zahlen aufschlagen, die aus dem Vertrag stammen. */
  // Die Verschiebung greift nur auf erfasste Schritte. Ohne Schritte bleibt sie
  // wirkungslos — dann trägt das Band von „Netto heute" die Unsicherheit.
  const shift = steps.length ? 1 + (s.incomeShift || 0) / 100 : 1;
  /* Eine Einkommenslücke — Krankheit, Kündigung, Elternzeit — als Fenster mit
     gekürztem Netto. Kommt aus der Vorschau; im normalen Lauf ist sie leer. */
  const gap = ov.incomeGap || null;
  const gapFactor = (m) =>
    gap && m >= gap.from && m < gap.from + gap.months ? gap.factor : 1;
  const net = (m) => gapFactor(m) * baseNet(m);
  const baseNet = (m) => {
    if (m >= anchor.m)
      return anchor.amt * shift * growth(s.inflIncome, m - anchor.m);
    let cur = s.netNow;
    for (const st of steps) {
      if (st.m > m) break;
      cur = st.amt * shift;
    }
    return cur;
  };
  const household = (m) => s.living * growth(s.inflCost, m);
  const yearsSince = (buy, m) => Math.floor((m - buy) / 12);

  /* Der Führerschein läuft als Zahlungsstrom, nicht als Schlussrechnung: Grundgebühr,
     Fahrstunden und Prüfungen verteilen sich über die Ausbildungszeit und enden mit
     dem Schein. Als Einmalbetrag gerechnet stand vorher in den Monaten davor ein zu
     hoher Kontostand — genau in der Phase, in der ohnehin am wenigsten liegt.

     Die Summe bleibt gleich; ist das Fenster bis zum geplanten Termin kürzer als die
     angesetzte Dauer, wird sie auf die verbleibenden Monate gedrängt statt gekürzt.
     Ein Termin in der Vergangenheit fällt auf den laufenden Monat — vorher fiel die
     Zahlung dann ganz aus, weil die Schleife bei null beginnt. */
  /* Ab diesem Monat wandert wieder alles Übrige aufs Tagesgeld. `null` heißt: nie —
     der Dauerauftrag läuft dann unverändert bis zum Kauf. Wer weiß, dass bis zum
     Sommer noch Ausgaben anstehen, will bis dahin nicht jeden Euro wegsparen. */
  const switchM =
    s.saveMode === "fixed" ? (idxFromYm(s.saveSwitchYm) ?? null) : 0;
  const shocks = Array.isArray(ov.events) ? ov.events : [];
  const licEnd = s.licenseOwned ? -1 : Math.max(0, licM);
  /* Der Zahlungszeitraum folgt aus dem Prüfungstermin: von heute bis zur Prüfung, denn
     bis dahin ist die Ausbildung bezahlt. Das war vorher ein eigenes Feld — eine Frage,
     deren Antwort bereits im Termin steht. Nur die Obergrenze bleibt: steht die Prüfung
     weiter als ein Jahr weg, beginnt die Fahrschule später statt heute. */
  const licSpread = Math.max(1, Math.min(licEnd + 1, LICENCE_MAX_MONTHS));
  const licFrom = Math.max(0, licEnd - licSpread + 1);
  const licRate = s.licenseOwned ? 0 : (s.licence || 0) / licSpread;

  let cap = s.cap;
  let giro = 0;
  let dailyMonth = null;
  let r34Month = null;
  let leftoverMin = null;
  let freeMin = null;
  let freeMonth = null;
  let freeSum = 0;
  let freeMonths = 0;
  let financed = 0;
  let deposited = 0;
  let payment = 0;
  let interest = 0;
  let priceAtBuy = 0;
  let sideAtBuy = 0;
  let extrasPaid = 0;
  let minGiro = 0;
  let negMonths = 0;
  let overdraftMonths = 0;
  let overdraftCost = 0;
  let overdraftPeak = 0;
  let brokeOff = false;
  const limit = 3 * Math.max(0, s.netNow || 0);
  let savedTotal = 0;
  let interestEarned = 0;
  let capAtBuy = 0;
  /* Was das laufende Konto für eine Einmalzahlung vorgestreckt hat, bis zum Kauf.
     Immer ≤ 0: das Tagesgeld ist eine Einbahnstraße, zurück fließt nichts. */
  let giroFronted = 0;
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
    if (r34Month == null) giroFronted -= rest;
  };
  for (let m = 0; m < SIM_HORIZON_MONTHS; m++) {
    const settled =
      r34Month != null &&
      dailyMonth != null &&
      m > Math.max(r34Month + (finance ? term * 12 : 0), hm) + SIM_TAIL_MONTHS;
    if (settled) break;

    if (cap > 0) {
      const credit = (cap * (s.saveRate || 0)) / 100 / 12;
      cap += credit;
      if (r34Month == null) interestEarned += credit;
    }
    /* Ein Minus auf dem laufenden Konto kostet. Der Satz steht auf jedem Kontoauszug —
       zweistellig, und deutlich über allem, was das Tagesgeld einbringt. Ohne diese
       Zeile wäre eine Überziehung gratis und ein zu hoher Dauerauftrag ein Gewinn. */
    if (giro < 0) {
      const dispo = (-giro * (s.overdraftRate || 0)) / 100 / 12;
      giro -= dispo;
      overdraftCost += dispo;
    }

    /* Einmalige Rückschläge aus der Vorschau. Sie gehen wie jede andere Einmalzahlung
       ab: reicht das Tagesgeld nicht, landet der Rest sichtbar auf dem laufenden Konto. */
    if (shocks.length)
      for (const e of shocks) if (e.m === m) spend(e.cost);

    /* Die Fahrschule wird aus dem Monatsbudget bezahlt, nicht aus dem Tagesgeld.
       Das ist nicht nur realistischer — niemand hebt für Fahrstunden monatlich vom
       Sparkonto ab —, es beseitigt auch einen Widerspruch: als Griff ins Tagesgeld
       landete die Rate auf dem laufenden Konto, sobald dort noch nichts lag, und
       wurde dann aus dem Haushaltsüberschuss getilgt. Der gilt sonst als verbraucht.
       Ein früher Schein war dadurch im Modell billiger als ein später, und das
       Kapital verlief U-förmig statt monoton. Reicht der Monat nicht, holt sich der
       Ausgleich den Rest weiterhin vom Tagesgeld — nur eben sichtbar. */
    let licThisMonth = 0;
    if (!s.licenseOwned && m >= licFrom && m <= licEnd) {
      licThisMonth = licRate;
      oneOffs.licence += licRate;
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
          /* Kaufmonat setzen, BEVOR gezahlt wird. `capAtBuy` ist oben schon
             festgehalten; deckt das Tagesgeld die Nebenkosten nicht, schiebt `spend`
             den Rest aufs laufende Konto. Solange r34Month noch null wäre, liefe das
             als `giroFronted` in die Aufstellung ein — die aber im Kaufmoment endet.
             Die Zeilen gingen dann um genau diesen Rest nicht auf. */
          r34Month = m;
          spend(deposit + side);
          extrasPaid += side;
          oneOffs.r34Extra += s.r34Extra || 0;
          if (hPlateAt(s, m)) oneOffs.hCert += s.hCert || 0;
        }
      } else if (cap >= price + side + s.reserve) {
        capAtBuy = cap;
        priceAtBuy = price;
        deposited = price;
        sideAtBuy = side;
        r34Month = m;
        spend(price + side);
        extrasPaid += side;
        oneOffs.r34Extra += s.r34Extra || 0;
        if (hPlateAt(s, m)) oneOffs.hCert += s.hCert || 0;
      }
    }

    // Gutachten, wenn die 30 Jahre erst nach dem Kauf erreicht werden
    if (s.hPlateWanted && r34Month != null && m === hm && m > r34Month) {
      spend(s.hCert || 0);
      extrasPaid += s.hCert || 0;
      oneOffs.hCert += s.hCert || 0;
    }

    let cost = household(m) + licThisMonth;
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
    if (stillSaving && s.saveMode === "fixed" && (switchM == null || m < switchM)) {
      const surplus = Math.max(0, flow - s.saveFixed);
      toSavings = s.saveFixed + (surplus * (s.saveSurplus || 0)) / 100;
    } else {
      toSavings = Math.max(0, flow);
    }
    cap += toSavings;
    giro += flow - toSavings;
    if (stillSaving) savedTotal += toSavings;
    if (giro < minGiro) minGiro = giro;
    if (giro < -1) negMonths++;
    /* Zwei verschiedene Dinge, die vorher eine Zahl waren: `negMonths` zählt Monate,
       in denen der Dauerauftrag mehr wollte als übrig war — das ist ein Hinweis auf
       eine zu hohe Sparrate. `overdraftMonths` zählt, was danach wirklich im Minus
       bleibt, weil auch das Tagesgeld leer war. Nur das ist ein echter Dispo. */
    if (giro < -1) overdraftMonths++;
    if (giro < overdraftPeak) overdraftPeak = giro;
    /* Jenseits von zwei bis drei Monatsnettos räumt keine Bank mehr ein. Ohne diese
       Grenze könnte ein zu hoher Dauerauftrag das Sparen vollständig über den Dispo
       finanzieren und „kaufte" selbst bei fünftausend Euro Lebenshaltung — das Geld
       landet ja auf dem Tagesgeld, und von dort kommt es nicht zurück. */
    if (r34Month == null && giro < -limit) {
      brokeOff = true;
      break;
    }

    /* Was vom Monatsfluss neben dem Sparen übrig bleibt. Gemessen gegen den
       Dauerauftrag, nicht gegen den Kontostand: Führerschein und Autokauf sind
       Einmalzahlungen aus dem Ersparten und kein Haushaltsgeld — würden sie hier
       mitzählen, wiese der Monat einer Fahrschulrate plötzlich mehr „zum Leben" aus.
       Negativ heißt: der Dauerauftrag liegt über dem, was der Monat hergibt. */
    if (stillSaving) {
      const free = flow - toSavings;
      if (freeMin == null || free < freeMin) {
        freeMin = free;
        freeMonth = m;
      }
      freeSum += free;
      freeMonths++;
    }

    /* Was am Monatsende auf dem laufenden Konto liegt, gilt als ausgegeben — so
       steht es in der Annahme oben, und so wird es hier gebucht. Vorher wuchs der
       Stand still weiter und deckte später Fehlmonate ab: dasselbe Geld galt einmal
       als verbraucht und einmal als Sparrate. Ein Minus bleibt stehen und kostet
       im nächsten Monat Dispozinsen. */
    if (giro > 0) giro = 0;

    if (path)
      path.push({ m, cap, giro, flow, save: toSavings });
  }

  let leftoverLong = null;
  if (r34Month != null) {
    const mLong = Math.max(r34Month, age25Month(s), hm) + 120;
    leftoverLong =
      net(mLong) -
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
    // Was das laufende Konto bis zum Kauf vorgestreckt hat, weil eine Einmalzahlung
    // das Tagesgeld überstieg. Immer ≤ 0; zurück fließt nichts.
    giroFronted,
    oneOffs,
    /* Was bis zum Kauftermin aus dem Tagesgeld ging — nur das gehört in die
       Aufstellung „wohin das Geld fließt". Bei der Reihenfolge „R34 zuerst" kommt
       das Alltagsauto danach und zählt dort nicht mit. Der Führerschein liegt
       immer davor, weil r34Earliest den Führerscheinmonat einschließt. */
    preBuy: {
      /* Nur was direkt vom Tagesgeld abging. Die Fahrschule läuft über die
         Monatskosten und steckt damit bereits in `savedTotal`. */
      licence: 0,
      daily:
        dailyMonth != null && r34Month != null && dailyMonth <= r34Month
          ? oneOffs.daily
          : 0,
    },
    leftover: leftoverMin,
    leftoverLong,
    // Zum Leben während der Sparphase: engster Monat und Durchschnitt
    free: freeMin,
    // In welchem Monat es am engsten wird und bis wann die Fahrschule läuft — die
    // Anzeige muss unterscheiden, ob der Dauerauftrag zu hoch ist oder nur gerade
    // die Fahrstunden mitlaufen.
    freeMonth,
    licenceUntil: s.licenseOwned ? null : licEnd,
    freeAvg: freeMonths ? freeSum / freeMonths : null,
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
    overdraftMonths,
    // Was die Überziehung über die Sparphase gekostet hat
    overdraftCost,
    overdraftPeak,
    /* Banken räumen üblicherweise zwei bis drei Monatsnettos ein. Was darüber
       hinausgeht, ist kein Plan mehr, sondern eine Kündigung mit Ansage — der
       Kauftermin wäre dann nur mit einer Überziehung erreichbar, die es nicht gibt. */
    overdrawn: brokeOff || overdraftPeak < -limit,
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
function savingMarks(r) {
  if (!r.path || !r.path.length) return [];
  const raise = firstRaise();
  const wanted = [{ m: 0, label: "heute" }];
  if (r.dailyMonth != null && r.dailyMonth + 1 < r.path.length)
    wanted.push({
      m: r.dailyMonth + 1,
      label: `ab Alltagsauto ${dat(r.dailyMonth)}`,
    });
  if (raise && raise.m > 0)
    wanted.push({
      m: raise.m,
      label: `ab ${raise.note || "Erhöhung"} ${dat(raise.m)}`,
    });
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


/** Was im Schnitt je Monat aufs Tagesgeld geht, bis zum Kauf.
 *
 *  Eine Stelle für zwei Anzeigen: die Karte oben und die Summenzeile im Sparverlauf
 *  rechneten denselben Durchschnitt getrennt aus. Vor dem Kauf ist das der ganze
 *  Zufluss — zurück fließt aus dem Tagesgeld nichts. */
function mittleresSparen(r) {
  const upto = r.path ? r.path.slice(0, r.r34Month ?? 0) : [];
  return upto.length ? upto.reduce((a, p) => a + p.save, 0) / upto.length : 0;
}

export { simulate, statusOf, savingMarks, mittleresSparen };
