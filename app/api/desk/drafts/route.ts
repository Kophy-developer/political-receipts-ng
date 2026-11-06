import { saveDraftEdit } from "@/lib/db/drafts";
import { isUuid } from "@/lib/db/labels";
import { editorActor } from "@/lib/db/identity";
import { assertEditorRequest } from "@/lib/x/guard";

export async function POST(request: Request) {
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { draftId?: unknown; content?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  if (typeof body.draftId !== "string" || !isUuid(body.draftId) || typeof body.content !== "string") {
    return Response.json({ ok: false, message: "The draft edit is incomplete." }, { status: 400, headers: { "cache-control": "no-store" } });
  }
  const saved = await saveDraftEdit({ draftId: body.draftId, content: body.content, actor: await editorActor() });
  if (!saved.ok) return Response.json({ ok: false, message: saved.message }, { status: 400, headers: { "cache-control": "no-store" } });
  return Response.json({ ok: true }, { headers: { "cache-control": "no-store" } });
}
