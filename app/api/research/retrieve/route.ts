import { connection } from "next/server";
import { isUuid } from "@/lib/db/labels";
import { retrieveStoredResults } from "@/lib/research/retrieve-selected";
import { assertEditorRequest } from "@/lib/x/guard";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const rejected = await assertEditorRequest(request);
  if (rejected) return Response.json({ ok: false, retrieved: 0, message: rejected.message }, { status: rejected.status });
  let body: { claimId?: unknown; resultIds?: unknown };
  try {
    body = (await request.json()) as { claimId?: unknown; resultIds?: unknown };
  } catch {
    return Response.json({ ok: false, retrieved: 0, message: "The desk could not read that request." }, { status: 400 });
  }
  if (typeof body.claimId !== "string" || !isUuid(body.claimId)) {
    return Response.json({ ok: false, retrieved: 0, message: "That claim is not on the desk." }, { status: 400 });
  }
  const resultIds = Array.isArray(body.resultIds) ? body.resultIds.filter((item): item is string => typeof item === "string") : [];
  const result = await retrieveStoredResults(body.claimId, resultIds);
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
