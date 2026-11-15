// Pure state logic. State shape: { routines, log, progress, tasks, areas, chores }.
// Score is never stored separately: it's the sum of log points, so deleting a routine can't touch it.

export const KEY = "routines-v1";

const pad = (n) => String(n).padStart(2, "0");
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const hm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, d.getHours(), d.getMinutes(), d.getSeconds());
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const toMin = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
// Date() normalises minute overflow, so windows crossing midnight still get correct timestamps.
// ponytail: a window crossing midnight belongs to its target day; at 00:01 yesterday's 23:58 window isn't shown as open.
const at = (day, min) => {
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(y, mo - 1, d, 0, min);
};

// Household: tasks (no points, no windows) grouped by area, shared via the server (see household.js).
// `chores` holds completions as { "<taskId>@<day>": "<who>" | true }. The local copy is a cache plus an outbox of unsent ops.
import { blankHousehold } from "./household.js";
export { GENERAL } from "./household.js";
export const AREA_COLORS = [
  ["#F08A3E", "Orange"],
  ["#2E9CCA", "Blau"],
  ["#3FA066", "Grün"],
  ["#1F9E8F", "Petrol"],
  ["#8B6AD6", "Violett"],
  ["#E3B21C", "Gelb"],
  ["#D9467A", "Pink"],
  ["#7A7A75", "Grau"],
];
const blank = () => ({ routines: [], log: [], progress: {}, ...blankHousehold(), outbox: [], synced: false });

// Weekday index with Monday = 0 (getDay() has Sunday = 0).
const wday = (day) => (at(day, 0).getDay() + 6) % 7;
// Recurrence modes: day | week (on `days`) | interval (every `every` weeks on days[0], counted from the week of `anchor`) | month (first days[0] of the month).
export function dueOn(t, day) {
  if (t.mode === "day") return true;
  const w = wday(day),
    d0 = t.days?.[0] ?? 5;
  if (t.mode === "week") return !!t.days?.includes(w);
  if (t.mode === "month") return w === d0 && at(day, 0).getDate() <= 7;
  if (t.mode === "interval") {
    if (w !== d0 || day < t.anchor) return false;
    const weeks = Math.round((at(day, 0) - at(t.anchor, 0) + (wday(t.anchor) - w) * 864e5) / 6048e5);
    return weeks % (t.every || 2) === 0;
  }
  return false;
}
// First due day after `day` (null if none within a year).
export function nextDue(t, day) {
  for (let i = 1; i <= 366; i++) {
    const k = dayKey(addDays(at(day, 0), i));
    if (dueOn(t, k)) return k;
  }
  return null;
}
export const choreKey = (id, day) => `${id}@${day}`;

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(s?.routines) && Array.isArray(s?.log)) return { ...blank(), ...s };
  } catch {}
  return blank();
}

export function save(s) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

// Time/tolerance edits are stored as `pending` and only apply from `pending.from` (tomorrow).
export const cfg = (r, day) => (r.pending && day >= r.pending.from ? r.pending : r);

export function windowOf(r, day) {
  const c = cfg(r, day),
    t = toMin(c.time);
  return { open: at(day, t - c.tolerance), close: at(day, t + c.tolerance), target: at(day, t) };
}

// Step timing (guidance only, never scored): a step starts at its fixed `at`, else when the previous one ends.
const dur = (x) => x.min ?? 2;
export function schedule(r, day) {
  let t = toMin(cfg(r, day).time);
  return r.steps.map((x) => {
    const start = x.at ? toMin(x.at) : t;
    t = start + dur(x);
    return { start: at(day, start), end: at(day, t) };
  });
}

export const entry = (s, id, day) => s.log.find((e) => e.routineId === id && e.day === day);
// Running total, floored at 0 after every entry: penalties can take you down to 0, never below,
// and a miss at 0 leaves no hidden debt. Entries are folded in time order (penalties for past days get logged late).
export function score(s, upTo = "9999-99-99") {
  return s.log
    .filter((e) => e.day <= upTo)
    .sort((a, b) => a.day.localeCompare(b.day) || String(a.at).localeCompare(String(b.at)))
    .reduce((t, e) => Math.max(0, t + e.points), 0);
}

export function status(s, r, now) {
  const day = dayKey(now),
    e = entry(s, r.id, day);
  if (e) return e.status;
  const w = windowOf(r, day);
  if (now < w.open || w.close <= new Date(r.created)) return "upcoming";
  return now <= w.close ? "open" : "missed";
}

// Locked while open or after a miss today, so penalties can't be dodged.
export const canEdit = (s, r, now) => !["open", "missed", "partial"].includes(status(s, r, now));

export const stepOf = (s, r, now) => (s.progress[r.id]?.day === dayKey(now) ? s.progress[r.id].step : 0);

function streak(s, id, day) {
  let n = 0,
    d = at(day, 0);
  while (entry(s, id, dayKey((d = addDays(d, -1))))?.status === "done") n++;
  return n;
}

// True when every step from `step` on is optional, i.e. the routine counts as finished.
export const onlyOptionalLeft = (r, step) => r.steps.slice(step).every((x) => x.optional);

function logDone(s, r, day, t) {
  delete s.progress[r.id];
  const diff = t - windowOf(r, day).target;
  const e = {
    routineId: r.id,
    name: r.name,
    day,
    status: "done",
    at: t.toISOString(),
    offset: Math.round(diff / 60000),
    points: 10 + (Math.abs(diff) <= 60000 ? 2 : 0) + Math.min(streak(s, r.id, day), 10),
  };
  s.log.push(e);
  return e;
}

// Mark one step done (or skipped, if optional). Returns the log entry when the routine is finished, else null.
// `finish` ends it early; only allowed once nothing required is left.
export function advance(s, r, now, finish = false) {
  if (status(s, r, now) !== "open") return null;
  const day = dayKey(now),
    step = stepOf(s, r, now) + (finish ? 0 : 1);
  if (finish ? !onlyOptionalLeft(r, step) : step < r.steps.length) {
    if (!finish) s.progress[r.id] = { day, step, at: now.toISOString() };
    return null;
  }
  return logDone(s, r, day, now);
}

// Penalise every closed, unlogged window in the last 7 days, then promote pending time changes.
export function evaluate(s, now) {
  for (const r of s.routines) {
    for (let i = 7; i >= 0; i--) {
      const day = dayKey(addDays(now, -i)),
        w = windowOf(r, day);
      if (w.close >= now || w.close <= new Date(r.created) || entry(s, r.id, day)) continue;
      const step = s.progress[r.id]?.day === day ? s.progress[r.id].step : 0;
      // All required steps done, only optional ones left: counts as done at the last step's time.
      if (step > 0 && onlyOptionalLeft(r, step)) {
        logDone(s, r, day, new Date(s.progress[r.id].at ?? w.close));
        continue;
      }
      const partial = step > 0;
      s.log.push({
        routineId: r.id,
        name: r.name,
        day,
        status: partial ? "partial" : "missed",
        at: w.close.toISOString(),
        offset: null,
        points: partial ? -10 : -20,
      });
    }
    if (r.pending && dayKey(now) >= r.pending.from) {
      Object.assign(r, { time: r.pending.time, tolerance: r.pending.tolerance });
      delete r.pending;
    }
  }
}

export function saveRoutine(s, d, now) {
  const tolerance = Math.max(0, Math.round(d.tolerance ?? 5));
  const r = s.routines.find((x) => x.id === d.id);
  if (!r) {
    s.routines.push({
      id: uid(),
      name: d.name,
      time: d.time,
      tolerance,
      steps: d.steps,
      autoStart: !!d.autoStart,
      created: now.toISOString(),
    });
    return;
  }
  r.name = d.name;
  r.steps = d.steps;
  r.autoStart = !!d.autoStart;
  delete s.progress[r.id];
  // Still being set up today: no window has counted yet, so apply directly.
  if (dayKey(new Date(r.created)) === dayKey(now)) (Object.assign(r, { time: d.time, tolerance }), delete r.pending);
  else if (d.time === r.time && tolerance === r.tolerance) delete r.pending;
  else r.pending = { time: d.time, tolerance, from: dayKey(addDays(now, 1)) };
}

// Share a routine by link: deflate-raw JSON as base64url. Photo refs are dropped (too big); the importer re-takes them.
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export async function shareCode(r) {
  const c = r.pending ?? r;
  const json = JSON.stringify({
    name: r.name,
    time: c.time,
    tolerance: c.tolerance,
    autoStart: !!r.autoStart,
    steps: r.steps.map((x) => ({
      text: x.text,
      type: x.type ?? "tap",
      optional: !!x.optional,
      min: dur(x),
      ...(x.at ? { at: x.at } : {}),
    })),
  });
  const b = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function parseShare(code) {
  const bin = atob(String(code).replace(/-/g, "+").replace(/_/g, "/"));
  const d = JSON.parse(
    new TextDecoder().decode(
      await pipe(
        Uint8Array.from(bin, (ch) => ch.charCodeAt(0)),
        new DecompressionStream("deflate-raw"),
      ),
    ),
  );
  const str = (v, n) => typeof v === "string" && v.length <= n;
  const HM = /^([01]\d|2[0-3]):[0-5]\d$/,
    min = (x) => x.min ?? 2;
  const ok =
    d &&
    str(d.name, 80) &&
    HM.test(d.time) &&
    typeof d.autoStart === "boolean" &&
    Number.isInteger(d.tolerance) &&
    d.tolerance >= 0 &&
    d.tolerance <= 120 &&
    Array.isArray(d.steps) &&
    d.steps.length >= 1 &&
    d.steps.length <= 50 &&
    d.steps.every(
      (x) =>
        x &&
        str(x.text, 120) &&
        ["tap", "photo"].includes(x.type) &&
        typeof x.optional === "boolean" &&
        (x.at === undefined || (typeof x.at === "string" && HM.test(x.at))) &&
        Number.isInteger(min(x)) &&
        min(x) >= 0 &&
        min(x) <= 240,
    );
  if (!ok) throw new Error("Invalid share code");
  return {
    name: d.name,
    time: d.time,
    tolerance: d.tolerance,
    autoStart: d.autoStart,
    steps: d.steps.map((x) => ({
      id: uid(),
      text: x.text,
      type: x.type,
      optional: x.optional,
      min: min(x),
      ...(x.at ? { at: x.at } : {}),
      ref: null,
    })),
  };
}
