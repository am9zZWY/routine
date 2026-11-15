import { test, expect } from "bun:test";
import { advance, evaluate, saveRoutine, status, canEdit, score, dayKey, hm, shareCode, parseShare, schedule } from "./logic.js";
import { similarity, features } from "./photo.js";

const T = (d, h, m, s = 0) => new Date(2026, 10, d, h, m, s);
const fresh = () => {
  const s = { routines: [], log: [], progress: {} };
  saveRoutine(s, { name: "Morning", time: "07:00", tolerance: 5, steps: [{ text: "a" }, { text: "b" }] }, T(1, 0, 0));
  return [s, s.routines[0]];
};
const finish = (s, r, t) => {
  advance(s, r, t);
  return advance(s, r, t);
};

test("window status", () => {
  const [s, r] = fresh();
  expect(status(s, r, T(2, 6, 54))).toBe("upcoming");
  expect(status(s, r, T(2, 6, 55))).toBe("open");
  expect(canEdit(s, r, T(2, 7, 0))).toBe(false);
  expect(advance(s, r, T(2, 6, 50))).toBe(null); // not open yet
});

test("points: base, ±1 min bonus, streak", () => {
  const [s, r] = fresh();
  expect(finish(s, r, T(2, 7, 0, 30)).points).toBe(12); // bonus
  const e = finish(s, r, T(3, 7, 4));
  expect([e.points, e.offset]).toEqual([11, 4]); // streak 1, no bonus
  expect(finish(s, r, T(4, 7, 3)).points).toBe(12);
  expect(score(s)).toBe(35);
});

test("missed / partial penalties, applied on app start, max 7 days back, streak reset", () => {
  const [s, r] = fresh();
  finish(s, r, T(2, 7, 3)); // +10
  advance(s, r, T(3, 7, 0)); // one step only, then app closed
  evaluate(s, T(4, 12, 0)); // day 3 partial, day 4 missed
  evaluate(s, T(20, 12, 0)); // days 13..20 missed, 5..12 out of range
  const byDay = Object.fromEntries(s.log.map((e) => [e.day, e.status]));
  expect(byDay[dayKey(T(3, 0, 0))]).toBe("partial");
  expect(s.log.filter((e) => e.status === "missed").length).toBe(10); // days 1, 4, 13..20
  expect(score(s)).toBe(0); // 10 - 10, then misses can't go below 0
  expect(score(s, dayKey(T(2, 0, 0)))).toBe(10);
  evaluate(s, T(20, 12, 1));
  expect(s.log.length).toBe(12); // idempotent
  expect(finish(s, r, T(21, 7, 3)).points).toBe(10); // streak reset
  expect(canEdit(s, r, T(20, 12, 0))).toBe(false); // missed today → locked
});

test("time change applies tomorrow; deletion keeps points", () => {
  const [s, r] = fresh();
  saveRoutine(s, { id: r.id, name: "M", time: "09:00", tolerance: 5, steps: r.steps }, T(2, 6, 0));
  expect(status(s, r, T(2, 6, 56))).toBe("open"); // still old time today
  evaluate(s, T(3, 6, 0));
  expect(status(s, r, T(3, 6, 56))).toBe("upcoming");
  expect(status(s, r, T(3, 8, 56))).toBe("open");
  finish(s, r, T(3, 9, 0));
  s.routines = [];
  expect(score(s)).toBe(12); // days 1 and 2 missed at 0 leave no debt
});

test("optional steps: trailing optional left undone counts as done; finish early", () => {
  const s = { routines: [], log: [], progress: {} };
  saveRoutine(s, { name: "M", time: "07:00", tolerance: 5, steps: [{ text: "a" }, { text: "b", optional: true }] }, T(1, 0, 0));
  const r = s.routines[0];
  advance(s, r, T(2, 7, 0, 20)); // required step done, app closed
  evaluate(s, T(3, 12, 0));
  expect(s.log.map((e) => [e.status, e.points])).toEqual([
    ["missed", -20],
    ["done", 12],
    ["missed", -20],
  ]);
  expect(advance(s, r, T(4, 7, 0), true)).toBe(null); // required step still left
  advance(s, r, T(4, 7, 0));
  expect(advance(s, r, T(4, 7, 2), true).points).toBe(10); // finished early; streak reset by day 3
});

test("photo similarity: identical = 1", () => {
  const px = Uint8ClampedArray.from({ length: 32 * 32 * 4 }, (_, i) => i % 251);
  const g = Uint8ClampedArray.from({ length: 9 * 8 * 4 }, (_, i) => i * 3);

  const f = features(px, g);
  expect(similarity(f, f)).toBe(1);
});

test("autoStart persisted on create and update", () => {
  const s = { routines: [], log: [], progress: {} };
  saveRoutine(s, { name: "M", time: "07:00", steps: [], autoStart: true }, T(1, 0, 0));
  const r = s.routines[0];
  expect(r.autoStart).toBe(true);
  saveRoutine(s, { id: r.id, name: "M", time: "07:00", steps: [], autoStart: false }, T(1, 0, 0));
  expect(r.autoStart).toBe(false);
});

test("old progress without `at` falls back to window close", () => {
  const s = { routines: [], log: [], progress: {} };
  saveRoutine(s, { name: "M", time: "07:00", steps: [{ text: "a" }, { text: "b", optional: true }] }, T(1, 0, 0));
  s.progress[s.routines[0].id] = { day: dayKey(T(2, 0, 0)), step: 1 };
  evaluate(s, T(2, 12, 0));
  expect(s.log.at(-1)).toMatchObject({ status: "done", offset: 5, points: 10 });
});

test("share code round-trip drops refs, uses pending time; garbage throws", async () => {
  const [s, r] = fresh();
  r.steps = [
    { id: "x", text: "a", type: "photo", ref: "data:image/jpeg;base64,AAAA", optional: false },
    { text: "b", type: "tap", optional: true, min: 7, at: "08:45" },
  ];
  saveRoutine(s, { id: r.id, name: "Morning", time: "08:30", tolerance: 3, steps: r.steps, autoStart: true }, T(2, 0, 0));
  const code = await shareCode(r);
  expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  const d = await parseShare(code);
  expect(d).toMatchObject({ name: "Morning", time: "08:30", tolerance: 3, autoStart: true });
  expect(d.steps.map((x) => [x.text, x.type, x.optional, x.ref, x.min, x.at])).toEqual([
    ["a", "photo", false, null, 2, undefined],
    ["b", "tap", true, null, 7, "08:45"],
  ]);
  expect(d.steps[0].id).not.toBe("x");
});

test("parseShare rejects garbage", async () => {
  await expect(parseShare("not-a-code!!")).rejects.toThrow();
  const bad = await shareCode({ name: "x", time: "25:00", tolerance: 5, steps: [{ text: "a" }] });
  await expect(parseShare(bad)).rejects.toThrow();
});

test("schedule: chained from target, fixed `at`, chain continues after fixed, midnight overflow", () => {
  const r = { time: "23:50", tolerance: 5, steps: [{ min: 5 }, {}, { at: "23:30", min: 10 }, { min: 15 }, { min: 0 }] };
  const hmd = schedule(r, "2026-11-02").map(({ start, end }) => `${start.getDate()} ${hm(start)}-${hm(end)}`);
  expect(hmd).toEqual(["2 23:50-23:55", "2 23:55-23:57", "2 23:30-23:40", "2 23:40-23:55", "2 23:55-23:55"]);
  r.steps[3].min = 30;
  expect(hm(schedule(r, "2026-11-02")[4].start)).toBe("00:10");
  expect(schedule(r, "2026-11-02")[4].start.getDate()).toBe(3);
});

test("time change on the day of creation applies immediately", () => {
  const [s, r] = fresh(); // created day 1
  saveRoutine(s, { id: r.id, name: "M", time: "09:00", tolerance: 3, steps: r.steps }, T(1, 6, 0));
  expect([r.time, r.tolerance, r.pending]).toEqual(["09:00", 3, undefined]);
});

test("household recurrence", async () => {
  const { dueOn, nextDue } = await import("./logic.js");
  // 2026-11-14 is a Saturday (Mon-first index 5).
  expect(dueOn({ mode: "week", days: [2, 5] }, "2026-11-14")).toBe(true);
  expect(dueOn({ mode: "week", days: [2, 5] }, "2026-11-15")).toBe(false);
  const iv = { mode: "interval", every: 2, days: [5], anchor: "2026-11-10" };
  expect(["2026-11-14", "2026-11-21", "2026-11-28"].map((d) => dueOn(iv, d))).toEqual([true, false, true]);
  expect(dueOn(iv, "2026-11-07")).toBe(false); // before anchor
  expect(nextDue({ mode: "month", days: [5] }, "2026-11-14")).toBe("2026-12-05");
  expect(nextDue({ mode: "day" }, "2026-11-14")).toBe("2026-11-15");
});

test("household ops: idempotent, validated, area removal, seed only into empty", async () => {
  const { blankHousehold, applyOp, validOp } = await import("./household.js");
  const h = blankHousehold();
  const task = { id: "a", title: "Bad", area: "Bad", mode: "day", days: [], every: 2 };
  for (const op of [
    { t: "task", task },
    { t: "task", task },
    { t: "chore", id: "a", day: "2026-11-15", by: "Jo" },
  ]) {
    expect(validOp(op)).toBe(true);
    applyOp(h, op);
  }
  expect([h.tasks.length, h.chores["a@2026-11-15"]]).toEqual([1, "Jo"]);
  applyOp(h, { t: "delarea", name: "Bad" });
  expect(h.tasks[0].area).toBe("Allgemein");
  applyOp(h, { t: "seed", tasks: [{ ...task, id: "b" }], areas: [] });
  expect(h.tasks.map((t) => t.id)).toEqual(["a"]); // not empty → ignored
  expect(validOp({ t: "area", area: { name: "X", color: "red;background:url(x)" } })).toBe(false);
  expect(validOp({ t: "chore", id: "a", day: "nope", by: null })).toBe(false);
});
