import { connection } from "next/server";
import { reviewResearch } from "@/lib/db/research";
import { assertEditorRequest } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const rejected = await assertEditorRequest(request);
  if (rejected) return Response.json({ ok: false, message: rejected.message }, { status: rejected.status });
  let body: {
    claimId?: unknown;
    action?: unknown;
    evidenceId?: unknown;
    tierRank?: unknown;
    stance?: unknown;
    verdict?: unknown;
    working?: unknown;
    angle?: unknown;
    angleText?: unknown;
    take?: unknown;
    confidence?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const result = await reviewResearch({
    claimId: typeof body.claimId === "string" ? body.claimId : "",
    action: typeof body.action === "string" ? body.action : "",
    evidenceId: typeof body.evidenceId === "string" ? body.evidenceId : undefined,
    tierRank: typeof body.tierRank === "number" ? body.tierRank : undefined,
    stance: typeof body.stance === "string" ? body.stance : undefined,
    verdict: typeof body.verdict === "string" ? body.verdict : undefined,
    working: typeof body.working === "string" ? body.working : undefined,
    angle: typeof body.angle === "string" ? body.angle : undefined,
    angleText: typeof body.angleText === "string" ? body.angleText : undefined,
    take: typeof body.take === "string" ? body.take : undefined,
    confidence: typeof body.confidence === "string" ? body.confidence : undefined,
  });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
