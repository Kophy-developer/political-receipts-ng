import { after, connection } from "next/server";
import { assertScheduleRequest } from "@/lib/auth/schedule";
import { claimBackgroundPipeline, executeClaimedBackgroundPipeline } from "@/lib/db/pipeline";

export const maxDuration = 300;

const noStore = { "cache-control": "no-store" } as const;

function parseRunFlags(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { force: false, skipScan: false };
  }
  const row = body as { force?: unknown; skipScan?: unknown };
  return { force: row.force === true, skipScan: row.skipScan === true };
}

async function startScheduleRun(request: Request, defaults: { force: boolean; skipScan: boolean }) {
  await connection();
  const refused = assertScheduleRequest(request);
  if (refused) {
    return Response.json({ ok: false, message: refused.message, posted: false }, { status: refused.status, headers: noStore });
  }
  let force = defaults.force;
  let skipScan = defaults.skipScan;
  if (request.method !== "GET" && request.method !== "HEAD") {
    const raw = await request.text();
    if (raw.trim()) {
      try {
        const flags = parseRunFlags(JSON.parse(raw) as unknown);
        force = flags.force || force;
        skipScan = flags.skipScan || skipScan;
      } catch {
        return Response.json({
          ok: false,
          message: "Request body must be empty or JSON with optional force and skipScan booleans.",
          posted: false,
        }, { status: 400, headers: noStore });
      }
    }
  }
  const claim = await claimBackgroundPipeline({ force, skipScan });
  if (!claim.claimed) {
    return Response.json(claim.result, { status: 200, headers: noStore });
  }
  const skip = claim.skipScan;
  after(() => {
    void executeClaimedBackgroundPipeline({ skipScan: skip });
  });
  return Response.json({
    ok: true,
    accepted: true,
    message: "Pipeline started. Find and draft continue in the background. Nothing was published.",
    scanned: false,
    developed: [],
    lastRun: null,
    posted: false,
    startedAt: claim.started,
  }, { status: 202, headers: noStore });
}

export async function POST(request: Request) {
  return startScheduleRun(request, { force: false, skipScan: false });
}

export async function GET(request: Request) {
  return startScheduleRun(request, { force: false, skipScan: false });
}
