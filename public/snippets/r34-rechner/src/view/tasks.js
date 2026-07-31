/* ============================================================
   Aufgaben und der gemessene Nutzen einer erledigten Aufgabe
   ============================================================ */
import { el, alle } from "../dom.js";
import { narrowingBy } from "../forecast.js";
import { eur } from "../format.js";
import { doneTasks, runtime, state } from "../state.js";
import { persist } from "../store.js";
import { openTasks } from "../tasks.js";


/* ---- Nächste Schritte ---- */
/** Was die Aufgabe bringt — gemessen, wenn möglich, sonst der Satz aus dem Katalog.
 *
 *  Die handgeschriebene Begründung war eine Behauptung („ist der größte Hebel").
 *  Die Messung sagt, wie viel Unsicherheit tatsächlich verschwindet, und rechtfertigt
 *  damit den Aufwand daneben. Zahlen ohne Wirkung auf den Termin verengen trotzdem den
 *  Spielraum danach — das muss dranstehen, sonst liest man „0" als „sinnlos". */
function taskGainText(t) {
  const g = (runtime.taskGain || {})[t.id];
  if (!g) return t.gain();
  if (g.months > 0)
    return `<b>Spanne −${g.months} ${g.months === 1 ? "Monat" : "Monate"}</b> · ${t.gain()}`;
  if (g.spare > 0)
    return `<b>Spielraum danach ±${eur(g.spare)} € genauer</b> · ${t.gain()}`;
  return t.gain();
}


function renderTasks() {
  const box = el("tasks");
  const sum = el("tasksSum");
  if (!box) return;
  /* Nach gemessener Wirkung sortiert, nicht nach Reihenfolge im Katalog. Was noch
     nicht gemessen ist, bleibt an seinem Platz — die Zahlen tröpfeln nach. */
  const gain = runtime.taskGain || {};
  const rank = (t) => {
    const g = gain[t.id];
    return g ? g.months * 100 + (g.spare ?? 0) : -1;
  };
  const open = openTasks().sort((a, b) => rank(b) - rank(a));
  if (sum)
    sum.textContent = open.length ? `${open.length} offen` : "nichts offen";

  if (!open.length) {
    box.innerHTML =
      '<div class="empty">Nichts offen. Sobald ein neuer Monat beginnt oder sich etwas ändert, taucht hier wieder etwas auf.</div>';
    return;
  }
  box.innerHTML = open
    .map(
      (t) =>
        `<div class="task"><button type="button" class="tcheck" data-task="${t.id}" aria-label="erledigt">○</button>` +
        `<div class="tbody"><div class="ttext">${t.text}<span class="teffort">${t.effort}</span></div>` +
        `<div class="tgain">${taskGainText(t)}</div></div>` +
        `<button type="button" class="tjump" data-jump="${t.jump}">hin →</button></div>`,
    )
    .join("");

  alle(box, "[data-task]").forEach((btn) =>
    btn.addEventListener("click", () => {
      doneTasks[btn.dataset.task] = new Date().toISOString();
      persist();
      renderTasks();
    }),
  );
  alle(box, "[data-jump]").forEach((btn) =>
      btn.addEventListener("click", () => jumpTo(btn.dataset.jump)),
    );
}


function jumpTo(id) {
  const target = el(id);
  if (!target) return;
  let node = /** @type {HTMLElement} */ (target);
  while (node) {
    if (node.tagName === "DETAILS")
      /** @type {HTMLDetailsElement} */ (node).open = true;
    node = node.parentElement;
  }
  if (typeof target.scrollIntoView === "function")
    target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("flash");
  setTimeout(() => target.classList.remove("flash"), 1200);
}


/** Was jede offene Aufgabe an Unsicherheit wegnimmt — eine Messung je Durchgang.
 *
 *  Nacheinander statt am Stück: eine Aufgabe kostet rund 30 ms, sechs am Stück wären
 *  ein spürbarer Hänger. So gibt der Hauptthread zwischendurch ab, und die Zahlen
 *  tröpfeln in die Liste. */
function measureTaskGains() {
  const offen = openTasks().filter((t) => t.proves);
  runtime.taskGain = runtime.taskGain || {};
  let i = 0;
  const step = () => {
    if (i >= offen.length) {
      renderTasks();
      return;
    }
    const t = offen[i++];
    try {
      runtime.taskGain[t.id] = narrowingBy(state, t.proves);
    } catch {
      runtime.taskGain[t.id] = null;
    }
    setTimeout(step, 0);
  };
  step();
}

export { taskGainText, renderTasks, jumpTo, measureTaskGains };
