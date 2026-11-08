import type { OpportunityType, ResearchNeed } from "@/lib/opportunities/types";
import { hasCheckableFact } from "@/lib/editorial/assess";
import { describeSource, replaceUserLabel, type QualityKind } from "@/lib/editorial/quality";
import { readingForPillar } from "@/lib/editorial/pillar-reading";
import { plannedNextStage, type Priority } from "@/lib/editorial/model";
import { fullConversationText, type ConversationPacket } from "@/lib/editorial/packet";
import type { ContentPillar } from "@/lib/pillars/catalog";

export const understandPromptVersion = "conversation-understand-v1";

export const primaryKinds = [
  "factual_assertion",
  "event",
  "opinion",
  "prediction",
  "question",
  "reaction",
  "humour",
  "rhetoric",
  "unclear",
] as const;

export const understandRoutes = [
  "CHECK",
  "ANALYSIS",
  "REACTION",
  "OPINION",
  "QUESTION",
  "HUMOUR",
  "ORIGINAL_INSIGHT",
] as const;

export type PrimaryKind = (typeof primaryKinds)[number];
export type UnderstandRoute = (typeof understandRoutes)[number];

const kindSet = new Set<string>(primaryKinds);
const routeSet = new Set<string>(understandRoutes);
const needSet = new Set<string>(["yes", "recommended", "no"]);

export type ConversationUnderstanding = {
  conversationId: string;
  summary: string;
  subjects: string[];
  primaryKind: PrimaryKind;
  checkableFacts: string[];
  dataOrNumbersInvolved: boolean;
  eventOrDevelopment: boolean;
  predictionPresent: boolean;
  opinionPresent: boolean;
  possibleRoutes: UnderstandRoute[];
  researchNeed: ResearchNeed;
  reasonForResearchNeed: string;
  understood: boolean;
};

export type RoutedConversation = {
  id: string;
  understood: boolean;
  lowValue: boolean;
  primaryKind: PrimaryKind;
  summary: string;
  subjects: string[];
  routes: UnderstandRoute[];
  researchNeed: ResearchNeed;
  reasonForResearchNeed: string;
  checkableFacts: string[];
  sourceText: string;
  pillar: ContentPillar;
  timely: boolean;
  band: 1 | 2 | 3 | 4 | 5;
  lifecycle: "RANKED" | "PASSED";
  passReason: string | null;
  rank: number | null;
  review: "Needs editorial review" | null;
  draftingCandidate: boolean;
  discoveredAt: string;
  index: number;
};

export const cannotUnderstand = "Cannot understand available text";

const timelyCue = /\b(today|yesterday|this morning|this week|this quarter|just announced|just said)\b/i;
const fortnightMs = 14 * 24 * 60 * 60 * 1000;

function recordOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function clip(value: string, max: number) {
  const text = value
    .replace(/bearer\s+\S+/gi, "bearer [redacted]")
    .replace(/\b(?:sk|gsk|rk|AIza)[_-]?[A-Za-z0-9\-._]{12,}\b/g, "[redacted]")
    .replace(/(?:api[_ -]?key|authorization|cookie)\s*[:=]\s*\S+/gi, (match) => match.replace(/[:=]\s*\S+/, ": [redacted]"))
    .replace(/\s+/g, " ")
    .trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

export function understandSystem() {
  return [
    "You read stored conversations for one human account. Your only job is to understand what each conversation contains.",
    "Do not decide whether a conversation is worth talking about, worth publishing, or likely to perform. Do not score its quality. Do not invent the account's belief. Do not forecast who wins an election.",
    "Do not include an extra status field. If you cannot tell what the stored posts are saying, set primary_kind to unclear and use the summary to say what is missing. Do not invent missing context.",
    "primary_kind classifies what the conversation contains. Allowed primary_kind values are only: factual_assertion, event, opinion, prediction, question, reaction, humour, rhetoric, unclear.",
    "A sentence about what someone did, spent, or claimed is a factual_assertion even when you have not verified it. Copy those sentences into checkable_facts.",
    "An event is a visit, meeting, or other development that is being reported. An opinion is a judgment. Humour is a joke. Rhetoric is insult, slogan, or heat with no proposition you can restate. A prediction says something will happen later. Leave it as a prediction.",
    "possible_routes are editorial routes, not classifications. Allowed possible_routes values are only: CHECK, ANALYSIS, REACTION, OPINION, QUESTION, HUMOUR, ORIGINAL_INSIGHT. They describe what the text could support. They are not a decision to publish.",
    "PREDICTION is a primary_kind. It is not a possible_route. Do not copy primary_kind values into possible_routes.",
    "For a prediction, QUESTION means a question about the observable issue the prediction depends on. It is not a forecast of an election result.",
    "research_need is yes, recommended, or no. Use yes when a factual or numerical assertion would need an outside record, recommended when an event would be clearer with context, and no for opinion, humour, rhetoric, or a prediction that is not a result.",
    "reason_for_research_need is a string. When research_need is no, it may be an empty string. When research_need is yes or recommended, it is one sentence.",
    "summary is one or two non-empty sentences using only the stored posts. subjects and checkable_facts are arrays of strings and may be empty. Do not invent subjects or facts.",
    "data_or_numbers_involved, event_or_development, prediction_present, and opinion_present are booleans. Use JSON true or false. Omit one of these four only when that signal is not asserted.",
    "Return JSON only. No markdown. No commentary. Return every conversation_id you were given, once.",
    '{"conversations":[{"conversation_id":"id","summary":"What the stored posts say.","subjects":["topic"],"primary_kind":"opinion","checkable_facts":[],"data_or_numbers_involved":false,"event_or_development":false,"prediction_present":false,"opinion_present":true,"possible_routes":["OPINION","REACTION"],"research_need":"no","reason_for_research_need":""}]}',
  ].join("\n");
}

export function understandUser(packets: ConversationPacket[]) {
  return JSON.stringify({
    conversations: packets.map((packet) => ({
      conversation_id: packet.id,
      pillar: packet.pillar,
      posts: packet.posts.map((post) => ({
        text: post.text,
        handle: post.handle,
        posted_at: post.postedAt,
        relationship: post.relationship,
      })),
    })),
  });
}

export function understandingOutcomeMessage(input: { received: number; understood: number; unclear: number; modelCalls: number; recovered?: boolean }) {
  if (input.recovered) {
    return "Recovered from 1 previous AI model response. New model requests during recovery: 0.";
  }
  return `Understanding outcome: ${input.understood} understood and in the queue. ${input.unclear} unclear and passed over. Received ${input.received}. This count is separate from historical extraction. Earlier cards were kept. Model requests for this action: ${input.modelCalls}. No X request or research call was made, and nothing was published.`;
}

export function understandConfirmation(storedConversations: number) {
  return [
    `Stored conversations: ${storedConversations}`,
    "X requests: 0",
    "AI understanding: up to 1 provider request",
    "Research: 0",
    "Publishing: No",
  ];
}

export type UnderstandingFieldError = {
  conversation_id: string | null;
  field_path: string;
  expected: string;
  received_type: string;
  message: string;
};

export type UnderstandingValidation = {
  success: boolean;
  readings_received: number;
  readings_valid: number;
  errors: UnderstandingFieldError[];
  missing_ids: string[];
  duplicate_ids: string[];
  unexpected_ids: string[];
  validated_output?: ConversationUnderstanding[];
};

/**
 * Accepted response shapes:
 * - { conversations: Reading[] }
 * - { readings: Reading[] }
 * - { result | output | data | response | json: { conversations | readings: Reading[] } }
 * - { result | output | data | response | json: Reading[] }
 * When both array keys exist, conversations is used and readings is ignored.
 * Enum strings ignore surrounding whitespace and letter case. Spaces inside an enum become underscores.
 * Duplicate entries in subjects, checkable_facts, and possible_routes are dropped.
 * A missing subjects, checkable_facts, or possible_routes array is an empty array.
 * A missing data_or_numbers_involved, event_or_development, prediction_present, or opinion_present
 * key is false: the model did not assert that signal. Null, blank, and other strings are not false.
 * Boolean fields accept true, false, and the strings true, false, yes, and no, ignoring case and surrounding space.
 * understood is not requested. A clear primary_kind other than unclear, with a meaningful summary, is understood.
 * primary_kind unclear is passed over. A missing id, kind, or summary is a validation failure.
 * An explicit understood false on an otherwise clear reading is a contradiction and is not overridden.
 * reason_for_research_need may be empty only when research_need is no.
 * primary_kind, research_need, and conversation_id are never guessed.
 * Subjects and checkable facts are never filled in.
 * PREDICTION is not a route. On a prediction record it is removed from possible_routes.
 * If that record then has no route left, the route is QUESTION. Any other unknown route still fails.
 */

const wrapperKeys = ["result", "output", "data", "response", "json"] as const;
const signalBooleans = ["data_or_numbers_involved", "event_or_development", "prediction_present", "opinion_present"] as const;

function receivedType(value: unknown) {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function safeToken(value: string) {
  const text = value.replace(/\s+/g, " ").trim();
  if (!text || text.length > 80) return null;
  if (/bearer|api[_ -]?key|\b(?:sk|gsk|rk|AIza)[_-]/i.test(text)) return null;
  return text;
}

function fieldError(conversationId: string | null, fieldPath: string, expected: string, received: string, message: string): UnderstandingFieldError {
  return {
    conversation_id: conversationId,
    field_path: fieldPath,
    expected,
    received_type: received,
    message,
  };
}

function meaningfulSummary(value: string) {
  const words = value.split(/\s+/).filter((word) => /[A-Za-z0-9]/.test(word));
  return words.length >= 2 && value.length >= 8;
}

function strictBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value !== "string") return null;
  const token = value.trim().toLowerCase();
  if (token === "true" || token === "yes") return true;
  if (token === "false" || token === "no") return false;
  return null;
}

function enumToken(value: unknown, letter: "lower" | "upper") {
  if (typeof value !== "string") return null;
  const token = value.trim().replace(/\s+/g, "_");
  return letter === "lower" ? token.toLowerCase() : token.toUpperCase();
}

function stringList(value: unknown, max: number, itemMax: number): { ok: true; values: string[] } | { ok: false; received: string } {
  if (value == null) return { ok: true, values: [] };
  if (!Array.isArray(value)) return { ok: false, received: receivedType(value) };
  const values: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return { ok: false, received: receivedType(item) };
    const text = clip(item, itemMax);
    if (!text || seen.has(text)) continue;
    seen.add(text);
    values.push(text);
    if (values.length >= max) break;
  }
  return { ok: true, values };
}

function readingArray(record: Record<string, unknown>, path: string): { items: unknown[] } | { error: UnderstandingFieldError } | null {
  if ("conversations" in record) {
    if (!Array.isArray(record.conversations)) {
      return { error: fieldError(null, `${path}.conversations`, "array", receivedType(record.conversations), "expected an array") };
    }
    return { items: record.conversations };
  }
  if ("readings" in record) {
    if (!Array.isArray(record.readings)) {
      return { error: fieldError(null, `${path}.readings`, "array", receivedType(record.readings), "expected an array") };
    }
    return { items: record.readings };
  }
  return null;
}

function locateReadings(value: unknown): { items: unknown[] } | { error: UnderstandingFieldError } {
  const record = recordOf(value);
  if (!record) {
    return { error: fieldError(null, "readings", "object with a readings array", receivedType(value), "The response was not an object.") };
  }
  const direct = readingArray(record, "readings");
  if (direct) return direct;
  for (const key of wrapperKeys) {
    if (!(key in record)) continue;
    const inner = record[key];
    if (Array.isArray(inner)) return { items: inner };
    const wrapped = recordOf(inner);
    if (!wrapped) continue;
    const nested = readingArray(wrapped, `readings.${key}`);
    if (nested) return nested;
  }
  return { error: fieldError(null, "readings", "conversations or readings array", "object", "The object did not contain a readings array.") };
}

function readingFrom(row: Record<string, unknown>, index: number, errors: UnderstandingFieldError[]): ConversationUnderstanding | null {
  const started = errors.length;
  const path = `readings[${index}]`;
  const rawId = row.conversation_id;
  const conversationId = typeof rawId === "string" && rawId.length > 0 ? rawId : null;
  if (typeof rawId !== "string" || rawId.length === 0) {
    errors.push(fieldError(null, `${path}.conversation_id`, "stored conversation id", receivedType(rawId), "expected a conversation_id string"));
  }
  const summaryText = typeof row.summary === "string" ? clip(row.summary, 500) : "";
  const summary = meaningfulSummary(summaryText) ? summaryText : "";
  if (!summary) {
    errors.push(fieldError(conversationId, `${path}.summary`, "meaningful summary", receivedType(row.summary), summaryText ? "expected a meaningful summary" : "expected a non-empty string"));
  }
  let reason = "";
  if (!("reason_for_research_need" in row)) {
    errors.push(fieldError(conversationId, `${path}.reason_for_research_need`, "string", "undefined", "missing string"));
  } else if (typeof row.reason_for_research_need !== "string") {
    errors.push(fieldError(conversationId, `${path}.reason_for_research_need`, "string", receivedType(row.reason_for_research_need), "expected a string"));
  } else {
    reason = clip(row.reason_for_research_need, 500);
  }
  const primaryToken = enumToken(row.primary_kind, "lower");
  if (primaryToken == null) {
    errors.push(fieldError(conversationId, `${path}.primary_kind`, primaryKinds.join(" | "), receivedType(row.primary_kind), "expected a string"));
  } else if (!kindSet.has(primaryToken)) {
    const shown = safeToken(primaryToken);
    errors.push(fieldError(
      conversationId,
      `${path}.primary_kind`,
      primaryKinds.join(" | "),
      "string",
      shown ? `unsupported value "${shown}"` : "unsupported value",
    ));
  }
  const derivedUnderstood = primaryToken && kindSet.has(primaryToken) && summary ? primaryToken !== "unclear" : null;
  let understood: boolean | null = null;
  if (!("understood" in row)) {
    understood = derivedUnderstood;
  } else {
    const explicit = strictBoolean(row.understood);
    const shown = typeof row.understood === "string" ? safeToken(row.understood) : null;
    if (explicit == null) {
      errors.push(fieldError(
        conversationId,
        `${path}.understood`,
        "omitted or boolean",
        receivedType(row.understood),
        shown ? `expected the field to be omitted or a boolean, received "${shown}"` : "expected the field to be omitted or a boolean",
      ));
    } else if (derivedUnderstood === true && explicit === false) {
      errors.push(fieldError(conversationId, `${path}.understood`, "omitted or true", "boolean", "understood is false while the reading is clear. Not overridden."));
    } else if (derivedUnderstood === false && explicit === true) {
      errors.push(fieldError(conversationId, `${path}.understood`, "omitted or false", "boolean", "understood is true while primary_kind is unclear. Not overridden."));
    } else if (derivedUnderstood != null) {
      understood = explicit;
    }
  }
  const needToken = enumToken(row.research_need, "lower");
  if (needToken == null) {
    errors.push(fieldError(conversationId, `${path}.research_need`, "yes | recommended | no", receivedType(row.research_need), "expected a string"));
  } else if (!needSet.has(needToken)) {
    const shown = safeToken(needToken);
    errors.push(fieldError(
      conversationId,
      `${path}.research_need`,
      "yes | recommended | no",
      "string",
      shown ? `unsupported value "${shown}"` : "unsupported value",
    ));
  }
  if (("reason_for_research_need" in row) && typeof row.reason_for_research_need === "string" && !reason && needToken !== "no") {
    errors.push(fieldError(conversationId, `${path}.reason_for_research_need`, "non-empty string when research_need is yes or recommended", "string", "expected a non-empty string"));
  }
  const signals: Record<(typeof signalBooleans)[number], boolean> = {
    data_or_numbers_involved: false,
    event_or_development: false,
    prediction_present: false,
    opinion_present: false,
  };
  for (const key of signalBooleans) {
    if (!(key in row)) continue;
    const parsed = strictBoolean(row[key]);
    if (parsed == null) {
      const shown = typeof row[key] === "string" ? safeToken(row[key]) : null;
      errors.push(fieldError(
        conversationId,
        `${path}.${key}`,
        "boolean",
        receivedType(row[key]),
        shown ? `expected a boolean, received "${shown}"` : "expected a boolean",
      ));
      continue;
    }
    signals[key] = parsed;
  }
  const subjects = stringList(row.subjects, 8, 80);
  if (!subjects.ok) errors.push(fieldError(conversationId, `${path}.subjects`, "array of strings", subjects.received, "expected an array of strings"));
  const facts = stringList(row.checkable_facts, 8, 240);
  if (!facts.ok) errors.push(fieldError(conversationId, `${path}.checkable_facts`, "array of strings", facts.received, "expected an array of strings"));
  const routes = stringList(row.possible_routes, 8, 40);
  const possibleRoutes: UnderstandRoute[] = [];
  const predictionRecord = primaryToken === "prediction" || signals.prediction_present;
  if (!routes.ok) {
    errors.push(fieldError(conversationId, `${path}.possible_routes`, understandRoutes.join(" | "), routes.received, "expected an array of strings"));
  } else {
    for (const item of routes.values) {
      const route = item.trim().replace(/\s+/g, "_").toUpperCase();
      if (route === "PREDICTION" && predictionRecord) continue;
      if (!routeSet.has(route)) {
        const shown = safeToken(route);
        errors.push(fieldError(
          conversationId,
          `${path}.possible_routes`,
          understandRoutes.join(" | "),
          "string",
          shown ? `unsupported value "${shown}"` : "unsupported value",
        ));
        continue;
      }
      if (!possibleRoutes.includes(route as UnderstandRoute)) possibleRoutes.push(route as UnderstandRoute);
    }
    if (predictionRecord && possibleRoutes.length === 0 && !errors.slice(started).some((error) => error.field_path === `${path}.possible_routes`)) {
      possibleRoutes.push("QUESTION");
    }
  }
  if (errors.length > started) return null;
  if (
    !conversationId
    || understood == null
    || !summary
    || (!reason && needToken !== "no")
    || !primaryToken
    || !kindSet.has(primaryToken)
    || !needToken
    || !needSet.has(needToken)
    || !subjects.ok
    || !facts.ok
    || !routes.ok
  ) return null;
  return {
    conversationId,
    summary,
    subjects: subjects.ok ? subjects.values : [],
    primaryKind: primaryToken as PrimaryKind,
    checkableFacts: facts.ok ? facts.values : [],
    dataOrNumbersInvolved: signals.data_or_numbers_involved,
    eventOrDevelopment: signals.event_or_development,
    predictionPresent: signals.prediction_present,
    opinionPresent: signals.opinion_present,
    possibleRoutes,
    researchNeed: needToken as ResearchNeed,
    reasonForResearchNeed: reason,
    understood,
  };
}

function batchResult(input: {
  success: boolean;
  readingsReceived: number;
  validCount: number;
  readings: ConversationUnderstanding[];
  errors: UnderstandingFieldError[];
  missingIds: string[];
  duplicateIds: string[];
  unexpectedIds: string[];
}): UnderstandingValidation {
  const result: UnderstandingValidation = {
    success: input.success,
    readings_received: input.readingsReceived,
    readings_valid: input.validCount,
    errors: input.errors,
    missing_ids: input.missingIds,
    duplicate_ids: input.duplicateIds,
    unexpected_ids: input.unexpectedIds,
  };
  if (input.success) result.validated_output = input.readings;
  return result;
}

/** A batch is accepted only when every requested conversation has one valid reading. */
export function parseConversationUnderstanding(value: unknown, ids: string[]): UnderstandingValidation {
  const located = locateReadings(value);
  if ("error" in located) {
    return batchResult({
      success: false,
      readingsReceived: 0,
      validCount: 0,
      readings: [],
      errors: [located.error],
      missingIds: [...ids],
      duplicateIds: [],
      unexpectedIds: [],
    });
  }
  const allowed = new Set(ids);
  const errors: UnderstandingFieldError[] = [];
  const seen = new Set<string>();
  const readings: ConversationUnderstanding[] = [];
  const duplicateIds: string[] = [];
  const unexpectedIds: string[] = [];
  located.items.forEach((item, index) => {
    const row = recordOf(item);
    if (!row) {
      errors.push(fieldError(null, `readings[${index}]`, "object", receivedType(item), "expected an object"));
      return;
    }
    const reading = readingFrom(row, index, errors);
    const id = typeof row.conversation_id === "string" && row.conversation_id.length > 0 ? row.conversation_id : null;
    if (id && !allowed.has(id)) {
      unexpectedIds.push(id);
      errors.push(fieldError(id, `readings[${index}].conversation_id`, "one stored conversation id", "string", "unknown conversation_id"));
    } else if (id && seen.has(id)) {
      duplicateIds.push(id);
      errors.push(fieldError(id, `readings[${index}].conversation_id`, "one reading for this conversation id", "string", "duplicate conversation_id"));
    } else if (id) {
      seen.add(id);
      if (reading) readings.push(reading);
    }
  });
  const missingIds = ids.filter((id) => !seen.has(id));
  for (const id of missingIds) {
    errors.push(fieldError(id, "readings", "one reading", "missing", "missing conversation_id"));
  }
  const success = errors.length === 0 && readings.length === ids.length;
  return batchResult({
    success,
    readingsReceived: located.items.length,
    validCount: readings.length,
    readings,
    errors,
    missingIds,
    duplicateIds,
    unexpectedIds,
  });
}

export function understandingFailureMessage(provider: string, errors: UnderstandingFieldError[]) {
  const first = errors[0];
  if (!first) return `${provider} returned JSON but validation failed.`;
  if (errors.length === 1) return `${provider} returned JSON but validation failed at ${first.field_path}: ${first.message}.`;
  const detail = errors.slice(0, 20).map((error) => `${error.field_path}: ${error.message}`).join("; ");
  return `${provider} returned JSON but validation failed. ${errors.length} field errors. ${detail}.`;
}

export function isTimely(packet: ConversationPacket, now = Date.now()) {
  const stamps = packet.posts.map((post) => (post.postedAt ? Date.parse(post.postedAt) : Number.NaN)).filter((stamp) => Number.isFinite(stamp));
  const newest = stamps.length ? Math.max(...stamps) : Number.NaN;
  if (Number.isFinite(newest)) {
    const age = now - newest;
    if (age >= 0 && age <= fortnightMs) return true;
  }
  return timelyCue.test(fullConversationText(packet));
}

function bandFor(item: { lowValue: boolean; checkable: boolean; timely: boolean; event: boolean }): 1 | 2 | 3 | 4 | 5 {
  if (item.lowValue) return 5;
  if (item.checkable && item.timely) return 1;
  if (item.event) return 2;
  if (item.checkable) return 3;
  return 4;
}

function routesFor(kind: PrimaryKind, checkable: boolean, data: boolean): UnderstandRoute[] {
  if (kind === "prediction") return ["QUESTION", "ANALYSIS", "REACTION"];
  if (checkable && data) return ["CHECK", "ANALYSIS", "ORIGINAL_INSIGHT"];
  if (checkable || kind === "factual_assertion") return ["CHECK", "ANALYSIS"];
  if (kind === "event") return ["REACTION", "ANALYSIS"];
  if (kind === "humour") return ["HUMOUR", "REACTION"];
  if (kind === "question") return ["QUESTION", "REACTION"];
  if (kind === "reaction") return ["REACTION", "OPINION"];
  if (kind === "opinion") return ["OPINION", "REACTION", "QUESTION"];
  return ["REACTION"];
}

export function applyResearchFloor(
  current: { need: ResearchNeed; reason: string },
  sourceText: string,
  facts: string[],
): { need: ResearchNeed; reason: string } {
  const premise = hasCheckableFact(sourceText) || facts.some((fact) => hasCheckableFact(fact));
  if (!premise || current.need === "yes") return current;
  return {
    need: "yes",
    reason: "A checkable factual premise is in the stored text or the extracted facts. Research is required.",
  };
}

function researchFor(kind: PrimaryKind, checkable: boolean): { need: ResearchNeed; reason: string } {
  if (kind === "prediction") return { need: "no", reason: "This is a prediction, not a result. Do not forecast the election." };
  if (checkable || kind === "factual_assertion") return { need: "yes", reason: "A record outside the post would be needed to confirm or contradict the assertion." };
  if (kind === "event") return { need: "recommended", reason: "The event can be described now. Outside context would make the description clearer." };
  if (kind === "rhetoric") return { need: "no", reason: "The wording is understandable and has no proposition to develop." };
  if (kind === "humour") return { need: "no", reason: "The joke can be answered without an outside record." };
  return { need: "no", reason: "The text is a judgment or a reaction. No outside record is required to respond to it." };
}

export function routeUnderstanding(packet: ConversationPacket, reading: ConversationUnderstanding, index: number, now = Date.now()): RoutedConversation {
  const sourceText = clip(fullConversationText(packet), 1000);
  const timely = isTimely(packet, now);
  const base = {
    id: packet.id,
    summary: reading.summary,
    subjects: reading.subjects,
    sourceText,
    pillar: packet.pillar,
    timely,
    checkableFacts: reading.checkableFacts,
    discoveredAt: packet.posts.find((post) => post.postedAt)?.postedAt ?? new Date(now).toISOString(),
    index,
  };
  const unclear = !reading.understood || reading.primaryKind === "unclear";
  if (unclear) {
    return {
      ...base,
      understood: false,
      lowValue: false,
      primaryKind: "unclear",
      routes: [],
      researchNeed: "no",
      reasonForResearchNeed: cannotUnderstand,
      band: 5,
      lifecycle: "PASSED",
      passReason: cannotUnderstand,
      rank: null,
      review: null,
      draftingCandidate: false,
    };
  }
  const quality = readingForPillar(packet.pillar, sourceText, describeSource(sourceText));
  if (quality.matched) {
    const checkable = quality.researchNeed === "yes";
    const event = quality.primaryKind === "event";
    return {
      ...base,
      summary: quality.summary,
      checkableFacts: quality.checkableFacts,
      understood: true,
      lowValue: quality.lowValue,
      primaryKind: quality.primaryKind as QualityKind,
      routes: quality.routes,
      researchNeed: quality.researchNeed,
      reasonForResearchNeed: quality.reason,
      band: bandFor({ lowValue: quality.lowValue, checkable, timely, event }),
      lifecycle: "RANKED",
      passReason: null,
      rank: null,
      review: quality.review,
      draftingCandidate: quality.draftingCandidate,
    };
  }
  const checkable = reading.primaryKind === "factual_assertion" || (reading.checkableFacts.length > 0 && reading.primaryKind !== "prediction" && reading.primaryKind !== "rhetoric" && reading.primaryKind !== "humour");
  const lowValue = reading.primaryKind === "rhetoric" && !checkable;
  const data = reading.dataOrNumbersInvolved || reading.checkableFacts.some((fact) => /\d/.test(fact));
  const event = reading.primaryKind === "event" || (reading.eventOrDevelopment && !checkable && reading.primaryKind !== "prediction");
  const kind = reading.primaryKind;
  const research = applyResearchFloor(
    researchFor(checkable && kind !== "prediction" ? "factual_assertion" : kind, checkable),
    sourceText,
    reading.checkableFacts,
  );
  return {
    ...base,
    summary: replaceUserLabel(reading.summary),
    understood: true,
    lowValue,
    primaryKind: kind,
    routes: routesFor(kind === "factual_assertion" || checkable ? "factual_assertion" : kind, checkable, data),
    researchNeed: research.need,
    reasonForResearchNeed: research.reason,
    band: bandFor({ lowValue, checkable, timely, event }),
    lifecycle: "RANKED",
    passReason: null,
    rank: null,
    review: null,
    draftingCandidate: !lowValue && kind !== "prediction",
  };
}

export function orderUnderstood(items: RoutedConversation[]): RoutedConversation[] {
  const ranked = items.filter((item) => item.lifecycle === "RANKED");
  const ordered = ranked.slice().sort((left, right) => left.band - right.band || left.index - right.index);
  const rankOf = new Map(ordered.map((item, index) => [item.id, index + 1]));
  return items.map((item) => ({ ...item, rank: item.lifecycle === "RANKED" ? (rankOf.get(item.id) ?? null) : null }));
}

export function routeAll(packets: ConversationPacket[], readings: ConversationUnderstanding[], now = Date.now()) {
  const byId = new Map(readings.map((reading) => [reading.conversationId, reading]));
  const routed = packets.map((packet, index) => {
    const reading = byId.get(packet.id);
    if (!reading) {
      return routeUnderstanding(packet, {
        conversationId: packet.id,
        summary: cannotUnderstand,
        subjects: [],
        primaryKind: "unclear",
        checkableFacts: [],
        dataOrNumbersInvolved: false,
        eventOrDevelopment: false,
        predictionPresent: false,
        opinionPresent: false,
        possibleRoutes: [],
        researchNeed: "no",
        reasonForResearchNeed: cannotUnderstand,
        understood: false,
      }, index, now);
    }
    return routeUnderstanding(packet, reading, index, now);
  });
  return orderUnderstood(routed);
}

const routeType: Record<UnderstandRoute, OpportunityType> = {
  CHECK: "check",
  ANALYSIS: "analysis",
  REACTION: "reaction",
  OPINION: "opinion",
  QUESTION: "question",
  HUMOUR: "humour",
  ORIGINAL_INSIGHT: "original_insight",
};

function voiceFor(item: RoutedConversation) {
  if (item.primaryKind === "prediction") return "prediction" as const;
  if (item.primaryKind === "humour" || item.routes.includes("HUMOUR")) return "humour" as const;
  if (item.routes.includes("CHECK")) return "fact" as const;
  if (item.routes.includes("ANALYSIS") || item.routes.includes("ORIGINAL_INSIGHT")) return "analysis" as const;
  return "opinion" as const;
}

function priorityFor(item: RoutedConversation): Priority {
  if (item.lowValue || item.band >= 4) return "low";
  if (item.band === 1) return "high";
  return "medium";
}

export function inboxRecords(item: RoutedConversation, scanId: string, version: number) {
  const storedPillar = item.pillar === "manchester_united" ? "football" : item.pillar;
  const opportunityType = item.routes[0] ? routeType[item.routes[0]] : "opinion";
  const priority = item.lifecycle === "RANKED" ? priorityFor(item) : null;
  const understanding = {
    summary: item.summary,
    primaryKind: item.primaryKind,
    routes: item.routes,
    researchNeed: item.researchNeed,
    reasonForResearchNeed: item.reasonForResearchNeed,
    sourceText: item.sourceText,
    lowValue: item.lowValue,
    subjects: item.subjects,
    understood: item.understood,
    review: item.review,
    draftingCandidate: item.draftingCandidate,
    status: item.review ?? (item.lifecycle === "PASSED" ? "Passed over" : item.lowValue ? "Low value" : item.draftingCandidate ? "In the queue" : "Not a drafting candidate"),
  };
  const assessmentShape = {
    worthTalkingAbout: item.understood,
    researchNeed: item.researchNeed,
    lifecycle: item.lifecycle,
  };
  return {
    assessment: {
      conversation_id: item.id,
      scan_id: scanId,
      version,
      worth_talking_about: item.understood,
      opportunity_type: item.routes[0] ? opportunityType : null,
      priority,
      research_need: item.researchNeed,
      timeliness: item.timely ? "high" : "low",
      possible_angle: item.routes.join(", "),
      reason: item.reasonForResearchNeed,
      pass_reason: item.passReason,
      claim_extraction_needed: item.routes.includes("CHECK"),
      content_score: item.lifecycle === "RANKED" ? 6 - item.band : 0,
      queue_rank: item.rank,
      lifecycle: item.lifecycle,
      next_stage: plannedNextStage(assessmentShape),
      discovered_at: item.discoveredAt,
      source: "model" as const,
      model_called: true,
      x_requests: 0,
      editorial_basis: null,
    },
    opportunity: {
      conversation_id: item.id,
      claim_id: null,
      scan_id: scanId,
      content_pillar: storedPillar,
      opportunity_type: opportunityType,
      research_required: item.researchNeed,
      score: priority ?? "low",
      score_reason: "Ordered from the conversation signals. People and parties are not scored.",
      what_happened: item.summary,
      why_interesting: item.reasonForResearchNeed,
      what_could_add: item.routes.join(" · ") || item.passReason || "No route.",
      angles: [],
      research_questions: item.checkableFacts,
      voice: voiceFor(item),
      status: item.understood ? "open" : "ignored",
      source: "assessment" as const,
      origin: "live" as const,
      lifecycle: item.lifecycle,
      queue_rank: item.rank,
      timeliness: item.timely ? "high" : "low",
      priority,
      claim_extraction_needed: item.routes.includes("CHECK"),
      pass_reason: item.passReason,
      content_score: item.lifecycle === "RANKED" ? 6 - item.band : 0,
      assessment_version: version,
      discovered_at: item.discoveredAt,
      possible_angle: item.routes.join(", "),
      understanding,
    },
  };
}
