import { connection } from "next/server";
import { saveQueryPreference } from "@/lib/db/query-selection";
import { isScanMode } from "@/lib/pillars/catalog";
import { assertEditorRequest } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { pillar?: unknown; slug?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that group choice. Nothing was sent to X." }, { status: 400 });
  }
  if (!isScanMode(body.pillar) || body.pillar === "smart") {
    return Response.json({ ok: false, message: "Choose Politics, Finance, or Manchester United. Nothing was sent to X." }, { status: 400 });
  }
  const slug = body.slug === null || body.slug === "" ? null : typeof body.slug === "string" ? body.slug : null;
  if (body.slug !== null && body.slug !== "" && slug === null) {
    return Response.json({ ok: false, message: "That group choice was not a slug. Nothing was sent to X." }, { status: 400 });
  }
  const saved = await saveQueryPreference(body.pillar, slug);
  return Response.json(saved, { status: saved.ok ? 200 : 400, headers: { "cache-control": "no-store" } });
}
