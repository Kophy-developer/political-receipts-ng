import { connection } from "next/server";
import { isUuid } from "@/lib/db/labels";
import { beginResearch } from "@/lib/research/run";
import { assertEditorRequest } from "@/lib/x/guard";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const rejected = await assertEditorRequest(request);
  if (rejected) return Response.json({ ok: false, started: false, message: rejected.message }, { status: rejected.status });
  let body: { claimId?: unknown };
  try {
    body = (await request.json()) as { claimId?: unknown };
  } catch {
    return Response.json({ ok: false, started: false, message: "The desk could not read that request." }, { status: 400 });
  }
  if (typeof body.claimId !== "string" || !isUuid(body.claimId)) {
    return Response.json({ ok: false, started: false, message: "That claim is not on the desk." }, { status: 400 });
  }
  const result = await beginResearch(body.claimId);
  return Response.json(result, { status: result.started || result.ok ? 200 : 400 });
}
