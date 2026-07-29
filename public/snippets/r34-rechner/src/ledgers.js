/* ============================================================
   Belege — reiner Datenhalter ohne Abhängigkeiten

   Steht bewusst allein: sowohl der Katalog (für Spaltenbeschreibungen) als auch
   der Zustand greifen darauf zu. Läge es in einem der beiden, entstünde ein
   Ladezyklus.
   ============================================================ */
const ledgers = {
  price: [],
  insR34: [],
  insDaily: [],
  actual: [],
  /* Bekannte künftige Nettobeträge mit ihrem Startmonat. Eine Liste, weil ein
     einzelner Sprung die Wirklichkeit nicht trifft: Ausbildungsjahre, Tarifstufen
     und ein Jobwechsel in vier Monaten sind alle gleichzeitig planbar. */
  income: [],
  /* Gelernte Zuordnungen aus dem Kontoauszug: Textmuster → Kategorie. Nur die Regel
     wird gespeichert, nie die Buchung, aus der sie entstanden ist. */
  rules: [],
  /* Welche Zeiträume schon eingelesen wurden. Nicht die Buchungen — nur Konto, von,
     bis und wann. Sonst wird derselbe Auszug beim dritten Mal wie eine Neuigkeit
     behandelt und bietet zum dritten Mal an, dieselbe Zahl zu setzen. */
  imports: [],
};
const doneTasks = {}; // Aufgaben-Kennung → ISO-Datum der Erledigung

export { ledgers, doneTasks };
