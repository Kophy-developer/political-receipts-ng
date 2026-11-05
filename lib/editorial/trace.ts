import type { AttemptRecord } from "@/lib/ai/route";
import type { StampedAttempt } from "@/lib/drafts/chain";
import type { EditorialReading } from "@/lib/editorial/reading";

export type EditorialTrace = {
  kind: "editorial-assess-v1";
  provider: string;
  model: string;
  requestId: string;
  providerRequestId: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  assessmentVersions: Record<string, number>;
  parsed: { assessments: Array<Record<string, unknown>> };
};

function text(value: unknown) {
  return typeof value === "string" ? value : null;
}

function count(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function versionsOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const versions: Record<string, number> = {};
  for (const [id, version] of Object.entries(value)) {
    if (typeof version === "number" && Number.isInteger(version) && version > 0) versions[id] = version;
  }
  return versions;
}

/** The validated reading, not the raw provider envelope. */
export function editorialTrace(input: {
  provider: string;
  model: string;
  requestId: string;
  providerRequestId: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  readings: EditorialReading[];
}): EditorialTrace {
  return {
    kind: "editorial-assess-v1",
    provider: input.provider,
    model: input.model,
    requestId: input.requestId,
    providerRequestId: input.providerRequestId,
    finishReason: input.finishReason,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    reasoningTokens: input.reasoningTokens,
    assessmentVersions: {},
    parsed: {
      assessments: input.readings.map((reading) => ({
        conversation_id: reading.conversationId,
        worth_talking_about: reading.worthTalkingAbout,
        content_type: reading.contentType,
        priority: reading.priority,
        timeliness: reading.timeliness,
        research_need: reading.researchNeed,
        reason: reading.reason,
        angle: reading.angle,
        factual_foundation: reading.factualFoundation,
        claim_extraction_needed: reading.claimExtractionNeeded,
        context_summary: reading.contextSummary,
        confidence: reading.confidence,
        editorial_basis: reading.editorialBasis,
      })),
    },
  };
}

export function stampEditorialAttempt(attempt: AttemptRecord, requestId: string, readings: EditorialReading[] | null): StampedAttempt {
  const stamped: StampedAttempt = { ...attempt, requestId, task: "editorial" };
  if (attempt.status !== "success" || !readings) return stamped;
  return {
    ...stamped,
    response: editorialTrace({
      provider: attempt.provider,
      model: attempt.model,
      requestId,
      providerRequestId: attempt.providerRequestId ?? null,
      finishReason: attempt.finishReason ?? null,
      inputTokens: attempt.inputTokens,
      outputTokens: attempt.outputTokens,
      reasoningTokens: attempt.reasoningTokens,
      readings,
    }),
  };
}

export function readEditorialTrace(value: unknown): EditorialTrace | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.kind !== "editorial-assess-v1") return null;
  const provider = text(row.provider);
  const model = text(row.model);
  const requestId = text(row.requestId);
  if (!provider || !model || !requestId) return null;
  const parsed = row.parsed;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const assessments = (parsed as { assessments?: unknown }).assessments;
  if (!Array.isArray(assessments)) return null;
  return {
    kind: "editorial-assess-v1",
    provider,
    model,
    requestId,
    providerRequestId: text(row.providerRequestId),
    finishReason: text(row.finishReason),
    inputTokens: count(row.inputTokens),
    outputTokens: count(row.outputTokens),
    reasoningTokens: count(row.reasoningTokens),
    assessmentVersions: versionsOf(row.assessmentVersions),
    parsed: {
      assessments: assessments.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Array<Record<string, unknown>>,
    },
  };
}

/** Versions are known only after the rows are planned. Attach them to the stored reading. */
export function withAssessmentVersions(response: unknown, versions: Record<string, number>): unknown {
  const trace = readEditorialTrace(response);
  if (!trace) return response;
  const ids = new Set(trace.parsed.assessments.map((item) => (typeof item.conversation_id === "string" ? item.conversation_id : "")));
  const assessmentVersions: Record<string, number> = {};
  for (const [id, version] of Object.entries(versions)) {
    if (ids.has(id) && Number.isInteger(version) && version > 0) assessmentVersions[id] = version;
  }
  return { ...trace, assessmentVersions };
}
