import { timingSafeEqual } from "node:crypto";
import { read, apply } from "#lib/server/household.js";
import { validOp } from "../../../household.js";

// Every request needs the household code (HOUSEHOLD_CODE, set in compose.yaml), sent as `x-household-code`.
function denied(request) {
  const want = Buffer.from(process.env.HOUSEHOLD_CODE ?? "");
  const got = Buffer.from(request.headers.get("x-household-code") ?? "");
  if (!want.length) return new Response("HOUSEHOLD_CODE is not set on the server", { status: 503 });
  if (got.length !== want.length || !timingSafeEqual(got, want)) return new Response("Wrong household code", { status: 401 });
}

const json = (v) => new Response(JSON.stringify(v), { headers: { "content-type": "application/json", "cache-control": "no-store" } });

export function GET({ request }) {
  return denied(request) ?? json(read());
}

// Body: { ops: [...] } → applies them in order, returns the whole household.
export async function POST({ request }) {
  const no = denied(request);
  if (no) return no;
  const body = await request.json().catch(() => null);
  const ops = body?.ops;
  if (!Array.isArray(ops) || ops.length > 500 || !ops.every(validOp)) return new Response("Bad ops", { status: 400 });
  return json(apply(ops));
}
