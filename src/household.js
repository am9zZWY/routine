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

const str = (v, max) => typeof v === "string" && v.length <= max;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/; // ends up in style attributes on other phones
const MODES = ["day", "week", "interval", "month"];

function validTask(t) {
  return (
    t &&
    str(t.id, 40) &&
    str(t.title, 120) &&
    t.title.trim() &&
    str(t.area, 40) &&
    MODES.includes(t.mode) &&
    Array.isArray(t.days) &&
    t.days.length <= 7 &&
    t.days.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
    Number.isInteger(t.every) &&
    t.every >= 1 &&
    t.every <= 52 &&
    (t.anchor === undefined || (str(t.anchor, 10) && DAY.test(t.anchor))) &&
    (t.note === undefined || str(t.note, 2000))
  );
}
const pickTask = (t) => ({
  id: t.id,
  title: t.title,
  area: t.area,
  mode: t.mode,
  days: t.days,
  every: t.every,
  anchor: t.anchor,
  note: t.note ?? "",
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
        op.areas.every((a) => validOp({ t: "area", area: a }))
      );
    default:
      return false;
  }
}

// Mutates `h` in place.
export function applyOp(h, op) {
  if (op.t === "task") {
    const i = h.tasks.findIndex((x) => x.id === op.task.id);
    if (i >= 0) h.tasks[i] = pickTask(op.task);
    else h.tasks.push(pickTask(op.task));
  } else if (op.t === "deltask") {
    h.tasks = h.tasks.filter((x) => x.id !== op.id);
  } else if (op.t === "area") {
    const name = op.area.name.trim();
    if (!h.areas.some((a) => a.name.toLowerCase() === name.toLowerCase()))
      h.areas.splice(Math.max(0, h.areas.length - 1), 0, { name, color: op.area.color }); // keep "Allgemein" last
  } else if (op.t === "delarea") {
    if (op.name === GENERAL) return;
    for (const t of h.tasks) if (t.area === op.name) t.area = GENERAL;
    h.areas = h.areas.filter((a) => a.name !== op.name);
  } else if (op.t === "chore") {
    const k = `${op.id}@${op.day}`;
    if (op.by === null) delete h.chores[k];
    else h.chores[k] = op.by || true; // value = who did it (name), or true if unnamed
  } else if (op.t === "seed") {
    // One-time upload of tasks made before the server existed; only into an empty household.
    if (h.tasks.length) return;
    for (const a of op.areas) applyOp(h, { t: "area", area: a });
    h.tasks = op.tasks.map(pickTask);
  }
}
