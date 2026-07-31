/* ============================================================
   Neu zeichnen, ohne den Taktgeber zu kennen

   Die Ansichtsmodule binden Knöpfe, und ein Klick muss den ganzen Lauf neu
   zeichnen. Importierten sie dafür `render` aus render.js, zeigte jede Ansicht
   auf den Taktgeber zurück, der sie selbst importiert — genau der Ladezyklus,
   den der Umbau auflösen sollte. Stattdessen trägt der Taktgeber sich hier ein.
   ============================================================ */
let handler = null;

/** Der Taktgeber meldet sich einmal beim Laden an. */
const onRefresh = (fn) => {
  handler = fn;
};

/** „Etwas hat sich geändert." Vor der Anmeldung ein No-op — dann steht ohnehin
 *  noch kein Bild, das aufzufrischen wäre. */
const refresh = () => {
  if (handler) handler();
};

export { onRefresh, refresh };
