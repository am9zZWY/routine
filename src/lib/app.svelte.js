// State and helpers shared by every page. Personal data lives in `app.s` (localStorage, saved by the layout);
// household changes go through `mutate`, which queues an op and syncs with the server (see household.js).
import { load, status, windowOf, stepOf, cfg, dayKey, choreKey, GENERAL } from "../logic.js";
import { applyOp } from "../household.js";

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
  s = $state(load());
  now = $state(new Date());
  today = $derived(dayKey(this.now));
  banner = $state("");
  hh = $state(read("routines-household", { code: "", name: "" })); // own key: the code stays out of the JSON backup
  syncState = $state(""); // ok | offline | denied | nocode | error
  perm = $state(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  theme = $state(theme);
  newOpen = $state(false); // the "+" sheet
  filter = $state("all"); // Heute: all | me | home
  listTab = $state("me"); // Listen: me | home
  tdraft = $state(null); // task being edited; survives a trip to /areas and back
  importDraft = null; // routine from a share link, picked up by /routine/new
  footer = $state(null); // snippet a page shows above the tab bar (the routine editor's add-step bar)

  sorted = $derived([...this.s.routines].sort((a, b) => cfg(a, this.today).time.localeCompare(cfg(b, this.today).time)));
}
export const app = new App();

export const stOf = (r) => status(app.s, r, app.now);

// --- Household sync. Every change is an op: applied here at once, queued in s.outbox (persisted, so it
// survives being away from home), sent on the next sync. ---
export function mutate(op) {
  applyOp(app.s, op);
  app.s.outbox.push(op);
  sync();
}
let syncing = false,
  again = false;
export async function sync() {
  const s = app.s;
  if (!app.hh.code) return (app.syncState = "nocode");
  if (syncing) return (again = true);
  syncing = true;
  const sent = $state.snapshot(s.outbox);
  // A device that never synced uploads its old local tasks once; the server ignores it if it already has tasks.
  const ops =
    !s.synced && s.tasks.length ? [{ t: "seed", tasks: $state.snapshot(s.tasks), areas: $state.snapshot(s.areas) }, ...sent] : sent;
  try {
    const res = await fetch("/api/household", {
      method: ops.length ? "POST" : "GET",
      headers: { "x-household-code": app.hh.code, "content-type": "application/json" },
      body: ops.length ? JSON.stringify({ ops }) : undefined,
    });
    if (res.status === 401) app.syncState = "denied";
    else if (res.status === 400) {
      s.outbox = s.outbox.slice(sent.length); // a malformed op would block the queue forever
      app.syncState = "error";
    } else if (!res.ok) throw new Error();
    else {
      const h = await res.json();
      s.outbox = s.outbox.slice(sent.length);
      for (const op of s.outbox) applyOp(h, $state.snapshot(op)); // changes made while the request was in flight
      Object.assign(s, { tasks: h.tasks, areas: h.areas, chores: h.chores, synced: true });
      app.syncState = "ok";
    }
  } catch {
    app.syncState = "offline";
  } finally {
    syncing = false;
    if (again) ((again = false), sync());
  }
}

// --- Household helpers ---
export const areaOf = (name) =>
  app.s.areas.find((a) => a.name === name) ?? app.s.areas.find((a) => a.name === GENERAL) ?? { name, color: "#7A7A75" };
// Pale tint that works in both themes (custom areas only store one colour).
export const pale = (c) => `color-mix(in srgb, ${c} 16%, var(--card))`;
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
export function rhythm(t) {
  const d0 = t.days?.[0] ?? 5;
  if (t.mode === "day") return "Täglich";
  if (t.mode === "interval") return `Alle ${t.every} Wo., ${DAY_ADV[d0]}`;
  if (t.mode === "month") return `1. ${DAYS[d0][0]} im Monat`;
  const ds = [...(t.days ?? [])].sort();
  return ds.length === 7 ? "Täglich" : ds.length === 1 ? `Jeden ${DAYS[ds[0]][0]}` : ds.map((i) => DAYS[i][0]).join(", ");
}
export const isDone = (t, day = app.today) => !!app.s.chores[choreKey(t.id, day)];

// --- Formatting ---
const pad = (n) => String(n).padStart(2, "0");
export const mmss = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${pad(t % 60)}`;
};
export const until = (d) => {
  const m = Math.ceil((d - app.now) / 60000);
  return m < 60 ? `in ${m} Min.` : `in ${Math.round(m / 60)} Std.`;
};
export const fmtOffset = (o) => (o == null ? "" : `${o >= 0 ? "+" : ""}${o} Min.`);
export const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
export const summary = (steps) => {
  const o = steps.filter((x) => x.optional).length;
  return `${steps.length} Schritt${steps.length === 1 ? "" : "e"}${o ? `, ${o} optional` : ""}`;
};
export const ST = { upcoming: "geplant", open: "offen", done: "erledigt", missed: "verpasst", partial: "teilweise" };
export function meta(r) {
  const st = stOf(r),
    w = windowOf(r, app.today);
  if (st === "open")
    return `Jetzt offen · noch ${mmss(w.close - app.now)} Min.${stepOf(app.s, r, app.now) ? ` · Schritt ${stepOf(app.s, r, app.now) + 1}` : ""}`;
  return `${cfg(r, app.today).time} · ${summary(r.steps)} · ${until(w.open)}`;
}
// Chrome desktop only opens the time picker from its tiny icon; open it on any click. iOS opens it natively.
export const pick = (e) => {
  try {
    e.currentTarget.showPicker();
  } catch {}
};
export function download(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Shared Lucide icon props (design: thin strokes) and class strings, so the markup stays close to the design.
export const ic = { size: 20, strokeWidth: 1.75, "aria-hidden": "true" };
export const sectionLabel = "mx-2 text-[13px] font-semibold text-muted-foreground";
export const listCard = "gap-0 overflow-hidden rounded-xl py-0 shadow-none ring-border";
export const row = "flex min-h-13 items-center gap-3 border-b border-divider px-4 last:border-b-0";
export const field = "h-13 rounded-xl bg-card px-4 text-[17px] font-medium shadow-none dark:bg-card";
