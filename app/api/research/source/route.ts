import { connection } from "next/server";
import { isUuid } from "@/lib/db/labels";
import { addManualSource } from "@/lib/research/source";
import { assertEditorRequest } from "@/lib/x/guard";

export const maxDuration = 30;

export async function POST(request: Request) {
  await connection();
  const rejected = await assertEditorRequest(request);
  if (rejected) return Response.json({ ok: false, message: rejected.message }, { status: rejected.status });
  let body: { claimId?: unknown; url?: unknown };
  try {
    body = (await request.json()) as { claimId?: unknown; url?: unknown };
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  if (typeof body.claimId !== "string" || !isUuid(body.claimId)) {
    return Response.json({ ok: false, message: "That claim is not on the desk." }, { status: 400 });
  }
  if (typeof body.url !== "string" || !body.url.trim()) {
    return Response.json({ ok: false, message: "Paste the URL of the record." }, { status: 400 });
  }
  const result = await addManualSource(body.claimId, body.url.trim());
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
