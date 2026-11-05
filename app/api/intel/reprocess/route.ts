import { connection } from "next/server";
import { reprocessSavedScan } from "@/lib/intel/saved-scan";
import { assertEditorPost } from "@/lib/x/guard";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const rejected = assertEditorPost(request);
  if (rejected) {
    return Response.json({ ok: false, xRequests: 0, detail: rejected, posted: false, polling: false }, { status: 403 });
  }
  let body: { scanId?: unknown };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  if (typeof body.scanId !== "string") {
    return Response.json(
      { ok: false, xRequests: 0, detail: "Choose the saved scan on the Desk. No X request was made.", posted: false, polling: false },
      { status: 400 },
    );
  }
  const report = await reprocessSavedScan(body.scanId);
  return Response.json(report);
}
