import { connection } from "next/server";
import { loadDiscoveryContext } from "@/lib/db/pillars";
import { isScanMode, storagePillar } from "@/lib/pillars/catalog";
import { chooseScan } from "@/lib/pillars/scan";
import { runScan } from "@/lib/intel/run";
import { assertEditorRequest } from "@/lib/x/guard";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const rejected = await assertEditorRequest(request);
  if (rejected) return Response.json({ ok: false, stopped: rejected.message, posted: false, polling: false, xRequests: 0 }, { status: rejected.status });
  let mode: unknown = "smart";
  try {
    const body = (await request.json()) as { mode?: unknown };
    if (body.mode !== undefined) mode = body.mode;
  } catch {
    mode = "smart";
  }
  if (!isScanMode(mode)) {
    return Response.json({ ok: false, stopped: "Choose one scan mode. No X request was made.", posted: false, polling: false, xRequests: 0 }, { status: 400 });
  }
  const context = await loadDiscoveryContext();
  const choice = chooseScan(mode, context.signals, context.publishedTotal, context.allowance);
  if (!choice.runnable) {
    return Response.json({
      ok: false,
      stopped: choice.reason,
      posted: false,
      polling: false,
      xRequests: 0,
      postsReturned: 0,
      pillar: choice.pillar,
      estimatedRequests: choice.estimatedRequests,
    });
  }
  const report = await runScan({ storagePillar: storagePillar(choice.pillar) });
  return Response.json({ ...report, pillar: choice.pillar, estimatedRequests: choice.estimatedRequests });
}
