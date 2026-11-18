import { read, write, denied, json, personalFile } from "#lib/server/store.js";
import { merge, validPersonal } from "../../../personal.js";

// Your own routines, log and progress, synced across your devices. Needs the household code and your sync key
// (`x-sync-key`, made on your first device; the "Gerät verbinden" link carries it to the others).
const KEY = /^[0-9a-f]{32}$/;
const blank = () => ({ routines: [], log: [], progress: {}, gone: {} });

function file(request) {
  const key = request.headers.get("x-sync-key") ?? "";
  return KEY.test(key) ? personalFile(key) : null;
}

export function GET({ request }) {
  const fileName = file(request);
  return denied(request) ?? (fileName ? json(read(fileName) ?? blank()) : new Response("Bad sync key", { status: 400 }));
}

// Body: the device's whole personal state → merged with the stored one, returned.
export async function POST({ request }) {
  const no = denied(request);
  if (no) return no;
  const fileName = file(request);
  const data = await request.json().catch(() => null);
  if (!fileName || !validPersonal(data)) return new Response("Bad data", { status: 400 });
  const merged = merge(read(fileName) ?? blank(), data);
  // Each upload is within limits, but merging many could grow the file without bound: check the result too.
  if (!validPersonal(merged)) return new Response("Too much data", { status: 413 });
  write(fileName, merged);
  return json(merged);
}
