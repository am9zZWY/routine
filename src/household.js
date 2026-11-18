// Shared household state { tasks, areas, chores }, changed only through operations.
// The server applies ops in arrival order; the client applies the same ops optimistically.
// Every op is safe to resend: upserts by client-made id, "set done/undone" instead of toggle.

export const GENERAL = "Allgemein"; // fixed area; tasks of removed areas move here
const AREAS = [
  ["Küche", "#F08A3E"],
  ["Bad", "#2E9CCA"],
  ["Wohnung", "#3FA066"],
  ["Balkon", "#1F9E8F"],
  ["Schlafzimmer", "#8B6AD6"],
  [GENERAL, "#E3B21C"],
];
export const blankHousehold = () => ({ tasks: [], areas: AREAS.map(([name, color]) => ({ name, color })), chores: {} });

const str = (value, max) => typeof value === "string" && value.length <= max;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export const COLOR = /^#[0-9a-fA-F]{6}$/; // ends up in style attributes on other phones
const MODES = ["day", "week", "interval", "month"];

function validTask(task) {
  return (
    task &&
    str(task.id, 40) &&
    str(task.title, 120) &&
    task.title.trim() &&
    str(task.area, 40) &&
    MODES.includes(task.mode) &&
    Array.isArray(task.days) &&
    task.days.length <= 7 &&
    task.days.every((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6) &&
    Number.isInteger(task.every) &&
    task.every >= 1 &&
    task.every <= 52 &&
    (task.anchor === undefined || (str(task.anchor, 10) && DAY.test(task.anchor))) &&
    (task.note === undefined || str(task.note, 2000))
  );
}
const pickTask = (task) => ({
  id: task.id,
  title: task.title,
  area: task.area,
  mode: task.mode,
  days: task.days,
  every: task.every,
  anchor: task.anchor,
  note: task.note ?? "",
});

// Returns false for a malformed op (the server rejects the whole request then).
export function validOp(op) {
  switch (op?.t) {
    case "task":
      return validTask(op.task);
    case "deltask":
      return str(op.id, 40);
    case "area":
      return op.area && str(op.area.name, 40) && op.area.name.trim() && COLOR.test(op.area.color);
    case "delarea":
      return str(op.name, 40);
    case "chore":
      return str(op.id, 40) && str(op.day, 10) && DAY.test(op.day) && (op.by === null || str(op.by, 40));
    case "seed":
      return (
        Array.isArray(op.tasks) &&
        op.tasks.length <= 500 &&
        op.tasks.every(validTask) &&
        Array.isArray(op.areas) &&
        op.areas.length <= 50 &&
        op.areas.every((area) => validOp({ t: "area", area }))
      );
    default:
      return false;
  }
}

// Mutates `household` in place.
export function applyOp(household, op) {
  if (op.t === "task") {
    const index = household.tasks.findIndex((task) => task.id === op.task.id);
    if (index >= 0) household.tasks[index] = pickTask(op.task);
    else household.tasks.push(pickTask(op.task));
  } else if (op.t === "deltask") {
    household.tasks = household.tasks.filter((task) => task.id !== op.id);
  } else if (op.t === "area") {
    const name = op.area.name.trim();
    if (!household.areas.some((area) => area.name.toLowerCase() === name.toLowerCase()))
      household.areas.splice(Math.max(0, household.areas.length - 1), 0, { name, color: op.area.color }); // keep "Allgemein" last
  } else if (op.t === "delarea") {
    if (op.name === GENERAL) return;
    for (const task of household.tasks) if (task.area === op.name) task.area = GENERAL;
    household.areas = household.areas.filter((area) => area.name !== op.name);
  } else if (op.t === "chore") {
    const key = `${op.id}@${op.day}`;
    if (op.by === null) delete household.chores[key];
    else household.chores[key] = op.by || true; // value = who did it (name), or true if unnamed
  } else if (op.t === "seed") {
    // One-time upload of tasks made before the server existed; only into an empty household.
    if (household.tasks.length) return;
    for (const area of op.areas) applyOp(household, { t: "area", area });
    household.tasks = op.tasks.map(pickTask);
  }
}
