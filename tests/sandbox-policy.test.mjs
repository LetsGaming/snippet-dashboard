/* ============================================================
   Sandbox-Politik der Snippet-Rahmen

   Gebündelte Snippets sind Dateien aus diesem Repository, Benutzer-Snippets sind
   eingefügter Code aus demselben Browserspeicher, in dem auch die Pläne liegen. Der
   Unterschied ist der ganze Punkt dieser Datei.

   Läuft über das Type-Stripping von Node — das Modul hat bewusst keine Importe zur
   Laufzeit, damit es ohne Vite und ohne Browser prüfbar bleibt.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";

const {
  resolveSandbox,
  DEFAULT_SNIPPET_SANDBOX,
  USER_SNIPPET_SANDBOX,
  USER_SANDBOX_TOKENS,
} = await import("../src/services/sandboxPolicy.ts");

const tokens = (s) => new Set(s.split(/\s+/).filter(Boolean));

test("ohne eigene Angabe gilt je Herkunft die Vorgabe", () => {
  assert.equal(resolveSandbox("bundled", null), DEFAULT_SNIPPET_SANDBOX);
  assert.equal(resolveSandbox("user", null), USER_SNIPPET_SANDBOX);
});

test("ein Benutzer-Snippet kann sich kein allow-same-origin geben", () => {
  /* Genau der Weg, den der Kommentar an der Vorgabe ausschließen wollte: über
     `meta.sandbox` hob sich ein eingefügtes Snippet die eigene Isolation auf und
     kam damit an den Speicher des Dashboards — an alle Pläne und alle anderen
     Snippets. */
  const gewaehrt = tokens(
    resolveSandbox("user", "allow-scripts allow-same-origin allow-downloads"),
  );
  assert.ok(!gewaehrt.has("allow-same-origin"));
  assert.ok(!gewaehrt.has("allow-downloads"));
  assert.ok(gewaehrt.has("allow-scripts"), "laufen darf es weiterhin");
});

test("erlaubte Wünsche kommen durch, verbotene fallen einzeln weg", () => {
  const gewaehrt = tokens(
    resolveSandbox("user", "allow-scripts allow-forms allow-top-navigation"),
  );
  assert.deepEqual([...gewaehrt].sort(), ["allow-forms", "allow-scripts"]);
});

test("ein gebündeltes Snippet behält seine eigene Angabe", () => {
  // Erstanbieter-Dateien aus diesem Repository, nachvollziehbar im Git-Verlauf
  assert.equal(
    resolveSandbox("bundled", "allow-scripts allow-same-origin"),
    "allow-scripts allow-same-origin",
  );
});

test("die Freigabeliste enthält nichts, was aus der Sandbox herausführt", () => {
  for (const verboten of [
    "allow-same-origin",
    "allow-downloads",
    "allow-popups-to-escape-sandbox",
    "allow-top-navigation",
    "allow-top-navigation-by-user-activation",
  ])
    assert.ok(!USER_SANDBOX_TOKENS.has(verboten), `${verboten} ist freigegeben`);
});

test("Doppelnennungen und Leerraum ergeben eine saubere Liste", () => {
  assert.equal(
    resolveSandbox("user", "  allow-scripts   allow-scripts\tallow-forms "),
    "allow-scripts allow-forms",
  );
  assert.equal(resolveSandbox("user", "allow-same-origin"), "");
});
