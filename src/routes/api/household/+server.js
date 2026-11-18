import { read, write, denied, json } from "#lib/server/store.js";
import { validOp, applyOp, blankHousehold } from "../../../household.js";

let household; // cached; this process is the only writer
const state = () => (household ??= { ...blankHousehold(), ...read("household.json") });

export function GET({ request }) {
  return denied(request) ?? json(state());
}

// Body: { ops: [...] } → applies them in order, returns the whole household.
export async function POST({ request }) {
  const no = denied(request);
  if (no) return no;
  const ops = (await request.json().catch(() => null))?.ops;
  if (!Array.isArray(ops) || ops.length > 500 || !ops.every(validOp)) return new Response("Bad ops", { status: 400 });
  const current = state();
  for (const op of ops) applyOp(current, op);
  write("household.json", current);
  return json(current);
}
