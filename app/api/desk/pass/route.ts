import { connection } from "next/server";
import { passReadyClaim } from "@/lib/db/editorial";
import { assertEditorPost } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const rejected = assertEditorPost(request);
  if (rejected) return Response.json({ ok: false, xRequests: 0, posted: false, message: rejected }, { status: 403 });
  let body: { claimId?: unknown };
  try {
    body = (await request.json()) as { claimId?: unknown };
  } catch {
    body = {};
  }
  const result = await passReadyClaim(typeof body.claimId === "string" ? body.claimId : "");
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
