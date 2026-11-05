import { extractionTimeoutMs } from "@/lib/ai/budgets";
import { generateStructuredContent, type ProviderCaller, type ProviderPlan } from "@/lib/ai/route";
import type { StampedAttempt } from "@/lib/drafts/chain";
import {
  editorialSystem,
  editorialUser,
  parseEditorialAssessment,
  rankReadings,
  type EditorialReading,
} from "@/lib/editorial/reading";
import { stampEditorialAttempt } from "@/lib/editorial/trace";
import { assessmentBatches, type ConversationPacket } from "@/lib/editorial/packet";
import type { RankedConversation } from "@/lib/editorial/model";

export const editorialMaxTokens = 6144;

export type EditorialRun = {
  ok: boolean;
  ranked: RankedConversation[] | null;
  modelCalls: number;
  provider: string | null;
  attempts: StampedAttempt[];
  xRequests: 0;
  researchCalls: 0;
  posted: false;
};

export async function assessPackets(input: {
  requestId: string;
  packets: ConversationPacket[];
  plans: ProviderPlan[];
  recentTexts?: string[];
  now?: () => number;
  call: ProviderCaller;
}): Promise<EditorialRun> {
  const attempts: StampedAttempt[] = [];
  const batches = assessmentBatches(input.packets);
  const readings: EditorialReading[] = [];
  let provider: string | null = null;
  for (const batch of batches) {
    const ids = batch.map((packet) => packet.id);
    const routed = await generateStructuredContent({
      task: "editorial-assess-v1",
      systemPrompt: editorialSystem(),
      userPrompt: editorialUser(batch),
      schema: null,
      timeoutMs: extractionTimeoutMs(),
      plans: input.plans,
      rejectionReason: "The editorial assessment did not match the conversation schema.",
      now: input.now,
      accept: (data) => (parseEditorialAssessment(data, ids) ? "success" : "malformed"),
      call: input.call,
    });
    const parsed = routed.ok ? parseEditorialAssessment(routed.data, ids) : null;
    attempts.push(...routed.attempts.map((attempt) => stampEditorialAttempt(attempt, input.requestId, parsed)));
    if (!routed.ok || !parsed) {
      return {
        ok: false,
        ranked: null,
        modelCalls: attempts.filter((attempt) => attempt.called).length,
        provider: routed.provider,
        attempts,
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
    ranked: rankReadings(input.packets, readings, input.recentTexts ?? []),
    modelCalls: attempts.filter((attempt) => attempt.called).length,
    provider,
    attempts,
    xRequests: 0,
    researchCalls: 0,
    posted: false,
  };
}
