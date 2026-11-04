import { parseSourceLinks } from "@/lib/desk/story";
import { saveFinalPost } from "@/lib/db/final-post";
import { isUuid } from "@/lib/db/labels";
import { assertEditorPost } from "@/lib/x/guard";

export async function POST(request: Request) {
  const refused = assertEditorPost(request);
  if (refused) return Response.json({ ok: false, message: refused }, { status: 403, headers: { "cache-control": "no-store" } });
  let body: { claimId?: unknown; text?: unknown; sources?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  if (typeof body.claimId !== "string" || !isUuid(body.claimId)) {
    return Response.json({ ok: false, message: "That story is not on the desk." }, { status: 400 });
  }
  if (typeof body.text !== "string" || !body.text.trim()) {
    return Response.json({ ok: false, message: "The final post is empty." }, { status: 400 });
  }
  const sources = parseSourceLinks(typeof body.sources === "string" ? body.sources : "");
  if (!sources.ok) return Response.json({ ok: false, message: sources.reason }, { status: 400 });
  const saved = await saveFinalPost({ claimId: body.claimId, text: body.text, sources: sources.links });
  if (!saved.ok) return Response.json({ ok: false, message: saved.message }, { status: 400 });
  return Response.json({ ok: true, id: saved.id, text: saved.text, message: "Final post saved. It was not published." });
}
