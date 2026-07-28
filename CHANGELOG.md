# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **R34-Rechner: weniger Fläche, gleiche Information.** Ein Hilfetext bekommt je Bereich
  einen Knopf statt einen pro Feld — „Fahrleistung", „Verbrauch", „Kraftstoff" und die
  drei Spritpreise zeigten alle denselben Text. Von 65 Fragezeichen an Feldern waren 27
  Wiederholungen. Der Dauerrahmen der Knöpfe ist weg; er kommt bei Hover und Fokus.
- **Abgeleitete Kästen sehen nicht mehr aus wie Meldungen.** Akzentfarbe auf Akzentfläche
  las sich als Hinweis — drei davon untereinander als drei Warnungen. Jetzt eine ruhige
  Fläche; Farbe bleibt den echten Meldungen vorbehalten.
- **„Bis dahin frei" wird eingeordnet wie „Danach frei".** Eine Zahl ohne Etikett neben
  einer mit Etikett liest sich, als sei die eine wichtig und die andere nicht. Ein Minus
  während der Fahrschulzeit heißt „vorübergehend", nicht „kritisch" — es ist kein
  kaputter Plan, sondern eine Phase.

### Fixed
- **R34-Rechner: das Ergebnis widersprach sich selbst.** Überschrift „R34 ab 10/2031" und
  Spannen-Mitte „07/2032" standen acht Zentimeter auseinander, beide unkommentiert als
  Antwort. Beide Zahlen waren richtig — die eine nimmt die Eingaben wörtlich, die andere
  ist der Median der gezogenen Durchläufe —, aber nebeneinander lesen sie sich als „der
  Rechner weiß es selbst nicht". Es gibt jetzt eine Antwort: deine Zahlen. Die Mitte steht
  darunter als Erklärung des Abstands, mit Grund.
- **Das Spannen-Modal erklärte die falsche Methode.** Der Text beschrieb noch die
  quadratische Addition, während oben längst gezogene Quantile stehen. Wer das Modal
  öffnet, um Vertrauen zu gewinnen, las eine Erklärung, die nicht zu den Zahlen passte.
- **Drei Panels standen außerhalb des Seitencontainers.** `.wrap` wurde beim Herausziehen
  des Sicherungs-Panels zu früh geschlossen; „Plan sichern", „Nächste Schritte" und
  „Datenquellen" liefen dadurch über die volle Fensterbreite.
- **Der Sparverlauf ließ sich nicht nachrechnen.** Die mittlere Spalte zeigte den Stand
  nach dem Ausgleich, die rechte die Differenz davor — 660 − 660 ergab dann −40. Alle drei
  Spalten stehen jetzt auf derselben Grundlage; was der Ausgleich zurückholt, steht als
  Hinweis dahinter.
- **`±—` als Bandbreite** bei Entweder-oder-Feldern in der Hebelliste.
- **„Nebenkosten Kauf" stand zweimal** in der Hebelliste, für beide Fahrzeuge identisch
  beschriftet und nicht auseinanderzuhalten.

### Added
- **Karte „Aufs Tagesgeld" im Ergebnis.** Was im Schnitt monatlich liegen bleibt, plus die
  Kette dahinter: angewiesen X, davon Y zurückgeholt. Diese Zahl war über vier Stellen
  verteilt und an keiner vollständig — die Stellschrauben zeigen den Dauerauftrag, also
  die Anweisung, nicht den Zufluss.

### Changed
- Die Hebelliste zeigt sechs Posten; die restlichen elf liegen hinter einem Aufklapper.
  Achtzehn Balken, von denen zehn zwischen einem und vier Monaten lagen, waren optisch
  nicht unterscheidbar.
- Das Gruppen-Etikett „wirkt auf den Termin" ist weg — es stand auf sechs von sieben
  Gruppen. Beschriftet wird nur noch die Ausnahme.

### Fixed
- **R34-Rechner: ein früher Führerschein machte den Plan reicher.** Die Fahrschulraten
  gingen bis dahin als Griff ins Tagesgeld ab. Lag dort noch nichts — und in den ersten
  Monaten liegt dort nichts —, landeten sie auf dem laufenden Konto und wurden von dort
  aus dem Haushaltsüberschuss getilgt, der sonst als verbraucht gilt. Ein früher Schein
  war dadurch im Modell billiger als ein später: das Kapital verlief U-förmig statt
  monoton, mit 534 € Unterschied zwischen früh und mittel. Am Kauftermin schlug das je
  nach Schwelle mal als +1, mal als −1 Monat durch.
  Die Fahrschule läuft jetzt über die Monatskosten — realistischer, weil niemand für
  Fahrstunden monatlich vom Sparkonto abhebt, und ohne die Asymmetrie. Reicht der Monat
  nicht, holt sich der Ausgleich den Rest weiterhin vom Tagesgeld, nur eben sichtbar.
  Ein Test hält fest, dass später bezahlen nie weniger übrig lässt.
- „Bis dahin frei" nennt jetzt die Fahrschule als Ursache, wenn der engste Monat in die
  Ausbildungszeit fällt — vorher stand dort pauschal „Dauerauftrag zu hoch".

### Changed
- **R34-Rechner: die Stellschrauben zeigen jetzt die stärksten Hebel.** Oben standen
  Termine und Nebenpreise, während Netto heute (22 Mon.), Lebenshaltung (22 Mon.) und
  Dauerauftrag (12 Mon.) im zugeklappten Bereich lagen — hinter einer Zusammenfassung,
  die „alles vorbelegt" behauptete. Die App hat diese Rangfolge über die Wirkungs-Chips
  selbst gemessen und im Layout ignoriert. Neu oben: Netto, Lebenshaltung, Sparweise mit
  Dauerauftrag, Kaufpreis R34. Termine, Alltagsauto-Preis und Rücklage wandern in eine
  neue Gruppe „Termine & Rahmen".
  Die Reihenfolge steht fest und wird nicht aus der laufenden Messung abgeleitet: sonst
  springen die Felder beim Tippen umher.
- Dauerauftrag und Überschussanteil verschwinden, wenn die Sparweise „alles Übrige" ist.
- **Der Nutzen jeder Aufgabe wird gemessen statt behauptet.** Statt „ist der größte
  Hebel" steht dort, um wie viele Monate die Spanne schrumpft, wenn die Zahl belegt
  wäre — ermittelt über zwei Vorschauläufe mit umgesetzter Herkunft. Die Liste sortiert
  sich danach. Zahlen, die den Termin nicht bewegen, weisen stattdessen aus, wie viel
  genauer der Spielraum nach dem Kauf wird; „0 Monate" hätte sonst als „sinnlos" gelesen
  werden können. Gerechnet wird eine Aufgabe je Durchgang, damit nichts hängt.

### Added
- **R34-Rechner: die Spanne kommt aus einer gezogenen Verteilung statt aus einer
  Faustformel.** Bisher wurde jeder Regler einzeln gekippt und die Ausschläge quadratisch
  addiert. Das unterstellte Unabhängigkeit (Lebenshaltung, Wartung, Versicherung und
  Sprit hängen aber alle an derselben Inflation), Symmetrie (eine Reparatur kann das
  Fünffache kosten, aber nie weniger als nichts) und kannte keine Ereignisse. Jetzt
  ziehen ein paar hundert vollständige Durchläufe: ein Schock je Risikogruppe, ein
  eigener je Feld, Kostenfelder multiplikativ, dazu große Reparatur (10 %/Jahr),
  zeitweiser Einkommensausfall (3 %/Jahr) und die Entweder-oder-Fragen mit eigener
  Wahrscheinlichkeit. Angezeigt sind das 10-, 50- und 90-Prozent-Quantil plus die
  Anteile „reicht gar nicht" und „danach unter 100 €/M".
  Der Zufall ist gesetzt, damit dieselbe Eingabe dieselbe Anzeige ergibt; gerechnet wird
  in einem eigenen, längeren Takt nach dem übrigen Render.
- Die Simulation nimmt Einmalschocks (`events`) und ein Fenster mit gekürztem Netto
  (`incomeGap`) entgegen.

### Changed
- **Spritpreise sind jetzt Eingabefelder.** Die bisherige Quelle war in keiner
  beobachteten Sitzung erreichbar. Eine Quelle, die dauerhaft „offline" meldet, ist
  schlechter als keine — und was du zuletzt getankt hast, ist für deine Rechnung
  ohnehin genauer als ein Bundesdurchschnitt.

### Fixed
- **Pläne aus Fassung 2 gingen beim Wechsel verloren.** Der Loader las nur `v4` und
  `v3`. Ein `v2`-Eintrag kennt weder Fassungsfeld noch `ui`-Abschnitt und wurde von der
  Prüfung als „kein Plan dieses Rechners" abgewiesen — der ganze Plan verschwand
  stillschweigend. Er wird jetzt beim Lesen in die heutige Form gebracht.

### Added
- **R34-Rechner: Gehaltsentwicklung als Liste statt als einzelner Sprung.** Das Feldpaar
  „Netto nach der Erhöhung" plus „Erhöhung ab" konnte genau eine Änderung abbilden. Wer
  im zweiten Lehrjahr schon weiß, was das dritte bringt, oder in vier Monaten den
  Arbeitgeber wechselt, konnte das nicht eintragen. Jetzt ein Beleg „Bekannte
  Gehaltsschritte" mit beliebig vielen Zeilen aus Monat, Netto und Anlass.
  Zwischen zwei erfassten Schritten gilt der erfasste Betrag — er enthält die Erhöhung
  ja bereits. Erst hinter dem letzten Schritt greift die allgemeine Lohnentwicklung;
  vorher schlug sie auf Zahlen auf, die aus dem Vertrag stammen. Schritte in der
  Vergangenheit werden auf den laufenden Monat gezogen statt zu verschwinden.
  Der Korridor-Hebel wandert von „Netto nach der Erhöhung" auf eine prozentuale
  Verschiebung der ganzen künftigen Reihe.

### Fixed
- **R34-Rechner: das laufende Konto gab Geld zweimal aus.** Der Rest, der laut Annahme
  als verbraucht gilt, wuchs mechanisch weiter und deckte später Fehlmonate ab, statt
  dass der Ausgleich vom Tagesgeld griff. Dasselbe Geld zählte einmal als verbraucht und
  einmal als Sparrate. Der Stand wird jetzt am Monatsende geleert; ein negativer bleibt
  stehen. Finanziell klein (rund 220 € über die Sparphase), logisch aber ein Widerspruch
  zur eigenen Annahme — und er wächst mit der Höhe des Dauerauftrags.
- **R34-Rechner: der Führerschein fiel als ein Betrag in einem Monat an.** Eine
  Fahrschule schickt keine Schlussrechnung — Grundgebühr, Fahrstunden und Prüfungs-
  gebühren verteilen sich über die Ausbildungszeit. Als Einmalbetrag gerechnet wies der
  Plan in den Monaten davor einen Kontostand aus, den es so nie gab: bei den Vorgaben
  3.308 € statt realistischer 1.000 €. Neues Feld „Fahrschule läuft über" (Vorgabe acht
  Monate); die Summe bleibt gleich und endet mit dem Prüfungstermin. Ist bis dahin
  weniger Zeit als die angesetzte Dauer, wird sie auf die verbleibenden Monate gedrängt
  statt gekürzt.
- **Ein Prüfungstermin in der Vergangenheit ließ die Zahlung ganz ausfallen**, weil die
  Bedingung auf `m === licM` stand und die Schleife bei null beginnt.

### Added
- **R34-Rechner: „Bis dahin frei".** Was während der Sparphase im Monat zum Leben
  bleibt — Netto minus Lebenshaltung, Unterhalt und Dauerauftrag. Diese Zahl gab es
  bisher nur für die Zeit *nach* dem Kauf, dabei ist die Sparphase die längere. Sie
  steht jetzt als eigene Karte im Ergebnis und als Spalte im Sparverlauf.
  Führerschein und Autokauf zählen dabei nicht mit: sie kommen aus dem Ersparten und
  sind kein Haushaltsgeld, sonst wiese ausgerechnet der Monat einer Fahrschulrate mehr
  Spielraum aus.
  Ist die Zahl negativ, liegt der Dauerauftrag über dem, was der Monat hergibt — bei
  den Vorgabewerten ist das ab dem Kauf des Alltagsautos der Fall (−76 €).

### Fixed
- **Snippets durften keine Dateien herausgeben.** Der Standard-Sandbox für gebündelte
  Snippets listete `allow-downloads` nicht auf. Ein Snippet konnte damit eine Blob-URL
  bauen, `download` am Anker setzen und klicken — der Browser verwarf den Download
  wortlos und schrieb nur in die Konsole. Kein Fehler, kein Ereignis, nichts, was die
  Seite hätte abfangen können. Der Datei-Export des R34-Rechners lief damit ins Leere.
  Der Nutzer-Snippet-Sandbox bleibt bewusst ohne das Recht: eingefügter Fremdcode soll
  keine Dateien an den Nutzer schieben können.
- **R34-Rechner: der Schnappschuss enthielt nur einen Teil des Plans.** Gesichert wurden
  ausschließlich Werte mit Herkunft „von dir". Alles, was über einen „übernehmen"-Knopf
  aus eigenen Belegen abgeleitet worden war — Lebenshaltung aus echten Kontoständen,
  Dauerauftrag aus dem Soll-Ist, gemessene Wertsteigerung — trug `proof`, und davon
  wurde nur das Etikett gespeichert, nicht der Wert. Auf dem neuen Gerät stand der
  Katalogwert unter einem Punkt, der „belegt" behauptete. Live geholte Zahlen
  (Spritpreise, Inflation, Kreditzins, Tagesgeldzins, Yen-Kurs) fielen ganz durchs
  Raster; ein Gerät ohne Netz rechnete mit Katalogvorgaben und kam zu einem anderen
  Termin. Von neun gesetzten Werten überlebten zwei — jetzt alle.

### Added
- **R34-Rechner: Plan als Textcode übertragen.** „Code kopieren" legt den vollständigen
  Plan als eine Zeile Text ab, „Code einfügen" liest ihn drüben wieder ein — für den
  Wechsel zwischen Handy und Rechner, wo eine Datei umständlich ist. Gepackt über
  `CompressionStream` (rund 70 % kürzer), base64url kodiert, damit Messenger den Code
  nicht als Link zerlegen. Ist die Zwischenablage gesperrt — unsicherer Kontext, mobile
  Browser —, steht der Code sichtbar im Feld und lässt sich von Hand kopieren.
- Der Datei-Export erkennt, wenn die Ansicht keine Dateien herausgeben darf, und bietet
  stattdessen den Code an — statt einen Klick anzubieten, der nichts tut. Das Einfügefeld
  nimmt zusätzlich den rohen Inhalt einer exportierten JSON-Datei an, für den Fall, dass
  auch der Dateidialog gesperrt ist.
- Import fragt vor dem Überschreiben nach und zeigt dabei, was im Plan steckt:
  Sicherungsdatum, Zahl der Belege, Zahl der eigenen Eingaben.
- **Eigenes, immer sichtbares Panel „Plan sichern".** Vorher steckten die Knöpfe im Fuß
  des zugeklappten Soll-Ist-Panels und sahen aus, als beträfen sie nur dieses Modul. Das
  Panel zeigt, was im Plan steckt (Belege und eigene Zahlen über alle Bereiche) und ob
  der Stand gesichert ist. Der Schritt „Plan sichern" in den nächsten Schritten kommt
  zurück, sobald sich etwas geändert hat, statt nach einmaligem Abhaken dreißig Tage zu
  schweigen.

### Fixed
- **R34-Rechner: Import umging die Migration.** Eine importierte Datei wurde roh in den
  Speicher geschrieben; die Umrechnung alter Stände lief nur beim Lesen des alten
  Speicherschlüssels. Ein Export aus einer früheren Fassung wurde dadurch falsch
  übernommen. Datei, Textcode und Speicher laufen jetzt alle durch dieselbe Prüfung.
- **Ein Plan aus einer neueren Fassung wird abgelehnt** statt halb verstanden zu werden.
  Zuvor genügte ein beliebiges `v`-Feld.
- **`planSnapshot()` gab die Belege als Referenz heraus.** Ein erstellter Export änderte
  sich damit nachträglich mit, wenn danach eine Zeile dazukam — beim Sichern unauffällig,
  weil sofort serialisiert wird, beim Merker nach dem Kodieren aber nicht: der Code
  enthielt den alten Stand, der Merker den neuen, und der Plan galt fälschlich als
  gesichert. Der Schnappschuss ist jetzt eine Kopie.
- **Die v3-Migration löschte einen Schlüssel, den es nicht gab.** Die Bedingung stand auf
  `m.car == null` statt `!= null`; der als Limousinen-Anker zu hohe Coupé-Preis aus v3
  überlebte damit jede Migration.

### Fixed
- **R34-Rechner: Aufstellung „wohin das Geld fließt" ging nicht auf.** Der Ausgleich
  zwischen Tagesgeld und laufendem Konto wurde als Einzahlung gezählt, aber nie
  abgezogen. Bei einem Dauerauftrag über dem Überschuss stand dort eine als
  „Rundungsdifferenz" beschriftete Abweichung von über 24.000 €. Der Betrag wird jetzt
  mitgeschrieben (`giroCover`) und als eigene Zeile ausgewiesen; die Meldung nennt eine
  verbleibende Differenz als das, was sie ist.
- **Soll-Ist-Vergleich maß gegen einen Plan, den das Modell nicht fährt.** Die
  Sollrate war eine Konstante aus `netNow − living` ohne Autounterhalt, Gehalts-
  erhöhung und Inflation und lag ab dem Kauf des Alltagsautos rund 200 €/M daneben.
  Verglichen werden jetzt Kontostandsänderungen gegen den simulierten Verlauf. Der
  Korrekturknopf verschiebt sein Feld um die gemessene Differenz, statt über
  `netNow − realRate` den gesamten Autounterhalt der Lebenshaltung zuzuschlagen.
- **Der Kaufmonat lief kostenlos.** Käufe stehen jetzt vor den Kosten des Monats,
  finanziert aus dem Stand des Vormonats. Ein Monat Versicherung, Steuer und Sprit je
  Fahrzeug fiel zuvor unter den Tisch; Termine verschieben sich dadurch um etwa einen
  Monat nach hinten.
- **Das Tagesgeld konnte zinsfrei ins Minus.** Nicht gedeckte Einmalkosten landen jetzt
  auf dem laufenden Konto, wo sie über `minGiro`/`negMonths` bereits gezählt und
  gewarnt werden. Zuvor lief das Konto mit einem teuren Führerschein über 35 Monate
  bis −25.855 €, ohne dass das etwas kostete.
- **Gemessene Wertsteigerung wurde verworfen.** Karosserie-Vergleich und Karosserie-
  wechsel prüften nur auf `manual` und überschrieben eine aus eigenen Inseraten
  übernommene Rate mit hartkodierten 3 %/5 %.
- **Leere Erstzulassung kippte den ganzen Plan.** Der Sentinel für unbekannte Termine
  landete im Feld „R34 frühestens ab" und schob den Kauf auf das Jahr 85359; das
  Ergebnis meldete dann „reicht so nicht". Der früheste Termin folgt dem H-Termin
  außerdem nur noch, wenn ein H-Kennzeichen überhaupt beantragt werden soll.
- Annuität rechnet den Effektivzins mit der zwölften Wurzel auf den Monat statt durch
  zwölf zu teilen, und ist gegen `years ≤ 0` und `effRate ≤ −1` abgesichert.
- Kfz-Steuer wird nach § 11 Abs. 4 KraftStG auf volle Euro abgerundet.
- Terminvergleich rechnet alle Zeilen nach derselben Regel; die Kreditzeile steht nicht
  mehr im „davon"-Block der Geldflusstabelle, weil sie nicht vom Tagesgeld kommt.
- Kleinere Anzeigefehler: „+−3.012 € Wertsteigerung" bei negativer Rate, die
  Anzahlungskarte behauptete immer die eingestellte Rücklage, und die Beleg-Herkunft
  fiel nach dem Löschen aller Angebote nicht auf „geschätzt" zurück.

### Added
- **R34-Rechner: Entweder-oder-Hebel im Korridor.** Schadstoffklasse, H-Kennzeichen und
  der Wechsel auf den Klassikertarif gehen jetzt als Sprung zwischen zwei Werten in die
  Spanne ein statt gar nicht. Der Klassikertarif zeigt sich mit 244 €/M Spielraum als
  größter Einzelposten überhaupt.
- **Herkunftsart „abgeleitet"** für Zahlen, die über eine Faustregel aus einer
  Live-Reihe entstehen — Lohnentwicklung aus dem HVPI, Tagesgeldzins aus dem
  Einlagesatz minus 0,25. Beide trugen zuvor das Etikett „live" samt dessen
  schmalerem Band.
- **Grenzen für Zahlenfelder** (16 Felder) und Durchsetzung beim Einlesen alter Pläne.
  Ein negativer Verbrauch erzeugte zuvor negative Spritkosten und damit Spielraum aus
  dem Nichts.
- **Testsuite** unter `tests/`: 47 Prüfungen über Kontoführung, Steuertarif,
  Finanzmathematik und Korridor plus ein jsdom-Rauchtest der Oberfläche. Läuft über
  `npm test` und in der CI.

### Changed
- Die Herkunft eines Feldes kippt nur noch bei einer echten Änderung auf „von dir".
  Denselben Schätzwert erneut einzutippen senkte zuvor das Bandgewicht von 1,0 auf 0,4
  und machte den Korridor ohne neue Information schmaler.
- Der Sparverlauf weist aus, was liegen bleibt, statt was angewiesen wird, und nennt die
  Obergrenze, ab der ein höherer Dauerauftrag den Termin nicht mehr bewegt.
- Das Import-Panel weist darauf hin, dass §21 und Zulassung bereits im Landepreis
  stecken und die „Nebenkosten Kauf" im Plan trotzdem dazukommen.
- `SNAPSHOT_VERSION` auf 8. Das alte Feldpaar für die Gehaltserhöhung wird beim
  Einlesen in die Schrittliste gehoben.
- `SNAPSHOT_VERSION` auf 7. Das Feld `manual` heißt jetzt `values` und enthält auch
  belegte Werte; `manual` bleibt als Zweitname stehen, damit ältere Exporte lesbar sind.
- `SNAPSHOT_VERSION` auf 6. Der Speicherschlüssel bleibt `r34planer:v4`, die Form ist
  unverändert.

### Added
- **Docker deployment.** Two-stage build (Node build, then `nginx:alpine`), a
  `docker-compose.yml`, a `.dockerignore`, and an nginx config with a hash-router
  fallback and cache headers split by file type. `VITE_BASE` is a build arg for
  sub-path deploys.
- CI workflow `docker.yml`: builds the image on pull requests, publishes to GHCR
  on `main` and `v*` tags.

### Changed
- Docs cover more than architecture now: added `DEPLOYMENT.md` (Docker, static
  hosting, sub-paths, updating a live instance), `SNIPPETS.md` (authoring,
  `meta.json` reference, the editor, sandboxing), and `DEVELOPMENT.md` (scripts,
  the dev file API, config reference). README and `ARCHITECTURE.md` rewritten.

## [0.3.0] - 2026-07-21

### Added
- **Editor works in production without a backend.** User-created and edited
  snippets are persisted in the browser (localStorage) as a second layer beside
  the bundled, file-based snippets.
- Merged registry: bundled snippets (from the manifest, rendered via iframe
  `src`) and user snippets (from the store, rendered via iframe `srcdoc`) are
  combined into one list.
- Deterministic override: a user snippet with the same id as a bundled one wins,
  is flagged in the sidebar and editor, and can be reset to the shipped version.
- Editor repository abstraction (`snippetRepository`): dev writes files through
  the dev-server API; production writes browser storage, transparent to the UI.
- "Herunterladen" in the editor exports a snippet's HTML, so a browser-only
  snippet can be deliberately promoted into `public/snippets/` and committed.
- Tighter default sandbox for user (`srcdoc`) snippets: `allow-scripts` only,
  so snippet code cannot reach the app's own storage.

### Notes
- No merge problems on update by design: bundled snippets live in the build,
  user snippets live in the browser; a deployment never touches browser storage,
  so the two layers cannot conflict. Same-id collisions resolve by precedence,
  not merge.

## [0.2.0] - 2026-07-21

### Added
- **In-app snippet editor (dev only).** Create, edit, and delete snippets from
  the UI, with a live `srcdoc` preview beside the code.
- Dev-server file API via a Vite plugin (`scripts/vite-plugin-snippets.mjs`):
  `GET/PUT/DELETE /__api/snippets/:id` write real files under
  `public/snippets/` and regenerate the manifest on every change.
- `generate-manifest.mjs` now also exports `generateManifest()` so the dev
  plugin and the CLI share one implementation.
- Sidebar gains a "+ Neues Snippet" action and a per-item edit control (shown
  only when the editor is enabled).
- Editor routes in the URL hash: `#/new` and `#/edit/<id>`.

### Notes
- The editor is available only under `vite dev`; the production build is static
  and has no writable backend. Snippet ids are validated (`^[a-z0-9][a-z0-9-]*$`)
  to prevent path traversal.

## [0.1.0] - 2026-07-21

### Added
- Vue 3 + Vite + TypeScript wrapper shell that lists and renders HTML snippets.
- iframe-based isolation: every snippet runs in its own document; switching
  snippets tears the previous one down (keyed iframe).
- Auto-generated snippet manifest via `scripts/generate-manifest.mjs`, run
  automatically on `predev` / `prebuild`.
- Optional per-snippet `meta.json` (title, description, tags, order, sandbox).
- Hash-based navigation with deep-linkable snippet URLs (`#/<id>`), no router
  dependency.
- Design-token theming (`tokens.css`) with light/dark support.
- Configurable, per-snippet-overridable iframe `sandbox`.
- Self-hosted SVG favicon.
- First snippet: `r34-rechner`, the R34 GT-T planning calculator.
- `_template` starter snippet.
- README, architecture documentation, and this changelog.
