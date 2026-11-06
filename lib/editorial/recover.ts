import type { ConversationPacket } from "@/lib/editorial/packet";
import { inboxRecords, parseConversationUnderstanding, routeAll, understandingOutcomeMessage, type RoutedConversation } from "@/lib/editorial/understand";

export const recoveredUnderstandingAttemptId = "0cc95870-6646-4ae1-a69c-4fc136789862";
export const recoveredUnderstandingScanId = "6dc2ba15-f367-4e35-a715-f18f5f507157";

type InboxOpportunity = ReturnType<typeof inboxRecords>["opportunity"];

export type RecoveryRow = {
  conversationId: string;
  assessment: ReturnType<typeof inboxRecords>["assessment"];
  opportunity: Omit<InboxOpportunity, "understanding"> & {
    understanding: InboxOpportunity["understanding"] & { recoveredFromAttempt: string };
  };
};

export function planSavedUnderstandingRecovery(input: {
  attemptId: string;
  scanId: string;
  parsed: unknown;
  truncated: boolean;
  packets: ConversationPacket[];
  now?: number;
}): { ok: true; routed: RoutedConversation[]; rows: RecoveryRow[]; message: string } | { ok: false; message: string } {
  if (input.attemptId !== recoveredUnderstandingAttemptId || input.scanId !== recoveredUnderstandingScanId) {
    return { ok: false, message: "Recovery is limited to the stored understanding attempt and its scan." };
  }
  if (input.truncated || !input.parsed || typeof input.parsed !== "object") {
    return { ok: false, message: "The stored response is truncated or missing, so it cannot be recovered. No model request was made." };
  }
  const ids = input.packets.map((packet) => packet.id);
  if (ids.length !== 10 || new Set(ids).size !== 10) {
    return { ok: false, message: "The scan does not have the ten stored conversations. No model request was made." };
  }
  const validation = parseConversationUnderstanding(input.parsed, ids);
  if (!validation.success || !validation.validated_output || validation.readings_valid !== 10) {
    const first = validation.errors[0];
    return {
      ok: false,
      message: first
        ? `The stored response does not validate: ${first.field_path}: ${first.message}. No model request was made.`
        : "The stored response does not validate. No model request was made.",
    };
  }
  const readingIds = new Set(validation.validated_output.map((reading) => reading.conversationId));
  if (ids.some((id) => !readingIds.has(id)) || readingIds.size !== 10) {
    return { ok: false, message: "The stored readings do not match the ten stored conversation IDs. No model request was made." };
  }
  const routed = routeAll(input.packets, validation.validated_output, input.now ?? Date.now());
  const rows = routed.map((item, index) => {
    const records = inboxRecords(item, input.scanId, index + 1);
    return {
      conversationId: item.id,
      assessment: { ...records.assessment, model_called: false, x_requests: 0 },
      opportunity: {
        ...records.opportunity,
        understanding: { ...records.opportunity.understanding, recoveredFromAttempt: input.attemptId },
      },
    };
  });
  const understood = routed.filter((item) => item.lifecycle === "RANKED").length;
  return {
    ok: true,
    routed,
    rows,
    message: understandingOutcomeMessage({
      received: routed.length,
      understood,
      unclear: routed.length - understood,
      modelCalls: 0,
      recovered: true,
    }),
  };
}
