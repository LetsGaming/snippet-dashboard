# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
