import { connection } from "next/server";
import { rejectReadyDraft } from "@/lib/db/publisher";
import { assertEditorRequest } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { opportunityId?: unknown; reason?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The queue could not read that request." }, { status: 400 });
  }
  if (typeof body.opportunityId !== "string") {
    return Response.json({ ok: false, message: "That draft could not be rejected." }, { status: 400 });
  }
  const rejected = await rejectReadyDraft({
    opportunityId: body.opportunityId,
    reason: typeof body.reason === "string" ? body.reason : undefined,
  });
  return Response.json(rejected, { status: rejected.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
