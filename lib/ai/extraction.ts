import { extractionSchema, extractionSystem, extractionUser, parseExtraction, type ModelClaim, type ModelPost } from "@/lib/ai/extract";
import { generateStructuredContent, type ProviderCaller, type ProviderPlan } from "@/lib/ai/route";
import type { StampedAttempt } from "@/lib/drafts/chain";
import type { Relevance } from "@/lib/intel/relevance";

export type ExtractionPost = {
  id: string;
  text: string;
  username: string | null;
  relevance: Relevance;
};

export type ExtractionChainResult = {
  requestId: string;
  ok: boolean;
  provider: string | null;
  model: string | null;
  parsed: { posts: ModelPost[]; claims: ModelClaim[] } | null;
  attempts: StampedAttempt[];
  classification: string | null;
};

/** Structural acceptance only. A valid empty claim list is success and does not try the next provider. */
export function acceptExtraction(data: unknown) {
  return parseExtraction(data) ? ("success" as const) : ("malformed" as const);
}

export async function extractWithProviders(input: {
  requestId: string;
  posts: ExtractionPost[];
  plans: ProviderPlan[];
  timeoutMs: number;
  now?: () => number;
  call: ProviderCaller;
}): Promise<ExtractionChainResult> {
  const routed = await generateStructuredContent({
    task: "extraction",
    systemPrompt: extractionSystem,
    userPrompt: extractionUser(input.posts),
    schema: extractionSchema,
    timeoutMs: input.timeoutMs,
    plans: input.plans,
    rejectionReason: "The extraction did not match the claim schema.",
    now: input.now,
    accept: acceptExtraction,
    call: input.call,
  });
  const attempts = routed.attempts.map((attempt) => ({ ...attempt, requestId: input.requestId, task: "extraction" as const }));
  const last = [...attempts].reverse().find((attempt) => attempt.called) ?? null;
  return {
    requestId: input.requestId,
    ok: routed.ok,
    provider: routed.provider,
    model: routed.model,
    parsed: routed.ok ? parseExtraction(routed.data) : null,
    attempts,
    classification: last?.diagnostic?.classification ?? null,
  };
}
