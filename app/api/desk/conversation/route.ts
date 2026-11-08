import { connection } from "next/server";
import { confirmConversationLookup } from "@/lib/db/activity";
import { assertEditorRequest } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, called: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { id?: unknown; confirm?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, called: false, message: "The desk could not read that request. Nothing was sent to X." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  const result = await confirmConversationLookup(id, body.confirm === true);
  return Response.json(result, { status: result.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
