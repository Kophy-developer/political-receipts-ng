import { connection } from "next/server";
import { isUuid } from "@/lib/db/labels";
import { loadPlan } from "@/lib/research/plan";

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
