// Pure state logic. State shape: { routines, log, progress, tasks, areas, chores }.
// Score is never stored separately: it's the sum of log points, so deleting a routine can't touch it.

export const KEY = "routines-v1";

const pad = (number) => String(number).padStart(2, "0");
export const dayKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const hm = (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
export const addDays = (date, days) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds());
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const toMin = (time) => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};
// Date() normalises minute overflow, so windows crossing midnight still get correct timestamps.
// ponytail: a window crossing midnight belongs to its target day; at 00:01 yesterday's 23:58 window isn't shown as open.
const at = (day, min) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date, 0, min);
};

// Household: tasks (no points, no windows) grouped by area, shared via the server (see household.js).
// `chores` holds completions as { "<taskId>@<day>": "<who>" | true }. The local copy is a cache plus an outbox of unsent ops.
import { blankHousehold, COLOR } from "./household.js";
import { ICONS } from "./personal.js";
export { GENERAL } from "./household.js";
export { ICONS } from "./personal.js";
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
const COLORS = AREA_COLORS.map(([color]) => color);
const blank = () => ({ routines: [], log: [], progress: {}, gone: {}, ...blankHousehold(), outbox: [], synced: false });

// Weekday index with Monday = 0 (getDay() has Sunday = 0).
const wday = (day) => (at(day, 0).getDay() + 6) % 7;
// Recurrence modes: day | week (on `days`) | interval (every `every` weeks on days[0], counted from the week of `anchor`) | month (first days[0] of the month).
export function dueOn(task, day) {
  if (task.mode === "day") return true;
  const weekday = wday(day),
    d0 = task.days?.[0] ?? 5;
  if (task.mode === "week") return !!task.days?.includes(weekday);
  if (task.mode === "month") return weekday === d0 && at(day, 0).getDate() <= 7;
  if (task.mode === "interval") {
    if (weekday !== d0 || day < task.anchor) return false;
    const weeks = Math.round((at(day, 0) - at(task.anchor, 0) + (wday(task.anchor) - weekday) * 864e5) / 6048e5);
    return weeks % (task.every || 2) === 0;
  }
  return false;
}
// First due day after `day` (null if none within a year).
export function nextDue(task, day) {
  for (let daysAhead = 1; daysAhead <= 366; daysAhead++) {
    const candidate = dayKey(addDays(at(day, 0), daysAhead));
    if (dueOn(task, candidate)) return candidate;
  }
  return null;
}
export const choreKey = (id, day) => `${id}@${day}`;

export function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    if (Array.isArray(stored?.routines) && Array.isArray(stored?.log)) return { ...blank(), ...stored };
  } catch {}
  return blank();
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// Time/tolerance edits are stored as `pending` and only apply from `pending.from` (tomorrow).
export const cfg = (routine, day) => (routine.pending && day >= routine.pending.from ? routine.pending : routine);

export function windowOf(routine, day) {
  const config = cfg(routine, day),
    targetMin = toMin(config.time);
  return { open: at(day, targetMin - config.tolerance), close: at(day, targetMin + config.tolerance), target: at(day, targetMin) };
}

// Length in minutes from the start time to the end of the last step (for the timeline).
export const span = (routine, day) => {
  const sc = schedule(routine, day);
  return sc.length ? Math.max(0, Math.round((sc.at(-1).end - windowOf(routine, day).target) / 60000)) : 0;
};

// Step timing (guidance only, never scored): a step starts at its fixed `at`, else when the previous one ends.
const dur = (step) => step.min ?? 2;
export function schedule(routine, day) {
  let minute = toMin(cfg(routine, day).time);
  return routine.steps.map((step) => {
    const start = step.at ? toMin(step.at) : minute;
    minute = start + dur(step);
    return { start: at(day, start), end: at(day, minute) };
  });
}

export const entry = (state, id, day) => state.log.find((logEntry) => logEntry.routineId === id && logEntry.day === day);
// Running total, floored at 0 after every entry: penalties can take you down to 0, never below,
// and a miss at 0 leaves no hidden debt. Entries are folded in time order (penalties for past days get logged late).
export function score(state, upTo = "9999-99-99") {
  return state.log
    .filter((logEntry) => logEntry.day <= upTo)
    .sort((first, second) => first.day.localeCompare(second.day) || String(first.at).localeCompare(String(second.at)))
    .reduce((total, logEntry) => Math.max(0, total + logEntry.points), 0);
}

// A routine counts from the first window that closes after it was created.
export const startsOn = (routine, day) => windowOf(routine, day).close > new Date(routine.created);

// Live status for today: new (starts tomorrow) | upcoming | open | overdue (window closed, still tickable today, 0 points)
// or the logged status: done | late (ticked after the window) | partial | missed.
export function status(state, routine, now) {
  const day = dayKey(now),
    logEntry = entry(state, routine.id, day);
  if (logEntry) return logEntry.status;
  const win = windowOf(routine, day);
  if (!startsOn(routine, day)) return "new";
  if (now < win.open) return "upcoming";
  return now <= win.close ? "open" : "overdue";
}
export const tickable = (st) => st === "open" || st === "overdue";

// Locked while open or overdue and after a miss, so penalties can't be dodged.
export const canEdit = (state, routine, now) => !["open", "overdue", "missed", "partial"].includes(status(state, routine, now));

export const stepOf = (state, routine, now) => (state.progress[routine.id]?.day === dayKey(now) ? state.progress[routine.id].step : 0);

function streak(state, id, day) {
  let count = 0,
    date = at(day, 0);
  // Late ticks earn nothing but keep the streak alive.
  while (["done", "late"].includes(entry(state, id, dayKey((date = addDays(date, -1))))?.status)) count++;
  return count;
}

// True when every step from `step` on is optional, i.e. the routine counts as finished.
export const onlyOptionalLeft = (routine, step) => routine.steps.slice(step).every((laterStep) => laterStep.optional);

function logDone(state, routine, day, doneAt) {
  delete state.progress[routine.id];
  const win = windowOf(routine, day),
    diff = doneAt - win.target,
    late = doneAt > win.close;
  const logEntry = {
    routineId: routine.id,
    name: routine.name,
    day,
    status: late ? "late" : "done",
    at: doneAt.toISOString(),
    offset: Math.round(diff / 60000),
    points: late ? 0 : 10 + (Math.abs(diff) <= 60000 ? 2 : 0) + Math.min(streak(state, routine.id, day), 10),
  };
  state.log.push(logEntry);
  return logEntry;
}

// Mark one step done (or skipped, if optional). Returns the log entry when the routine is finished, else null.
// `finish` ends it early; only allowed once nothing required is left.
export function advance(state, routine, now, finish = false) {
  if (!tickable(status(state, routine, now))) return null;
  const day = dayKey(now),
    step = stepOf(state, routine, now) + (finish ? 0 : 1);
  if (finish ? !onlyOptionalLeft(routine, step) : step < routine.steps.length) {
    if (!finish) state.progress[routine.id] = { day, step, at: now.toISOString() };
    return null;
  }
  return logDone(state, routine, day, now);
}

// Tick a whole routine at once (the circle on Heute). Not when a required photo step is left: that needs the run screen.
export function complete(state, routine, now) {
  if (!tickable(status(state, routine, now))) return null;
  if (routine.steps.slice(stepOf(state, routine, now)).some((step) => step.type === "photo" && !step.optional)) return null;
  return logDone(state, routine, dayKey(now), now);
}

// Penalise unlogged windows of the last 7 days once their day is over (until midnight they can still be
// ticked late, for 0 points), then promote pending time changes.
export function evaluate(state, now) {
  for (const routine of state.routines) {
    for (let daysBack = 7; daysBack >= 0; daysBack--) {
      const day = dayKey(addDays(now, -daysBack)),
        win = windowOf(routine, day);
      if (win.close >= now || !startsOn(routine, day) || entry(state, routine.id, day)) continue;
      const step = state.progress[routine.id]?.day === day ? state.progress[routine.id].step : 0;
      // All required steps done, only optional ones left: counts as done at the last step's time.
      if (step > 0 && onlyOptionalLeft(routine, step)) {
        logDone(state, routine, day, new Date(state.progress[routine.id].at ?? win.close));
        continue;
      }
      if (daysBack === 0) continue; // today: still tickable
      const partial = step > 0;
      state.log.push({
        routineId: routine.id,
        name: routine.name,
        day,
        status: partial ? "partial" : "missed",
        at: win.close.toISOString(),
        offset: null,
        points: partial ? -10 : -20,
      });
    }
    if (routine.pending && dayKey(now) >= routine.pending.from) {
      Object.assign(routine, { time: routine.pending.time, tolerance: routine.pending.tolerance });
      delete routine.pending;
    }
  }
}

export function saveRoutine(state, draft, now) {
  const tolerance = Math.max(0, Math.round(draft.tolerance ?? 5));
  const routine = state.routines.find((other) => other.id === draft.id);
  if (!routine) {
    state.routines.push({
      id: uid(),
      name: draft.name,
      time: draft.time,
      tolerance,
      steps: draft.steps,
      autoStart: !!draft.autoStart,
      color: draft.color ?? COLORS[0],
      icon: draft.icon ?? ICONS[0],
      created: now.toISOString(),
      updated: now.toISOString(),
    });
    return;
  }
  Object.assign(routine, {
    name: draft.name,
    steps: draft.steps,
    autoStart: !!draft.autoStart,
    color: draft.color,
    icon: draft.icon,
    updated: now.toISOString(),
  });
  delete state.progress[routine.id];
  // Still being set up today: no window has counted yet, so apply directly.
  if (dayKey(new Date(routine.created)) === dayKey(now)) (Object.assign(routine, { time: draft.time, tolerance }), delete routine.pending);
  else if (draft.time === routine.time && tolerance === routine.tolerance) delete routine.pending;
  else routine.pending = { time: draft.time, tolerance, from: dayKey(addDays(now, 1)) };
}

// Share a routine by link: deflate-raw JSON as base64url. Photo refs are dropped (too big); the importer re-takes them.
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export async function shareCode(routine) {
  const config = routine.pending ?? routine;
  const json = JSON.stringify({
    name: routine.name,
    time: config.time,
    tolerance: config.tolerance,
    autoStart: !!routine.autoStart,
    color: routine.color,
    icon: routine.icon,
    steps: routine.steps.map((step) => ({
      text: step.text,
      type: step.type ?? "tap",
      optional: !!step.optional,
      min: dur(step),
      ...(step.at ? { at: step.at } : {}),
    })),
  });
  const bytes = await pipe(new TextEncoder().encode(json), new CompressionStream("deflate-raw"));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function parseShare(code) {
  // A real code is a few KB at most; the cap keeps a crafted link from inflating into a huge string (decompression bomb).
  // ponytail: input cap only, ~1000x inflation of 8 KB is still bounded; stream with a byte limit if that ever matters.
  if (String(code).length > 8000) throw new Error("Share code too long");
  const bin = atob(String(code).replace(/-/g, "+").replace(/_/g, "/"));
  const data = JSON.parse(
    new TextDecoder().decode(
      await pipe(
        Uint8Array.from(bin, (ch) => ch.charCodeAt(0)),
        new DecompressionStream("deflate-raw"),
      ),
    ),
  );
  const str = (value, max) => typeof value === "string" && value.length <= max;
  const HM = /^([01]\d|2[0-3]):[0-5]\d$/,
    min = (step) => step.min ?? 2;
  const ok =
    data &&
    str(data.name, 80) &&
    HM.test(data.time) &&
    typeof data.autoStart === "boolean" &&
    Number.isInteger(data.tolerance) &&
    data.tolerance >= 0 &&
    data.tolerance <= 120 &&
    Array.isArray(data.steps) &&
    (data.color === undefined || COLOR.test(data.color)) &&
    (data.icon === undefined || ICONS.includes(data.icon)) &&
    data.steps.length >= 1 &&
    data.steps.length <= 50 &&
    data.steps.every(
      (step) =>
        step &&
        str(step.text, 120) &&
        ["tap", "photo"].includes(step.type) &&
        typeof step.optional === "boolean" &&
        (step.at === undefined || (typeof step.at === "string" && HM.test(step.at))) &&
        Number.isInteger(min(step)) &&
        min(step) >= 0 &&
        min(step) <= 240,
    );
  if (!ok) throw new Error("Invalid share code");
  return {
    name: data.name,
    time: data.time,
    tolerance: data.tolerance,
    autoStart: data.autoStart,
    color: data.color,
    icon: data.icon,
    steps: data.steps.map((step) => ({
      id: uid(),
      text: step.text,
      type: step.type,
      optional: step.optional,
      min: min(step),
      ...(step.at ? { at: step.at } : {}),
      ref: null,
    })),
  };
}
