import { connection } from "next/server";
import { createManualClaim } from "@/lib/db/research";
import { assertEditorPost } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const rejected = assertEditorPost(request);
  if (rejected) return Response.json({ ok: false, message: rejected }, { status: 403 });
  let body: {
    claim?: unknown;
    speaker?: unknown;
    pillar?: unknown;
    topic?: unknown;
    notes?: unknown;
    postUrl?: unknown;
    entities?: unknown;
    statementKind?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, message: "The desk could not read that request." }, { status: 400 });
  }
  const text = (value: unknown) => (typeof value === "string" ? value : "");
  const result = await createManualClaim({
    claim: text(body.claim),
    speaker: text(body.speaker),
    pillar: text(body.pillar),
    topic: text(body.topic),
    notes: text(body.notes),
    postUrl: text(body.postUrl),
    entities: text(body.entities),
    statementKind: text(body.statementKind),
  });
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
