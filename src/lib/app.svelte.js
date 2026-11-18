// State and helpers shared by every page. Personal data lives in `app.state` (localStorage, saved by the layout);
// household changes go through `mutate`, which queues an op and syncs with the server (see household.js).
import { load, status, windowOf, stepOf, cfg, dayKey, choreKey, GENERAL } from "../logic.js";
import { applyOp } from "../household.js";
import { merge, personal } from "../personal.js";

const read = (key, fallback) => {
  try {
    return { ...fallback, ...JSON.parse(localStorage.getItem(key)) };
  } catch {
    return fallback;
  }
};
const THEMES = ["system", "light", "dark"];
let theme = "system";
try {
  if (THEMES.includes(localStorage.getItem("routines-theme"))) theme = localStorage.getItem("routines-theme");
} catch {}

class App {
  state = $state(load());
  now = $state(new Date());
  today = $derived(dayKey(this.now));
  banner = $state("");
  hh = $state(read("routines-household", { code: "", name: "" })); // own key: the code stays out of the JSON backup
  syncState = $state(""); // ok | offline | denied | nocode | error
  // Personal sync key (32 hex chars), made on the first device; Gerät verbinden carries it to the others. Own key, not in the backup.
  meKey = $state(read("routines-me", { key: "" }).key);
  meState = $state(""); // same values as syncState
  day = $state(null); // day picked in the Heute strip (null = today)
  perm = $state(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  theme = $state(theme);
  newOpen = $state(false); // the "+" sheet
  filter = $state("all"); // Heute: all | me | home
  listTab = $state("me"); // Listen: me | home
  tdraft = $state(null); // task being edited; survives a trip to /areas and back
  importDraft = null; // routine from a share link, picked up by /routine/new
  footer = $state(null); // snippet a page shows above the tab bar (the routine editor's add-step bar)

  sorted = $derived(
    [...this.state.routines].sort((first, second) => cfg(first, this.today).time.localeCompare(cfg(second, this.today).time)),
  );
}
export const app = new App();

export const stOf = (routine) => status(app.state, routine, app.now);

// --- Household sync. Every change is an op: applied here at once, queued in state.outbox (persisted, so it
// survives being away from home), sent on the next sync. ---
export function mutate(op) {
  applyOp(app.state, op);
  app.state.outbox.push(op);
  sync();
}
let syncing = false,
  again = false;
export async function sync() {
  const state = app.state;
  if (!app.hh.code) return (app.syncState = "nocode");
  if (syncing) return (again = true);
  syncing = true;
  const sent = $state.snapshot(state.outbox);
  // A device that never synced uploads its old local tasks once; the server ignores it if it already has tasks.
  const ops =
    !state.synced && state.tasks.length
      ? [{ t: "seed", tasks: $state.snapshot(state.tasks), areas: $state.snapshot(state.areas) }, ...sent]
      : sent;
  try {
    const res = await fetch("/api/household", {
      method: ops.length ? "POST" : "GET",
      headers: { "x-household-code": app.hh.code, "content-type": "application/json" },
      body: ops.length ? JSON.stringify({ ops }) : undefined,
    });
    if (res.status === 401) app.syncState = "denied";
    else if (res.status === 400) {
      state.outbox = state.outbox.slice(sent.length); // a malformed op would block the queue forever
      app.syncState = "error";
    } else if (!res.ok) throw new Error();
    else {
      const household = await res.json();
      state.outbox = state.outbox.slice(sent.length);
      for (const op of state.outbox) applyOp(household, $state.snapshot(op)); // changes made while the request was in flight
      Object.assign(state, { tasks: household.tasks, areas: household.areas, chores: household.chores, synced: true });
      app.syncState = "ok";
    }
  } catch {
    app.syncState = "offline";
  } finally {
    syncing = false;
    if (again) ((again = false), sync());
  }
}

// --- Personal sync: send the whole personal state when it changed, merge the answer into the current state
// (not over it, so edits made while the request was in flight survive). See personal.js. ---
let meBusy = false,
  meAgain = false,
  lastSent = "";
export const newKey = () => [...crypto.getRandomValues(new Uint8Array(16))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
export function setMeKey(key) {
  app.meKey = key;
  lastSent = ""; // a new key means a new server copy: upload everything once
  try {
    localStorage.setItem("routines-me", JSON.stringify({ key }));
  } catch {}
}
export async function syncMe() {
  const state = app.state;
  if (!app.hh.code) return (app.meState = "nocode");
  if (!app.meKey) setMeKey(newKey());
  if (meBusy) return (meAgain = true);
  meBusy = true;
  const mine = JSON.stringify(personal($state.snapshot(state)));
  try {
    const res = await fetch("/api/me", {
      method: mine === lastSent ? "GET" : "POST",
      headers: { "x-household-code": app.hh.code, "x-sync-key": app.meKey, "content-type": "application/json" },
      body: mine === lastSent ? undefined : mine,
    });
    if (res.status === 401) app.meState = "denied";
    else if (res.status === 400) app.meState = "error";
    else if (!res.ok) throw new Error();
    else {
      const merged = merge(personal($state.snapshot(state)), await res.json());
      const next = JSON.stringify(merged);
      if (next !== JSON.stringify(personal($state.snapshot(state)))) Object.assign(state, merged);
      lastSent = next; // now equal to the server copy
      app.meState = "ok";
    }
  } catch {
    app.meState = "offline";
  } finally {
    meBusy = false;
    if (meAgain) ((meAgain = false), syncMe());
  }
}
// Deleting keeps a tombstone so the routine is not brought back by another device. Its log (points) stays.
export function deleteRoutine(routine) {
  app.state.routines = app.state.routines.filter((other) => other.id !== routine.id);
  app.state.gone[routine.id] = new Date().toISOString();
  delete app.state.progress[routine.id];
}

// --- Household helpers ---
export const areaOf = (name) =>
  app.state.areas.find((area) => area.name === name) ?? app.state.areas.find((area) => area.name === GENERAL) ?? { name, color: "#7A7A75" };
// Pale tint that works in both themes (custom areas only store one colour).
export const pale = (color) => `color-mix(in srgb, ${color} 16%, var(--card))`;
export const DAYS = [
  ["Mo", "Montag"],
  ["Di", "Dienstag"],
  ["Mi", "Mittwoch"],
  ["Do", "Donnerstag"],
  ["Fr", "Freitag"],
  ["Sa", "Samstag"],
  ["So", "Sonntag"],
];
export const DAY_ADV = ["montags", "dienstags", "mittwochs", "donnerstags", "freitags", "samstags", "sonntags"];
export function rhythm(task) {
  const d0 = task.days?.[0] ?? 5;
  if (task.mode === "day") return "Täglich";
  if (task.mode === "interval") return `Alle ${task.every} Wo., ${DAY_ADV[d0]}`;
  if (task.mode === "month") return `1. ${DAYS[d0][0]} im Monat`;
  const ds = [...(task.days ?? [])].sort();
  return ds.length === 7 ? "Täglich" : ds.length === 1 ? `Jeden ${DAYS[ds[0]][0]}` : ds.map((weekday) => DAYS[weekday][0]).join(", ");
}
export const isDone = (task, day = app.today) => !!app.state.chores[choreKey(task.id, day)];

// --- Formatting ---
const pad = (number) => String(number).padStart(2, "0");
export const mmss = (ms) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(seconds / 60)}:${pad(seconds % 60)}`;
};
export const until = (date) => {
  const minutes = Math.ceil((date - app.now) / 60000);
  return minutes < 60 ? `in ${minutes} Min.` : `in ${Math.round(minutes / 60)} Std.`;
};
export const fmtOffset = (offset) => (offset == null ? "" : `${offset >= 0 ? "+" : ""}${offset} Min.`);
export const signed = (number) => (number > 0 ? `+${number}` : `${number}`);
export const summary = (steps) => {
  const optional = steps.filter((step) => step.optional).length;
  return `${steps.length} Schritt${steps.length === 1 ? "" : "e"}${optional ? `, ${optional} optional` : ""}`;
};
export const ST = {
  new: "ab morgen",
  upcoming: "geplant",
  open: "offen",
  overdue: "überfällig",
  done: "erledigt",
  late: "zu spät erledigt",
  missed: "verpasst",
  partial: "teilweise",
};
export function meta(routine) {
  const st = stOf(routine),
    win = windowOf(routine, app.today);
  if (st === "open")
    return `Jetzt offen · noch ${mmss(win.close - app.now)} Min.${stepOf(app.state, routine, app.now) ? ` · Schritt ${stepOf(app.state, routine, app.now) + 1}` : ""}`;
  if (st === "overdue") return `Überfällig · heute noch abhaken, ohne Punkte`;
  if (st === "new") return `${cfg(routine, app.today).time} · startet morgen`;
  if (st !== "upcoming") return `${cfg(routine, app.today).time} · ${ST[st]}`;
  return `${cfg(routine, app.today).time} · ${summary(routine.steps)} · ${until(win.open)}`;
}
// Chrome desktop only opens the time picker from its tiny icon; open it on any click. iOS opens it natively.
export const pick = (event) => {
  try {
    event.currentTarget.showPicker();
  } catch {}
};
export function download(blob, name) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

// Shared Lucide icon props (design: thin strokes) and class strings, so the markup stays close to the design.
export const ic = { size: 20, strokeWidth: 1.75, "aria-hidden": "true" };
export const sectionLabel = "mx-2 text-[13px] font-semibold text-muted-foreground";
export const listCard = "gap-0 overflow-hidden rounded-xl py-0 shadow-none ring-border";
export const row = "flex min-h-13 items-center gap-3 border-b border-divider px-4 last:border-b-0";
export const field = "h-13 rounded-xl bg-card px-4 text-[17px] font-medium shadow-none dark:bg-card";
