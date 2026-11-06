import { connection } from "next/server";
import { decideOpportunity } from "@/lib/db/opportunities";
import { assertEditorRequest } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const rejected = await assertEditorRequest(request);
  if (rejected) return Response.json({ ok: false, message: rejected.message }, { status: rejected.status });
  let body: { id?: unknown; action?: unknown; angle?: unknown; take?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const result = await decideOpportunity({
    id: typeof body.id === "string" ? body.id : "",
    action: typeof body.action === "string" ? body.action : "",
    angle: typeof body.angle === "string" ? body.angle : "",
    take: typeof body.take === "string" ? body.take : "",
  });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
