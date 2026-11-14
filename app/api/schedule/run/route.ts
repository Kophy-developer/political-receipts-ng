import { connection } from "next/server";
import { assertScheduleRequest } from "@/lib/auth/schedule";
import { runBackgroundPipeline } from "@/lib/db/pipeline";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const refused = assertScheduleRequest(request);
  if (refused) {
    return Response.json({ ok: false, message: refused.message, posted: false }, { status: refused.status, headers: { "cache-control": "no-store" } });
  }
  let force = false;
  let skipScan = false;
  try {
    const body = (await request.json()) as { force?: unknown; skipScan?: unknown };
    force = body.force === true;
    skipScan = body.skipScan === true;
  } catch {
    force = false;
    skipScan = false;
  }
  const result = await runBackgroundPipeline({ force, skipScan });
  return Response.json(result, { status: result.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}

export async function GET(request: Request) {
  await connection();
  const refused = assertScheduleRequest(request);
  if (refused) {
    return Response.json({ ok: false, message: refused.message, posted: false }, { status: refused.status, headers: { "cache-control": "no-store" } });
  }
  const result = await runBackgroundPipeline({ force: false });
  return Response.json(result, { status: result.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
