/* ============================================================
   Buchungen einsortieren

   Das Modell braucht aus einem Kontoauszug genau drei Größen: was fürs Leben abgeht,
   was aufs Auto, und was nur zwischen den eigenen Konten hin und her wandert. Die
   dritte ist die wichtigste — eine Umbuchung aufs Tagesgeld ist keine Ausgabe, und wer
   sie mitzählt, hält seine Lebenshaltung für doppelt so hoch wie sie ist.

   Autokosten müssen getrennt bleiben, weil der Rechner sie schon einzeln führt
   (Versicherung, Steuer, Sprit, Wartung je Fahrzeug). Landen sie zusätzlich in der
   Lebenshaltung, zählen sie zweimal.

   Die Regeln sind Textvergleiche auf Gegenpartei und Verwendungszweck. Das trifft
   erfahrungsgemäß den größten Teil und niemals alles — der Rest wird gefragt, nicht
   geraten. Eine falsch geratene Zuordnung ist schlimmer als eine offene, weil sie
   unbemerkt in die Lebenshaltung wandert.

   Gespeichert werden am Ende nur die Monatssummen und die gelernten Regeln. Nie eine
   einzelne Buchung.
   ============================================================ */

/* Fünf Töpfe, weil sie im Modell fünf verschiedene Dinge bedeuten:

   leben       — läuft jeden Monat weiter und wird auf Jahre fortgeschrieben
   auto        — führt der Rechner schon einzeln; hier nur, damit es nicht doppelt zählt
   einmalig    — war echtes Geld, kommt aber nicht wieder (Hardware, Möbel, Reparatur)
   umbuchung   — eigenes Konto, gar keine Ausgabe
   ignorieren  — soll nirgends auftauchen

   Der Unterschied zwischen „einmalig" und „leben" ist der teuerste im ganzen Modul:
   500 € Hardware in einem von drei Monaten heben die Lebenshaltung um 167 €/Monat —
   und die schreibt der Plan dann fünf Jahre lang fort, inflationsbereinigt. Aus einer
   einmaligen Anschaffung werden so über 10.000 €. */
const KATEGORIEN = {
  leben: "Lebenshaltung",
  auto: "Auto",
  einmalig: "einmalig",
  einkommen: "Einkommen",
  umbuchung: "Umbuchung",
  ignorieren: "ignorieren",
};

/* Startregeln für den deutschen Markt. Bewusst auf Ketten und Behörden beschränkt:
   was eindeutig ist, wird zugeordnet, alles Zweideutige bleibt offen.

   Die Reihenfolge entscheidet — die erste passende Regel gewinnt. Umbuchungen stehen
   vorn, weil „Übertrag Tagesgeld" sonst als Lebenshaltung durchginge. */
const SEED_RULES = [
  { pat: "umbuchung", cat: "umbuchung" },
  { pat: "übertrag", cat: "umbuchung" },
  { pat: "eigenübertrag", cat: "umbuchung" },
  { pat: "tagesgeld", cat: "umbuchung" },
  { pat: "sparkonto", cat: "umbuchung" },
  { pat: "festgeld", cat: "umbuchung" },
  { pat: "depot", cat: "umbuchung" },

  { pat: "gehalt", cat: "einkommen" },
  { pat: "kindergeld", cat: "einkommen", dir: "in" },
  { pat: "bundesagentur für arbeit", cat: "einkommen", dir: "in" },
  { pat: "stadtkasse", cat: "einkommen", dir: "in" },
  { pat: "lohn", cat: "einkommen" },
  { pat: "bezüge", cat: "einkommen" },
  { pat: "ausbildungsvergütung", cat: "einkommen" },
  { pat: "entgeltabrechnung", cat: "einkommen" },

  { pat: "aral", cat: "auto" },
  { pat: "shell", cat: "auto" },
  { pat: "esso", cat: "auto" },
  { pat: "jet tankstelle", cat: "auto" },
  { pat: "total energies", cat: "auto" },
  { pat: "tankstelle", cat: "auto" },
  { pat: "tank & rast", cat: "auto" },
  { pat: "kfz-steuer", cat: "auto" },
  { pat: "hauptzollamt", cat: "auto" },
  { pat: "kfz-versicherung", cat: "auto" },
  { pat: "kfz versicherung", cat: "auto" },
  { pat: "werkstatt", cat: "auto" },
  { pat: "a.t.u", cat: "auto" },
  { pat: "vergölst", cat: "auto" },
  { pat: "euromaster", cat: "auto" },
  { pat: "pitstop", cat: "auto" },
  { pat: "dekra", cat: "auto" },
  { pat: "tüv", cat: "auto" },
  { pat: "adac", cat: "auto" },

  { pat: "miete", cat: "leben" },
  { pat: "hausverwaltung", cat: "leben" },
  { pat: "stadtwerke", cat: "leben" },
  { pat: "vattenfall", cat: "leben" },
  { pat: "enbw", cat: "leben" },
  { pat: "telekom", cat: "leben" },
  { pat: "vodafone", cat: "leben" },
  { pat: "congstar", cat: "leben" },
  { pat: "edeka", cat: "leben" },
  { pat: "rewe", cat: "leben" },
  { pat: "aldi", cat: "leben" },
  { pat: "lidl", cat: "leben" },
  { pat: "kaufland", cat: "leben" },
  { pat: "penny", cat: "leben" },
  { pat: "rossmann", cat: "leben" },
  { pat: "dm-drogerie", cat: "leben" },
  { pat: "netflix", cat: "leben" },
  { pat: "spotify", cat: "leben" },
  { pat: "krankenkasse", cat: "leben" },
  { pat: "famila", cat: "leben" },
  { pat: "wucherpfennig", cat: "leben" },
  { pat: "netto marken", cat: "leben" },
  { pat: "mcdonald", cat: "leben" },
  { pat: "burger king", cat: "leben" },
  { pat: "drillisch", cat: "leben" },
  { pat: "sim.de", cat: "leben" },
  { pat: "o2 ", cat: "leben" },
  { pat: "montana", cat: "leben" },
  { pat: "eprimo", cat: "leben" },
  { pat: "lichtblick", cat: "leben" },
  { pat: "db vertrieb", cat: "leben" },
  { pat: "deutsche bahn", cat: "leben" },
  { pat: "steampowered", cat: "leben" },
  { pat: "discord", cat: "leben" },
  { pat: "ubisoft", cat: "leben" },
  { pat: "google play", cat: "leben" },
  { pat: "anthropic", cat: "leben" },
  { pat: "deutsche post", cat: "leben" },
];

/* Absichtlich NICHT in den Startregeln, obwohl sie häufig vorkommen:

   „netto"   — Discounter und zugleich das Wort auf jeder Gehaltsabrechnung
   „amazon"  — Einkauf, Abo oder Rückerstattung, je nach Buchung
   „paypal"  — sagt über den Zweck gar nichts
   „star"    — Tankstellenkette und Wortbestandteil von hundert anderen Namen
   „real"    — Supermarkt und häufiges Wortfragment

   Bei diesen ist eine falsche Zuordnung wahrscheinlicher als eine richtige, und sie
   fällt niemandem auf, weil sie in einer Summe verschwindet. */

/* Zahlungsdienstleister und Kartenterminals schreiben ihren eigenen Namen ins
   Namensfeld und den echten Händler in den Verwendungszweck. Ohne diesen Schritt
   landen dreißig verschiedene Einkäufe unter „PayPal Europe S.a.r.l." in einer
   einzigen offenen Gruppe — unbrauchbar zum Einsortieren und unbrauchbar für Regeln.

   Die Muster stammen aus einem echten Sparkassen-Auszug:
     PayPal … /PP.8259.PP/. www.steampowered.com, Ihr Einkauf bei www.steampowered.com
     Klarna Bank AB Purchase at KaartDirect
     Payone i.A. von IKEA IKEA 187 HANNOVER DANKT …
     01446 MCDONALDS//HANNOVER/DE 2026-05-29T13:58 Debitk.1 …
     REWE SAGT DANKE. 41650304/Iris-Runge/Hannover-Kronsrode /DE … */
const DURCHLEITUNG = [
  /ihr\s+e\s?inkauf\s+bei\s+(.{3,60}?)\s*$/i, // PayPal
  /purchase\s+at\s+(.{3,40}?)\s*$/i, // Klarna
  /i\.?\s?a\.?\s+von\s+([\p{L}0-9.&'-]{3,30})/iu, // Payone im Namen von
];

/** Bezeichner aufräumen: Rechtsformen, Belegnummern und Terminaltexte weg. */
const putzen = (t) =>
  String(t)
    .replace(/\b(gmbh|ag|kg|ohg|se|inc|ltd|llc|s\.?a\.?r\.?l\.?|s\.?c\.?a\.?|e\.?k\.?|europe|deutschland|niederlassung)\b/gi, " ")
    .replace(/\bsagt danke\b|\bdankt\b|\bdebitk\b/gi, " ")
    .replace(/\d{4,}/g, " ")
    .replace(/[.,;/\\]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/**
 * Der eigentliche Händler hinter einer Buchung.
 *
 * Gibt den rohen Text zurück, wenn sich nichts Besseres finden lässt — lieber eine
 * unschöne Gruppe als eine falsche.
 */
function merchantOf(entry) {
  const roh = `${entry.name || ""} ${entry.text || ""}`.replace(/\s+/g, " ").trim();
  for (const re of DURCHLEITUNG) {
    const m = re.exec(roh);
    if (m && putzen(m[1]).length > 2) return putzen(m[1]);
  }
  // Kartenzahlung: Händler steht vorn, vor //ORT/LAND
  const karte = /^(?:\d+\s+)?([^/]{3,48}?)\s*\/\/\s*\p{Lu}/u.exec(roh);
  if (karte && putzen(karte[1]).length > 2) return putzen(karte[1]);
  /* Zuletzt: auf die Marke zuschneiden. Ein Gruppenschlüssel muss vor allem *stabil*
     sein — „REWE Iris-Runge Hannover-Kronsrode" und „REWE HM 621" wären zwei Gruppen
     für denselben Laden, und eine gelernte Regel griffe beim nächsten Auszug nicht. */
  const worte = putzen(roh).split(" ").filter(Boolean);
  if (!worte.length) return roh.slice(0, 60);
  if (worte[0].length >= 4 && worte[0] === worte[0].toUpperCase()) return worte[0];
  const bis = worte.findIndex((w) => /\d/.test(w));
  return worte.slice(0, bis > 0 ? Math.min(bis, 2) : 2).join(" ");
}

/* Banken schreiben Umlaute mal so, mal so: im Buchungstext steht „UEBERTRAG", im
   Verwendungszweck „Übertrag". Beide Schreibweisen werden auf dieselbe Form gebracht,
   sonst greift eine Regel je nach Feld oder Bank — oder eben nicht. */
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();

/** Die erste passende Regel gewinnt; eigene Regeln stehen vor den Startregeln. */
function categorise(entry, rules = []) {
  /* Die Buchungsart gehört in den Suchtext, aber nicht in die Händlererkennung:
     "UEBERTRAG (UEBERWEISUNG)" ist das einzige Kennzeichen einer Umbuchung aufs
     eigene Konto, während der Name nur "Kirchner, Domenic" lautet. */
  const heu = norm(`${entry.name} ${entry.text} ${entry.kind || ""} ${merchantOf(entry)}`);
  const rein = entry.amt > 0;
  for (const r of [...rules, ...SEED_RULES]) {
    /* Manche Namen bedeuten je nach Richtung etwas anderes: „Stadtkasse" ist als
       Gutschrift eine Leistung und als Lastschrift die Grundsteuer. Regeln dürfen
       deshalb eine Richtung verlangen. */
    if (r.dir === "in" && !rein) continue;
    if (r.dir === "out" && rein) continue;
    const p = norm(r.pat);
    if (p && heu.includes(p)) return { cat: r.cat, pat: r.pat };
  }
  return { cat: "offen", pat: null };
}

/** Gegenparteien zusammenfassen, damit die Rückfrage nicht 24-mal dieselbe Firma zeigt. */
/* Manche Buchungen tragen keinen Namen, nur Formulierungen der Bank. Als Gruppe
   angeboten („Lastschrift aus", „Danke Yormas") sind sie nicht einsortierbar, weil
   niemand weiß, worum es geht. Sie kommen in einen Sammeltopf. */
const KEIN_NAME =
  /^(lastschrift|gutschrift|ueberweisung|überweisung|dauerauftrag|kartenzahlung|entgelt|danke|abschluss|sepa|folgelastschrift|auszahlung|einzahlung|umsatz|betrag|zahlung)\b/i;

const gruppenschluessel = (entry) => {
  const m = merchantOf(entry);
  if (!m || m.length < 3 || KEIN_NAME.test(m)) return "ohne erkennbaren Empfänger";
  return m;
};

/**
 * Buchungen zu Monatswerten verdichten.
 *
 * Offene Buchungen werden **nicht** stillschweigend der Lebenshaltung zugeschlagen. Sie
 * stehen als eigener Posten da, damit sichtbar ist, wie belastbar die Zahl ist: 40 €
 * offen sind egal, 400 € offen heißen, dass die Lebenshaltung noch nichts taugt.
 */
function summarise(entries, rules = []) {
  const monate = new Map();
  const offen = new Map();
  for (const e of entries) {
    const { cat } = categorise(e, rules);
    const m =
      monate.get(e.month) ||
      {
        month: e.month,
        leben: 0,
        auto: 0,
        einmalig: 0,
        einkommen: 0,
        umbuchung: 0,
        offen: 0,
        n: 0,
      };
    m.n++;
    if (cat === "einkommen") m.einkommen += Math.max(0, e.amt);
    else if (cat === "umbuchung") m.umbuchung += Math.abs(e.amt);
    else if (cat === "ignorieren") {
      /* zählt nirgends mit */
    } else if (cat === "offen") {
      m.offen += Math.max(0, -e.amt);
      const k = gruppenschluessel(e);
      // Angezeigt wird der Händler, nicht der Rohtext — sonst steht in der Rückfrage
      // eine halbe Zeile Terminalprotokoll statt eines Namens.
      const g = offen.get(k) || { key: k, name: k, n: 0, summe: 0 };
      g.n++;
      g.summe += Math.abs(e.amt);
      offen.set(k, g);
    } else {
      /* Netto, nicht nur der Abfluss: eine Erstattung mindert die Kategorie, in die
         sie gehört. Vorher fiel jede Gutschrift unter `Math.max(0, -amt)` heraus —
         eine Retoure erhöhte die Lebenshaltung, weil der Kauf zählte und das Geld
         zurück nicht. */
      m[cat] -= e.amt;
    }
    monate.set(e.month, m);
  }
  return {
    months: [...monate.values()].sort((a, b) => (a.month < b.month ? -1 : 1)),
    /* Nach Betrag sortiert: wer zehn Zeilen sortiert, soll mit den zehn anfangen, die
       am meisten ausmachen — nicht mit denen, die zufällig oben stehen. */
    open: [...offen.values()].sort((a, b) => b.summe - a.summe),
  };
}

const median = (xs) => {
  if (!xs.length) return null;
  const a = [...xs].sort((p, q) => p - q);
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

/**
 * Was aus den Monatswerten für den Plan folgt.
 *
 * Median statt Durchschnitt: ein Monat mit Jahresbeitrag oder Urlaub zieht den
 * Durchschnitt hoch, ohne über den Normalfall etwas zu sagen. Angeschnittene Monate am
 * Rand des Auszugs fliegen raus — ein halber Monat sieht aus wie halbierte Kosten.
 */
function derive(summary, { minMonths = 2 } = {}) {
  /* Ein Monat ohne einen einzigen Geldeingang ist angeschnitten — beim Export bis zum
     28. fehlt das Gehalt, und der Monat sähe aus, als hätte man von nichts gelebt. */
  const voll = summary.months.filter((m) => m.n >= 5 && m.einkommen > 0);
  if (voll.length < minMonths)
    return {
      ok: false,
      reason:
        `Für einen belastbaren Wert braucht es mindestens ${minMonths} vollständige Monate — gefunden: ${voll.length}.` +
        (summary.months.some((m) => m.n >= 5 && !m.einkommen)
          ? " Mindestens ein Monat hat keinen Geldeingang: fehlen dort Dateien?"
          : ""),
      partial: summary.months.filter((m) => m.n >= 5 && !m.einkommen).map((m) => m.month),
    };
  const lebenswerte = voll.map((m) => m.leben);
  const offenAnteil =
    voll.reduce((a, m) => a + m.offen, 0) /
    Math.max(1, voll.reduce((a, m) => a + m.leben + m.auto + m.offen, 0));
  /* Was am Monatsende übrig bleibt — und damit die einzige ehrliche Antwort auf
     „wie viel kann ich überweisen". Einkommen minus alles, was tatsächlich abfließt,
     einschließlich der noch nicht einsortierten Posten: die sind ja bezahlt worden.
     Umbuchungen zählen nicht als Ausgabe, sie sind genau das, was hier herauskommt. */
  /* Einmalige Ausgaben bleiben draußen: gefragt ist, was Monat für Monat übrig bleibt,
     nicht was in dem Monat zufällig noch anstand. Sie werden separat ausgewiesen, denn
     verschwunden ist das Geld trotzdem. */
  const uebrig = voll.map((m) => m.einkommen - (m.leben + m.auto + m.offen));
  const einmalig = voll.reduce((a, m) => a + m.einmalig, 0);
  return {
    ok: true,
    months: voll.length,
    partial: summary.months.filter((m) => m.n >= 5 && !m.einkommen).map((m) => m.month),
    living: median(lebenswerte),
    capacity: {
      median: median(uebrig),
      /* Der schwächste Monat entscheidet, was ein Dauerauftrag verträgt. Ein Betrag
         über diesem Wert bedeutet in mindestens einem der erfassten Monate ein Minus
         auf dem laufenden Konto — und das kostet Dispozinsen. */
      min: Math.min(...uebrig),
      max: Math.max(...uebrig),
      months: voll.length,
    },
    /* Was in diesen Monaten einmalig anfiel. Steht daneben, nicht in der Lebenshaltung. */
    oneOff: { summe: einmalig, proMonat: einmalig / voll.length },
    auto: median(voll.map((m) => m.auto)),
    income: median(voll.map((m) => m.einkommen)),
    /* Anteil der Abflüsse, die noch keiner Kategorie zugeordnet sind. Darüber
       entscheidet sich, ob man den Wert übernehmen sollte. */
    openShare: offenAnteil,
  };
}

export {
  KATEGORIEN,
  merchantOf,
  SEED_RULES,
  categorise,
  summarise,
  derive,
  gruppenschluessel,
};
