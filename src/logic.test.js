import { test, expect } from "bun:test";
import { advance, evaluate, saveRoutine, status, canEdit, score, dayKey, hm, shareCode, parseShare, schedule } from "./logic.js";
import { similarity, features } from "./photo.js";

const novDate = (day, hours, minutes, seconds = 0) => new Date(2026, 10, day, hours, minutes, seconds);
const fresh = () => {
  const state = { routines: [], log: [], progress: {} };
  saveRoutine(state, { name: "Morning", time: "07:00", tolerance: 5, steps: [{ text: "a" }, { text: "b" }] }, novDate(1, 0, 0));
  return [state, state.routines[0]];
};
const finish = (state, routine, time) => {
  advance(state, routine, time);
  return advance(state, routine, time);
};

test("window status", () => {
  const [state, routine] = fresh();
  expect(status(state, routine, novDate(2, 6, 54))).toBe("upcoming");
  expect(status(state, routine, novDate(2, 6, 55))).toBe("open");
  expect(canEdit(state, routine, novDate(2, 7, 0))).toBe(false);
  expect(advance(state, routine, novDate(2, 6, 50))).toBe(null); // not open yet
});

test("points: base, ±1 min bonus, streak", () => {
  const [state, routine] = fresh();
  expect(finish(state, routine, novDate(2, 7, 0, 30)).points).toBe(12); // bonus
  const logEntry = finish(state, routine, novDate(3, 7, 4));
  expect([logEntry.points, logEntry.offset]).toEqual([11, 4]); // streak 1, no bonus
  expect(finish(state, routine, novDate(4, 7, 3)).points).toBe(12);
  expect(score(state)).toBe(35);
});

test("missed / partial penalties, applied on app start, max 7 days back, streak reset", () => {
  const [state, routine] = fresh();
  finish(state, routine, novDate(2, 7, 3)); // +10
  advance(state, routine, novDate(3, 7, 0)); // one step only, then app closed
  evaluate(state, novDate(4, 12, 0)); // day 3 partial; day 4 (today) can still be ticked late
  evaluate(state, novDate(20, 12, 0)); // days 13..19 missed, 4..12 out of range, 20 is today
  const byDay = Object.fromEntries(state.log.map((logEntry) => [logEntry.day, logEntry.status]));
  expect(byDay[dayKey(novDate(3, 0, 0))]).toBe("partial");
  expect(state.log.filter((logEntry) => logEntry.status === "missed").length).toBe(8); // days 1, 13..19
  expect(score(state)).toBe(0); // 10 - 10, then misses can't go below 0
  expect(score(state, dayKey(novDate(2, 0, 0)))).toBe(10);
  evaluate(state, novDate(20, 12, 1));
  expect(state.log.length).toBe(10); // idempotent
  expect(finish(state, routine, novDate(21, 7, 3)).points).toBe(10); // streak reset
  expect(canEdit(state, routine, novDate(20, 12, 0))).toBe(false); // overdue today → locked
});

test("time change applies tomorrow; deletion keeps points", () => {
  const [state, routine] = fresh();
  saveRoutine(state, { id: routine.id, name: "M", time: "09:00", tolerance: 5, steps: routine.steps }, novDate(2, 6, 0));
  expect(status(state, routine, novDate(2, 6, 56))).toBe("open"); // still old time today
  evaluate(state, novDate(3, 6, 0));
  expect(status(state, routine, novDate(3, 6, 56))).toBe("upcoming");
  expect(status(state, routine, novDate(3, 8, 56))).toBe("open");
  finish(state, routine, novDate(3, 9, 0));
  state.routines = [];
  expect(score(state)).toBe(12); // days 1 and 2 missed at 0 leave no debt
});

test("optional steps: trailing optional left undone counts as done; finish early", () => {
  const state = { routines: [], log: [], progress: {} };
  saveRoutine(state, { name: "M", time: "07:00", tolerance: 5, steps: [{ text: "a" }, { text: "b", optional: true }] }, novDate(1, 0, 0));
  const routine = state.routines[0];
  advance(state, routine, novDate(2, 7, 0, 20)); // required step done, app closed
  evaluate(state, novDate(3, 12, 0));
  expect(state.log.map((logEntry) => [logEntry.status, logEntry.points])).toEqual([
    ["missed", -20],
    ["done", 12],
  ]); // day 3 is today: no penalty yet
  expect(advance(state, routine, novDate(4, 7, 0), true)).toBe(null); // required step still left
  advance(state, routine, novDate(4, 7, 0));
  expect(advance(state, routine, novDate(4, 7, 2), true).points).toBe(10); // finished early; streak reset by day 3
});

test("photo similarity: identical = 1", () => {
  const px = Uint8ClampedArray.from({ length: 32 * 32 * 4 }, (_unused, index) => index % 251);
  const grid = Uint8ClampedArray.from({ length: 9 * 8 * 4 }, (_unused, index) => index * 3);

  const feats = features(px, grid);
  expect(similarity(feats, feats)).toBe(1);
});

test("autoStart persisted on create and update", () => {
  const state = { routines: [], log: [], progress: {} };
  saveRoutine(state, { name: "M", time: "07:00", steps: [], autoStart: true }, novDate(1, 0, 0));
  const routine = state.routines[0];
  expect(routine.autoStart).toBe(true);
  saveRoutine(state, { id: routine.id, name: "M", time: "07:00", steps: [], autoStart: false }, novDate(1, 0, 0));
  expect(routine.autoStart).toBe(false);
});

test("old progress without `at` falls back to window close", () => {
  const state = { routines: [], log: [], progress: {} };
  saveRoutine(state, { name: "M", time: "07:00", steps: [{ text: "a" }, { text: "b", optional: true }] }, novDate(1, 0, 0));
  state.progress[state.routines[0].id] = { day: dayKey(novDate(2, 0, 0)), step: 1 };
  evaluate(state, novDate(2, 12, 0));
  expect(state.log.at(-1)).toMatchObject({ status: "done", offset: 5, points: 10 });
});

test("share code round-trip drops refs, uses pending time; garbage throws", async () => {
  const [state, routine] = fresh();
  routine.steps = [
    { id: "x", text: "a", type: "photo", ref: "data:image/jpeg;base64,AAAA", optional: false },
    { text: "b", type: "tap", optional: true, min: 7, at: "08:45" },
  ];
  saveRoutine(
    state,
    { id: routine.id, name: "Morning", time: "08:30", tolerance: 3, steps: routine.steps, autoStart: true },
    novDate(2, 0, 0),
  );
  const code = await shareCode(routine);
  expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  const parsed = await parseShare(code);
  expect(parsed).toMatchObject({ name: "Morning", time: "08:30", tolerance: 3, autoStart: true });
  expect(parsed.steps.map((step) => [step.text, step.type, step.optional, step.ref, step.min, step.at])).toEqual([
    ["a", "photo", false, null, 2, undefined],
    ["b", "tap", true, null, 7, "08:45"],
  ]);
  expect(parsed.steps[0].id).not.toBe("x");
});

test("parseShare rejects garbage", async () => {
  await expect(parseShare("not-a-code!!")).rejects.toThrow();
  await expect(parseShare("A".repeat(8001))).rejects.toThrow("too long");
  const bad = await shareCode({ name: "x", time: "25:00", tolerance: 5, steps: [{ text: "a" }] });
  await expect(parseShare(bad)).rejects.toThrow();
});

test("schedule: chained from target, fixed `at`, chain continues after fixed, midnight overflow", () => {
  const routine = { time: "23:50", tolerance: 5, steps: [{ min: 5 }, {}, { at: "23:30", min: 10 }, { min: 15 }, { min: 0 }] };
  const hmd = schedule(routine, "2026-11-02").map(({ start, end }) => `${start.getDate()} ${hm(start)}-${hm(end)}`);
  expect(hmd).toEqual(["2 23:50-23:55", "2 23:55-23:57", "2 23:30-23:40", "2 23:40-23:55", "2 23:55-23:55"]);
  routine.steps[3].min = 30;
  expect(hm(schedule(routine, "2026-11-02")[4].start)).toBe("00:10");
  expect(schedule(routine, "2026-11-02")[4].start.getDate()).toBe(3);
});

test("time change on the day of creation applies immediately", () => {
  const [state, routine] = fresh(); // created day 1
  saveRoutine(state, { id: routine.id, name: "M", time: "09:00", tolerance: 3, steps: routine.steps }, novDate(1, 6, 0));
  expect([routine.time, routine.tolerance, routine.pending]).toEqual(["09:00", 3, undefined]);
});

test("household recurrence", async () => {
  const { dueOn, nextDue } = await import("./logic.js");
  // 2026-11-14 is a Saturday (Mon-first index 5).
  expect(dueOn({ mode: "week", days: [2, 5] }, "2026-11-14")).toBe(true);
  expect(dueOn({ mode: "week", days: [2, 5] }, "2026-11-15")).toBe(false);
  const iv = { mode: "interval", every: 2, days: [5], anchor: "2026-11-10" };
  expect(["2026-11-14", "2026-11-21", "2026-11-28"].map((day) => dueOn(iv, day))).toEqual([true, false, true]);
  expect(dueOn(iv, "2026-11-07")).toBe(false); // before anchor
  expect(nextDue({ mode: "month", days: [5] }, "2026-11-14")).toBe("2026-12-05");
  expect(nextDue({ mode: "day" }, "2026-11-14")).toBe("2026-11-15");
});

test("household ops: idempotent, validated, area removal, seed only into empty", async () => {
  const { blankHousehold, applyOp, validOp } = await import("./household.js");
  const household = blankHousehold();
  const task = { id: "a", title: "Bad", area: "Bad", mode: "day", days: [], every: 2 };
  for (const op of [
    { t: "task", task },
    { t: "task", task },
    { t: "chore", id: "a", day: "2026-11-15", by: "Jo" },
  ]) {
    expect(validOp(op)).toBe(true);
    applyOp(household, op);
  }
  expect([household.tasks.length, household.chores["a@2026-11-15"]]).toEqual([1, "Jo"]);
  applyOp(household, { t: "delarea", name: "Bad" });
  expect(household.tasks[0].area).toBe("Allgemein");
  applyOp(household, { t: "seed", tasks: [{ ...task, id: "b" }], areas: [] });
  expect(household.tasks.map((existing) => existing.id)).toEqual(["a"]); // not empty → ignored
  expect(validOp({ t: "area", area: { name: "X", color: "red;background:url(x)" } })).toBe(false);
  expect(validOp({ t: "chore", id: "a", day: "nope", by: null })).toBe(false);
});

test("late tick: after the window, same day, 0 points and no penalty; streak kept; photo steps need the run screen", async () => {
  const { complete } = await import("./logic.js");
  const [state, routine] = fresh();
  finish(state, routine, novDate(2, 7, 0)); // +12
  expect(status(state, routine, novDate(3, 9, 0))).toBe("overdue");
  evaluate(state, novDate(3, 9, 0));
  expect(state.log.length).toBe(2); // day 1 missed; day 3 not penalised yet
  const logEntry = complete(state, routine, novDate(3, 9, 0));
  expect([logEntry.status, logEntry.points]).toEqual(["late", 0]);
  expect(finish(state, routine, novDate(4, 7, 3)).points).toBe(12); // streak 2 (days 2 and 3)
  expect(complete(state, routine, novDate(5, 6, 0))).toBe(null); // not open yet
  routine.steps.push({ id: "p", text: "photo", type: "photo", ref: "x" });
  expect(complete(state, routine, novDate(5, 7, 0))).toBe(null); // photo left → run screen
  const other = { routines: [], log: [], progress: {} };
  saveRoutine(other, { name: "N", time: "07:00", tolerance: 5, steps: [{ text: "a" }] }, novDate(1, 9, 0));
  expect(status(other, other.routines[0], novDate(1, 10, 0))).toBe("new"); // created after today's window: starts tomorrow
  evaluate(other, novDate(2, 9, 0));
  expect(other.log.length).toBe(0);
});

test("personal merge: last edit wins, deletions stick, best log outcome wins, validated", async () => {
  const { merge, validPersonal } = await import("./personal.js");
  const makeRoutine = (id, name, updated) => ({
    id,
    name,
    time: "07:00",
    tolerance: 5,
    steps: [{ id: "a", text: "a" }],
    created: "2026-11-01",
    updated,
  });
  const makeLogEntry = (status, points) => ({ routineId: "1", name: "x", day: "2026-11-02", status, points, at: "t" });
  const mine = {
    routines: [makeRoutine("1", "old", "2026-11-02"), makeRoutine("2", "gone", "2026-11-02")],
    log: [makeLogEntry("missed", -20)],
    progress: {},
    gone: {},
  };
  const theirs = {
    routines: [makeRoutine("1", "new", "2026-11-03")],
    log: [makeLogEntry("done", 12)],
    progress: { 1: { day: "2026-11-03", step: 1, at: "z" } },
    gone: { 2: "t" },
  };
  const merged = merge(mine, theirs);
  expect(merged.routines.map((routine) => routine.name)).toEqual(["new"]);
  expect(merged.log).toEqual([makeLogEntry("done", 12)]);
  expect(merge(theirs, mine)).toEqual({ ...merged, routines: merged.routines }); // order of arrival doesn't matter
  expect(merged.progress[1].step).toBe(1);
  expect(validPersonal(merged)).toBe(true);
  expect(validPersonal({ ...merged, routines: [{ ...makeRoutine("3", "x"), color: "red;}" }] })).toBe(false);
  expect(validPersonal({ ...merged, log: [makeLogEntry("toString", 0)] })).toBe(false);
  expect(
    validPersonal({ ...merged, routines: [{ ...makeRoutine("3", "x"), steps: [{ id: "a", text: "a", ref: "javascript:alert(1)" }] }] }),
  ).toBe(false);
});
