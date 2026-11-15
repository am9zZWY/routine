// The household lives in one JSON file on the server (Docker volume). One Node process applies ops in
// arrival order, so there are no lost updates. Writes go to a temp file first, then rename (atomic).
import fs from "node:fs";
import path from "node:path";
import { blankHousehold, applyOp } from "../../household.js";

const dir = process.env.DATA_DIR ?? "data";
const file = path.join(dir, "household.json");

let h;
function state() {
  if (h) return h;
  try {
    h = { ...blankHousehold(), ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch (e) {
    if (e.code !== "ENOENT") throw e; // a corrupt file must not be silently replaced by an empty household
    h = blankHousehold();
  }
  return h;
}

export const read = () => state();

export function apply(ops) {
  const s = state();
  for (const op of ops) applyOp(s, op);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file + ".tmp", JSON.stringify(s));
  fs.renameSync(file + ".tmp", file);
  return s;
}
