import { connection } from "next/server";
import { prepareApprovalDraft } from "@/lib/db/publisher";
import { assertEditorRequest } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { opportunityId?: unknown; text?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The queue could not read that request. Nothing was sent to X." }, { status: 400 });
  }
  if (typeof body.opportunityId !== "string" || typeof body.text !== "string") {
    return Response.json({ ok: false, message: "Choose a prepared draft. Nothing was sent to X." }, { status: 400 });
  }
  const prepared = await prepareApprovalDraft({ opportunityId: body.opportunityId, text: body.text });
  return Response.json(prepared, { status: prepared.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
