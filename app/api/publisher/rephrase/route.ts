import { connection } from "next/server";
import { planDraftProviders } from "@/lib/ai/catalog";
import { generateStructuredContent } from "@/lib/ai/route";
import { readAiEnv } from "@/lib/ai/runtime";
import { callProvider } from "@/lib/ai/transport";
import { calledToday, persistAttempts } from "@/lib/db/ai-attempts";
import {
  parseRephraseRequest,
  rephraseGeminiSchema,
  rephraseSchema,
  rephraseSystemPrompt,
  rephraseUserPrompt,
  textFromRephrase,
} from "@/lib/publisher/rephrase";
import { assertEditorRequest } from "@/lib/x/guard";

export const maxDuration = 45;

export async function POST(request: Request) {
  await connection();
  const refused = await assertEditorRequest(request);
  if (refused) return Response.json({ ok: false, message: refused.message }, { status: refused.status, headers: { "cache-control": "no-store" } });
  let body: { text?: unknown; instruction?: unknown; claim?: unknown; caveats?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, message: "The rewrite request could not be read. Nothing was published." }, { status: 400 });
  }
  const parsed = parseRephraseRequest(body);
  if (!parsed.ok) return Response.json({ ok: false, message: parsed.message }, { status: 400 });
  const used = await calledToday();
  const plans = planDraftProviders(readAiEnv(), used);
  if (plans.every((plan) => plan.skipReason)) {
    return Response.json({
      ok: false,
      message: "No AI rewrite provider is available right now. Edit the draft yourself, or try again after a provider is configured.",
    }, { status: 503 });
  }
  const routed = await generateStructuredContent({
    task: "draft_regenerate",
    systemPrompt: rephraseSystemPrompt(),
    userPrompt: rephraseUserPrompt(parsed.value),
    schema: plans[0]?.id === "gemini" ? rephraseGeminiSchema : rephraseSchema,
    timeoutMs: 20_000,
    plans,
    rejectionReason: "The rewrite did not return usable post text.",
    accept: (data) => (textFromRephrase(data) ? "success" : "malformed"),
    call: (plan, providerRequest) => callProvider(plan, {
      ...providerRequest,
      schema: plan.id === "gemini" ? rephraseGeminiSchema : rephraseSchema,
    }),
  });
  await persistAttempts(routed.attempts.map((attempt) => ({ ...attempt, requestId: crypto.randomUUID(), task: "draft_regenerate" as const })));
  if (!routed.ok) {
    return Response.json({
      ok: false,
      message: routed.rejected
        ? "The rewrite came back unusable. Nothing was published."
        : "The rewrite did not finish. Nothing was published.",
    }, { status: 502 });
  }
  const text = textFromRephrase(routed.data);
  if (!text) {
    return Response.json({ ok: false, message: "The rewrite came back empty. Nothing was published." }, { status: 502 });
  }
  return Response.json({
    ok: true,
    text,
    message: "Rewrite ready. Review it before publishing.",
    provider: routed.provider,
    model: routed.model,
  }, { headers: { "cache-control": "no-store" } });
}
