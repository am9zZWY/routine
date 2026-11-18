// Personal data { routines, log, progress, gone } synced across your own devices (server: one file per sync key).
// Devices send their whole state; both sides merge with `merge`, so it doesn't matter who saw what first:
// - routines: last edit wins (`updated`); deleted ids stay in `gone` (id → time) so they don't come back
// - log: one entry per routine and day; the better outcome wins (done > late > partial > missed), so a
//   penalty from an offline phone can't override a completion made on another
// - progress: newest step wins

export const ICONS = ["sun", "moon", "coffee", "dumbbell", "book", "bed", "bath", "briefcase", "utensils", "heart", "pill", "music"];
const RANK = { missed: 1, partial: 2, late: 3, done: 4 };
const stamp = (routine) => routine.updated ?? routine.created ?? "";

export const personal = (state) => ({ routines: state.routines, log: state.log, progress: state.progress, gone: state.gone ?? {} });

export function merge(mine, theirs) {
  const gone = { ...mine.gone, ...theirs.gone };
  const routines = new Map();
  for (const routine of [...mine.routines, ...theirs.routines]) {
    const known = routines.get(routine.id);
    if (!known || stamp(routine) > stamp(known)) routines.set(routine.id, routine);
  }
  const log = new Map();
  for (const logEntry of [...mine.log, ...theirs.log]) {
    const key = `${logEntry.routineId}@${logEntry.day}`,
      known = log.get(key);
    if (!known || RANK[logEntry.status] > RANK[known.status]) log.set(key, logEntry);
  }
  const progress = { ...mine.progress };
  for (const [id, entry] of Object.entries(theirs.progress)) if (!progress[id] || entry.at > progress[id].at) progress[id] = entry;
  return { routines: [...routines.values()].filter((routine) => !gone[routine.id]), log: [...log.values()], progress, gone };
}

// Validates what a device uploads (the server stores it and sends it to your other devices).
const str = (value, max) => typeof value === "string" && value.length <= max;
const int = (value, lo, hi) => Number.isInteger(value) && value >= lo && value <= hi;
const obj = (value, max) => value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length <= max;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const IMG = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const validStep = (step) =>
  step &&
  str(step.id, 40) &&
  str(step.text, 500) &&
  [undefined, "tap", "photo"].includes(step.type) &&
  (step.ref == null || (str(step.ref, 200_000) && IMG.test(step.ref))) &&
  (step.min === undefined || int(step.min, 0, 240)) &&
  (step.at === undefined || HM.test(step.at));
const validRoutine = (routine) =>
  routine &&
  str(routine.id, 40) &&
  str(routine.name, 200) &&
  HM.test(routine.time) &&
  int(routine.tolerance, 0, 720) &&
  str(routine.created, 40) &&
  (routine.updated === undefined || str(routine.updated, 40)) &&
  (routine.color === undefined || COLOR.test(routine.color)) &&
  (routine.icon === undefined || ICONS.includes(routine.icon)) &&
  (routine.pending === undefined ||
    (routine.pending && HM.test(routine.pending.time) && int(routine.pending.tolerance, 0, 720) && DAY.test(routine.pending.from))) &&
  Array.isArray(routine.steps) &&
  routine.steps.length <= 50 &&
  routine.steps.every(validStep);
const validLogEntry = (logEntry) =>
  logEntry &&
  str(logEntry.routineId, 40) &&
  str(logEntry.name, 200) &&
  DAY.test(logEntry.day) &&
  Object.hasOwn(RANK, logEntry.status) &&
  int(logEntry.points, -100, 100) &&
  str(logEntry.at, 40);

export const validPersonal = (data) =>
  data &&
  Array.isArray(data.routines) &&
  data.routines.length <= 200 &&
  data.routines.every(validRoutine) &&
  Array.isArray(data.log) &&
  data.log.length <= 100_000 &&
  data.log.every(validLogEntry) &&
  obj(data.progress, 200) &&
  Object.values(data.progress).every(
    (entry) => entry && DAY.test(entry.day) && int(entry.step, 0, 50) && (entry.at === undefined || str(entry.at, 40)),
  ) &&
  obj(data.gone, 5000) &&
  Object.values(data.gone).every((time) => str(time, 40));
