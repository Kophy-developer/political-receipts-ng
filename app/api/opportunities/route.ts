import { connection } from "next/server";
import { createManualOpportunity } from "@/lib/db/opportunities";
import { assertEditorPost } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const rejected = assertEditorPost(request);
  if (rejected) return Response.json({ ok: false, message: rejected }, { status: 403 });
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await createManualOpportunity({
    conversationId: text(body.conversationId),
    type: text(body.type),
    research: text(body.research),
    score: text(body.score),
    whatHappened: text(body.whatHappened),
    whyInteresting: text(body.whyInteresting),
    whatCouldAdd: text(body.whatCouldAdd),
    pillar: text(body.pillar) || "politics",
  });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
