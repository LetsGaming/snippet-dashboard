/* ============================================================
   Kontoauszüge lesen

   Zweck ist eng gefasst: aus einem Auszug die **Monatsendsalden** ziehen und damit das
   Soll-Ist füllen. Daraus rechnet der Plan Lebenshaltung und Sparrate bereits zurück —
   ohne dass eine einzige Buchung kategorisiert werden muss. Das Kategorisieren ist der
   teure Teil (Regeln, Durchsicht, gelernte Zuordnungen); die Salden sind der billige,
   und sie tragen den größten Teil des Nutzens.

   Zwei Formate, weil beide von deutschen Banken im Onlinebanking angeboten werden:

   - **CAMT.053** (ISO 20022, XML). Der Saldo steht in `<Bal>` mit Typ `CLBD` —
     closing booked. Mehrere `<Stmt>` je Datei sind zulässig.
   - **MT940** (SWIFT, zeilenbasiert). Der Schlusssaldo steht im Feld `:62F:`,
     Zwischensalden in `:62M:`.

   Das XML wird bewusst **ohne DOMParser** gelesen. Nicht aus Prinzip, sondern damit das
   Modul in Node testbar bleibt, ohne jsdom zur Laufzeitabhängigkeit zu machen. CAMT ist
   maschinenerzeugt und wohlgeformt, und gebraucht werden fünf Elemente — ein enger
   Scanner ist dafür angemessen. Für beliebiges XML wäre er es nicht.

   Nichts an dieser Datei verlässt den Browser. Gespeichert werden am Ende nur die
   Monatssalden, nie der Auszug und nie einzelne Buchungen.
   ============================================================ */

/** Über 8 MB ist kein Kontoauszug mehr, sondern ein Versehen. */
const MAX_BYTES = 8 * 1024 * 1024;

/** Tags können einen Namensraum tragen: `<Bal>`, `<ns:Bal>`, `<camt:Bal>`. */
const tag = (name) => `(?:[A-Za-z][\\w.-]*:)?${name}`;

const blocks = (text, name) => {
  const re = new RegExp(`<${tag(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag(name)}>`, "g");
  const out = [];
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
};

const firstValue = (text, name) => {
  const m = new RegExp(`<${tag(name)}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag(name)}>`).exec(text);
  return m ? m[1].trim() : null;
};

const MONTH = /^(\d{4})-(\d{2})/;
const monthOf = (iso) => {
  const m = MONTH.exec(String(iso || ""));
  return m ? `${m[1]}-${m[2]}` : null;
};

/** Welches Format liegt vor? Erkannt wird am Inhalt, nicht an der Dateiendung —
 *  Banken benennen CAMT-Dateien gern `.xml`, `.txt` oder gar nicht. */
function detectFormat(text) {
  const head = text.slice(0, 4000);
  if (/BkToCstmrStmt|BkToCstmrAcctRpt/.test(head)) return "camt";
  if (/^\s*:20:/m.test(head) && /^\s*:6[02][FM]:/m.test(text)) return "mt940";
  if (/^\s*[{[]/.test(head)) return "json";
  if (head.includes(";") || head.includes(",")) return "csv";
  return null;
}

/* ---------------- CAMT.053 ---------------- */

/**
 * Salden aus einem CAMT-Auszug.
 *
 * `CLBD` ist der gebuchte Schlusssaldo einer Auszugsperiode. Eine Datei kann mehrere
 * Perioden enthalten, deshalb wird über alle `<Stmt>` gesammelt und je Monat der
 * späteste Stand behalten — ein Auszug vom 15. sagt weniger über den Monat aus als
 * einer vom 30.
 */
function parseCamt(text) {
  const balances = [];
  const accounts = new Set();
  const warnings = [];
  const statements = [
    ...blocks(text, "Stmt"),
    ...blocks(text, "Rpt"), // camt.052, gleiche Struktur
  ];
  if (!statements.length) warnings.push("Kein <Stmt>-Abschnitt gefunden.");

  for (const stmt of statements) {
    const iban = firstValue(stmt, "IBAN");
    if (iban) accounts.add(iban);
    for (const bal of blocks(stmt, "Bal")) {
      const code = firstValue(bal, "Cd");
      if (code !== "CLBD" && code !== "CLAV") continue;
      const raw = firstValue(bal, "Amt");
      const amt = Number(String(raw).replace(",", "."));
      if (!Number.isFinite(amt)) continue;
      // <Dt><Dt>2026-06-30</Dt></Dt> — das äußere Dt ist der Container
      const date = (firstValue(bal, "Dt") || "").replace(/<[^>]*>/g, "").trim();
      const month = monthOf(date);
      if (!month) continue;
      const sign = firstValue(bal, "CdtDbtInd") === "DBIT" ? -1 : 1;
      balances.push({ month, date, amt: sign * amt, kind: code });
    }
  }
  return { balances, entries: camtEntries(statements), accounts: [...accounts], warnings };
}

/** Eine Buchung auf das Nötigste eingedampft: Monat, Betrag mit Vorzeichen, und der
 *  Text, an dem sich die Zuordnung entscheidet. Mehr wird gar nicht erst mitgenommen. */
function camtEntries(statements) {
  const out = [];
  for (const stmt of statements) {
    for (const ntry of blocks(stmt, "Ntry")) {
      const raw = firstValue(ntry, "Amt");
      const amt = Number(String(raw).replace(",", "."));
      // Nullbuchungen wie die Entgeltabrechnung sind kein Umsatz
      if (!Number.isFinite(amt) || Math.abs(amt) < 0.005) continue;
      const soll = firstValue(ntry, "CdtDbtInd") === "DBIT";
      const date = (firstValue(ntry, "BookgDt") || firstValue(ntry, "ValDt") || "")
        .replace(/<[^>]*>/g, "")
        .trim();
      const month = monthOf(date);
      if (!month) continue;
      /* Gegenpartei je nach Richtung: bei einer Belastung ist es der Empfänger, bei
         einer Gutschrift der Auftraggeber. Beide Namen stehen im selben Block, deshalb
         wird gezielt im passenden Teilbaum gesucht. */
      const partei = soll
        ? blocks(ntry, "Cdtr").map((b) => firstValue(b, "Nm"))
        : blocks(ntry, "Dbtr").map((b) => firstValue(b, "Nm"));
      /* `AddtlNtryInf` trägt die Buchungsart — FOLGELASTSCHRIFT, DAUERAUFTRAG,
         KARTENZAHLUNG. Sie gehört nicht in den Verwendungszweck: angehängt zerstörte
         sie jede Erkennung, die am Zeilenende ansetzt. „Ihr Einkauf bei DB Vertrieb
         GmbH FOLGELASTSCHRIFT" ergab als Händler „DB Vertrieb GmbH FOLGELASTSCHRIFT"
         oder gar nichts. */
      out.push({
        month,
        date,
        amt: soll ? -amt : amt,
        name: (partei.find(Boolean) || "").trim(),
        text: blocks(ntry, "Ustrd").join(" ").trim(),
        kind: (firstValue(ntry, "AddtlNtryInf") || "").trim(),
      });
    }
  }
  return out;
}

/* ---------------- MT940 ---------------- */

/** `:62F:C260630EUR4876,55` — Kennzeichen, JJMMTT, Währung, Betrag mit Komma. */
const MT_BAL = /^:(6[02])([FM]):([CD])(\d{6})([A-Z]{3})([\d.,]+)/;

/** `:61:` trägt Datum und Betrag, `:86:` den Text dazu — in Unterfeldern `?NN`.
 *  `?32`/`?33` ist der Name der Gegenpartei, `?20` bis `?29` der Verwendungszweck.
 *
 *  Die Marke steht laut Feldaufbau als `2a`: `C`, `D` oder mit vorangestelltem `R`
 *  als Storno (`RC`, `RD`). Danach kann ein einbuchstabiger Währungsschlüssel folgen.
 *  Vorher stand hier `([CD])R?` — das fing den Schlüssel hinter der Marke, aber kein
 *  Storno, weil das R davor steht. Stornobuchungen fielen damit still heraus, und ein
 *  Auszug mit Rückbuchung wies zu hohe Ausgaben aus. */
const MT_TX = /^:61:(\d{6})(\d{4})?(R?[CD])([A-Z])?([\d.,]+)/;

function mt940Text(block) {
  const teile = block.split("?").slice(1);
  const nach = (von, bis) =>
    teile
      .filter((t) => {
        const n = Number(t.slice(0, 2));
        return n >= von && n <= bis;
      })
      .map((t) => t.slice(2))
      .join("")
      .trim();
  return { name: nach(32, 33), zweck: nach(20, 29) };
}

function parseMt940(text) {
  const balances = [];
  const entries = [];
  const accounts = new Set();
  const warnings = [];
  /* :86: gehört immer zur vorangegangenen :61:-Zeile und kann über mehrere Zeilen
     laufen — deshalb wird die offene Buchung mitgeführt, bis die nächste beginnt. */
  let offen = null;
  let sammel = "";
  const schliesse = () => {
    if (!offen) return;
    const { name, zweck } = mt940Text(sammel);
    entries.push({ ...offen, name, text: zweck });
    offen = null;
    sammel = "";
  };
  for (const line of text.split(/\r?\n/)) {
    const tx = MT_TX.exec(line.trim());
    if (tx) {
      schliesse();
      const [, jjmmtt, , marke, , betrag] = tx;
      const amt = Number(betrag.replace(/\./g, "").replace(",", "."));
      /* `RC` storniert eine Gutschrift und wirkt damit wie eine Belastung, `RD`
         umgekehrt. Ohne diese Zeile hätte ein Storno das Vorzeichen der Buchung, die
         es aufhebt. */
      const soll = marke === "D" || marke === "RC";
      const jj = Number(jjmmtt.slice(0, 2));
      const jahr = jj >= 70 ? 1900 + jj : 2000 + jj;
      const date = `${jahr}-${jjmmtt.slice(2, 4)}-${jjmmtt.slice(4, 6)}`;
      if (Number.isFinite(amt) && monthOf(date))
        offen = { month: monthOf(date), date, amt: (soll ? -1 : 1) * amt };
      continue;
    }
    if (/^:86:/.test(line.trim())) {
      sammel += line.trim().slice(4);
      continue;
    }
    if (offen && /^\?/.test(line.trim())) {
      sammel += line.trim();
      continue;
    }
    schliesse();
    const acc = /^:25:(.+)/.exec(line.trim());
    if (acc) accounts.add(acc[1].trim());
    const m = MT_BAL.exec(line.trim());
    if (!m) continue;
    const [, feld, art, cd, jjmmtt, , betrag] = m;
    if (feld !== "62") continue; // 60 = Anfangssaldo, hier nicht gebraucht
    const amt = Number(betrag.replace(/\./g, "").replace(",", "."));
    if (!Number.isFinite(amt)) continue;
    /* Zweistellige Jahre: MT940 stammt aus einer Zeit, in der das noch ging. Die
       Fenstergrenze bei 70 folgt der üblichen Auslegung — 70..99 sind 19xx. */
    const jj = Number(jjmmtt.slice(0, 2));
    const jahr = jj >= 70 ? 1900 + jj : 2000 + jj;
    const date = `${jahr}-${jjmmtt.slice(2, 4)}-${jjmmtt.slice(4, 6)}`;
    const month = monthOf(date);
    if (!month) continue;
    balances.push({
      month,
      date,
      amt: (cd === "D" ? -1 : 1) * amt,
      kind: art === "F" ? "CLBD" : "ITBD",
    });
  }
  schliesse();
  if (!balances.length)
    warnings.push("Kein Schlusssaldo (:62F: oder :62M:) gefunden.");
  return { balances, entries, accounts: [...accounts], warnings };
}

/* ---------------- CSV-CAMT ----------------

   Der frühere Einwand gegen CSV war „jede Bank baut die Spalten anders". Er gilt für
   selbstgebaute Exporte, nicht für CSV-CAMT: das Format hat benannte Spalten, und
   genau daran wird gelesen — nie an der Position. Fehlt eine erwartete Spalte, wird
   das gesagt, statt die falsche zu nehmen.

   Kontostände enthält dieser Export nicht. Das ist kein Fehler, sondern der Grund,
   warum Salden oben optional sind. */
const CSV_SPALTEN = {
  date: ["buchungstag", "buchungsdatum", "datum"],
  amount: ["betrag"],
  name: [
    "beguenstigter/zahlungspflichtiger",
    "begünstigter/zahlungspflichtiger",
    "name zahlungsbeteiligter",
    "zahlungspflichtiger",
  ],
  text: ["verwendungszweck", "buchungstext"],
  account: ["auftragskonto", "kontonummer"],
};

/** Zeile in Felder zerlegen, Anführungszeichen beachtet — ein Verwendungszweck
 *  enthält regelmäßig Semikolons. */
function splitCsvLine(line, sep) {
  const out = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === sep && !quoted) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

/** `1.234,56` und `-42,00` — deutsche Schreibweise, Minus vorn oder hinten. */
function parseGermanAmount(raw) {
  const t = String(raw).trim();
  const negativ = /^-/.test(t) || /-$/.test(t);
  const zahl = Number(t.replace(/[-\s€]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(zahl) ? (negativ ? -zahl : zahl) : NaN;
}

/** `01.06.2026` oder `01.06.26` */
function parseGermanDate(raw) {
  const m = /^(\d{2})\.(\d{2})\.(\d{2}(?:\d{2})?)$/.exec(String(raw).trim());
  if (!m) return null;
  const jahr = m[3].length === 2 ? (Number(m[3]) >= 70 ? "19" : "20") + m[3] : m[3];
  /* Bereichsprüfung, sonst wurde aus „31.13.26" der Monat „2026-13" und lief als
     eigener Monat durch die ganze Auswertung. Der Kalendertag zählt mit: den 31.02.
     gibt es nicht, und eine Datei, die ihn enthält, ist kein Auszug. */
  const tag = Number(m[1]);
  const monat = Number(m[2]);
  if (monat < 1 || monat > 12 || tag < 1 || tag > 31) return null;
  const probe = new Date(Date.UTC(Number(jahr), monat - 1, tag));
  if (probe.getUTCMonth() !== monat - 1 || probe.getUTCDate() !== tag) return null;
  return `${jahr}-${m[2]}-${m[1]}`;
}

function parseCsvCamt(text) {
  const zeilen = text.split(/\r?\n/).filter((l) => l.trim());
  if (!zeilen.length) return { balances: [], entries: [], accounts: [], warnings: [] };
  const sep = (zeilen[0].match(/;/g) || []).length >= 3 ? ";" : ",";
  const kopf = splitCsvLine(zeilen[0], sep).map((h) =>
    h.toLowerCase().replace(/^"|"$/g, "").trim(),
  );
  /* Die Reihenfolge der Kandidaten entscheidet, nicht die der Kopfzeile. `findIndex`
     über die Kopfzeile nahm die erste Spalte, die *irgendeinen* Kandidaten traf —
     bei „Buchungstext" vor „Verwendungszweck" landete damit die Buchungsart
     („KARTENZAHLUNG") im Textfeld und der eigentliche Zweck fiel weg. */
  const spalte = (kandidaten) => {
    for (const k of kandidaten) {
      const i = kopf.indexOf(k);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iDate = spalte(CSV_SPALTEN.date);
  const iAmt = spalte(CSV_SPALTEN.amount);
  if (iDate < 0 || iAmt < 0)
    return {
      balances: [],
      entries: [],
      accounts: [],
      warnings: [
        `In der Kopfzeile fehlt ${iDate < 0 ? "eine Datumsspalte" : "die Spalte „Betrag“"}. Erwartet wird das Format CSV-CAMT.`,
      ],
    };
  const iName = spalte(CSV_SPALTEN.name);
  const iText = spalte(CSV_SPALTEN.text);
  const iAcct = spalte(CSV_SPALTEN.account);

  const entries = [];
  const accounts = new Set();
  for (const zeile of zeilen.slice(1)) {
    const f = splitCsvLine(zeile, sep);
    const date = parseGermanDate(f[iDate]);
    const amt = parseGermanAmount(f[iAmt]);
    if (!date || !Number.isFinite(amt) || Math.abs(amt) < 0.005) continue;
    if (iAcct >= 0 && f[iAcct]) accounts.add(f[iAcct]);
    entries.push({
      month: monthOf(date),
      date,
      amt,
      name: iName >= 0 ? f[iName] || "" : "",
      text: iText >= 0 ? f[iText] || "" : "",
    });
  }
  return { balances: [], entries, accounts: [...accounts], warnings: [] };
}

/* ---------------- Gemeinsamer Weg ---------------- */

/** Je Monat der späteste Stand. Ein Auszug vom 15. sagt weniger als einer vom 30. */
function latestPerMonth(balances) {
  const byMonth = new Map();
  for (const b of balances) {
    const bisher = byMonth.get(b.month);
    if (!bisher || b.date > bisher.date) byMonth.set(b.month, b);
  }
  return [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
}

/**
 * Einen Auszug lesen. Wirft nicht — Fehler kommen als `ok: false` mit Begründung
 * zurück, weil der Aufrufer sie dem Menschen zeigen muss und nicht der Konsole.
 */
function readStatement(text) {
  if (typeof text !== "string" || !text.trim())
    return { ok: false, reason: "Die Datei ist leer." };
  if (text.length > MAX_BYTES)
    return { ok: false, reason: "Die Datei ist größer als 8 MB — das ist kein Kontoauszug." };

  const format = detectFormat(text);
  if (format !== "camt" && format !== "mt940" && format !== "csv")
    return {
      ok: false,
      reason: "Weder CAMT.053 noch MT940 erkannt. Beide Formate stehen im Onlinebanking meist unter „Umsätze exportieren“.",
    };

  let roh;
  try {
    roh =
      format === "camt"
        ? parseCamt(text)
        : format === "mt940"
          ? parseMt940(text)
          : parseCsvCamt(text);
  } catch (e) {
    return { ok: false, reason: `Die Datei ließ sich nicht lesen (${e.message}).` };
  }

  const balances = latestPerMonth(roh.balances);
  const entries = roh.entries || [];
  /* Salden und Umsätze sind zwei getrennte Nutzen. Der Export „gebuchte Umsätze"
     mancher Banken enthält keinen Saldo — die Datei deswegen ganz abzulehnen wäre
     falsch, denn die Auswertung der Ausgaben funktioniert unabhängig davon. */
  if (!balances.length && !entries.length)
    return {
      ok: false,
      reason:
        roh.warnings[0] ||
        "Weder Salden noch Buchungen gefunden. Enthält die Datei überhaupt Umsätze?",
      format,
    };

  /* Mehrere Konten in einer Datei sind ein Warnsignal, kein Fehler: die Salden würden
     sich vermischen und ergäben eine Reihe, die es so nie gab. */
  const warnings = [...roh.warnings];
  if (roh.accounts.length > 1)
    warnings.push(
      `Die Datei enthält ${roh.accounts.length} Konten. Die Stände werden vermischt — besser je Konto einzeln einlesen.`,
    );

  if (!balances.length)
    warnings.push(
      "Die Datei enthält keine Kontostände, nur Umsätze. Die Ausgaben lassen sich auswerten, die Monatsstände fürs Soll-Ist nicht.",
    );

  return {
    ok: true,
    format,
    accounts: roh.accounts,
    entries,
    balances,
    warnings,
    from: balances[0]?.month ?? entries[0]?.month ?? null,
    to: balances[balances.length - 1]?.month ?? entries[entries.length - 1]?.month ?? null,
  };
}

/**
 * Salden in die vorhandenen Einträge mischen.
 *
 * Gleicher Monat wird ersetzt, nicht verdoppelt — wer denselben Auszug zweimal einliest,
 * soll nicht zwei Reihen bekommen. Zurückgegeben wird, was sich geändert hat, damit die
 * Rückfrage sagen kann, was passiert.
 */
function mergeBalances(vorhandene, neue, quelle = "aus Kontoauszug") {
  const byMonth = new Map(vorhandene.map((r) => [r.month, r]));
  let neu = 0;
  let ersetzt = 0;
  let gleich = 0;
  for (const b of neue) {
    const alt = byMonth.get(b.month);
    if (!alt) neu++;
    else if (Math.abs(Number(alt.amt) - b.amt) < 0.005) {
      gleich++;
      continue;
    } else ersetzt++;
    byMonth.set(b.month, { month: b.month, amt: b.amt, src: quelle });
  }
  const rows = [...byMonth.values()].sort((a, b) => (a.month < b.month ? -1 : 1));
  return { rows, neu, ersetzt, gleich };
}

/**
 * Mehrere Dateien zu einem Ergebnis verbinden.
 *
 * Der XML-Export der Sparkasse liefert **eine Datei je Buchungstag** — bei einem
 * Vierteljahr sind das fünfzig Stück. Einzeln eingelesen ergäbe jede für sich einen
 * Monatsstand und ein paar Buchungen; erst zusammen ergeben sie eine Reihe.
 */
function combine(ergebnisse) {
  const gut = ergebnisse.filter((r) => r && r.ok);
  if (!gut.length)
    return {
      ok: false,
      reason: ergebnisse.find((r) => r && r.reason)?.reason || "Keine lesbare Datei dabei.",
    };
  const balances = latestPerMonth(gut.flatMap((r) => r.balances));
  const entries = gut
    .flatMap((r) => r.entries)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const accounts = [...new Set(gut.flatMap((r) => r.accounts))];
  const warnings = [...new Set(gut.flatMap((r) => r.warnings))];
  const abgelehnt = ergebnisse.length - gut.length;
  if (abgelehnt)
    warnings.push(`${abgelehnt} von ${ergebnisse.length} Dateien waren nicht lesbar.`);
  return {
    ok: true,
    format: gut[0].format,
    files: gut.length,
    accounts,
    entries,
    balances,
    warnings,
    from: balances[0]?.month ?? entries[0]?.month ?? null,
    to: balances[balances.length - 1]?.month ?? entries[entries.length - 1]?.month ?? null,
  };
}

export {
  readStatement,
  combine,
  mergeBalances,
  detectFormat,
  latestPerMonth,
  parseGermanAmount,
  parseGermanDate,
  MAX_BYTES,
};
