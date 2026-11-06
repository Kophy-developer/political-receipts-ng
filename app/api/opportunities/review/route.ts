import { connection } from "next/server";
import { reviewStoredConversations } from "@/lib/db/opportunities";
import { assertEditorRequest } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const rejected = await assertEditorRequest(request);
  if (rejected) return Response.json({ ok: false, message: rejected.message }, { status: rejected.status });
  const result = await reviewStoredConversations();
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
