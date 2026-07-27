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
  const store = await src("store.js");
  const { state, prov, runtime, ledgers } = await src("state.js");
  const { render } = await src("render.js");
  const {
    wireFields,
    wireTopControls,
    wireLedgers,
    wireHelp,
    wireBackup,
    syncTopControls,
  } = await src("wire.js");
  const { auditLayout } = await src("selfcheck.js");
  const { ALLFIELDS } = await src("catalog.js");
  const el = (id) => window.document.getElementById(id);

  buildFields();
  wireFields();
  wireTopControls();
  wireLedgers();
  wireHelp();
  wireBackup();
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
    const { fundsTableHTML } = await src("render.js");
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
}
