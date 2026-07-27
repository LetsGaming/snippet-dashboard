# R34 Planungsrechner

Snippet für das Snippet-Dashboard. Ablage unter `public/snippets/r34-rechner/`,
`meta.json` liegt bei. Statisches HTML, CSS und ES-Module, kein Build.

## Die Spanne über dem Ergebnis

Drei Werte, und die Beschriftung sagt jetzt, was sie sind:

| optimistisch | mit deinen Zahlen | pessimistisch |
|---|---|---|

Die Mitte ist die Rechnung mit genau den eingetragenen Zahlen. Links und rechts steht
nicht, wie das Leben läuft, sondern wie genau die noch offenen **Schätzungen** sind.

Der Knopf „Woher die Spanne kommt" öffnet die Aufschlüsselung: eine Achse mit den drei
Werten, drei Kurzerklärungen und ein Balkendiagramm, das pro Posten zeigt, wie weit er
den Termin nach vorn zieht und nach hinten schiebt. Sortiert nach Wirkung — der
längste Balken oben ist das, was die Spanne auseinanderzieht.

## Behobene Klassenkollision

Über mehrere Fassungen waren alle Auswahlfelder ohne Bedienelement. Die Segmentleisten
trugen `class="seg mini"`; `mini` war als Größenmodifikator gedacht, existierte aber
zugleich als eigene Komponente — die mitlaufende Ergebnisleiste:

```css
.mini {
  position: fixed;       /* nimmt keinen Platz im Fluss ein */
  opacity: 0;            /* unsichtbar bis .on gesetzt wird */
  pointer-events: none;  /* nicht anklickbar */
}
```

Jede Knopfleiste erbte das und verschwand an den unteren Bildschirmrand. Behoben durch
eindeutige Namen: `.seg-sm` für den Modifikator, `.resultbar` für die Ergebnisleiste.
Der Name `mini` kommt nicht mehr vor.

**Wer hier etwas ändert:** Modifikatoren an die Komponente binden (`.seg-sm`, nicht
`.sm`). Ein allgemeiner Zusatzname, der anderswo eine vollständige Komponente ist,
erzeugt denselben Fehler wieder.

## Selbstprüfung

`src/selfcheck.js` misst nach dem Aufbau jede Knopfleiste — Breite, Höhe, Deckkraft,
Position und Klickbarkeit. Ein Element kann normale Maße haben und trotzdem unbedienbar
sein; genau das war der Fall. Bei Befund erscheint ein Banner über dem Ergebnis.

Messtabelle in der Konsole des Snippet-Frames:

    r34diagnose()

## Module

Die ersten fünfzehn fassen kein DOM an.

| Datei | Inhalt |
|---|---|
| `calendar.js` | Monatsindex, Datumsformate |
| `tax.js` | Kfz-Steuer nach §§ 8, 9 KraftStG |
| `format.js` | Zahlformate, Annuität, Median |
| `config.js` | Konstanten, Herkunftsarten, Gewichte |
| `currency.js` | Wechselkurse |
| `ledgers.js` | Belege als reiner Datenhalter |
| `catalog.js` | Feldkatalog |
| `state.js` | Zustand, Herkunft, abgeleitete Termine |
| `pricing.js` | Belegte Preise, Karosserie, Import, laufende Kosten |
| `simulate.js` | Simulation, Sparverlauf |
| `spread.js` | Hebel, Sensitivität, Spanne |
| `tasks.js` | Nächste Schritte |
| `sources.js` | Live-Quellen (MTS-K, EZB, Frankfurter) |
| `store.js` | Speicher, Schnappschuss, Migration |
| `help.js` | Hilfetexte |
| `dom.js` | DOM-Helfer |
| `fields.js` | Feldaufbau |
| `render.js` | Rendering |
| `wire.js` | Verdrahtung |
| `selfcheck.js` | Layout-Messung |

## Zwei Konten

Das Tagesgeld ist die Kaufkraft und wird verzinst, das laufende Konto ist der
Alltagspuffer. Der Monat läuft in dieser Reihenfolge:

1. Zinsen auf den Stand des Vormonats
2. Führerschein, falls fällig
3. Käufe — aus dem Stand des Vormonats, das Gehalt kommt erst danach
4. Kosten des Monats, einschließlich der eben gekauften Fahrzeuge
5. Aufteilung auf beide Töpfe, dann Ausgleich

Dass die Käufe **vor** den Kosten stehen, ist der Punkt: wer im Monat m zulässt,
zahlt ab m auch Versicherung, Steuer und Sprit. Stünden sie danach, liefe der
Kaufmonat kostenlos.

Das Tagesgeldkonto geht nicht ins Minus. Was eine Einmalzahlung nicht deckt, geht
aufs laufende Konto — dort wird es gezählt und gewarnt. Ein negativer Stand im
Tagesgeld wäre unsichtbar geblieben, weil der Zinsblock ihn überspringt.

Der Ausgleich vom Tagesgeld ans laufende Konto wird als `giroCover` mitgeschrieben.
Ohne ihn zählt ein zu hoher Dauerauftrag als Einzahlung, die nie liegen bleibt, und
die Aufstellung „wohin das Geld fließt" geht um genau diesen Betrag nicht auf. Die
Invariante, an der das hängt:

    Startkapital + angewiesen + Zinsen − Einmalkosten − Ausgleich = Stand im Kaufmonat

Sie wird in der Anzeige geprüft und in `tests/` über achtzehn Konfigurationen
festgehalten.

## Herkunft der Zahlen

Sechs Stufen, zwei Ebenen. `solid` heißt: die Zahl steht.

| Herkunft | solid | Bandgewicht |
|---|---|---|
| `calc` | ja | 0 |
| `proof` | ja | 0,25 |
| `manual` | ja | 0,4 |
| `live` | ja | 0,6 |
| `preset` | nein | 0,8 |
| `derived` | nein | 0,8 |
| `guess` | nein | 1 |

`derived` ist für Zahlen, die über eine Faustregel aus einer Live-Reihe entstehen:
der HVPI als Lohnentwicklung, der Einlagesatz minus 0,25 als Tagesgeldzins. Die
Quelle ist gemessen, die Übertragung nicht — `live` hätte ihnen ein Band von 0,6
verschafft, das die Faustregel nicht verdient.

Die Herkunft kippt nur bei einer **echten Änderung** auf `manual`. Denselben
Schätzwert erneut einzutippen darf den Korridor nicht schmaler machen.

## Der Korridor

Jedes Feld mit `band` ist ein Hebel, und jedes Feld mit `choices` ebenfalls — dann
springt es zwischen zwei Werten statt um einen Betrag. Ohne das blieben die größten
offenen Fragen eines JDM-Imports außerhalb der Spanne: die Schadstoffklasse
entscheidet über 450 € Steuer im Jahr, der Klassikertarif ab 25 über 244 €/M
Spielraum.

## Tests

    npm test

`tests/r34-rechner.test.mjs` prüft den Rechenkern ohne DOM — Kontoführung,
Steuertarif nach §§ 8, 9 KraftStG, Finanzmathematik, Belege und Korridor.
`tests/r34-rechner.dom.test.mjs` bootet die Seite in jsdom und prüft, dass die
Anzeigen entstehen und die Knöpfe greifen; ohne jsdom überspringt sich die Datei.

## Sichern und übertragen

Der Plan liegt im Browserspeicher und überlebt weder geleerten Cache noch
Gerätewechsel.

**Gesichert wird alles, was nicht aus dem Katalog oder aus einer anderen Zahl
folgt** — über alle Bereiche hinweg, nicht nur die Belege eines Moduls:

| | |
|---|---|
| `values` | Handeingaben **und** belegte Werte, mit `origin` je Schlüssel |
| `fallback` | zuletzt live geholte Zahlen, damit ein Gerät ohne Netz nicht auf Katalogwerte zurückfällt |
| `ui` | Startkapital, Wertsteigerung, Reihenfolge, Zahlweise, Restfinanzierung |
| `ledgers` | alle vier Belegarten |
| `doneTasks` | abgehakte Schritte |
| `keys` | geänderte EZB-Reihenschlüssel |

Bis Fassung 6 wurden nur Werte mit `prov === "manual"` gesichert. Damit fiel
ausgerechnet weg, was am meisten Arbeit gekostet hat: eine aus Kontoständen
abgeleitete Lebenshaltung, ein aus eigenen Inseraten gemessener Wertzuwachs, ein
am Soll-Ist ausgerichteter Dauerauftrag. Die tragen `proof`, und davon wurde nur
das Etikett gespeichert. Wer hier etwas ändert: **der Filter entscheidet, was ein
Gerätewechsel überlebt.**

Zwei Wege hinaus, beide mit demselben Inhalt:

- **Textcode** — eine Zeile, Format `R34<n>:<base64url>`. `n` sagt, ob gepackt
  wurde; beim Lesen werden beide Formen erkannt, ein Code von einem alten Browser
  lässt sich also auf einem neuen einlesen. base64url statt base64, damit `+` und
  `/` nicht daran scheitern, dass ein Messenger den Code als Link erkennt.
- **JSON-Datei** — für die Ablage neben den anderen Unterlagen.

Beide gehen durch `normalizeSnapshot()`: Fassung prüfen, migrieren, dann erst
übernehmen. Der frühere Datei-Import schrieb roh in den Speicher und umging die
Migration — deshalb gibt es diesen Weg jetzt genau einmal.

`planSnapshot()` liefert eine **Kopie** der Belege, keine Referenz. Sonst ändert
sich ein bereits erstellter Export nachträglich mit.

Ob der Plan gesichert ist, entscheidet ein Fingerabdruck über den Schnappschuss
ohne Zeitstempel. Weicht er vom zuletzt gemerkten ab, steht „nicht gesichert" in
der Zusammenfassung des Soll-Ist-Panels — sichtbar auch, wenn es zugeklappt ist.

## Konventionen

- **Monat 0** ist der laufende Monat und wandert mit dem Kalender.
- **Kontostände gelten zum Monatsende**, nach Gehalt, Kosten und Dauerauftrag.
- **Kaufkraft ist nur das Tagesgeldkonto.** Was auf dem laufenden Konto bleibt,
  gilt im Modell als verbraucht — sonst wäre ein Dauerauftrag wirkungslos. Daraus
  folgt eine Obergrenze: über dem Betrag, der tatsächlich übrig bleibt, verschiebt
  ein höherer Dauerauftrag den Termin nicht mehr.
- **Zahlenfelder haben Grenzen** (`min`/`max` im Katalog). Sie greifen bei der
  Eingabe und beim Einlesen alter Pläne.
- Der Plan liegt unter `r34planer:v4` in `window.storage`, sonst `localStorage`.
