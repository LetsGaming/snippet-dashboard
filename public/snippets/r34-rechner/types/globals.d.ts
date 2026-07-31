/* Was der Rechner absichtlich am Fenster ablegt.
   Ohne diese Datei meldet die Prüfung jede dieser Zeilen als Tippfehler — und sie
   dokumentiert zugleich, was von außen erreichbar ist. */
interface Window {
  /** Vollständige Layout-Messung in der Konsole (siehe selfcheck.js). */
  r34diagnose?: () => unknown;
  /** Layout-Prüfung von Hand auslösen. */
  r34audit?: () => unknown;
  /** Zugriff für den Oberflächentest (siehe testhooks.js). */
  __testHooks?: Record<string, unknown>;
  /** Schlüssel-Wert-Speicher der Snippet-Umgebung; fehlt im Browser. */
  storage?: {
    get(key: string): Promise<{ value: string } | null>;
    set(key: string, value: string): Promise<unknown>;
  };
}
