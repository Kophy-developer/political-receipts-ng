import { connection } from "next/server";
import { reassessSavedScan } from "@/lib/db/editorial";
import { assertEditorRequest } from "@/lib/x/guard";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const rejected = await assertEditorRequest(request);
  if (rejected) {
    return Response.json({ ok: false, xRequests: 0, modelCalls: 0, researchCalls: 0, posted: false, message: rejected.message }, { status: rejected.status });
  }
  let body: { scanId?: unknown };
  try {
    body = (await request.json()) as { scanId?: unknown };
  } catch {
    body = {};
  }
  if (typeof body.scanId !== "string") {
    return Response.json(
      { ok: false, xRequests: 0, modelCalls: 0, researchCalls: 0, posted: false, message: "Choose the saved scan on the Desk." },
      { status: 400 },
    );
  }
  const report = await reassessSavedScan(body.scanId);
  return Response.json(report, { status: report.ok ? 200 : 400 });
}
