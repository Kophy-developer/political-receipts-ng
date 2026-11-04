import { connection } from "next/server";
import { reviewStoredConversations } from "@/lib/db/opportunities";
import { assertEditorPost } from "@/lib/x/guard";

export async function POST(request: Request) {
  await connection();
  const rejected = assertEditorPost(request);
  if (rejected) return Response.json({ ok: false, message: rejected }, { status: 403 });
  const result = await reviewStoredConversations();
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
