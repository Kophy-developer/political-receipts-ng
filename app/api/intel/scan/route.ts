import { connection } from "next/server";
import { runScan } from "@/lib/intel/run";
import { assertEditorPost } from "@/lib/x/guard";

export const maxDuration = 60;

export async function POST(request: Request) {
  await connection();
  const rejected = assertEditorPost(request);
  if (rejected) return Response.json({ ok: false, stopped: rejected, posted: false, polling: false }, { status: 403 });
  const report = await runScan();
  return Response.json(report);
}
