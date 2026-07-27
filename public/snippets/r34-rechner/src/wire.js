import { ymOf } from "./calendar.js";
import { BODIES, STORE_KEY, isSolid } from "./config.js";
import { eur, num, clamp } from "./format.js";
import { ALLFIELDS, LEDGERS } from "./catalog.js";
import {
  state,
  prov,
  ledgers,
  doneTasks,
  initState,
  runtime,
} from "./state.js";
import { store, persist, persistSoon, planSnapshot } from "./store.js";
import { adoptLive } from "./sources.js";
import { HELP } from "./help.js";
import { el, setSeg, setInput } from "./dom.js";
import {
  render,
  renderLedger,
  loadSources,
  resetMiniBaseline,
  clearSelectedPoint,
  spreadModalHTML,
  fundsTableHTML,
} from "./render.js";

/* ---- Feld-Verdrahtung ---- */
function wireFields() {
  ALLFIELDS.forEach((f) => {
    if (f.type === "seg") {
      el("seg_" + f.key).addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        setSeg("seg_" + f.key, btn.dataset.v);
        state[f.key] = btn.dataset.v;
        prov[f.key] = "manual";

        if (f.target && btn.dataset.p !== "") {
          const preset = parseFloat(btn.dataset.p);
          if (
            isFinite(preset) &&
            prov[f.target] !== "proof" &&
            prov[f.target] !== "manual"
          ) {
            state[f.target] = preset;
            setInput("f_" + f.target, preset);
          }
        }
        /* Die Wertsteigerung folgt der Karosserie, solange sie offen ist. Sobald sie
           steht — selbst eingetragen oder aus eigenen Inseraten übernommen —, bleibt
           sie stehen. Die frühere Bedingung prüfte nur auf „manual" und warf eine
           gemessene Rate beim nächsten Karosseriewechsel weg. */
        if (f.key === "r34Body" && !isSolid(prov.appr)) {
          state.appr = btn.dataset.v === BODIES.coupe ? 5 : 3;
          syncTopControls();
        }
        persistSoon();
        render();
      });
      return;
    }

    if (f.type === "toggle") {
      el("seg_" + f.key).addEventListener("click", (e) => {
        const btn = e.target.closest("button");
        if (!btn) return;
        setSeg("seg_" + f.key, btn.dataset.v);
        state[f.key] = btn.dataset.v === "on";
        prov[f.key] = "manual";
        persistSoon();
        render();
      });
      return;
    }

    const node = el("f_" + f.key);
    if (!node) return;

    /* Nur eine echte Änderung ist eine Entscheidung. Vorher setzte jeder Tastendruck
       die Herkunft auf „von dir" — denselben Schätzwert noch einmal einzutippen senkte
       das Bandgewicht von 1,0 auf 0,4 und machte den Korridor schmaler, ohne dass eine
       Information dazugekommen wäre. */
    const take = (key, next) => {
      if (next !== state[key]) prov[key] = "manual";
      state[key] = next;
      persistSoon();
      render();
    };

    if (f.type === "month") {
      node.addEventListener("input", (e) => take(f.key, e.target.value));
      return;
    }
    if (f.type === "select") {
      node.addEventListener("change", (e) => take(f.key, Number(e.target.value)));
      return;
    }
    node.addEventListener("input", (e) => {
      if (f.ro) return;
      const v = parseFloat(e.target.value);
      /* Grenzen aus dem Katalog, Vorgabe ist „nicht negativ". Ohne das erzeugte ein
         negativer Verbrauch negative Spritkosten und damit Spielraum aus dem Nichts.
         Das Eingabefeld selbst wird nicht überschrieben, solange es den Fokus hat —
         darum kümmert sich setInput beim nächsten Render. */
      take(f.key, clamp(isNaN(v) ? 0 : v, f.min ?? 0, f.max ?? Infinity));
    });
  });
}

/* ---- Belege ---- */
function wireLedgers() {
  Object.keys(LEDGERS).forEach(renderLedger);

  document.querySelectorAll("[data-add]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.add;
      const def = LEDGERS[id];
      const row = { date: ymOf(0) };

      def.cols.forEach((c) => {
        const node = document.querySelector(
          `[data-led="${id}"][data-col="${c.key}"]`,
        );
        if (!node) return;
        row[c.key] = c.type === "number" ? parseFloat(node.value) : node.value;
        if (c.type === "text" || c.type === "number") node.value = "";
      });

      const valid = def.valid
        ? def.valid(row)
        : isFinite(row.amt) && (def.allowNegative || row.amt > 0);
      if (!valid) return;
      if (id === "price" && !row.cur) row.cur = "EUR";
      ledgers[id].push(row);

      // Ein frischer Beleg hebt eine frühere Handeingabe auf
      if (id === "price") prov.car = "proof";
      if (id === "insR34") prov.r34InsY = "proof";
      if (id === "insDaily") prov.dailyInsY = "proof";

      persist();
      wireLedgers();
      render();
    });
  });

  document.querySelectorAll(".ldel").forEach((btn) => {
    btn.addEventListener("click", () => {
      ledgers[btn.dataset.led].splice(Number(btn.dataset.i), 1);
      persist();
      wireLedgers();
      render();
    });
  });
}

/* ---- Bedienelemente außerhalb des Feldkatalogs ---- */
function syncTopControls() {
  el("cap").value = state.cap;
  el("cap-val").textContent = eur(state.cap) + " €";
  el("appr").value = state.appr;
  el("appr-val").textContent = num(state.appr, 1) + " % / Jahr";
  setSeg("strat", state.strat);
  setSeg("method", state.method);
  setSeg("restGoal", state.restGoal);
  setSeg("seg_restTerm", state.restTerm);
  setInput("f_restYm", state.restYm);
  setInput("f_restAmount", state.restAmount);
  setInput("f_restRate", state.restRate);
}

function wireTopControls() {
  el("cap").addEventListener("input", (e) => {
    state.cap = Number(e.target.value);
    prov.cap = "manual";
    el("cap-val").textContent = eur(state.cap) + " €";
    persistSoon();
    render();
  });
  el("appr").addEventListener("input", (e) => {
    state.appr = Number(e.target.value);
    prov.appr = "manual";
    el("appr-val").textContent = num(state.appr, 1) + " % / Jahr";
    persistSoon();
    render();
  });

  const wireSeg = (id, key, after) => {
    el(id).addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;
      setSeg(id, btn.dataset.v);
      state[key] = btn.dataset.v;
      if (after) after();
      persistSoon();
      render();
    });
  };
  // Nach einem Moduswechsel passt der Bezugspunkt der Ergebnisleiste nicht mehr zur Zielgröße
  wireSeg("strat", "strat");
  wireSeg("method", "method", () => {
    resetMiniBaseline();
  });
  wireSeg("restGoal", "restGoal", () => {
    resetMiniBaseline();
  });

  el("seg_restTerm").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    setSeg("seg_restTerm", btn.dataset.v);
    state.restTerm = Number(btn.dataset.v);
    persistSoon();
    render();
  });

  el("refresh").addEventListener("click", loadSources);

  el("f_restYm").addEventListener("input", (e) => {
    state.restYm = e.target.value;
    prov.restYm = "manual";
    persistSoon();
    render();
  });
  [
    ["f_restAmount", "restAmount"],
    ["f_restRate", "restRate"],
  ].forEach(([id, key]) => {
    el(id).addEventListener("input", (e) => {
      const v = parseFloat(e.target.value);
      state[key] = isNaN(v) ? 0 : v;
      persistSoon();
      render();
    });
  });
}

/* ---- Sichern und übertragen ---- */
function wireBackup() {
  el("export").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(planSnapshot(), null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `r34-plan-${ymOf(0)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  el("importFile").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const snap = JSON.parse(await file.text());
      if (!snap || typeof snap !== "object" || !snap.v)
        throw new Error("kein Plan");
      await store.set(STORE_KEY, JSON.stringify(snap));
      location.reload();
    } catch {
      alert(
        "Die Datei ließ sich nicht lesen. Erwartet wird ein Export dieses Rechners.",
      );
    } finally {
      e.target.value = "";
    }
  });
}

/* ---- Hilfe und Erklär-Modal ---- */
const MODALS = {
  spread: { t: "Woher die Spanne kommt", html: spreadModalHTML },
  funds: {
    t: "Wohin das Geld fließt",
    html: () => fundsTableHTML(state, runtime.lastRun),
  },
};

function wireHelp() {
  const backdrop = el("backdrop");
  const closeHelp = () => {
    backdrop.hidden = true;
  };
  const open = (title, body, links) => {
    el("m-title").textContent = title;
    el("m-body").innerHTML = body;
    el("m-links").innerHTML = (links || [])
      .map(
        (x) =>
          `<a href="${x.h}" target="_blank" rel="noopener noreferrer">${x.n} ↗</a>`,
      )
      .join("");
    backdrop.hidden = false;
    el("m-close").focus();
  };

  document.addEventListener("click", (e) => {
    const dyn = e.target.closest("[data-modal]");
    if (dyn) {
      e.preventDefault();
      const m = MODALS[dyn.dataset.modal];
      if (m) open(m.t, m.html());
      return;
    }
    const btn = e.target.closest(".hbtn");
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    const h = HELP[btn.dataset.help];
    if (h) open(h.t, h.b, h.l);
  });

  el("m-close").addEventListener("click", closeHelp);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeHelp();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeHelp();
  });
}

/* ---- Ergebnisleiste beim Scrollen ---- */
function watchHero() {
  const hero = el("hero");
  const mini = el("resultbar");
  const sync = () =>
    mini.classList.toggle("on", hero.getBoundingClientRect().bottom < 8);

  if (typeof IntersectionObserver === "function") {
    new IntersectionObserver(
      ([entry]) => mini.classList.toggle("on", !entry.isIntersecting),
      {
        rootMargin: "-8px 0px 0px 0px",
      },
    ).observe(hero);
  } else {
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync, { passive: true });
    sync();
  }
  mini.addEventListener("click", () =>
    window.scrollTo({ top: 0, behavior: "smooth" }),
  );
}

/* ---- Zurücksetzen ---- */
function wireReset() {
  el("reset").addEventListener("click", () => {
    if (
      !confirm("Alle Eingaben, Belege und erfassten Kontostände zurücksetzen?")
    )
      return;

    initState();
    Object.keys(ledgers).forEach((k) => {
      ledgers[k] = [];
    });
    Object.keys(doneTasks).forEach((k) => delete doneTasks[k]);
    Object.assign(state, {
      cap: 0,
      appr: 4,
      strat: "dailyfirst",
      method: "cash",
      restGoal: "date",
      restTerm: 3,
      restAmount: 10000,
      restRate: 350,
    });
    resetMiniBaseline();
    clearSelectedPoint();

    ALLFIELDS.forEach((f) => {
      if (f.type === "seg") setSeg("seg_" + f.key, f.def);
      else if (f.type === "toggle")
        setSeg("seg_" + f.key, f.def ? "on" : "off");
      else setInput("f_" + f.key, f.def);
    });
    syncTopControls();
    adoptLive();
    ALLFIELDS.forEach((f) => setInput("f_" + f.key, state[f.key]));
    persist();
    wireLedgers();
    render();
  });
}

export {
  wireFields,
  wireLedgers,
  syncTopControls,
  wireTopControls,
  wireBackup,
  MODALS,
  wireHelp,
  watchHero,
  wireReset,
};
