import { connection } from "next/server";
import { developContent, furtherResearch, previewDevelopment } from "@/lib/db/develop";
import { assertEditorPost } from "@/lib/x/guard";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const refused = assertEditorPost(request);
  if (refused) return Response.json({ ok: false, message: refused }, { status: 403, headers: { "cache-control": "no-store" } });
  let body: { id?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action === "start" || body.action === "preview" || body.action === "further-preview" || body.action === "further" ? body.action : "";
  if (!action) return Response.json({ ok: false, message: "Choose a preview or a start. Nothing was called." }, { status: 400 });
  if (action === "preview") {
    const preview = await previewDevelopment(id);
    return Response.json(preview, { status: preview.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  }
  if (action === "further-preview" || action === "further") {
    const further = await furtherResearch(id, action === "further");
    return Response.json(further, { status: further.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  }
  const result = await developContent(id);
  return Response.json(result, { status: result.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
