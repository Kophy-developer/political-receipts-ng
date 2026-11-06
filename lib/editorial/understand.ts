import type { OpportunityType, ResearchNeed } from "@/lib/opportunities/types";
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
    "understood means only: can you tell what the stored posts are saying? It is not a quality score. A single clear post can be understood. Not knowing whether a claim is true does not make the post unclear.",
    "If the text genuinely cannot be understood, set understood to false and primary_kind to unclear. Do not invent missing context.",
    "primary_kind is factual_assertion, event, opinion, prediction, question, reaction, humour, rhetoric, or unclear.",
    "A sentence about what someone did, spent, or claimed is a factual_assertion even when you have not verified it. Copy those sentences into checkable_facts.",
    "An event is a visit, meeting, or other development that is being reported. An opinion is a judgment. Humour is a joke. Rhetoric is insult, slogan, or heat with no proposition you can restate. A prediction says something will happen later. Leave it as a prediction.",
    "possible_routes may include CHECK, ANALYSIS, REACTION, OPINION, QUESTION, HUMOUR, and ORIGINAL_INSIGHT. They describe what the text could support. They are not a decision to publish.",
    "research_need is yes when a factual or numerical assertion would need an outside record, recommended when an event would be clearer with context, and no for opinion, humour, rhetoric, or a prediction that is not a result.",
    "reason_for_research_need is one sentence. summary is one or two sentences using only the stored posts. subjects are the topics named in the posts.",
    "data_or_numbers_involved is true when the conversation uses a figure, a sum, or a measurable claim. event_or_development, prediction_present, and opinion_present are true when that signal is in the text.",
    "Return JSON only. No markdown. No commentary.",
    '{"conversations":[{"conversation_id":"","summary":"","subjects":[],"primary_kind":"unclear","checkable_facts":[],"data_or_numbers_involved":false,"event_or_development":false,"prediction_present":false,"opinion_present":false,"possible_routes":[],"research_need":"no","reason_for_research_need":"","understood":false}]}',
    "Return every conversation_id you were given, once.",
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
  errors: UnderstandingFieldError[];
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
 * value is false: the model did not assert that signal.
 * primary_kind, research_need, understood, and conversation_id are never guessed.
 * Subjects and checkable facts are never filled in.
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
  if (typeof row.understood !== "boolean") {
    errors.push(fieldError(conversationId, `${path}.understood`, "boolean", receivedType(row.understood), "expected a boolean"));
  }
  const summary = typeof row.summary === "string" ? clip(row.summary, 500) : "";
  if (!summary) {
    errors.push(fieldError(conversationId, `${path}.summary`, "non-empty string", receivedType(row.summary), "expected a non-empty string"));
  }
  const reason = typeof row.reason_for_research_need === "string" ? clip(row.reason_for_research_need, 500) : "";
  if (!reason) {
    errors.push(fieldError(conversationId, `${path}.reason_for_research_need`, "non-empty string", receivedType(row.reason_for_research_need), "expected a non-empty string"));
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
  const signals: Record<(typeof signalBooleans)[number], boolean> = {
    data_or_numbers_involved: false,
    event_or_development: false,
    prediction_present: false,
    opinion_present: false,
  };
  for (const key of signalBooleans) {
    if (!(key in row) || row[key] == null) continue;
    if (typeof row[key] !== "boolean") {
      errors.push(fieldError(conversationId, `${path}.${key}`, "boolean", receivedType(row[key]), "expected a boolean"));
      continue;
    }
    signals[key] = row[key];
  }
  const subjects = stringList(row.subjects, 8, 80);
  if (!subjects.ok) errors.push(fieldError(conversationId, `${path}.subjects`, "array of strings", subjects.received, "expected an array of strings"));
  const facts = stringList(row.checkable_facts, 8, 240);
  if (!facts.ok) errors.push(fieldError(conversationId, `${path}.checkable_facts`, "array of strings", facts.received, "expected an array of strings"));
  const routes = stringList(row.possible_routes, 8, 40);
  const possibleRoutes: UnderstandRoute[] = [];
  if (!routes.ok) {
    errors.push(fieldError(conversationId, `${path}.possible_routes`, understandRoutes.join(" | "), routes.received, "expected an array of strings"));
  } else {
    for (const item of routes.values) {
      const route = item.trim().replace(/\s+/g, "_").toUpperCase();
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
  }
  if (errors.length > started) return null;
  if (
    !conversationId
    || typeof row.understood !== "boolean"
    || !summary
    || !reason
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
    understood: row.understood,
  };
}

/** A batch is accepted only when every requested conversation has one valid reading. */
export function parseConversationUnderstanding(value: unknown, ids: string[]): UnderstandingValidation {
  const located = locateReadings(value);
  if ("error" in located) return { success: false, errors: [located.error] };
  const allowed = new Set(ids);
  const errors: UnderstandingFieldError[] = [];
  const seen = new Set<string>();
  const readings: ConversationUnderstanding[] = [];
  located.items.forEach((item, index) => {
    const row = recordOf(item);
    if (!row) {
      errors.push(fieldError(null, `readings[${index}]`, "object", receivedType(item), "expected an object"));
      return;
    }
    const reading = readingFrom(row, index, errors);
    const id = typeof row.conversation_id === "string" && row.conversation_id.length > 0 ? row.conversation_id : null;
    if (id && !allowed.has(id)) {
      errors.push(fieldError(id, `readings[${index}].conversation_id`, "one stored conversation id", "string", "unknown conversation_id"));
    } else if (id && seen.has(id)) {
      errors.push(fieldError(id, `readings[${index}].conversation_id`, "one reading for this conversation id", "string", "duplicate conversation_id"));
    } else if (id) {
      seen.add(id);
      if (reading) readings.push(reading);
    }
  });
  for (const id of ids) {
    if (!seen.has(id)) {
      errors.push(fieldError(id, "readings", "one reading", "missing", "missing conversation_id"));
    }
  }
  if (errors.length > 0 || readings.length !== ids.length) return { success: false, errors };
  return { success: true, errors: [], validated_output: readings };
}

export function understandingFailureMessage(provider: string, errors: UnderstandingFieldError[]) {
  const first = errors[0];
  if (!first) return `${provider} returned JSON but validation failed.`;
  return `${provider} returned JSON but validation failed at ${first.field_path}: ${first.message}.`;
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
    };
  }
  const checkable = reading.primaryKind === "factual_assertion" || (reading.checkableFacts.length > 0 && reading.primaryKind !== "prediction" && reading.primaryKind !== "rhetoric" && reading.primaryKind !== "humour");
  const lowValue = reading.primaryKind === "rhetoric" && !checkable;
  const data = reading.dataOrNumbersInvolved || reading.checkableFacts.some((fact) => /\d/.test(fact));
  const event = reading.primaryKind === "event" || (reading.eventOrDevelopment && !checkable && reading.primaryKind !== "prediction");
  const kind = reading.primaryKind;
  const research = researchFor(checkable && kind !== "prediction" ? "factual_assertion" : kind, checkable);
  return {
    ...base,
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
    status: item.lifecycle === "PASSED" ? "Passed over" : item.lowValue ? "Low value" : "In the queue",
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
