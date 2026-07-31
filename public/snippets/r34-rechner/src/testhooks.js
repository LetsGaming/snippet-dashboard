import { state, prov, runtime, initState } from "./state.js";
import { ledgers, doneTasks } from "./ledgers.js";
import { ALLFIELDS, STEER, GROUPS, LEDGERS } from "./catalog.js";
import { seasonMonths } from "./state.js";
import { planSnapshot, applySnapshot } from "./snapshot.js";
import { openTasks, TASKS } from "./tasks.js";
import { HELP } from "./help.js";
import { BODIES } from "./config.js";
import {
  measureControls,
  findCollapsed,
  hasLayoutEngine,
  auditLayout,
} from "./selfcheck.js";

/* Nur für Tests: ein Bündel der Bindings, die von außen geprüft werden.
   Im Produktivbetrieb kostet das ein Objekt und sonst nichts. */
window.__testHooks = {
  state,
  prov,
  runtime,
  ledgers,
  doneTasks,
  ALLFIELDS,
  STEER,
  GROUPS,
  LEDGERS,
  TASKS,
  HELP,
  BODIES,
  seasonMonths,
  planSnapshot,
  applySnapshot,
  openTasks,
  initState,
  measureControls,
  findCollapsed,
  hasLayoutEngine,
  auditLayout,
};
