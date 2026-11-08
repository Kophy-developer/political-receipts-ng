import { connection } from "next/server";
import { saveEngagement } from "@/lib/db/engagement";
import { assertEditorRequest } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { metric?: unknown; minimum?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that threshold. Nothing was sent to X." }, { status: 400 });
  }
  const saved = await saveEngagement(body);
  return Response.json(saved, { status: saved.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
