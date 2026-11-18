// Server storage: JSON files in DATA_DIR (a Docker volume). One Node process handles requests one at a time
// with synchronous file IO, so there are no lost updates. Writes go to a temp file first, then rename (atomic).
import fs from "node:fs";
import path from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";

const dir = process.env.DATA_DIR ?? "data";

export function read(name) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error; // a corrupt file must not be silently replaced by an empty one
  }
}

export function write(name, value) {
  const file = path.join(dir, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + ".tmp", JSON.stringify(value));
  fs.renameSync(file + ".tmp", file);
}

// Every API request needs the household code (HOUSEHOLD_CODE, set in compose.yaml), sent as `x-household-code`.
export function denied(request) {
  const want = Buffer.from(process.env.HOUSEHOLD_CODE ?? "");
  const got = Buffer.from(request.headers.get("x-household-code") ?? "");
  if (!want.length) return new Response("HOUSEHOLD_CODE is not set on the server", { status: 503 });
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new Response("Wrong household code", { status: 401 });
}

// Personal data is filed under a hash of the device-made sync key, so the key itself is never on disk.
export const personalFile = (key) => `me/${createHash("sha256").update(key).digest("hex")}.json`;

export const json = (value) =>
  new Response(JSON.stringify(value), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
