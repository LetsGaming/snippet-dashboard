/* ============================================================
   Live-Quellen — Stand und Übernahme
   ============================================================ */
import { refresh } from "../refresh.js";
import { ALLFIELDS } from "../catalog.js";
import { el, setInput, alle, von } from "../dom.js";
import { esc } from "../format.js";
import { SOURCES, adoptLive, firstUsable, live } from "../sources.js";
import { state } from "../state.js";
import { persist } from "../store.js";


/* ---- Datenquellen ---- */
function renderSources() {
  const count = (st) =>
    SOURCES.filter((s) => (live[s.id] || {}).state === st).length;
  const ok = count("ok");
  const bad = count("fail");
  const busy = count("load");

  const sum = el("srcSum");
  if (sum) {
    sum.textContent = busy
      ? "wird geladen …"
      : bad
        ? `${ok} live · ${bad} offline, Rückfallwerte aktiv`
        : `alle ${ok} live`;
    sum.classList.toggle("warn", !busy && bad > 0);
  }

  el("sources").innerHTML = SOURCES.map((s) => {
    const st = live[s.id] || { state: "load" };
    const dot =
      st.state === "ok" ? "live" : st.state === "fail" ? "fail" : "load";
    const value =
      st.state === "ok"
        ? s.fmt(st.data)
        : st.state === "fail"
          ? `nicht erreichbar — ${esc(st.error)}, es gilt der Rückfallwert`
          : "wird geladen …";
    const stamp =
      st.state === "ok" && st.data.asOf ? ` · Stand ${esc(st.data.asOf)}` : "";
    const key = s.editable
      ? `<input class="skey" data-src="${s.id}" value="${esc(s.key)}" spellcheck="false" aria-label="Reihenschlüssel ${esc(s.label)}">`
      : "";
    return (
      `<div class="src"><div class="sdot ${dot}"></div><div class="sbody">` +
      `<div class="sname">${s.label}</div><div class="sval">${value}${stamp}</div>` +
      `<div class="smeta">${s.note}${
        s.docs
          ? ` · <a href="${s.docs}" target="_blank" rel="noopener noreferrer">Quelle ↗</a>`
          : ""
      }</div>${key}</div></div>`
    );
  }).join("");

  alle(document, ".skey").forEach((node) => {
    node.addEventListener("change", (e) => {
      const s = SOURCES.find((x) => x.id === von(e).dataset.src);
      if (!s) return;
      s.key = von(e).value.trim();
      persist();
      loadSources();
    });
  });
}


async function loadSources() {
  SOURCES.forEach((s) => {
    live[s.id] = { state: "load" };
  });
  renderSources();
  await Promise.all(
    SOURCES.map(async (s) => {
      const r = await firstUsable(s.urls(s), s.parse);
      live[s.id] = r.ok
        ? { state: "ok", data: r.value, at: new Date() }
        : { state: "fail", error: r.error, at: new Date() };
      renderSources();
    }),
  );
  adoptLive();
  ALLFIELDS.forEach((f) => setInput("f_" + f.key, state[f.key]));
  refresh();
}

export { renderSources, loadSources };
