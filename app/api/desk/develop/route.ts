import { connection } from "next/server";
import { continueContent, developContent, furtherResearch, openSavedDocuments, previewDevelopment, readOfficialSeries, resumeValidatedSeries } from "@/lib/db/develop";
import { assertEditorRequest } from "@/lib/x/guard";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { id?: unknown; action?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const action = body.action === "start" || body.action === "preview" || body.action === "further-preview" || body.action === "further" || body.action === "continue-preview" || body.action === "continue" || body.action === "open-saved" || body.action === "read-structured" || body.action === "resume-saved" ? body.action : "";
  if (!action) return Response.json({ ok: false, message: "Choose a preview or a start. Nothing was called." }, { status: 400 });
  if (action === "preview") {
    const preview = await previewDevelopment(id);
    return Response.json(preview, { status: preview.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  }
  if (action === "further-preview" || action === "further") {
    const further = await furtherResearch(id, action === "further");
    return Response.json(further, { status: further.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  }
  if (action === "continue-preview" || action === "continue") {
    const continued = await continueContent(id, action === "continue");
    return Response.json(continued, { status: continued.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  }
  if (action === "resume-saved") {
    const saved = await resumeValidatedSeries(id, true);
    return Response.json(saved, { status: saved.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  }
  if (action === "read-structured") {
    const read = await readOfficialSeries(id, true);
    return Response.json(read, { status: read.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  }
  if (action === "open-saved") {
    const opened = await openSavedDocuments(id, true);
    return Response.json(opened, { status: opened.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
  }
  const result = await developContent(id);
  return Response.json(result, { status: result.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
