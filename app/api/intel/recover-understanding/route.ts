import { connection } from "next/server";
import { recoverSavedUnderstanding } from "@/lib/db/recover-understanding";
import { assertEditorPost } from "@/lib/x/guard";

export const maxDuration = 30;

export async function POST(request: Request) {
  await connection();
  const rejected = assertEditorPost(request);
  if (rejected) {
    return Response.json({ ok: false, xRequests: 0, modelCalls: 0, researchCalls: 0, posted: false, message: rejected }, { status: 403 });
  }
  const report = await recoverSavedUnderstanding();
  return Response.json(report, { status: report.ok ? 200 : 400 });
}
