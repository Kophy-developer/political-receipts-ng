import { connection } from "next/server";
import { setClaimDeskStatus } from "@/lib/db/intel";
import { isUuid } from "@/lib/db/labels";
import { assertEditorRequest } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const rejected = await assertEditorRequest(request);
  if (rejected) return Response.json({ ok: false, message: rejected.message }, { status: rejected.status });
  let body: { id?: unknown; action?: unknown };
  try {
    body = (await request.json()) as { id?: unknown; action?: unknown };
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  if (typeof body.id !== "string" || !isUuid(body.id)) {
    return Response.json({ ok: false, message: "That claim is not on the desk." }, { status: 400 });
  }
  if (body.action !== "dismiss" && body.action !== "investigate") {
    return Response.json({ ok: false, message: "That action is not available." }, { status: 400 });
  }
  const result = await setClaimDeskStatus(body.id, body.action);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
