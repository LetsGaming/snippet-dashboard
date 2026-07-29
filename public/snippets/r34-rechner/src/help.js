/* ============================================================
   11 — Hilfetexte
   ============================================================ */
const HELP = {
  /* Kernzahlen */
  netNow: {
    t: "Netto heute",
    b: 'Dein monatliches Nettoeinkommen inklusive steuerfreiem Fahrgeld. Gilt im Modell bis zu dem Monat, den du unter „Erhöhung ab" einträgst.',
  },
  income: {
    t: "Bekannte Gehaltsschritte",
    b: "Jede Zeile ist ein Netto, von dem du weißt, dass es ab einem bestimmten Monat gilt: das nächste Ausbildungsjahr, eine Tarifstufe, der Wechsel in die Übernahme, ein neuer Arbeitgeber. Trag so viele ein, wie du kennst.<br><br>Zwischen zwei erfassten Schritten rechnet der Plan mit dem erfassten Betrag — der enthält die Erhöhung ja bereits. Erst <b>hinter dem letzten</b> Schritt greift die allgemeine Lohnentwicklung. Sonst schlüge sie auf Zahlen auf, die aus deinem Vertrag stammen.<br><br>Bis zum ersten Schritt gilt dein heutiges Netto unverändert. Ist die Liste leer, läuft das heutige Netto von Anfang an mit der Lohnentwicklung weiter.<br><br>Ein Schritt in der Vergangenheit ist kein Fehler: er wird auf den laufenden Monat gezogen und beschreibt damit, was ohnehin schon gilt.",
  },
  living: {
    t: "Lebenshaltung ohne Auto",
    b: "Alles, was monatlich abgeht außer Autokosten: Warmmiete, Strom, Internet, Handy, Versicherungen, Abos, Essen, Freizeit, Kleidung.<br><br>Der Rechner zieht den Betrag jeden Monat vom Netto ab und erhöht ihn jährlich um die Kosteninflation. Er ist der stärkste Hebel im ganzen Modell: ±150 € verschieben den Kauftermin um etwa 15 Monate.<br><br>Wenn du eine einzige Zahl belastbar machst, dann diese. Drei Monate Kontoauszug, alles ohne Auto summieren, durch drei teilen — oder unter Soll-Ist zwei Kontostände erfassen und den Wert daraus übernehmen lassen.",
  },
  car: {
    t: "Kaufpreis R34",
    b: 'Der Preis der Karosserie, die oben ausgewählt ist — im Standard die <b>Limousine</b> (ER34). Dafür liegt der Markt bei etwa 28.000 bis 32.000 €. Coupés fangen selten unter 35.000 € an; wechselst du oben die Variante, rechnet das Modell mit dem Aufschlag oder, sobald vorhanden, mit deinen eigenen Inseraten.<br><br>Solange keine Vergleichsangebote erfasst sind, trägt diese Zahl die größte Unsicherheit im ganzen Plan. Unter „R34 — Preis & Karosserie" echte Inserate eintragen, dann ersetzt deren Median diesen Wert und die Spanne oben wird spürbar schmaler.',
  },

  /* Korridor und Hebel */
  spread: {
    t: "Woher die Spanne kommt",
    b: "Der Rechner zieht ein paar hundert vollständige Durchläufe. In jedem werden alle offenen Zahlen gleichzeitig neu ausgewürfelt, und heraus kommt eine Verteilung von Kaufterminen statt einer einzigen Zahl.<br><br>Angezeigt sind das <b>10-, 50- und 90-Prozent-Quantil</b>: in jedem zehnten Durchlauf ist es früher als links, in jedem zehnten später als rechts. Die Mitte ist der Median, nicht deine Punktrechnung — er liegt meist etwas später, weil Kosten nach oben mehr Luft haben als nach unten.<br><br>Drei Dinge stecken darin, die eine einfache Fehlerrechnung nicht abbildet:<br><br><b>Zusammenhänge.</b> Lebenshaltung, Wartung, Versicherung und Sprit hängen alle an derselben Inflation. Sie werden deshalb gemeinsam gezogen, nicht unabhängig — sonst wäre die Spanne zu schmal.<br><br><b>Schiefe.</b> Eine Reparatur kann das Fünffache der Schätzung kosten, aber nie weniger als nichts. Kostenfelder werden deshalb multiplikativ gezogen: nach unten begrenzt, nach oben offen.<br><br><b>Ereignisse.</b> Eine große Reparatur (10 % im Jahr) und ein zeitweiser Einkommensausfall (3 % im Jahr) kommen vor. Dazu die Entweder-oder-Fragen: Schadstoffklasse, H-Kennzeichen, Klassikertarif. Das sind Risiken, die keine Bandbreite abdeckt.<br><br>Wie breit die Spanne wird, hängt an den Herkunftspunkten: belegte Zahlen streuen weniger als geratene. Angebote zu erfassen macht sie also nicht kosmetisch, sondern berechtigt schmaler.",
  },
  levers: {
    t: "Was den Termin verschiebt",
    b: "Der Rechner dreht jeden Wert einmal um die angegebene Spanne nach unten und nach oben und lässt die Simulation beide Male komplett durchlaufen. Der Balken zeigt, wie weit das Ergebnis dabei wandert. Die Reihenfolge ordnet sich neu, sobald du oben etwas änderst.<br><br>Bei fest vorgegebenem Kauftermin ist die Zielgröße nicht mehr der Monat — der steht ja fest —, sondern die Kreditsumme in Euro. Die Liste rechnet dann automatisch um.<br><br>Die Schlusszeile listet die Posten ohne Wirkung. Das sind die laufenden Kosten des R34, weil sie erst ab dem Kaufmonat anfallen. Sie entscheiden darüber, was dir nach dem Kauf im Monat bleibt.",
  },

  /* Karosserie */
  body: {
    t: "Limousine oder Coupé",
    b: "Den GT-T gab es als viertürige Limousine (ER34) und als Coupé. Technisch ist es derselbe RB25DET, im Preis liegen Welten — der Sammleraufschlag hängt fast vollständig am Coupé.<br><br>Der Rechner nimmt die <b>Limousine als Anker</b>, weil es davon mehr Angebote gibt und der Preis besser bekannt ist. Das Coupé wird über den Aufschlag daneben abgeleitet, solange dafür keine eigenen Inserate erfasst sind. Sobald für beide Karosserien Zeilen im Ledger stehen, rechnet das Modell mit den echten Medianen und der Aufschlag wird bedeutungslos.<br><br>Die angenommene Wertsteigerung folgt der Wahl: 3 % für die Limousine, 5 % für das Coupé, sofern du den Regler oben nicht selbst angefasst hast.",
  },
  bodyCompare: {
    t: "Der Vergleich darunter",
    b: "Beide Varianten werden vollständig durchgerechnet, jede mit ihrem eigenen Preis und ihrer eigenen Wertsteigerung. Was du siehst, sind zwei echte Kauftermine nebeneinander.<br><br>Die Schlusszeile beantwortet die eigentliche Frage: Wie viele Monate früher wärst du mit der Limousine am Ziel, und ist dir das den Unterschied wert? Unter sechs Monaten lohnt das Warten aufs Coupé fast immer.<br><br>Solange für eine Variante keine Angebote im Ledger stehen, wird ihr Preis über den Abschlag abgeleitet — dann vergleichst du eine Schätzung mit einer Schätzung. Erst ab je drei, vier Inseraten trägt der Vergleich.",
  },
  extra: {
    t: "Nebenkosten des Kaufs",
    b: "Alles, was zusätzlich zum Kaufpreis sofort fällig wird: Zulassung, Kennzeichen, Überführung oder Transport, fällige HU, erste Instandsetzung.<br><br>Beim Daily sind 500 bis 700 € realistisch, beim R34 als fast 30 Jahre altem Fahrzeug eher 1.200 bis 2.500 €. Der Rechner zieht den Betrag im Kaufmonat zusätzlich ab, bei Finanzierung wird er <b>nicht</b> mitfinanziert, sondern bar bezahlt.<br><br>Das H-Gutachten nach §23 StVZO steht separat, weil es an einem eigenen Termin hängt: Liegt der Kauf vor dem 30-Jahres-Datum, fällt es erst dann an.",
  },

  /* Restfinanzierung */
  method: {
    t: "Bar, Kredit oder Restfinanzierung",
    b: "<b>Bar:</b> Gekauft wird im ersten Monat, in dem das Ersparte Kaufpreis, Nebenkosten und Rücklage deckt. Keine Zinsen, dafür später.<br><br><b>Kredit:</b> Gekauft wird im frühestmöglichen Monat. Anzahlung ist alles Ersparte über der Rücklage, der Rest läuft als Annuität über die Laufzeit.<br><br><b>Restfinanzierung:</b> Dasselbe Prinzip, aber du gibst vor, was dir wichtig ist — Termin, Kreditsumme oder Monatsrate. Die anderen beiden rechnet das Modell aus.",
  },
  restGoal: {
    t: "Was gibst du vor",
    b: 'Drei Zahlen hängen zusammen: Termin, Kreditsumme und Monatsrate. Eine legst du fest, die anderen beiden fallen heraus.<br><br>• <b>Termin</b> → gekauft wird in diesem Monat, unabhängig davon, ob das Geld reicht. Was fehlt, wird finanziert.<br>• <b>Kreditsumme</b> → der Rechner sucht den ersten Monat, in dem nicht mehr fehlt als dein Wert.<br>• <b>Monatsrate</b> → derselbe Weg, nur über die Annuität aus Restbetrag, Zins und Laufzeit.<br><br>Bei den letzten beiden gilt weiter die Untergrenze aus „Frühestens kaufen ab".',
  },
  restYm: {
    t: "Wunschtermin",
    b: "Der Monat, in dem gekauft wird — unabhängig davon, ob das Geld reicht. Reicht es schon, entsteht kein Kredit und der Termin steht trotzdem.<br><br>Vorbelegt mit dem H-Termin. Liegt er vor dem Führerscheintermin, schiebt der Rechner ihn dorthin.",
  },
  restAmount: {
    t: "Kreditsumme höchstens",
    b: "Der Betrag, den du bereit bist aufzunehmen. Gekauft wird im ersten Monat, in dem Preis minus Anzahlung diesen Wert nicht mehr übersteigt.<br><br>Auf 0 gesetzt entspricht das dem Barkauf, nur ohne den Puffer für Nebenkosten.",
  },
  restRate: {
    t: "Monatsrate höchstens",
    b: 'Dieselbe Logik über die Rate statt über die Summe.<br><br>Achte dabei auf „Danach frei im Monat": eine Rate, die rechnerisch passt, kann den engsten Monat trotzdem auf null drücken. Der Rechner warnt, wenn weniger als 150 € übrig bleiben.',
  },
  restTerm: {
    t: "Laufzeit",
    b: "Länger heißt kleinere Rate und mehr Zinsen. Bei 13.500 € zu 8,5 % kostet der Schritt von zwei auf fünf Jahre rund 1.900 € zusätzliche Zinsen, senkt die Rate aber von etwa 614 € auf 277 €.<br><br>Gibst du die Rate vor, holt eine längere Laufzeit den Termin nach vorn — zum Preis der Zinsen.",
  },
  restCmp: {
    t: "Was ein anderer Termin ändert",
    b: "Dieselbe Rechnung für drei, sechs und zwölf Monate vor und nach deinem Termin.<br><br>Entscheidend ist das Verhältnis zweier Größen: Solange du im Monat mehr zurücklegst, als das Auto durch die Wertsteigerung teurer wird, sinkt die Kreditsumme mit jedem Monat Warten. Kippt das Verhältnis, wird Warten teurer — dann ist früher kaufen und mehr finanzieren die günstigere Variante.",
  },

  /* Soll-Ist */
  track: {
    t: "Soll-Ist",
    b: "Der Plan weiß, was du vorhast. Was tatsächlich passiert, weiß er nur, wenn du es ihm sagst.<br><br>Trag einmal im Monat den Stand deines <b>Tagesgeldkontos</b> ein — jeweils zum <b>Monatsende</b>, also nachdem Gehalt, Kosten und der Dauerauftrag durch sind. Genau so rechnet auch die Simulation, damit beide Linien vergleichbar sind.<br><br>Ab dem zweiten Eintrag rechnet der Rechner deine tatsächliche Sparrate aus und stellt sie der geplanten gegenüber. Weichen sie ab, bietet er dir den passenden Wert zur Übernahme an: bei Dauerauftrag den echten Betrag, sonst die daraus abgeleitete Lebenshaltung.<br><br>Das ist der Punkt, an dem der stärkste Hebel im Modell von einer Schätzung zu einer belegten Zahl wird und die Spanne oben sichtbar schrumpft.<br><br>Ein Klick auf einen Punkt im Graph zeigt den Vergleich für diesen Monat.",
  },
  backup: {
    t: "Sichern und übertragen",
    b: "Der Plan liegt im Speicher des Browsers. Der überlebt keinen geleerten Cache, keinen Gerätewechsel und keinen privaten Tab.<br><br><b>Gesichert wird der ganze Plan</b>, nicht ein einzelner Bereich: Stellschrauben, deine Fakten, Sparweise, Preis und Karosserie, Unterhalt beider Fahrzeuge, Import, alle vier Belegarten, abgehakte Schritte und geänderte EZB-Reihenschlüssel. Dazu die zuletzt live geholten Spritpreise und Zinsen als Rückfall — damit ein Gerät ohne Netz nicht mit Katalogwerten weiterrechnet und zu einem anderen Termin kommt.<br><br>Auch Zahlen, die du über einen „übernehmen\"-Knopf aus deinen eigenen Belegen abgeleitet hast, wandern mit. Bis Fassung 6 blieb davon nur das Etikett „belegt\" übrig, während der Wert auf den Katalogstand zurückfiel.<br><br><b>Code</b> — für den Wechsel zwischen Handy und Rechner. „Code kopieren\" legt den ganzen Plan als eine Zeile Text ab. Schick sie dir selbst, per Nachricht, Mail oder Notiz, und drück auf dem anderen Gerät „Code einfügen\". Der Code enthält keine Zugangsdaten und geht nirgendwo über einen Server.<br><br><b>Datei</b> — für die Ablage. Eine JSON-Datei, lesbar und versionierbar, gut für ein Backup neben den anderen Unterlagen.<br><br>Beide Wege prüfen vor dem Übernehmen, aus welcher Fassung der Plan stammt, rechnen ältere Stände auf die aktuelle Form um und fragen nach, bevor sie den Plan auf diesem Gerät ersetzen. Ein Plan aus einer <i>neueren</i> Fassung wird abgelehnt statt halb verstanden.<br><br>Oben am Soll-Ist-Panel steht „nicht gesichert\", sobald sich seit der letzten Sicherung etwas geändert hat. Nach zwei Jahren gesammelter Angebote sind das die einzigen Zahlen in diesem Werkzeug, die sich nicht wiederbeschaffen lassen.",
  },

  /* Belege */
  priceLedger: {
    t: "Vergleichsangebote",
    b: "Jede Zeile ist ein reales Inserat mit <b>Monat, Karosserie und Preis</b>. Der Monat ist kein Beiwerk: Inserate aus verschiedenen Zeiträumen sind nicht direkt vergleichbar, deshalb rechnet der Rechner ältere Zeilen mit der angesetzten Wertsteigerung auf heute hoch, bevor er den Median bildet.<br><br>Ab <b>vier Inseraten über mindestens vier Monate</b> misst er zusätzlich deine <b>eigene Wertsteigerung</b> — als Regression über den Logarithmus der Preise, weil Wertentwicklung multiplikativ verläuft. Weicht sie von der Einstellung ab, kannst du sie mit einem Klick übernehmen. Damit wird aus der letzten großen Annahme im Modell eine gemessene Größe.<br><br>Trag entweder nur deutsche Angebote frei Haus ein oder nur ausländische ab Werk und schalt den Import-Rechner dazu. Gemischt im selben Median vergleichst du Preise, die nicht dasselbe enthalten.<br><br>Zum Suchen: <b>mobile.de</b> und <b>Classic Trader</b> für Fahrzeuge in Deutschland, <b>Goo-net Exchange</b> für den japanischen Markt.",
    l: [
      {
        h: "https://www.classic-trader.com/de/",
        n: "Classic Trader: Marktübersicht Klassiker",
      },
      {
        h: "https://www.goo-net-exchange.com/",
        n: "Goo-net Exchange: japanischer Gebrauchtmarkt",
      },
    ],
  },
  insLedger: {
    t: "Versicherungsangebote",
    b: 'Anbieter und Jahresbeitrag eintragen, der Rechner nimmt das günstigste Angebot.<br><br>Entscheidend ist die Spalte daneben. Ein Angebot aus einem Vergleichsportal gilt für <b>deine</b> Einstufung und enthält den Fahranfänger-Zuschlag bereits. Wähl dann „meine SF", der Rechner rechnet es auf erfahren-Niveau zurück und lässt den Zuschlag über die Jahre wieder abschmelzen. „Erfahren" ist für Beiträge gedacht, die schon auf SF 3 kalkuliert sind.',
  },

  /* Fahrzeugdaten */
  ez: {
    t: "Erstzulassung",
    b: "Steuert im Modell drei Dinge gleichzeitig:<br>• den <b>H-Termin</b>, 30 Jahre nach diesem Datum<br>• das <b>Steuerregime</b>: vor dem 01.07.2009 nach Hubraum und Schadstoffklasse, danach nach Hubraum und CO₂<br>• die Einordnung als <b>Sammlungsstück</b> beim Import, ebenfalls ab 30 Jahren<br><br>Ändere das Datum und alle drei Termine wandern mit.",
  },
  ccm: {
    t: "Hubraum",
    b: "Aus der Zulassungsbescheinigung Teil I, Feld P.1. Der RB25DET hat 2.498 cm³.<br><br>Die Steuer rechnet mit angefangenen 100 cm³, aus 2.498 werden also 25 Einheiten.",
  },
  norm: {
    t: "Schadstoffklasse",
    b: "Feld 14.1 der Zulassungsbescheinigung. Bei Erstzulassung vor dem 01.07.2009 bestimmt sie den Steuersatz je angefangene 100 cm³ vollständig. Für Benziner:<br><br>Euro 3 und besser <b>6,75 €</b> · Euro 2 7,36 € · Euro 1 15,13 € · Euro 0 bedingt 21,07 € · ohne Einstufung <b>25,36 €</b><br><br>Ein JDM-Import ohne europäische Einstufung landet regelmäßig in der letzten Zeile, beim R34 sind das 634 € im Jahr. Mit Kat-Nachrüstung und Einstufung auf Euro 2 werden daraus 184 €. Beim Kauf in die Papiere schauen und hier eintragen.",
    l: [
      {
        h: "https://de.wikipedia.org/wiki/Kraftfahrzeugsteuer_(Deutschland)",
        n: "Kraftfahrzeugsteuer: Sätze und Rechtsgrundlage",
      },
    ],
  },
  co2: {
    t: "CO₂-Wert",
    b: "Feld V.7, nur relevant bei Erstzulassung ab dem 01.07.2009. Die ersten 95 g/km sind frei, darüber staffelt der Tarif:<br><br>96–115 g 2,00 € · 116–135 2,20 € · 136–155 2,50 € · 156–175 2,90 € · 176–195 3,40 € · ab 196 4,00 € je g/km<br><br>Vor 2021 gilt statt der Staffel ein linearer Satz von 2,00 €/g, und die Freigrenze lag bei 110 g/km (2012 und 2013) beziehungsweise 120 g/km (bis 2011). Welche Variante greift, entscheidet der Rechner am Erstzulassungsdatum.",
  },
  taxCalc: {
    t: "Wie die Kfz-Steuer hier entsteht",
    b: "Der Wert kommt aus dem Tarif nach §§ 8, 9 KraftStG, angewandt auf Hubraum, Kraftstoff, Schadstoffklasse, CO₂ und Erstzulassung.<br><br>Drei Sonderfälle sind abgedeckt: Erstzulassung zwischen dem 05.11.2008 und dem 30.06.2009 nimmt die günstigere der beiden Rechnungen, das H-Kennzeichen setzt pauschal <b>191,73 €</b> im Jahr, und ein Saisonkennzeichen kürzt anteilig auf die zugelassenen Monate.<br><br>Die Jahressteuer wird nach § 11 Abs. 4 KraftStG auf volle Euro abgerundet. Beim R34 geht die Rechnung glatt auf, bei anderen Hubräumen fällt der Rest weg: 19 × 16,05 € = 304,95 € werden zu 304 €.<br><br>Zum Gegenprüfen taugt der Rechner des ADAC.",
    l: [
      {
        h: "https://www.adac.de/rund-ums-fahrzeug/auto-kaufen-verkaufen/kfz-steuer/kfz-steuer-rechner/",
        n: "ADAC: Kfz-Steuer-Rechner zum Gegenprüfen",
      },
    ],
  },
  hkz: {
    t: "H-Kennzeichen",
    b: "Möglich ab 30 Jahren nach Erstzulassung — beim R34 also ab dem Termin, der sich aus dem Erstzulassungsdatum ergibt.<br><br>Die Steuer fällt dann pauschal auf <b>191,73 €</b> im Jahr, unabhängig vom Hubraum. Beim R34 ohne europäische Einstufung sind das statt 634 € rund 442 € Ersparnis im Jahr — bei ganzjähriger Zulassung. Mit einem Saisonkennzeichen wird beides anteilig gekürzt, bei acht Monaten bleiben rund 295 €. Dazu kommen Zugang zu allen Umweltzonen und zu Klassikertarifen.<br><br><b>Es kommt aber nicht von allein.</b> Nötig sind ein Gutachten nach §23 StVZO durch TÜV, DEKRA, GTÜ oder KÜS (etwa 80 bis 200 €, im Modell ein eigenes Feld), ein weitgehend originaler und guter Erhaltungszustand und eine gültige HU. Umbauten müssen zeitgenössisch sein — <b>starkes Tuning kostet das H-Kennzeichen</b>.<br><br>Genau deshalb ist es hier eine Wahl und kein Automatismus. Schaltest du es ab, rechnet das Modell dauerhaft mit dem regulären Tarif, das Gutachten entfällt und die Marke verschwindet aus der Zeitleiste. Wer den RB25DET ernsthaft aufbauen will, sollte hier ehrlich sein.",
    l: [
      {
        h: "https://www.adac.de/rund-ums-fahrzeug/oldtimer-youngtimer/recht-tipps/oldtimer-zulassung/",
        n: "ADAC: Oldtimer-Zulassung, H- und Saisonkennzeichen",
      },
    ],
  },
  importCalc: {
    t: "Import aus Japan",
    b: "Rechnet aus dem Yen-Preis die Landekosten. Fracht und Versicherung ergeben zusammen mit dem Fahrzeugpreis den Zollwert, darauf kommt der Zoll, auf die Summe die Einfuhrumsatzsteuer, dazu Einzelabnahme nach §21 StVZO und Zulassung.<br><br>Regulär sind das 10 % Zoll und 19 % EUSt. Als <b>Sammlungsstück nach Position 9705</b> (mindestens 30 Jahre alt, Originalzustand ohne wesentliche Umbauten, Modell nicht mehr gebaut) entfällt der Zoll und die EUSt sinkt auf 7 %. Bei 25.000 € Fahrzeugwert sind das grob 6.000 € Unterschied.<br><br>Die 30 Jahre zählen zum <b>Kaufzeitpunkt</b>, nicht zu heute. Der Rechner setzt den Schalter deshalb selbst, solange du ihn nicht anfasst, und warnt, wenn du ihn gegen die Rechnung stellst.<br><br>Das Freihandelsabkommen zwischen EU und Japan kann den Zoll mit gültiger Ursprungserklärung ebenfalls senken. Deshalb ist der Satz hier ein Feld. Verbindlich ist nur eine Auskunft beim Zoll.",
    l: [
      {
        h: "https://www.adac.de/rund-ums-fahrzeug/oldtimer-youngtimer/recht-tipps/oldtimer-import-export/",
        n: "ADAC: Oldtimer-Import, Zoll und Einfuhrsteuer",
      },
    ],
  },

  /* Versicherung und Unterhalt */
  insVariant: {
    t: "Versicherungsart",
    b: "<b>Haftpflicht</b> zahlt nur Schäden an anderen. <b>Teilkasko</b> ergänzt Diebstahl, Glas, Hagel, Wild und Brand. <b>Vollkasko</b> ergänzt selbstverschuldete Schäden am eigenen Auto. <b>Liebhaber</b> ist ein Pauschaltarif ohne SF-Einstufung und setzt Mindestalter 25, abschließbare Garage, ein Alltagsfahrzeug und eine gute Zustandsnote voraus.<br><br>Die hinterlegten Beträge sind Schätzwerte. Die tatsächliche Höhe hängt an Typklasse und Regionalklasse, beide lassen sich beim GDV kostenlos abfragen.",
    l: [
      {
        h: "https://www.gdv.de/gdv/themen/mobilitaet/typklassen-kurz-erklaert-12228",
        n: "GDV: Typklasse deines Wunschautos abfragen",
      },
    ],
  },
  insY: {
    t: "Versicherungsbeitrag",
    b: 'Jahresbeitrag auf „erfahren"-Niveau, also SF 3 und besser. Den Fahranfänger-Zuschlag legt der Rechner separat über die SF-Kurve darauf, damit er nicht zweimal zählt.<br><br>Sobald du unten ein echtes Angebot einträgst, ersetzt das günstigste diesen Wert und das Feld wechselt auf „beleg".',
    l: [
      {
        h: "https://www.gdv.de/gdv/themen/mobilitaet/typklassen-kurz-erklaert-12228",
        n: "GDV: Typklassen und Regionalklassen abfragen",
      },
    ],
  },
  sf: {
    t: "SF-Einstufung",
    b: 'Die Schadenfreiheitsklasse zählt Jahre mit eigenem versicherten Fahrzeug, keine Führerscheinjahre. Wer nie ein Auto versichert hatte, startet bei SF 0.<br><br>„Automatisch" leitet ab: das erste Auto der gewählten Reihenfolge zählt als Fahranfänger, das zweite als Zweitwagen.<br><br>Der Rechner multipliziert den Jahresbeitrag im ersten Jahr mit ×2,3, dann 1,8 · 1,5 · 1,3 · 1,15 und ab dem sechsten Jahr 1,0. Zweitwagen laufen mit 1,3 · 1,2 · 1,1. Diese Kurve ist eine Annahme und schwankt je Versicherer deutlich. Ein Zweitwagenvertrag über die Eltern startet oft bei SF ½ statt SF 0.',
    l: [
      {
        h: "https://de.wikipedia.org/wiki/Schadenfreiheitsklasse",
        n: "Wikipedia: Schadenfreiheitsklasse",
      },
    ],
  },
  switch25: {
    t: "Tarifwechsel mit 25",
    b: 'Ab dem Monat, in dem du 25 wirst, rechnet das Modell den R34 mit der Liebhaber-Pauschale von 800 € im Jahr weiter statt mit der gewählten Variante samt SF-Zuschlag. Der Termin kommt aus deinem Geburtsmonat unter „Sparen & Rahmendaten".<br><br>Die Pauschale wird bewusst <b>nicht</b> zusätzlich saisonal gekürzt: Liebhabertarife sind ohnehin schon mit begrenzter Fahrleistung und Standzeit kalkuliert, ein zweiter Abschlag wäre doppelt gerechnet.<br><br>Voraussetzungen bleiben abschließbare Garage, vorhandenes Alltagsauto und guter Zustand. Fällt eine davon weg, schalt den Wechsel ab.',
  },
  season: {
    t: "Saisonkennzeichen",
    b: "Zulassung nur für die gewählten Monate. Außerhalb darf das Auto nicht auf öffentlichem Grund stehen oder fahren.<br><br>Zulässig sind <b>2 bis 11 Monate</b> — zwölf gibt es nicht, das wäre eine normale Ganzjahreszulassung. Wählst du eine unzulässige Spanne, rechnet das Modell mit der nächstgelegenen erlaubten weiter und weist darauf hin.<br><br>Der Rechner kürzt die Steuer auf Monate/12 und die Versicherung auf denselben Anteil mal dem Saison-Aufschlag daneben, weil Saisontarife nicht exakt linear kalkuliert sind. März bis Oktober ergibt 8/12, also 67 % der Steuer.<br><br>Der Stellplatz läuft ganzjährig weiter, das Auto steht auch im Winter irgendwo.",
    l: [
      {
        h: "https://de.wikipedia.org/wiki/Saisonkennzeichen",
        n: "Wikipedia: Saisonkennzeichen",
      },
    ],
  },
  maint: {
    t: "Wartung und Rücklage",
    b: "Jahresrücklage für Inspektion, Öl, Bremsen, Reifen, HU alle zwei Jahre und Puffer für Verschleiß. Der Rechner verteilt sie gleichmäßig auf zwölf Monate und erhöht sie jährlich um die Kosteninflation.<br><br>In der Realität kostet ein Jahr 200 € und das nächste 900 €, der Wert ist also ein Durchschnitt. Beim R34 höher ansetzen, JDM-Teile sind teurer und teils nur aus Japan zu bekommen.",
  },
  garage: {
    t: "Garage oder Stellplatz",
    b: "Monatliche Miete für den Abstellplatz. Läuft auch bei Saisonkennzeichen ganzjährig weiter. Beim Daily meist 0, wenn er auf der Straße steht.<br><br>Beim R34 verlangen Klassiker- und Liebhabertarife fast immer eine abschließbare Garage. Ohne sie ist die Pauschale von 800 € nicht zu bekommen.",
  },
  km: {
    t: "Fahrleistung",
    b: "Kilometer pro Jahr. Wirkt im Modell auf die Spritkosten: km × Verbrauch/100 × Literpreis, verteilt auf zwölf Monate.<br><br>Beim Daily ist das einer der stärkeren Hebel auf den Termin, weil die Kosten die ganze Sparphase mitlaufen. ±4.000 km verschieben ihn um etwa fünf Monate. Beim R34 wirkt die Fahrleistung nur auf das, was nach dem Kauf übrig bleibt.<br><br>Auf den Versicherungsbeitrag wirkt sie hier nicht, in echten Tarifen dagegen spürbar.",
  },
  cons: {
    t: "Verbrauch",
    b: "Liter pro 100 km im realen Betrieb, nicht nach Prospekt. Der RB25DET liegt je nach Fahrweise bei 10 bis 13, ein sparsamer Vierzylinder bei 6 bis 8.<br><br>Bleibt eine Annahme, bis du selbst getankt und nachgerechnet hast.",
  },
  fuelGrade: {
    t: "Kraftstoffsorte",
    b: 'Der Literpreis kommt live aus dem Bundesdurchschnitt der Markttransparenzstelle für Kraftstoffe, alle fünf Minuten aktualisiert und unten unter „Datenquellen" einsehbar.<br><br>Super Plus meldet die MTS-K nicht separat. Der Rechner nimmt deshalb Super E5 und addiert den Aufschlag aus dem Feld darunter, der je nach Region und Marke zwischen 8 und 20 Cent liegt.',
    l: [
      {
        h: "https://www.benzinpreis-aktuell.de/",
        n: "Bundesdurchschnitt und Preisverlauf",
      },
    ],
  },
  price: {
    t: "Kaufpreis Daily",
    b: "Ein Alltagsauto mit Steuerkette und wenig Rost gibt es realistisch ab 2.500 bis 4.000 €. Die Nebenkosten stehen separat im Feld daneben.<br><br>Der Rechner zieht beides im Kaufmonat vom Ersparten ab.",
  },

  /* Rahmen */
  licenseOwned: {
    t: "Führerschein-Status",
    b: 'Bei „noch zu machen" zieht der Rechner die Kosten im geplanten Monat einmalig vom Ersparten ab und lässt vorher keinen Autokauf zu.<br><br>Bei „vorhanden" entfallen Kosten und Sperre. Das Datum darunter ist reine Dokumentation: die SF-Einstufung hängt an eigenen versicherten Fahrzeugjahren, nicht am Alter des Führerscheins.',
  },
  licence: {
    t: "Kosten Führerschein",
    b: "Klasse B, realistisch 3.000 bis 4.500 € inklusive Fahrstunden, Theorie und Prüfungsgebühren.<br><br>Wird einmalig im geplanten Monat abgezogen und verschiebt den Termin um etwa einen Monat, ist also der kleinste der wirksamen Posten. Zwei Angebote von Fahrschulen vor Ort ersetzen die Schätzung.<br><br>Gezahlt wird nicht am Ende, sondern laufend: Grundgebühr, Fahrstunden und Prüfungsgebühren verteilen sich über die Ausbildungszeit. Der Rechner verteilt den Betrag deshalb gleichmäßig auf die eingestellten Monate und lässt sie mit dem Prüfungstermin enden. Ist bis dahin weniger Zeit als die angesetzte Dauer, wird die Summe auf die verbleibenden Monate gedrängt — sie wird nicht kleiner, nur die Rate höher.<br><br>Als Einmalbetrag gerechnet zeigte der Plan davor einen Kontostand, den es so nie gab.",
  },
  birth: {
    t: "Geburtsmonat",
    b: "Bestimmt genau einen Termin: den Monat, ab dem Liebhaber- und Oldtimertarife zugänglich sind. Die meisten Anbieter setzen 25 Jahre Mindestalter voraus.<br><br>Der Rechner addiert 25 Jahre auf diesen Monat und schaltet den Tarif ab da um, sofern der Schalter unter R34-Unterhalt aktiv ist.",
  },
  reserve: {
    t: "Rücklage",
    b: "Bargeld, das nach dem Kauf liegen bleibt. Der Rechner kauft bar erst, wenn das Ersparte Kaufpreis, Nebenkosten <b>und</b> Rücklage deckt, und nimmt sie bei Finanzierung von der Anzahlung aus.<br><br>Bei einem fast 30 Jahre alten Import ist der Posten schwer wegzudiskutieren: Kupplung, Turbo oder Getriebe kosten schnell vierstellig.",
  },
  rate: {
    t: "Kreditzins",
    b: "Vorbelegt mit dem Durchschnittszins für Konsumentenkredite an private Haushalte in Deutschland mit ein bis fünf Jahren Zinsbindung, aus der EZB-Zinsstatistik. Der Rechner bildet daraus eine Annuität, also eine gleichbleibende Monatsrate über die Laufzeit. Der Jahreswert ist ein Effektivzins und wird mit der zwölften Wurzel auf den Monat gebracht, nicht durch zwölf geteilt — sonst käme eine zu hohe Rate heraus.<br><br>Der Wert ist ein Marktdurchschnitt über alle Banken und kein Angebot an dich. Für einen JDM-Import gibt es meist keinen günstigen Autokredit, weil Banken den Beleihungswert nicht über Schwacke ermitteln können. Rechne mit Aufschlag und ersetz die Zahl, sobald du eine Zusage hast.",
    l: [
      {
        h: "https://data.ecb.europa.eu/data/datasets/MIR",
        n: "EZB: Zinsstatistik der Banken",
      },
    ],
  },
  overdraft: {
    t: "Dispozins",
    b: "Was die Bank für ein Minus auf dem laufenden Konto nimmt. Der Satz steht auf deinem Kontoauszug — bei der Sparkasse Celle-Gifhorn-Wolfsburg sind es 10,75 %.<br><br>Er ist rund fünfmal so hoch wie alles, was Tagesgeld einbringt. Deshalb ist eine Überziehung der teuerste Weg, einen Sparplan einzuhalten.<br><br><b>Warum das hier steht:</b> Das Tagesgeld ist eine Einbahnstraße. Was einmal dort liegt, gehört dem R34 — der Rechner holt es nicht zurück, wenn der Monat knapp wird. Ein zu hoch gesetzter Dauerauftrag führt deshalb nicht zu einem stillen Ausgleich, sondern zu einem Minus, und das kostet.<br><br>Reicht die Überziehung über zwei bis drei Monatsnettos hinaus, meldet der Rechner den Plan als nicht erreichbar. So viel räumt keine Bank ein.",
  },
  saveRate: {
    t: "Tagesgeldzins",
    b: "Vorbelegt mit dem EZB-Einlagesatz minus 0,25 Punkte, weil gute Tagesgeldangebote erfahrungsgemäß knapp darunter liegen. Auf dem Girokonto sind es 0.<br><br>Der Rechner schreibt die Zinsen monatlich auf das Ersparte gut. Über drei Jahre Ansparphase macht das etwa einen Monat beim Termin aus.",
  },
  inflCost: {
    t: "Kosteninflation",
    b: 'Jährliche Steigerung von Lebenshaltung, Wartung, Versicherung und Stellplatz. Vorbelegt mit der aktuellen HVPI-Jahresrate für Deutschland aus dem EZB-Datenportal, nachzusehen unten unter „Datenquellen".<br><br>Der Rechner multipliziert die Kosten in Monat m mit (1 + Rate/100)^(m/12). Über vier Jahre machen schon 2 % rund 8 % im Unterhalt aus.',
    l: [
      {
        h: "https://data.ecb.europa.eu/data/datasets/ICP",
        n: "EZB-Datenportal: HVPI",
      },
    ],
  },
  inflIncome: {
    t: "Lohnentwicklung",
    b: "Jährliche Steigerung des Nettos nach der vertraglichen Erhöhung, gleiche Formel wie bei den Kosten.<br><br>Steht sie gleich hoch wie die Kosteninflation, bleibt dein Spielraum real konstant. Auf 0 gesetzt schmilzt die Kaufkraft über die Laufzeit ab, das ist die pessimistische Variante.",
  },
  cap: {
    t: "Startkapital",
    b: "Was du heute schon gespart hast. Geht direkt als Startsumme in die Simulation.<br><br>±4.000 € verschieben den Termin um etwa vier Monate. Bei Finanzierung senkt jeder Euro zusätzlich die Kreditsumme und damit die Zinsen.<br><br>Erfasst du unter Soll-Ist deinen Kontostand für den laufenden Monat, kannst du ihn von dort direkt übernehmen.",
  },
  appr: {
    t: "Wertsteigerung",
    b: 'Angenommene jährliche Wertentwicklung. Der Rechner verzinst den Kaufpreis exponentiell bis zum Kaufmonat; bei 4 % über vier Jahre sind das rund 17 % Aufschlag.<br><br>Für JDM-Klassiker gibt es keinen offenen Preisindex — solange du nichts sammelst, bleibt der Wert eine Annahme. <b>Sobald vier Inserate über mindestens vier Monate erfasst sind, misst der Rechner deine eigene Rate</b> und zeigt sie unter „R34 — Preis & Karosserie" an. Ein Klick übernimmt sie, und der Wert wechselt von Schätzung auf belegt.<br><br>Der Sammleraufschlag hängt vor allem am Coupé; für die Limousine setzt der Rechner deshalb 3 % statt 5 % an, solange du den Regler nicht selbst anfasst.',
  },
  strat: {
    t: "Reihenfolge der Käufe",
    b: "<b>Daily zuerst:</b> Du bist früh mobil und sammelst SF-Jahre auf dem günstigen Auto. Der R34 kommt später, startet dann aber als Zweitwagen und ist deutlich billiger versichert.<br><br><b>R34 zuerst:</b> Du bist früher am Traumauto, versicherst es aber als Erstwagen eines Fahranfängers. Der Daily kommt erst danach und nur, wenn der Kauf die Rücklage nicht antastet.<br><br>Die Wahl steuert auch die automatische SF-Einstufung beider Autos.",
  },
  statement: {
    t: "Kontoauszug einlesen",
    b: "<b>PDF geht nicht.</b> Im Onlinebanking der Sparkasse steht der Export unter „Umsätze → Exportieren“; wähl dort <b>CAMT</b> oder <b>MT940</b> statt PDF oder CSV. Der PDF-Auszug ist zum Lesen gemacht, nicht zum Rechnen — die Beträge stehen dort in einer Tabelle, deren Spalten sich nicht zuverlässig zurückgewinnen lassen.<br><br>Statt jeden Monat den Kontostand abzutippen, liest der Rechner ihn aus einem Auszug. Gelesen werden <b>nur die Monatsendsalden</b> — keine einzelne Buchung, kein Empfänger, kein Verwendungszweck.<br><br>Zwei Formate, beide im Onlinebanking meist unter „Umsätze exportieren“:<br>• <b>CAMT.053</b> — XML, der heutige Standard<br>• <b>MT940</b> — das ältere Format, immer noch fast überall angeboten<br><br>CSV geht nicht: jede Bank baut die Spalten anders, und eine falsch zugeordnete Spalte wäre schlimmer als Abtippen.<br><br>Die Datei wird im Browser gelesen und nirgendwohin geschickt. Gespeichert werden am Ende nur die Monatssalden — dieselben Zahlen, die du sonst von Hand einträgst.<br><br>Enthält die Datei mehrere Konten, warnt der Rechner: vermischte Stände ergeben eine Reihe, die es so nie gab.",
  },
  tagesgeld: {
    t: "Aufs Tagesgeld",
    b: "Was im Schnitt Monat für Monat auf dem Tagesgeld liegen bleibt — nicht, was der Dauerauftrag anweist.<br><br>Die beiden Zahlen sind nicht dasselbe. Ist der Dauerauftrag höher als das, was der Monat hergibt, holt sich das laufende Konto die Differenz im selben Monat zurück. Angewiesen werden dann 700 €, liegen bleiben vielleicht 628. Für den Kauftermin zählt nur die zweite Zahl.<br><br>Führerschein und Autokauf sind hier nicht abgezogen — die stehen in der Aufstellung unter „Wohin das Geld bis dahin fließt\".",
  },
  freeSaving: {
    t: "Bis dahin frei",
    b: "Was dir während der Sparphase im Monat zum Leben bleibt: Netto minus Lebenshaltung, minus Unterhalt des Alltagsautos, minus Dauerauftrag.<br><br>Führerschein und Autokauf zählen hier nicht mit — die kommen aus dem Ersparten und sind kein Haushaltsgeld. Sonst wiese ausgerechnet der Monat einer Fahrschulrate plötzlich mehr Spielraum aus.<br><br>Ist die Zahl <b>negativ</b>, liegt dein Dauerauftrag über dem, was der Monat hergibt. Das Modell holt sich die Differenz vom Tagesgeld zurück, und der Kauftermin bewegt sich dadurch nicht — aber es heißt, dass der Betrag im Dauerauftrag nicht der ist, den du tatsächlich zurücklegen kannst.<br><br>Angezeigt wird der engste Monat. Der liegt meist direkt nach dem Kauf des Alltagsautos, bevor die Gehaltserhöhung greift.",
  },
  leftover: {
    t: "Frei nach dem Kauf",
    b: "Der engste Monat ab dem Kauf: Netto minus Lebenshaltung, minus Unterhalt beider Autos, minus Kreditrate, jeweils zum dann gültigen inflationierten Stand.<br><br>Der Rechner nimmt bewusst das Minimum und keinen Durchschnitt, weil sich daran entscheidet, ob der Plan im Alltag trägt. Der Wert daneben zeigt den eingeschwungenen Zustand: SF abgeschmolzen, Kredit getilgt, gegebenenfalls Liebhabertarif aktiv.<br><br>Einmalkosten sind hier nicht enthalten, die laufen separat gegen das Ersparte.",
  },
  timeline: {
    t: "Zeitleiste",
    b: "Die Meilensteine des Plans in zeitlicher Reihenfolge. Der eingefärbte Abschnitt reicht bis zum R34-Kauf, das hellere Band darum ist der Korridor aus dem Ergebnis oben.<br><br>Ereignisse erscheinen nur, wenn sie im gewählten Szenario vorkommen.",
  },
  sources: {
    t: "Datenquellen",
    b: 'Alle Quellen laufen ohne Schlüssel und ohne Konto direkt aus dem Browser.<br><br>Spritpreise aus der amtlichen Markttransparenzstelle für Kraftstoffe. Inflation, Kreditzins und Einlagesatz aus dem Datenportal der EZB. Wechselkurse über Frankfurter, das dieselben EZB-Referenzkurse ausliefert.<br><br>Fällt eine Quelle aus, rechnet das Modell mit dem hinterlegten Rückfallwert weiter und meldet das in der Kopfzeile dieses Panels sowie unter „Was noch geraten ist". Die EZB-Reihenschlüssel sind editierbar, falls du im Datenportal eine passendere Zeitreihe findest.',
    l: [
      {
        h: "https://data.ecb.europa.eu/help/api/data",
        n: "EZB: Aufbau der API-Abfragen",
      },
    ],
  },
  saveMode: {
    t: "Wie das Geld aufs Tagesgeld kommt",
    b: "<b>Dauerauftrag:</b> Jeden Monat geht ein fester Betrag aufs Tagesgeldkonto, unabhängig davon, wie der Monat gelaufen ist. Was darüber hinaus übrig bleibt, wandert anteilig hinterher — den Anteil stellst du daneben ein. Das entspricht dem üblichen Vorgehen und ist ehrlicher als die Annahme, dass am Monatsende alles Übrige automatisch beiseite liegt.<br><br><b>Alles Übrige:</b> Was nach allen Kosten bleibt, geht vollständig aufs Tagesgeld. Das ist die optimistische Variante.<br><br>Der Rechner führt beide Konten getrennt: Das Tagesgeld ist die Kaufkraft und wird verzinst, das laufende Konto ist der Alltagspuffer. <b>Dauerauftrag bis zu einem Datum.</b> Das Feld \u201edanach alles \u00dcbrige ab\u201c schaltet zu einem Monat um: bis dahin der feste Betrag, danach wandert wieder alles \u00dcbrige aufs Tagesgeld. Gedacht f\u00fcr den Fall, dass bis zum Sommer noch Ausgaben anstehen \u2014 bis dahin will man nicht jeden Euro wegsparen, danach schon. Leer hei\u00dft: der Dauerauftrag l\u00e4uft unver\u00e4ndert bis zum Kauf.<br><br>Ist der Dauerauftrag zu hoch angesetzt, rutscht der Puffer ins Minus — der Rechner sagt dir dann, in wie vielen Monaten und wie tief.<br><br>Was dabei fehlt, holt sich der Puffer im selben Monat vom Tagesgeld zurück. Deshalb gibt es eine Obergrenze: Über dem Betrag, der tatsächlich übrig bleibt, verschiebt ein höherer Dauerauftrag den Termin nicht mehr. Er wird dann nur noch angewiesen und gleich wieder abgezogen.",
  },
  saveSurplus: {
    t: "Anteil des Überschusses",
    b: "Wie viel von dem, was über den Dauerauftrag hinaus übrig bleibt, zusätzlich aufs Tagesgeld geht.<br><br>Bei 0 % sparst du strikt den festen Betrag, alles Weitere bleibt auf dem laufenden Konto. Bei 100 % entspricht es der Variante „alles Übrige“. Die Voreinstellung von 50 % unterstellt, dass du gute Monate zur Hälfte mitnimmst.",
  },
  tasks: {
    t: "Nächste Schritte",
    b: "Eine Liste dessen, was den Plan gerade am meisten verbessern würde — nicht statisch, sondern aus dem aktuellen Stand abgeleitet. Erfasst du fünf Inserate, verschwindet der erste Punkt von selbst.<br><br>Zu jedem Schritt steht, wie lange er dauert und was er bringt. Abhaken blendet ihn für dreißig Tage aus; monatlich wiederkehrende Punkte wie der Kontostand tauchen danach wieder auf.<br><br>Wer den Rechner nur ausprobiert, kann die Liste ignorieren — sie beschreibt, wie aus einer Schätzung ein Plan wird, nicht was zum Rechnen nötig ist.",
  },
  r34start: {
    t: "R34 frühestens ab",
    b: "Vor diesem Monat wird nicht gekauft, auch wenn das Geld reicht. Vorbelegt mit dem H-Termin, also 30 Jahre nach Erstzulassung.<br><br>Frühere Monate sind erlaubt, kosten aber die höhere Kfz-Steuer und den Zugang zu Klassikertarifen — der Rechner warnt dann unter „R34 — Unterhalt“.<br><br>Im Modus Restfinanzierung mit vorgegebenem Termin gilt stattdessen der Wunschtermin oben; dieses Feld bleibt dann reine Untergrenze.",
  },
  dailystart: {
    t: "Alltagsauto frühestens ab",
    b: 'Vorbelegt mit dem Führerscheintermin. Gekauft wird im ersten Monat danach, in dem das Geld reicht, spätestens sechs Monate später auch dann, wenn es knapp wird — sonst kämst du nicht zur Arbeit.<br><br>Bei „R34 zuerst" wartet das Alltagsauto zusätzlich, bis der R34 da ist, und wird nur gekauft, wenn die Rücklage unangetastet bleibt.',
  },
};

export { HELP };
