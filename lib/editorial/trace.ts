import type { AttemptRecord } from "@/lib/ai/route";
import type { StampedAttempt } from "@/lib/drafts/chain";
import type { EditorialReading } from "@/lib/editorial/reading";
import { providerLabels } from "@/lib/ai/catalog";
import { sanitizeProviderMessage } from "@/lib/ai/diagnostics";
import { understandingFailureMessage, type ConversationUnderstanding, type UnderstandingFieldError } from "@/lib/editorial/understand";

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

export type UnderstandTrace = {
  kind: "conversation-understand-v1";
  provider: string;
  model: string;
  requestId: string;
  providerRequestId: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  assessmentVersions: Record<string, number>;
  parsed: { conversations: Array<Record<string, unknown>> };
};

export function understandTrace(input: {
  provider: string;
  model: string;
  requestId: string;
  providerRequestId: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  reasoningTokens: number | null;
  readings: ConversationUnderstanding[];
}): UnderstandTrace {
  return {
    kind: "conversation-understand-v1",
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
      conversations: input.readings.map((reading) => ({
        conversation_id: reading.conversationId,
        summary: reading.summary,
        subjects: reading.subjects,
        primary_kind: reading.primaryKind,
        checkable_facts: reading.checkableFacts,
        data_or_numbers_involved: reading.dataOrNumbersInvolved,
        event_or_development: reading.eventOrDevelopment,
        prediction_present: reading.predictionPresent,
        opinion_present: reading.opinionPresent,
        possible_routes: reading.possibleRoutes,
        research_need: reading.researchNeed,
        reason_for_research_need: reading.reasonForResearchNeed,
        understood: reading.understood,
      })),
    },
  };
}

export const rejectedUnderstandingCharLimit = 16_000;
export const rejectedUnderstandingErrorLimit = 20;

export type RejectedUnderstanding = {
  kind: "conversation-understand-v1-rejected";
  provider: string;
  model: string;
  requestId: string;
  errors: UnderstandingFieldError[];
  readings_received: number | null;
  readings_valid: number | null;
  missing_ids: string[];
  duplicate_ids: string[];
  unexpected_ids: string[];
  parsed: unknown;
  truncated: boolean;
};

function providerName(provider: string) {
  return provider === "groq" || provider === "openrouter" || provider === "gemini" ? providerLabels[provider] : provider;
}

function redactParsed(value: unknown, depth: number): unknown {
  if (depth > 6) return "[depth limited]";
  if (typeof value === "string") return sanitizeProviderMessage(value);
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => redactParsed(item, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      if (/token|secret|password|authorization|cookie|bearer|api[_-]?key/i.test(key)) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = redactParsed(item, depth + 1);
    }
    return out;
  }
  return null;
}

function storedError(error: UnderstandingFieldError): UnderstandingFieldError {
  return {
    conversation_id: error.conversation_id ? error.conversation_id.slice(0, 80) : null,
    field_path: error.field_path.slice(0, 120),
    expected: error.expected.slice(0, 180),
    received_type: error.received_type.slice(0, 40),
    message: error.message.slice(0, 180),
  };
}

/** Server-side record of a rejected understanding object. The desk does not render `parsed`. */
function idList(value: string[] | undefined) {
  return (value ?? []).filter((id) => typeof id === "string").slice(0, 20).map((id) => id.slice(0, 80));
}

export function rejectedUnderstandingResponse(input: {
  provider: string;
  model: string;
  requestId: string;
  errors: UnderstandingFieldError[];
  parsed: unknown;
  readingsReceived?: number;
  readingsValid?: number;
  missingIds?: string[];
  duplicateIds?: string[];
  unexpectedIds?: string[];
}): RejectedUnderstanding {
  const errors = input.errors.slice(0, rejectedUnderstandingErrorLimit).map(storedError);
  const redacted = redactParsed(input.parsed, 0);
  const serialized = JSON.stringify(redacted);
  const truncated = serialized.length > rejectedUnderstandingCharLimit;
  return {
    kind: "conversation-understand-v1-rejected",
    provider: input.provider.slice(0, 40),
    model: input.model.slice(0, 120),
    requestId: input.requestId.slice(0, 80),
    errors,
    readings_received: typeof input.readingsReceived === "number" ? input.readingsReceived : null,
    readings_valid: typeof input.readingsValid === "number" ? input.readingsValid : null,
    missing_ids: idList(input.missingIds),
    duplicate_ids: idList(input.duplicateIds),
    unexpected_ids: idList(input.unexpectedIds),
    parsed: truncated ? { truncated: true, characters: serialized.length } : redacted,
    truncated,
  };
}

export type UnderstandingFailureNotice = {
  explanation: string;
  completedAt: string;
  provider: string;
};

export function understandingFailureNotice(value: unknown, provider: string): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.kind !== "conversation-understand-v1-rejected" || !Array.isArray(row.errors) || row.errors.length === 0) return null;
  const errors: UnderstandingFieldError[] = [];
  for (const item of row.errors) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const field = item as Record<string, unknown>;
    if (typeof field.field_path !== "string" || typeof field.message !== "string") continue;
    errors.push({
      conversation_id: typeof field.conversation_id === "string" ? field.conversation_id : null,
      field_path: field.field_path,
      expected: typeof field.expected === "string" ? field.expected : "",
      received_type: typeof field.received_type === "string" ? field.received_type : "",
      message: field.message,
    });
  }
  if (errors.length === 0) return null;
  const received = typeof row.readings_received === "number" ? row.readings_received : null;
  const valid = typeof row.readings_valid === "number" ? row.readings_valid : null;
  const counts = received == null ? "" : `Received ${received}. Valid ${valid ?? 0}. `;
  return `${counts}${understandingFailureMessage(providerName(provider), errors)}`;
}

export function stampUnderstandAttempt(
  attempt: AttemptRecord,
  requestId: string,
  readings: ConversationUnderstanding[] | null,
  rejected: {
    errors: UnderstandingFieldError[];
    parsed: unknown;
    readingsReceived?: number;
    readingsValid?: number;
    missingIds?: string[];
    duplicateIds?: string[];
    unexpectedIds?: string[];
  } | null = null,
): StampedAttempt {
  const { parsedPayload, ...rest } = attempt;
  void parsedPayload;
  const stamped: StampedAttempt = { ...rest, requestId, task: "understand" };
  if (attempt.status === "success" && readings) {
    return {
      ...stamped,
      response: understandTrace({
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
  if (rejected && rejected.errors.length > 0) {
    const explanation = understandingFailureMessage(providerName(attempt.provider), rejected.errors);
    return {
      ...stamped,
      failureReason: explanation,
      diagnostic: stamped.diagnostic ? { ...stamped.diagnostic, message: explanation } : stamped.diagnostic,
      response: rejectedUnderstandingResponse({
        provider: attempt.provider,
        model: attempt.model,
        requestId,
        errors: rejected.errors,
        parsed: rejected.parsed,
        readingsReceived: rejected.readingsReceived,
        readingsValid: rejected.readingsValid,
        missingIds: rejected.missingIds,
        duplicateIds: rejected.duplicateIds,
        unexpectedIds: rejected.unexpectedIds,
      }),
    };
  }
  return stamped;
}

export function readUnderstandTrace(value: unknown): UnderstandTrace | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.kind !== "conversation-understand-v1") return null;
  const provider = text(row.provider);
  const model = text(row.model);
  const requestId = text(row.requestId);
  if (!provider || !model || !requestId) return null;
  const parsed = row.parsed;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const conversations = (parsed as { conversations?: unknown }).conversations;
  if (!Array.isArray(conversations)) return null;
  return {
    kind: "conversation-understand-v1",
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
      conversations: conversations.filter((item) => item && typeof item === "object" && !Array.isArray(item)) as Array<Record<string, unknown>>,
    },
  };
}

export function withUnderstandVersions(response: unknown, versions: Record<string, number>): unknown {
  const trace = readUnderstandTrace(response);
  if (!trace) return withAssessmentVersions(response, versions);
  const ids = new Set(trace.parsed.conversations.map((item) => (typeof item.conversation_id === "string" ? item.conversation_id : "")));
  const assessmentVersions: Record<string, number> = {};
  for (const [id, version] of Object.entries(versions)) {
    if (ids.has(id) && Number.isInteger(version) && version > 0) assessmentVersions[id] = version;
  }
  return { ...trace, assessmentVersions };
}

export function readDiagnosticTrace(value: unknown) {
  return readUnderstandTrace(value) ?? readEditorialTrace(value);
}
