/* ============================================================
   Belege — reiner Datenhalter ohne Abhängigkeiten

   Steht bewusst allein: sowohl der Katalog (für Spaltenbeschreibungen) als auch
   der Zustand greifen darauf zu. Läge es in einem der beiden, entstünde ein
   Ladezyklus.
   ============================================================ */
const ledgers = { price: [], insR34: [], insDaily: [], actual: [] };
const doneTasks = {}; // Aufgaben-Kennung → ISO-Datum der Erledigung

export { ledgers, doneTasks };
