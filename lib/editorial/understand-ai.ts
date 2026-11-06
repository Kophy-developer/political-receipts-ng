import { extractionTimeoutMs } from "@/lib/ai/budgets";
import { generateStructuredContent, type ProviderCaller, type ProviderPlan } from "@/lib/ai/route";
import type { StampedAttempt } from "@/lib/drafts/chain";
import { assessmentBatches, type ConversationPacket } from "@/lib/editorial/packet";
import { stampUnderstandAttempt } from "@/lib/editorial/trace";
import {
  parseConversationUnderstanding,
  routeAll,
  understandPromptVersion,
  understandSystem,
  understandUser,
  type ConversationUnderstanding,
  type RoutedConversation,
} from "@/lib/editorial/understand";

export type UnderstandRun = {
  ok: boolean;
  routed: RoutedConversation[] | null;
  readings: ConversationUnderstanding[] | null;
  modelCalls: number;
  provider: string | null;
  attempts: StampedAttempt[];
  failureMessage: string | null;
  xRequests: 0;
  researchCalls: 0;
  posted: false;
};

export async function understandPackets(input: {
  requestId: string;
  packets: ConversationPacket[];
  plans: ProviderPlan[];
  now?: () => number;
  call: ProviderCaller;
}): Promise<UnderstandRun> {
  const attempts: StampedAttempt[] = [];
  const readings: ConversationUnderstanding[] = [];
  let provider: string | null = null;
  for (const batch of assessmentBatches(input.packets)) {
    const ids = batch.map((packet) => packet.id);
    const routed = await generateStructuredContent({
      task: understandPromptVersion,
      systemPrompt: understandSystem(),
      userPrompt: understandUser(batch),
      schema: null,
      timeoutMs: extractionTimeoutMs(),
      plans: input.plans,
      rejectionReason: "The conversation understanding did not match the schema.",
      now: input.now,
      accept: (data) => (parseConversationUnderstanding(data, ids).success ? "success" : "malformed"),
      call: input.call,
    });
    const validation = routed.ok ? parseConversationUnderstanding(routed.data, ids) : null;
    const parsed = validation?.success ? validation.validated_output ?? null : null;
    attempts.push(...routed.attempts.map((attempt) => {
      const rejected = attempt.parsedPayload === undefined ? null : parseConversationUnderstanding(attempt.parsedPayload, ids);
      return stampUnderstandAttempt(
        attempt,
        input.requestId,
        parsed,
        rejected && !rejected.success ? {
          errors: rejected.errors,
          parsed: attempt.parsedPayload,
          readingsReceived: rejected.readings_received,
          readingsValid: rejected.readings_valid,
          missingIds: rejected.missing_ids,
          duplicateIds: rejected.duplicate_ids,
          unexpectedIds: rejected.unexpected_ids,
        } : null,
      );
    }));
    if (!routed.ok || !parsed) {
      const failureMessage = attempts.find((attempt) => attempt.response && typeof attempt.response === "object" && (attempt.response as { kind?: unknown }).kind === "conversation-understand-v1-rejected")?.failureReason ?? null;
      return {
        ok: false,
        routed: null,
        readings: null,
        modelCalls: attempts.filter((attempt) => attempt.called).length,
        provider: routed.provider,
        attempts,
        failureMessage,
        xRequests: 0,
        researchCalls: 0,
        posted: false,
      };
    }
    provider = routed.provider;
    readings.push(...parsed);
  }
  return {
    ok: true,
    routed: routeAll(input.packets, readings, input.now?.() ?? Date.now()),
    readings,
    modelCalls: attempts.filter((attempt) => attempt.called).length,
    provider,
    attempts,
    failureMessage: null,
    xRequests: 0,
    researchCalls: 0,
    posted: false,
  };
}
