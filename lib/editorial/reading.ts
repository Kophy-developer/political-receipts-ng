import type { OpportunityType, ResearchNeed } from "@/lib/opportunities/types";
import { plannedNextStage, type Priority, type RankedConversation, type Timeliness } from "@/lib/editorial/model";
import { fullConversationText, type ConversationPacket } from "@/lib/editorial/packet";
import { pillarVoice, researchSources, type ContentPillar } from "@/lib/pillars/catalog";

export const editorialPromptVersion = "editorial-assess-v1";

const types = new Set<OpportunityType>(["reaction", "opinion", "check", "analysis", "original_insight", "humour", "question"]);
const levels = new Set<Priority>(["high", "medium", "low"]);
const needs = new Set<ResearchNeed>(["yes", "recommended", "no"]);
const confidences = new Set(["high", "medium", "low"]);

export type EditorialReading = {
  conversationId: string;
  worthTalkingAbout: boolean;
  contentType: OpportunityType | null;
  priority: Priority | null;
  timeliness: Timeliness;
  researchNeed: ResearchNeed;
  reason: string;
  angle: string;
  factualFoundation: string[];
  claimExtractionNeeded: boolean;
  contextSummary: string;
  confidence: "high" | "medium" | "low";
  editorialBasis: string | null;
};

function recordOf(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function word(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase().replaceAll(" ", "_") : "";
}

function clip(value: string, max: number) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length <= max ? text : `${text.slice(0, max - 1).trim()}…`;
}

function safeText(value: string, max: number) {
  const cleaned = value
    .replace(/bearer\s+\S+/gi, "bearer [redacted]")
    .replace(/\b(?:sk|gsk|rk|AIza)[_-]?[A-Za-z0-9\-._]{12,}\b/g, "[redacted]")
    .replace(/(?:api[_ -]?key|authorization|cookie)\s*[:=]\s*\S+/gi, (match) => match.replace(/[:=]\s*\S+/, ": [redacted]"));
  return clip(cleaned, max);
}

export function editorialSystem() {
  return [
    "You are an editorial assistant reading one human account's feed with the editor. The account follows politics, finance, and Manchester United. It is one person.",
    "Suggest an angle. Do not invent that person's political, financial, or club belief. Do not forecast an election winner. Do not rank people or parties by partisan benefit or harm.",
    "This is discovery, not publication review. You are not deciding whether a final post should be published now. You are deciding whether there is a potentially worthwhile content opportunity.",
    "The useful question is: if you and the editor were scrolling X together, would you point at this and say \"This could be something\"? If yes, keep it.",
    "Bias toward curiosity. A useful assistant says the conversation is interesting enough to look into. It does not demand enough evidence to write the final post. Do not keep obvious garbage merely to fill a queue. Do not aim for any count or percentage. A scan may produce no worthwhile items, or several, or all of them.",
    "worth_talking_about means this conversation gives the account a reasonable chance to say, ask, investigate, explain, analyse, react to, joke about, or explore something potentially interesting.",
    "It does not mean the item is already verified, ready to publish, a major national story, certain to perform, or something you already know enough to resolve.",
    "Reason through three questions, separately.",
    "Question A: can you understand what this conversation is saying from the stored posts? If no, worth_talking_about is false and the reason may be \"Insufficient context\". Insufficient context means the available text genuinely cannot be understood. It does not mean you need research, you do not know whether a claim is true, there is only one tweet, the tweet refers to a wider issue, you lack background knowledge, or you cannot yet write the final post. A single clear tweet is enough context.",
    "Question B: if you understand it, could it reasonably inspire something useful or interesting for this account to contribute? If no, worth_talking_about is false and you must give the real reason. Say what is wrong with it: a pure insult with no useful angle, a duplicate idea, nothing meaningful to add, too vague to develop, outside the account's interests, or understandable but no useful contribution. Do not say \"Insufficient context\" when the statement is clear.",
    "Question C: if it is worth a contribution, does developing it need external information? If yes, research_need is yes or recommended. Research need must not flip worth_talking_about to false. Not knowing whether an assertion is true is a reason to investigate, not a reason to pass. The research stage exists for that.",
    "A clear attributed claim, including a biographical claim or a spending claim, can be worth a check before anyone has proved it. Name the assertion, set research_need to yes, and leave the truth to research.",
    "Praise and opinion can hide factual premises such as foreign investment, economic performance, or causal attribution. Name those premises. The opportunity may be a check, an analysis, or an original insight, with research required. Do not reduce that to political praise and stop.",
    "An event, such as a political visit, can be a reaction, an analysis, or a question even when no claim is disputed. Ask whether there is something useful to add, not whether something is false.",
    "An opinion is not kept automatically. Keep it only when the account could add something specific, interesting, funny, analytical, or questioning. If it cannot, pass it and give that reason.",
    "A prediction stays an attributed prediction. Do not assess who will win or lose, and do not adopt the prediction. It may still inspire a question, an analysis, or a reaction about the observable conditions or the sentiment behind it.",
    "Read every stored post in the conversation. Do not judge from a title, a first line, or a fragment. context_summary describes the full conversation in one or two sentences, using only the stored posts.",
    "When worth_talking_about is true, editorial_basis is a short internal note on why it survives, such as checkable assertion, interesting event, useful question, strong reaction opportunity, economic premise, potential explanatory angle, humorous observation, or timely discussion. When it is false, editorial_basis is null.",
    "Return JSON only. No markdown. No commentary.",
    'Shape: {"assessments":[{"conversation_id":"","worth_talking_about":false,"content_type":null,"priority":null,"timeliness":"low","research_need":"no","reason":"","angle":"","factual_foundation":[],"claim_extraction_needed":false,"context_summary":"","confidence":"low","editorial_basis":null}]}',
    "content_type is reaction, opinion, check, analysis, original_insight, humour, question, or null.",
    "priority and timeliness are high, medium, or low. priority may be null only when the conversation is not worth talking about.",
    "research_need is yes, recommended, or no. confidence is high, medium, or low.",
    "Return every conversation_id you were given, once.",
    pillarVoice.politics,
    pillarVoice.finance,
    pillarVoice.manchester_united,
    researchSources.politics,
    researchSources.finance,
    researchSources.manchester_united,
  ].join("\n");
}

export function editorialUser(packets: ConversationPacket[]) {
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

function readingFrom(row: Record<string, unknown>, allowed: Set<string>): EditorialReading | null {
  const conversationId = typeof row.conversation_id === "string" ? row.conversation_id : "";
  if (!allowed.has(conversationId)) return null;
  if (typeof row.worth_talking_about !== "boolean") return null;
  const typeWord = row.content_type == null ? null : word(row.content_type);
  if (typeWord !== null && !types.has(typeWord as OpportunityType)) return null;
  const priorityWord = row.priority == null ? null : word(row.priority);
  if (priorityWord !== null && !levels.has(priorityWord as Priority)) return null;
  const timeliness = word(row.timeliness);
  if (!levels.has(timeliness as Timeliness)) return null;
  const researchNeed = word(row.research_need);
  if (!needs.has(researchNeed as ResearchNeed)) return null;
  const confidence = word(row.confidence);
  if (!confidences.has(confidence)) return null;
  if (typeof row.reason !== "string" || !row.reason.trim()) return null;
  if (typeof row.angle !== "string") return null;
  if (typeof row.context_summary !== "string") return null;
  if (typeof row.claim_extraction_needed !== "boolean") return null;
  if (!Array.isArray(row.factual_foundation) || row.factual_foundation.some((item) => typeof item !== "string")) return null;
  if (row.editorial_basis != null && typeof row.editorial_basis !== "string") return null;
  const contentType = typeWord as OpportunityType | null;
  const worthTalkingAbout = row.worth_talking_about;
  if (worthTalkingAbout && !contentType) return null;
  const editorialBasis = typeof row.editorial_basis === "string" && row.editorial_basis.trim()
    ? safeText(row.editorial_basis, 240)
    : null;
  if (worthTalkingAbout && !editorialBasis) return null;
  return {
    conversationId,
    worthTalkingAbout,
    contentType,
    priority: worthTalkingAbout ? ((priorityWord as Priority | null) ?? "medium") : null,
    timeliness: timeliness as Timeliness,
    researchNeed: researchNeed as ResearchNeed,
    reason: safeText(row.reason, 500),
    angle: safeText(row.angle, 500),
    factualFoundation: row.factual_foundation.map((item) => safeText(item, 240)).filter(Boolean).slice(0, 8),
    claimExtractionNeeded: row.claim_extraction_needed,
    contextSummary: safeText(row.context_summary, 500),
    confidence: confidence as EditorialReading["confidence"],
    editorialBasis: worthTalkingAbout ? editorialBasis : null,
  };
}

/** A batch is accepted only when every requested conversation has one valid reading. */
export function parseEditorialAssessment(value: unknown, ids: string[]): EditorialReading[] | null {
  const record = recordOf(value);
  if (!record || !Array.isArray(record.assessments)) return null;
  const allowed = new Set(ids);
  if (record.assessments.length !== ids.length) return null;
  const seen = new Set<string>();
  const readings: EditorialReading[] = [];
  for (const item of record.assessments) {
    const row = recordOf(item);
    if (!row) return null;
    const reading = readingFrom(row, allowed);
    if (!reading || seen.has(reading.conversationId)) return null;
    seen.add(reading.conversationId);
    readings.push(reading);
  }
  if (seen.size !== allowed.size) return null;
  return readings;
}

const winnerStamp = /\b(check whether .{0,80}will win|forecast the (winner|election|result)|will win (the |in )?(election|2027)|stamp (the|a) result)\b/i;

export function withoutForecast(reading: EditorialReading): EditorialReading {
  const blob = `${reading.angle} ${reading.reason}`;
  const forecasting = winnerStamp.test(blob) || (reading.contentType === "check" && /\bwill (win|lose|survive)\b/i.test(blob) && /\b(2027|election|tsunami)\b/i.test(blob));
  if (!forecasting) return reading;
  return {
    ...reading,
    contentType: reading.contentType === "check" ? "question" : reading.contentType,
    researchNeed: reading.factualFoundation.length > 0 ? reading.researchNeed : "no",
    claimExtractionNeeded: false,
    angle: "Ask what observable conditions are driving that prediction. Do not forecast the result.",
  };
}

export function researchFloor(reading: EditorialReading): EditorialReading {
  if (!reading.worthTalkingAbout || reading.factualFoundation.length === 0) return reading;
  if (reading.contentType === "check") return { ...reading, researchNeed: "yes", claimExtractionNeeded: true };
  if (reading.factualFoundation.length >= 2 || reading.contentType === "analysis" || reading.contentType === "original_insight") {
    return { ...reading, researchNeed: "yes" };
  }
  if (reading.researchNeed === "no") return { ...reading, researchNeed: "recommended" };
  return reading;
}

export function displayContext(packet: ConversationPacket, summary: string) {
  const full = fullConversationText(packet).replace(/\s+/g, " ").trim();
  const clean = summary.replace(/\s+/g, " ").trim();
  const later = packet.posts.slice(1).map((post) => post.text.replace(/\s+/g, " ").trim()).filter((text) => text.length > 24);
  const missesLater = later.some((text) => {
    const probe = text.slice(0, 40).toLowerCase();
    return !clean.toLowerCase().includes(probe);
  });
  if (missesLater) return clip(full, 500);
  if (clean.length >= 24) return clip(clean, 500);
  return clip(full, 500);
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function coveredByRecent(text: string, recentTexts: string[]) {
  const words = normalized(text).split(" ").filter(Boolean);
  if (words.length < 12) return false;
  const window = words.slice(0, 12).join(" ");
  return recentTexts.some((recent) => normalized(recent).includes(window));
}

function voiceFor(type: OpportunityType | null, forecast: boolean): RankedConversation["voice"] {
  if (forecast) return "prediction";
  if (type === "check") return "fact";
  if (type === "analysis" || type === "original_insight") return "analysis";
  if (type === "humour") return "humour";
  return "opinion";
}

function editorialScore(reading: EditorialReading) {
  if (!reading.worthTalkingAbout) return 0;
  const priority = reading.priority === "high" ? 40 : reading.priority === "medium" ? 24 : 10;
  const timeliness = reading.timeliness === "high" ? 16 : reading.timeliness === "medium" ? 8 : 2;
  const evidence = reading.researchNeed === "yes" ? 14 : reading.researchNeed === "recommended" ? 8 : 3;
  const specificity = Math.min(16, reading.factualFoundation.length * 4 + Math.min(8, Math.floor(reading.angle.length / 40)));
  const originality = reading.angle.length > 40 ? 8 : 2;
  const confidence = reading.confidence === "high" ? 4 : reading.confidence === "medium" ? 2 : 0;
  const fit = 6;
  return priority + timeliness + evidence + specificity + originality + confidence + fit;
}

export function rankReadings(
  packets: ConversationPacket[],
  readings: EditorialReading[],
  recentTexts: string[] = [],
  discoveredAt = new Date().toISOString(),
): RankedConversation[] {
  const byId = new Map(readings.map((reading) => [reading.conversationId, reading]));
  const seen = new Set<string>();
  const settled = packets.map((packet, index) => {
    const raw = byId.get(packet.id);
    const base = raw ? researchFloor(withoutForecast(raw)) : null;
    const summary = base ? displayContext(packet, base.contextSummary) : displayContext(packet, "");
    const duplicate = summary.length > 0 && seen.has(normalized(summary));
    if (summary) seen.add(normalized(summary));
    const repeated = !duplicate && coveredByRecent(fullConversationText(packet), recentTexts);
    let reading = base;
    if (reading && (duplicate || repeated)) {
      const reason = duplicate ? "Duplicate conversation." : "Already covered by a recent post.";
      reading = { ...reading, worthTalkingAbout: false, priority: null, researchNeed: "no", reason, angle: "", editorialBasis: null };
    }
    return { packet, reading, summary, index };
  });
  const worthwhile = settled.filter((item) => item.reading?.worthTalkingAbout);
  const ordered = worthwhile
    .slice()
    .sort((left, right) => editorialScore(right.reading as EditorialReading) - editorialScore(left.reading as EditorialReading) || left.index - right.index);
  const rankOf = new Map(ordered.map((item, index) => [item.packet.id, index + 1]));
  return settled.map(({ packet, reading, summary }) => {
    const worth = reading?.worthTalkingAbout === true;
    const type = reading?.contentType ?? null;
    const forecast = reading ? /do not forecast the result/i.test(reading.angle) : false;
    const lifecycle = worth ? "RANKED" as const : "PASSED" as const;
    const researchNeed = reading?.researchNeed ?? "no";
    const assessment = {
      worthTalkingAbout: worth,
      opportunityType: type,
      priority: worth ? (reading?.priority ?? "medium") : null,
      researchNeed,
      timeliness: reading?.timeliness ?? "low",
      possibleAngle: worth ? (reading?.angle ?? "") : "",
      reason: reading?.reason ?? "Insufficient context",
      passReason: worth ? null : (reading?.reason ?? "Insufficient context"),
      claimExtractionNeeded: type === "check" ? true : (reading?.claimExtractionNeeded ?? false),
      claimRequired: false as const,
      factualVerdict: null,
      contentScore: reading && worth ? editorialScore(reading) : 0,
      voice: voiceFor(type, forecast),
    };
    return {
      ...assessment,
      id: packet.id,
      text: fullConversationText(packet),
      title: summary || "Insufficient context",
      rank: worth ? (rankOf.get(packet.id) ?? null) : null,
      lifecycle,
      nextStage: plannedNextStage({ ...assessment, lifecycle }),
      discoveredAt: packet.posts.find((post) => post.postedAt)?.postedAt ?? discoveredAt,
      pillar: packet.pillar,
      factualFoundation: reading?.factualFoundation ?? [],
      editorialBasis: worth ? (reading?.editorialBasis ?? null) : null,
    };
  });
}

export function assessmentRecords(item: RankedConversation, scanId: string, version: number) {
  const pillar = (item.pillar ?? "politics") satisfies ContentPillar;
  const storedPillar = pillar === "manchester_united" ? "football" : pillar;
  return {
    assessment: {
      conversation_id: item.id,
      scan_id: scanId,
      version,
      worth_talking_about: item.worthTalkingAbout,
      opportunity_type: item.opportunityType,
      priority: item.priority,
      research_need: item.researchNeed,
      timeliness: item.timeliness,
      possible_angle: item.possibleAngle,
      reason: item.reason,
      pass_reason: item.passReason,
      claim_extraction_needed: item.claimExtractionNeeded,
      content_score: item.contentScore,
      queue_rank: item.rank,
      lifecycle: item.lifecycle,
      next_stage: item.nextStage,
      discovered_at: item.discoveredAt,
      source: "model" as const,
      model_called: true,
      x_requests: 0,
      editorial_basis: item.editorialBasis ?? null,
    },
    opportunity: {
      conversation_id: item.id,
      claim_id: null,
      scan_id: scanId,
      content_pillar: storedPillar,
      opportunity_type: item.opportunityType ?? "opinion",
      research_required: item.researchNeed ?? "no",
      score: item.priority ?? "low",
      score_reason: "Ranked after editorial assessment. People and parties are not scored.",
      what_happened: item.title,
      why_interesting: item.reason,
      what_could_add: item.possibleAngle || item.passReason || "No angle filed.",
      angles: [],
      research_questions: item.factualFoundation ?? [],
      voice: item.voice,
      status: item.worthTalkingAbout ? "open" : "ignored",
      source: "assessment" as const,
      origin: "live" as const,
      lifecycle: item.lifecycle,
      queue_rank: item.rank,
      timeliness: item.timeliness,
      priority: item.priority,
      claim_extraction_needed: item.claimExtractionNeeded,
      pass_reason: item.passReason,
      content_score: item.contentScore,
      assessment_version: version,
      discovered_at: item.discoveredAt,
      possible_angle: item.possibleAngle,
    },
  };
}
