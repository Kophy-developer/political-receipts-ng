import { connection } from "next/server";
import { geminiHealth } from "@/lib/ai/gemini";
import { saveAnalysis } from "@/lib/db/intel";
import { recordUsage } from "@/lib/db/usage";
import { assertEditorPost } from "@/lib/x/guard";

export const maxDuration = 30;

export async function POST(request: Request) {
  await connection();
  const rejected = assertEditorPost(request);
  if (rejected) return Response.json({ ok: false, message: rejected, called: false }, { status: 403 });
  const health = await geminiHealth();
  if (health.called) {
    await recordUsage({
      provider: "gemini",
      operation: "health",
      requests: 1,
      units: 0,
      inputTokens: health.usage.inputTokens,
      outputTokens: health.usage.outputTokens,
    });
    await saveAnalysis({ provider: "gemini", model: health.model, promptVersion: "health-v1" });
  }
  return Response.json({
    ok: health.ok,
    model: health.model,
    message: health.message,
    called: health.called,
  });
}
