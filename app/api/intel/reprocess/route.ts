import { connection } from "next/server";
import { reprocessStoredPosts } from "@/lib/intel/reprocess";
import { assertEditorPost } from "@/lib/x/guard";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const rejected = assertEditorPost(request);
  if (rejected) {
    return Response.json(
      {
        ok: false,
        xRequests: 0,
        detail: rejected,
        posted: false,
        polling: false,
        extraction: "failed",
        errors: [rejected],
      },
      { status: 403 },
    );
  }
  const report = await reprocessStoredPosts();
  return Response.json(report);
}
