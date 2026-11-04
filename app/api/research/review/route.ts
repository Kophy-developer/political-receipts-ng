import { connection } from "next/server";
import { reviewResearch } from "@/lib/db/research";
import { assertEditorPost } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const rejected = assertEditorPost(request);
  if (rejected) return Response.json({ ok: false, message: rejected }, { status: 403 });
  let body: {
    claimId?: unknown;
    action?: unknown;
    evidenceId?: unknown;
    tierRank?: unknown;
    stance?: unknown;
    verdict?: unknown;
    working?: unknown;
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
  });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
