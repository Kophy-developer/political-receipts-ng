import { saveEditorIdentity } from "@/lib/db/identity";
import { assertEditorRequest } from "@/lib/x/guard";

export async function POST(request: Request) {
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { name?: unknown; role?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  if (typeof body.name !== "string" || (body.role !== undefined && typeof body.role !== "string")) {
    return Response.json({ ok: false, message: "Enter a display name." }, { status: 400 });
  }
  const saved = await saveEditorIdentity({ name: body.name, role: typeof body.role === "string" ? body.role : "" });
  if (!saved.ok) return Response.json({ ok: false, message: saved.message }, { status: 400 });
  return Response.json({ ok: true, name: saved.name, role: saved.role, message: "Editor identity saved. The connected X account was not changed." });
}
