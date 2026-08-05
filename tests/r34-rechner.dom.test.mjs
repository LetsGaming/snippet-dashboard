/* ============================================================
   R34 Planungsrechner — Rauchtest der Oberfläche

   Der Rechenkern hat eigene Tests. Hier geht es nur darum, dass das Sichtbare
   überhaupt entsteht und die Knöpfe greifen: Ein Tippfehler in einer Template-Zeichen-
   kette oder ein Feld ohne Bedienelement fällt sonst erst im Browser auf.

   jsdom steckt in devDependencies. Fehlt es, überspringt sich die Datei selbst,
   damit der Kern auch ohne Netz getestet werden kann.
   ============================================================ */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const APP = resolve(here, "../public/snippets/r34-rechner");

let JSDOM;
try {
  ({ JSDOM } = await import("jsdom"));
} catch {
  test("Oberflächen-Rauchtest übersprungen — jsdom fehlt", { skip: true }, () => {});
}

if (JSDOM) {
  /* Eine Seite, ein Modulsatz. Die Module halten Zustand, deshalb baut der Test die
     Umgebung einmal auf und prüft darauf — wie im Browser auch. */
  const dom = new JSDOM(readFileSync(resolve(APP, "index.html"), "utf8"), {
    url: "https://example.test/snippet/",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  for (const k of [
    "window",
    "document",
    "Node",
    "Element",
    "HTMLElement",
    "getComputedStyle",
    "requestAnimationFrame",
    "cancelAnimationFrame",
  ])
    globalThis[k] = window[k];
  // Kein Netz im Test: Live-Quellen sollen sauber fehlschlagen, nicht hängen.
  globalThis.fetch = () => Promise.reject(new Error("kein Netz im Test"));
  window.fetch = globalThis.fetch;
  /* `globalThis.navigator` ist in Node schreibgeschützt und kennt keine
     Zwischenablage — genau die Lage, die es auch in unsicherem Kontext und in
     manchen mobilen Browsern gibt. Der Test läuft damit über den Rückfallweg:
     der Code muss auch dann im Feld stehen, wenn das Kopieren scheitert. */

  /* Die Module sprechen `location` und `URL.createObjectURL` unqualifiziert an — im
     Browser ist das `window`, hier muss es gestellt werden. Beides wird nur beobachtet,
     nicht ausgeführt: ein echtes reload() gäbe es in jsdom ohnehin nicht. */
  const spy = { reloaded: 0, downloads: [], objectUrls: 0 };
  globalThis.location = { reload: () => spy.reloaded++, href: "https://example.test/" };
  window.URL.createObjectURL = () => (spy.objectUrls++, "blob:test");
  window.URL.revokeObjectURL = () => {};
  const realClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () {
    if (this.download) spy.downloads.push(this.download);
    else realClick.call(this);
  };

  const src = (f) => import(`${APP}/src/${f}`);
  const { buildFields } = await src("fields.js");
  /* Vier Module, ein Name: der Test geht den Weg vom Plan über den Textcode zurück
     und interessiert sich nicht für die Aufteilung dahinter. */
  const store = {
    ...(await src("store.js")),
    ...(await src("snapshot.js")),
    ...(await src("plancode.js")),
  };
  const { state, prov, runtime, ledgers } = await src("state.js");
  const { render } = await src("render.js");
  const { wireAll } = await src("wire.js");
  const { syncTopControls } = await src("topcontrols.js");
  const { auditLayout, measureControls } = await src("selfcheck.js");
  const { ALLFIELDS } = await src("catalog.js");
  const el = (id) => window.document.getElementById(id);
  const put = (id, v) => {
    const node = el(id);
    node.value = String(v);
    node.dispatchEvent(new window.Event("input", { bubbles: true }));
  };

  buildFields();
  wireAll();
  syncTopControls();
  render();

  test("jedes Katalogfeld bekommt ein Bedienelement", () => {
    const missing = ALLFIELDS.filter(
      (f) =>
        !el(f.type === "seg" || f.type === "toggle" ? "seg_" + f.key : "f_" + f.key),
    ).map((f) => f.key);
    assert.deepEqual(missing, [], `ohne Bedienelement: ${missing.join(", ")}`);
  });

  test("Ergebnis, Zeitleiste und Ableitungen sind gefüllt", () => {
    for (const id of ["hero", "tl", "der_r34", "der_daily", "der_body", "der_saving"])
      assert.ok(el(id).innerHTML.trim().length > 0, `${id} ist leer`);
    assert.match(el("hero").textContent, /R34 ab \d\d\/\d{4}/);
  });

  test("jede Gruppenüberschrift trägt ihre Zusammenfassung", () => {
    /* Gezeichnet wurde über `g.sum` — eine Eigenschaft, die der Katalog nicht kennt.
       Die Zeile neben jeder Überschrift blieb damit dauerhaft leer, obwohl der Text
       dafür in render.js stand. */
    const felder = [...window.document.querySelectorAll(".gsum")];
    assert.ok(felder.length >= 5, "keine Zusammenfassungsfelder im Dokument");
    const leer = felder.filter((f) => !f.textContent.trim()).map((f) => f.id);
    assert.deepEqual(leer, [], "ohne Text geblieben");
  });

  test("keine unaufgelösten Platzhalter im Markup", () => {
    const html = window.document.body.innerHTML;
    for (const bad of ["undefined", "NaN", "[object Object]", "${"])
      assert.ok(!html.includes(bad), `„${bad}" steht im Markup`);
  });

  test("die Selbstprüfung findet keine unbedienbare Knopfleiste", () => {
    /* Die Klassenkollision `.seg mini` hatte jede Segmentleiste unsichtbar gemacht.
       jsdom rechnet kein Layout, deshalb prüft der Test die Ursache statt der
       Wirkung: kein Bedienelement darf fixiert, transparent oder klickblockiert sein. */
    const seen = auditLayout();
    assert.ok(Array.isArray(seen) || seen === undefined);
    for (const box of window.document.querySelectorAll(".seg")) {
      const cs = window.getComputedStyle(box);
      assert.notEqual(cs.position, "fixed", `${box.id} ist fixiert`);
      assert.notEqual(cs.pointerEvents, "none", `${box.id} ist nicht klickbar`);
      assert.notEqual(cs.opacity, "0", `${box.id} ist unsichtbar`);
    }
  });

  test("Hero zeigt den Spielraum der Sparphase, Fahrschule läuft mit", async () => {
    render();
    await settle();
    const hero = el("hero").textContent;
    assert.match(hero, /Bis dahin frei/);
    assert.match(hero, /Danach frei im Monat/);
    // Der engste Monat wird eingeordnet — womit, hängt an der Sparweise
    assert.match(hero, /engster Monat/);
    // Die Ausbildungsdauer ist abgeleitet, nicht eingegeben — aber sichtbar
    assert.ok(!el("f_licenceMonths"), "das Feld sollte weg sein");
    assert.match(el("der_facts").textContent, /Fahrschule: .* über .* = .*€\/M/);
  });

  test("Hilfetexte stehen einmal je Bereich, nicht an jedem Feld", async () => {
    /* 65 Fragezeichen an Feldern, davon 27 Wiederholungen desselben Textes — das las
       sich als „alles hier ist erklärungsbedürftig". */
    const proGruppe = new Map();
    for (const btn of window.document.querySelectorAll(".hbtn")) {
      const flab = btn.closest(".flab");
      if (!flab) continue;
      const gruppe = btn.closest(".grp")?.id ?? "steer";
      const schluessel = `${gruppe}|${btn.dataset.help}`;
      proGruppe.set(schluessel, (proGruppe.get(schluessel) ?? 0) + 1);
    }
    const doppelt = [...proGruppe].filter(([, n]) => n > 1);
    assert.deepEqual(doppelt, [], `mehrfach im selben Bereich: ${doppelt.map(([k]) => k).join(", ")}`);
  });

  test("jede Ergebniskarte ordnet ihre Zahl ein", async () => {
    render();
    await settle();
    const karten = [...window.document.querySelectorAll(".hstats > div")];
    assert.ok(karten.length >= 4);
    for (const name of ["Aufs Tagesgeld", "Bis dahin frei", "Danach frei"]) {
      const k = karten.find((n) => n.textContent.includes(name));
      assert.ok(k, `Karte "${name}" fehlt`);
      assert.ok(k.querySelector(".hx")?.textContent.trim(), `"${name}" ohne Einordnung`);
    }
    // Beide Spielraum-Karten tragen ein Etikett, nicht nur eine davon
    const frei = karten.filter((n) => /frei/.test(n.textContent));
    for (const k of frei)
      assert.ok(k.querySelector(".pill"), "eine Zahl ohne Etikett neben einer mit");
  });

  test("Sparverlauf weist aus, was zum Leben bleibt", async () => {
    render();
    await settle();
    const table = el("der_saving").textContent;
    assert.match(table, /zum Leben/);
    assert.match(table, /aufs Tagesgeld/);
    // Die Zeilen müssen sich aufaddieren lassen: übrig − aufs Tagesgeld = zum Leben
    const zahlen = [...el('der_saving').querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].slice(1).map((td) =>
        Number((td.textContent.match(/-?[\d.]+/) || ['0'])[0].replace(/\./g, ''))));
    for (const [uebrig, aufs, frei] of zahlen.filter((z) => z.length === 3))
      assert.ok(Math.abs(uebrig - aufs - frei) <= 1,
        `Zeile geht nicht auf: ${uebrig} − ${aufs} ≠ ${frei}`);
  });

  test("Gehaltsschritte lassen sich über die Oberfläche erfassen", async () => {
    assert.ok(el("led_income"), "Beleg für Gehaltsschritte fehlt");
    assert.ok(!el("f_netAfter") && !el("f_raiseYm"), "das alte Feldpaar muss weg sein");

    const put = (col, v) => {
      const node = window.document.querySelector(`[data-led="income"][data-col="${col}"]`);
      node.value = String(v);
    };
    ledgers.income.length = 0;
    put("month", dateOf(12));
    put("amt", 2500);
    put("src", "3. Lehrjahr");
    window.document.querySelector('[data-add="income"]').click();
    await settle();
    assert.equal(ledgers.income.length, 1);
    assert.equal(ledgers.income[0].amt, 2500);
    assert.match(el("led_income").textContent, /3\. Lehrjahr/);

    // und ein zweiter Schritt daneben
    put("month", dateOf(24));
    put("amt", 3000);
    put("src", "Übernahme");
    window.document.querySelector('[data-add="income"]').click();
    await settle();
    assert.equal(ledgers.income.length, 2, "mehrere Schritte müssen nebeneinander stehen");
    ledgers.income.length = 0;
    render();
    await settle();
  });

  test("Kontoauszug: Vorschau erscheint, Übernahme füllt das Soll-Ist", async () => {
    const { readFileSync } = await import("node:fs");
    const xml = readFileSync(new URL("./fixtures/camt053.xml", import.meta.url), "utf8");
    ledgers.actual.length = 0;

    // Der Browser liefert ein File-Objekt; hier genügt etwas mit .text()
    const input = el("stmtFile");
    Object.defineProperty(input, "files", {
      value: [{ name: "auszug.xml", arrayBuffer: async () => new TextEncoder().encode(xml).buffer }],
      configurable: true,
    });
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();

    const vorschau = el("stmtResult").textContent;
    assert.match(vorschau, /CAMT/);
    assert.equal(window.document.querySelectorAll("#stmtResult .steps > li").length, 4,
      "vier Schritte: gelesen, Konto, einsortieren, übernehmen");
    assert.match(vorschau, /DE02100100100006820101/);
    assert.equal(ledgers.actual.length, 0, "vor der Bestätigung darf nichts übernommen sein");

    /* Eine Datei mit wenigen Buchungen je Monat ist ein Tagesgeldkonto — dort dürfen
       die Stände übernommen werden. Umgeschaltet auf Girokonto verschwindet der Knopf,
       denn ein Girosaldo gehört nicht ins Soll-Ist. */
    assert.equal(window.document.querySelector("#stmtTyp .on").textContent, "Tagesgeld");
    assert.equal(el("stepTg").hidden, false, "Schritt „Stände übernehmen“ muss offen sein");
    assert.equal(el("stepGiro").hidden, true, "Einsortieren gehört nicht zum Tagesgeld");

    window.document.querySelector('#stmtTyp [data-v="giro"]').click();
    assert.equal(el("stepTg").hidden, true, "vom Girokonto darf nichts übernommen werden");
    assert.equal(el("stepGiro").hidden, false);
    assert.equal(el("stmtGiroNote").hidden, false);
    /* Die Auswahl muss auch sichtbar bleiben. setSeg vergleicht `data-v`; solange die
       Knöpfe `data-t` trugen, verloren nach dem Klick beide die Markierung. */
    assert.equal(window.document.querySelector("#stmtTyp .on").textContent, "Girokonto");

    window.document.querySelector('#stmtTyp [data-v="tagesgeld"]').click();
    assert.equal(window.document.querySelector("#stmtTyp .on").textContent, "Tagesgeld");

    el("stmtApply").click();
    await settle();
    assert.equal(ledgers.actual.length, 3);
    assert.equal(ledgers.actual[2].amt, 4876.55);
    assert.match(el("stmtResult").textContent, /übernommen/);

    ledgers.actual.length = 0;
    render();
    await settle();
  });

  test("Kontoauszug: offene Empfänger einsortieren setzt die Lebenshaltung", async () => {
    const { readFileSync } = await import("node:fs");
    const xml = readFileSync(new URL("./fixtures/camt-umsaetze.xml", import.meta.url), "utf8");
    ledgers.actual.length = 0;
    ledgers.rules.length = 0;

    const input = el("stmtFile");
    Object.defineProperty(input, "files", {
      value: [{ name: "umsaetze.xml", arrayBuffer: async () => new TextEncoder().encode(xml).buffer }],
      configurable: true,
    });
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();

    const spend = el("stmtSpend");
    assert.match(spend.textContent, /13 Buchungen/);
    assert.match(spend.textContent, /Kleinbrauerei/, "der unbekannte Empfänger muss auftauchen");
    assert.ok(spend.querySelector('[data-cat="leben"]'), "Einsortier-Knöpfe fehlen");

    /* Der Einkauf steht als Teil der Lebenshaltung da: eigene Spalte, eigener Anteil,
       aber keine zweite Summe. EDEKA und REWE stecken in der Datei. */
    assert.ok(
      [...spend.querySelectorAll("th")].some((n) => /Lebensmittel/.test(n.textContent)),
      "die Spalte „davon Lebensmittel“ fehlt",
    );
    assert.match(spend.textContent, /% der Lebenshaltung/, "der Anteil muss dastehen");
    const lm = spend.querySelector('[data-sub="lebensmittel"]');
    assert.ok(lm, "der Knopf „Lebensmittel“ fehlt");
    assert.equal(lm.dataset.cat, "leben", "er verfeinert Leben, er ersetzt es nicht");

    // Einsortieren erzeugt eine Regel und blendet den Posten aus
    spend.querySelector('[data-cat="leben"]').click();
    await settle();
    assert.equal(ledgers.rules.length, 1);
    assert.equal(ledgers.rules[0].sub, undefined, "ohne Knopf keine Unterkategorie");
    assert.match(el("stmtSpend").textContent, /Alles zugeordnet/);

    // und der Vorschlag landet im Feld
    el("spendApply").click();
    await settle();
    assert.ok(state.living > 700 && state.living < 800, `living=${state.living}`);
    assert.equal(prov.living, "proof");

    /* Nach dem Übernehmen muss die Auswertung stehen bleiben. Vorher wurde der ganze
       Schritt durch eine Bestätigungszeile ersetzt — die Buchungen lagen noch im
       Speicher, aber man kam nicht mehr an sie heran. */
    const nachher = el("stmtSpend").textContent;
    assert.match(nachher, /gesetzt/, "eine Rückmeldung soll es geben");
    assert.match(nachher, /Buchungen/, "die Auswertung darf nicht verschwinden");
    assert.match(nachher, /Was übrig bleibt/, "auch die Kapazität bleibt");
    assert.ok(
      el("stmtSpend").querySelector("[data-cat]") || /Alles zugeordnet/.test(nachher),
      "Einsortieren muss weiter möglich sein",
    );
    // Der Knopf bietet jetzt nichts Neues mehr an, statt dasselbe noch einmal
    assert.equal(el("spendApply"), null);
    assert.match(nachher, /steht bereits auf/);

    ledgers.rules.length = 0;
    ledgers.actual.length = 0;
    put("f_living", 950);
    render();
    await settle();
  });

  test("Kontoauszug: „Lebensmittel“ merkt sich die Verfeinerung, nicht nur die Kategorie", async () => {
    const { readFileSync } = await import("node:fs");
    const xml = readFileSync(new URL("./fixtures/camt-umsaetze.xml", import.meta.url), "utf8");
    ledgers.actual.length = 0;
    ledgers.rules.length = 0;

    const input = el("stmtFile");
    Object.defineProperty(input, "files", {
      value: [{ name: "umsaetze.xml", arrayBuffer: async () => new TextEncoder().encode(xml).buffer }],
      configurable: true,
    });
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();

    el("stmtSpend").querySelector('[data-sub="lebensmittel"]').click();
    await settle();
    assert.deepEqual(ledgers.rules[0], {
      pat: "Kleinbrauerei Sonnenschein",
      cat: "leben",
      sub: "lebensmittel",
    });
    /* Ohne die Unterkategorie in der Regel käme der Posten beim nächsten Auszug als
       gewöhnliche Lebenshaltung zurück und der Einkauf wäre still zu niedrig. */
    assert.match(el("stmtSpend").textContent, /Davon Lebensmittel/);

    ledgers.rules.length = 0;
    ledgers.actual.length = 0;
    render();
    await settle();
  });

  test("Kontoauszug: unbrauchbare Datei nennt den Grund", async () => {
    const input = el("stmtFile");
    Object.defineProperty(input, "files", {
      value: [{ name: "muell.txt", arrayBuffer: async () => new TextEncoder().encode("irgendwas ohne Struktur").buffer }],
      configurable: true,
    });
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
    await settle();
    assert.match(el("stmtResult").textContent, /CAMT|MT940/);
    assert.equal(ledgers.actual.length, 0);
  });

  test("gleiche Eingabe hebt die Herkunft nicht auf „von dir“", () => {
    prov.living = "guess";
    const node = el("f_living");
    node.value = String(state.living);
    node.dispatchEvent(new window.Event("input", { bubbles: true }));
    assert.equal(prov.living, "guess", "unveränderter Wert ist keine Entscheidung");

    node.value = String(state.living + 100);
    node.dispatchEvent(new window.Event("input", { bubbles: true }));
    assert.equal(prov.living, "manual");
  });

  test("Zahlenfelder werden gegen die Kataloggrenzen geklemmt", () => {
    const set = (id, v) => {
      const node = el(id);
      node.value = String(v);
      node.dispatchEvent(new window.Event("input", { bubbles: true }));
    };
    set("f_r34Cons", -5);
    assert.equal(state.r34Cons, 0, "negativer Verbrauch");
    set("f_saveSurplus", 500);
    assert.equal(state.saveSurplus, 100, "Überschussanteil über 100 %");
    set("f_r34Cons", 11);
    set("f_saveSurplus", 50);
  });

  test("leere Erstzulassung kippt den Plan nicht", () => {
    const node = el("f_r34Ez");
    const before = state.r34Ez;
    node.value = "";
    node.dispatchEvent(new window.Event("input", { bubbles: true }));
    assert.ok(
      !/85\d{3}/.test(el("hero").textContent + state.startYm),
      `Termin entgleist: startYm=${state.startYm}`,
    );
    assert.ok(runtime.lastRun.r34Month != null, "es muss weiter ein Datum geben");
    node.value = before;
    node.dispatchEvent(new window.Event("input", { bubbles: true }));
  });

  test("Geldflusstabelle geht auf und meldet keine Differenz", async () => {
    const { fundsTableHTML } = await src("view/derived.js");
    const html = fundsTableHTML(state, runtime.lastRun);
    assert.ok(!html.includes("geht um"), "die Aufstellung meldet einen Fehlbetrag");
    assert.ok(html.includes("Tagesgeld im Kaufmonat"));
  });

  test("Wertsteigerung aus Belegen überlebt einen Karosseriewechsel", () => {
    state.appr = 7.5;
    prov.appr = "proof";
    el("seg_r34Body").querySelector('[data-v="Coupé"]').click();
    assert.equal(state.appr, 7.5, "belegte Wertsteigerung wurde überschrieben");

    prov.appr = "preset";
    el("seg_r34Body").querySelector('[data-v="Limousine"]').click();
    assert.equal(state.appr, 3, "offene Wertsteigerung soll der Karosserie folgen");
  });

  test("Wirkungs-Chip erscheint auch an den Entweder-oder-Feldern", async () => {
    const { sensitivity } = await src("spread.js");
    const { renderImpacts } = await src("render.js");
    runtime.lastSpread = sensitivity(runtime.lastRun);
    renderImpacts(runtime.lastSpread);
    for (const key of ["r34Norm", "hPlateWanted", "r34Switch25"]) {
      const chip = el("imp_" + key);
      assert.ok(chip, `kein Chip für ${key}`);
      assert.ok(chip.textContent.includes("↔"), `${key}: „${chip.textContent}“`);
      assert.ok(!chip.textContent.includes("±—"), `${key}: leeres Band`);
    }
  });

  /* Die schweren Anzeigen (Soll-Ist, Hebel, Vergleiche) laufen entprellt über
     scheduleHeavy(). Direkt nach render() steht dort noch der Platzhalter. */
  const HEAVY_WAIT = 400;
  const settle = () => new Promise((r) => setTimeout(r, HEAVY_WAIT));

  test("Soll-Ist vergleicht gegen den simulierten Verlauf", async () => {
    /* Vorherige Tests haben am Zustand gedreht — was dieser Test braucht, setzt er
       selbst. Das entspricht der Lage im Browser, wo auch niemand zurücksetzt. */
    const put = (id, v) => {
      const node = el(id);
      node.value = String(v);
      node.dispatchEvent(new window.Event("input", { bubbles: true }));
    };
    put("f_living", 950);

    const load = async (rows) => {
      ledgers.actual.length = 0;
      ledgers.actual.push(...rows);
      render();
      await settle();
      return el("track").textContent;
    };
    const planPoints = (gapPerMonth = 0) => {
      const plan = runtime.lastRun.path;
      return [
        { month: dateOf(plan[0].m), amt: Math.round(plan[0].cap) },
        { month: dateOf(plan[6].m), amt: Math.round(plan[6].cap - 6 * gapPerMonth) },
      ];
    };

    // Stände genau auf der Planlinie → das Urteil muss „auf Kurs“ lauten
    assert.match(await load(planPoints(0)), /auf Kurs/);

    /* 200 €/M darunter, Dauerauftrag-Modus: der Vorschlag senkt den Dauerauftrag um
       genau diesen Betrag. */
    el("seg_saveMode").querySelector('[data-v="fixed"]').click();
    await settle();
    const fixedText = await load(planPoints(200));
    assert.match(fixedText, /weniger/);
    const newFixed = euroIn(fixedText, /Dauerauftrag auf ([\d.]+) €/);
    assert.ok(
      Math.abs(newFixed - (state.saveFixed - 200)) <= 2,
      `Dauerauftrag ${newFixed} €, erwartet rund ${state.saveFixed - 200} €`,
    );

    /* Derselbe Rückstand im Modus „alles Übrige“: die Korrektur geht in die
       Lebenshaltung — und zwar um 200 €, nicht um den Autounterhalt obendrauf.
       Die frühere Formel `netNow − realRate` schlug rund 500 € vor. */
    el("seg_saveMode").querySelector('[data-v="auto"]').click();
    await settle();
    const autoText = await load(planPoints(200));
    const newLiving = euroIn(autoText, /Lebenshaltung von ([\d.]+) €/);
    assert.ok(
      Math.abs(newLiving - (state.living + 200)) <= 2,
      `Lebenshaltung ${newLiving} €, erwartet rund ${state.living + 200} €`,
    );

    el("seg_saveMode").querySelector('[data-v="fixed"]').click();
    ledgers.actual.length = 0;
    render();
    await settle();
  });

  const euroIn = (text, re) =>
    Number((text.match(re)?.[1] ?? "").replace(/\./g, "")) || 0;

  function dateOf(m) {
    const now = new Date();
    const a = now.getFullYear() * 12 + now.getMonth() + m;
    return `${Math.floor(a / 12)}-${String((a % 12) + 1).padStart(2, "0")}`;
  }

  /* ---------------- Sichern und übertragen ---------------- */

  const seedLedgers = () => {
    ledgers.price.length = 0;
    ledgers.actual.length = 0;
    for (let i = 0; i < 4; i++)
      ledgers.price.push({
        src: `Inserat ${i}`,
        date: "2026-05",
        body: "Limousine",
        amt: 29000 + i * 400,
        cur: "EUR",
      });
    ledgers.actual.push({ month: dateOf(0), amt: 5200, src: "Monatsende" });
  };

  test("Code kopieren legt einen einlesbaren Plan ins Feld", async () => {
    seedLedgers();
    el("copyCode").click();
    await settle();
    const code = el("codeText").value;
    assert.match(code, /^R34[01]:[A-Za-z0-9_-]+$/, `Feld enthielt: ${code.slice(0, 40)}`);
    assert.equal(el("codeBox").hidden, false, "das Feld muss sichtbar werden");
    const back = await store.decodeSnapshot(code);
    assert.equal(back.ledgers.price.length, 4, "Belege fehlen im Code");
    assert.equal(back.ledgers.actual.length, 1);
  });

  test("unbrauchbarer Code wird abgewiesen, ohne den Plan anzufassen", async () => {
    const before = spy.reloaded;
    el("pasteCode").click();
    el("codeText").value = "das ist kein Code";
    el("codeApply").click();
    await settle();
    assert.match(el("codeHint").textContent, /weder ein Plan-Code/);
    assert.equal(el("codeHint").className, "lhint bad");
    assert.equal(spy.reloaded, before, "es darf nichts übernommen worden sein");
  });

  test("Plan aus einer neueren Fassung wird abgelehnt statt halb verstanden", async () => {
    const snap = store.planSnapshot();
    const code = await store.encodeSnapshot({ ...snap, v: 999 });
    const before = spy.reloaded;
    el("pasteCode").click();
    el("codeText").value = code;
    el("codeApply").click();
    await settle();
    assert.match(el("codeHint").textContent, /neueren Fassung/);
    assert.equal(spy.reloaded, before);
  });

  test("Übernehmen fragt nach und lässt sich abbrechen", async () => {
    const snap = store.planSnapshot();
    const code = await store.encodeSnapshot(snap);
    const asked = [];
    const realConfirm = window.confirm;
    window.confirm = (text) => (asked.push(text), false);

    const before = spy.reloaded;
    el("pasteCode").click();
    el("codeText").value = code;
    el("codeApply").click();
    await settle();
    assert.equal(asked.length, 1, "es muss nachgefragt werden");
    assert.match(asked[0], /Belege/, "die Rückfrage soll zeigen, was drinsteckt");
    assert.match(asked[0], /ersetzt/);
    assert.equal(spy.reloaded, before, "Abbruch darf nichts übernehmen");

    window.confirm = () => true;
    el("codeApply").click();
    await settle();
    assert.equal(spy.reloaded, before + 1, "nach Zustimmung wird übernommen");
    window.confirm = realConfirm;
  });

  test("Inhalt einer exportierten Datei lässt sich auch einfügen", async () => {
    const snap = store.planSnapshot();
    const asked = [];
    const realConfirm = window.confirm;
    window.confirm = (t) => (asked.push(t), false);
    el("pasteCode").click();
    el("codeText").value = JSON.stringify(snap, null, 2);
    el("codeApply").click();
    await settle();
    assert.equal(asked.length, 1, "roher JSON-Export muss angenommen werden");
    window.confirm = realConfirm;
  });

  test("gesperrte Downloads führen zum Code statt ins Leere", async () => {
    /* Im Snippet-iframe fehlte `allow-downloads`: der Browser verwarf den Download
       wortlos. Der Rechner muss das erkennen und den Code anbieten. */
    const frame = window.document.createElement("iframe");
    // setAttribute, nicht `frame.sandbox = …`: jsdom spiegelt die Zuweisung an die
    // DOMTokenList nicht zurück aufs Attribut, und der Test liefe ins Leere.
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin");
    Object.defineProperty(window, "frameElement", { value: frame, configurable: true });
    try {
      const before = spy.downloads.length;
      el("export").click();
      await settle();
      assert.equal(spy.downloads.length, before, "es darf kein Download versucht werden");
      assert.equal(el("codeBox").hidden, false);
      assert.match(el("codeText").value, /^R34[01]:/);
      assert.match(el("codeHint").textContent, /gesperrt/);

      // Mit dem Recht läuft der gewohnte Weg
      frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-downloads");
      el("export").click();
      await settle();
      assert.equal(spy.downloads.length, before + 1);

      // Ohne sandbox-Attribut überhaupt gilt keine Sperre
      frame.removeAttribute("sandbox");
      el("export").click();
      await settle();
      assert.equal(spy.downloads.length, before + 2);
    } finally {
      Object.defineProperty(window, "frameElement", { value: null, configurable: true });
    }
  });

  test("Datei-Export lädt den Plan mit sprechendem Namen herunter", async () => {
    const before = spy.downloads.length;
    el("export").click();
    await settle();
    assert.equal(spy.downloads.length, before + 1);
    assert.match(spy.downloads.at(-1), /^r34-plan-\d{4}-\d{2}\.json$/);
  });

  test("Sicherungsstand steht im eigenen Panel, nicht im Soll-Ist", async () => {
    seedLedgers();
    /* Vorherige Tests haben gesichert. Damit „nicht gesichert“ überhaupt zutrifft,
       muss der Plan erst weiterlaufen — ein Stand, den es so noch nie gab. */
    ledgers.actual.push({ month: dateOf(1), amt: 6100, src: "Folgemonat" });
    render();
    await settle();
    assert.match(el("backupSum").textContent, /nicht gesichert/);

    el("copyCode").click();
    await settle();
    render();
    await settle();
    assert.doesNotMatch(
      el("backupSum").textContent,
      /nicht gesichert/,
      "nach dem Sichern muss der Hinweis weg sein",
    );

    ledgers.price.push({ src: "neu", date: "2026-06", body: "Limousine", amt: 30500, cur: "EUR" });
    render();
    await settle();
    assert.match(
      el("backupSum").textContent,
      /nicht gesichert/,
      "eine neue Zeile muss den Hinweis zurückholen",
    );
    /* Und ausdrücklich nicht im Soll-Ist-Panel: gesichert wird der ganze Plan,
       nicht ein Modul. */
    assert.doesNotMatch(el("trackSum").textContent, /gesichert/);
    assert.match(el("backupState").textContent, /Belege/);
    assert.match(el("backupState").textContent, /eigene Zahl/);

    ledgers.price.length = 0;
    ledgers.actual.length = 0;
    render();
    await settle();
  });

  test("der Bereich der Läufe liegt als Fläche hinter der Kurve", async () => {
    /* Direkt gezeichnet statt über render(): die Vorschau läuft entprellt, und ein
       Test, der auf einen Timer wartet, misst den Timer und nicht die Zeichnung. */
    const { renderTrack } = await src("view/track.js");
    const { runtime } = await src("state.js");
    ledgers.actual.length = 0;
    ledgers.actual.push({ month: dateOf(0), amt: 5200, src: "Monatsende" });
    render();
    await settle();

    runtime.lastForecast = {
      band: [
        { m: 0, p10: 4000, p50: 5200, p90: 6400, n: 400 },
        { m: 6, p10: 6000, p50: 9000, p90: 12000, n: 400 },
        { m: 12, p10: 8000, p50: 13000, p90: 18000, n: 400 },
      ],
    };
    renderTrack(runtime.lastRun);

    const fan = window.document.querySelector("#track .cfan");
    assert.ok(fan, "die Fläche fehlt");
    assert.match(fan.getAttribute("d"), / Z$/, "die Fläche muss geschlossen sein");
    assert.ok(window.document.querySelector("#track .cmid"), "der Mittelwert fehlt");
    assert.match(el("track").textContent, /p10–p90/, "die Legende nennt den Bereich nicht");

    runtime.lastForecast = null;
    renderTrack(runtime.lastRun);
    assert.equal(
      window.document.querySelectorAll("#track .cfan").length,
      0,
      "ohne Vorschau darf keine Fläche stehen",
    );

    ledgers.actual.length = 0;
    render();
    await settle();
  });

  /* ---------------- Fremdtext aus importierten Plänen ---------------- */

  test("Freitext eines Belegs landet nicht als Markup im Sparverlauf", async () => {
    /* Der Weg: Ledger-Spalte `src` → incomeSteps → firstRaise().note → savingMarks()
       baut daraus eine Beschriftung → savingPhasesHTML rendert sie. Ledger-Zeilen
       kommen unverändert aus Plan-Codes und JSON-Importen, sind also Fremdtext.
       Gebündelte Snippets laufen mit `allow-same-origin`; ein Script von hier käme
       an den localStorage des Dashboards. */
    ledgers.income.length = 0;
    ledgers.income.push({
      month: dateOf(6),
      amt: 3200,
      src: '<img src=x onerror="globalThis.__xss = true">',
    });
    render();
    await settle();

    const html = el("der_saving").innerHTML;
    assert.match(html, /&lt;img/, "der Freitext muss escaped im Dokument stehen");
    assert.ok(!html.includes("<img"), "und darf kein Element werden");
    assert.equal(window.document.querySelectorAll("#der_saving img").length, 0);
    assert.equal(globalThis.__xss, undefined);

    ledgers.income.length = 0;
    render();
    await settle();
  });

  test("fehlende Erstzulassung kollabiert die Zeitleiste nicht", async () => {
    /* Ohne Erstzulassung ist der H-Termin NEVER (1e6). Ungeprüft übernommen zieht er
       das Ende der Leiste auf Monat 1.000.000: jede andere Marke sitzt dann bei 0 %
       und im Etikett steht „01/85359". */
    const alt = state.r34Ez;
    try {
      state.r34Ez = "";
      render();
      await settle();
      const tl = el("tl").innerHTML;
      assert.ok(!tl.includes("85359"), "NEVER darf nicht als Datum durchschlagen");
      assert.ok(!tl.includes("H-Kennzeichen"), "ohne Erstzulassung kein H-Termin");
      const marken = [...tl.matchAll(/left:([\d.]+)%/g)].map((m) => Number(m[1]));
      assert.ok(marken.length > 0, "die Leiste muss überhaupt Marken haben");
      assert.ok(
        marken.some((x) => x > 1),
        `alle Marken bei 0 %: ${marken.join(", ")}`,
      );
    } finally {
      state.r34Ez = alt;
      render();
      await settle();
    }
  });

  test("die Selbstprüfung meldet nur, was sie gemessen hat", () => {
    /* Der Banner las `position`, `deckkraft` und `klickbar` — Felder, die die Messung
       nie gesetzt hat. Im Banner stand dann „undefined". */
    const gemessen = new Set(Object.keys(measureControls()[0] ?? {}));
    for (const feld of ["feld", "breite", "höhe", "display", "sichtbarkeit", "rahmen"])
      assert.ok(gemessen.has(feld), `${feld} fehlt in der Messung`);
    for (const feld of ["position", "deckkraft", "klickbar"])
      assert.ok(!gemessen.has(feld), `${feld} wird nicht gemessen`);
  });
}
