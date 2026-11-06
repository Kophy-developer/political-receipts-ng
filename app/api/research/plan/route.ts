import { connection } from "next/server";
import { isUuid } from "@/lib/db/labels";
import { loadPlan, reviseResearchPlan } from "@/lib/research/plan";
import { assertEditorRequest } from "@/lib/x/guard";

function deskRead(request: Request) {
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") return "Open this from the desk.";
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return "Open this from the desk.";
    } catch {
      return "Open this from the desk.";
    }
  }
  return null;
}

export async function GET(request: Request) {
  await connection();
  const rejected = deskRead(request);
  if (rejected) return Response.json({ ok: false, message: rejected }, { status: 403 });
  const id = new URL(request.url).searchParams.get("claim");
  if (!id || !isUuid(id)) return Response.json({ ok: false, message: "That claim is not on the desk." }, { status: 400 });
  const plan = await loadPlan(id);
  if (!plan) return Response.json({ ok: false, message: "That claim is not on the desk." }, { status: 404 });
  return Response.json({ ok: true, plan, searched: false });
}

export async function POST(request: Request) {
  await connection();
  const rejected = await assertEditorRequest(request);
  if (rejected) return Response.json({ ok: false, message: rejected.message }, { status: rejected.status });
  let body: { claimId?: unknown; action?: unknown };
  try {
    body = (await request.json()) as { claimId?: unknown; action?: unknown };
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  if (typeof body.claimId !== "string" || !isUuid(body.claimId)) {
    return Response.json({ ok: false, message: "That claim is not on the desk." }, { status: 400 });
  }
  if (body.action !== "change" && body.action !== "advance" && body.action !== "accept") {
    return Response.json({ ok: false, message: "That plan action is not available. No search was sent." }, { status: 400 });
  }
  const result = await reviseResearchPlan(body.claimId, body.action);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
