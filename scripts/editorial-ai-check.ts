import { readFileSync } from "node:fs";
import { planExtractionProviders, type AiEnv, type ProviderId } from "../lib/ai/catalog";
import type { ProviderCallResult, ProviderPlan, ProviderRequest } from "../lib/ai/route";
import { assessPackets } from "../lib/editorial/ai";
import { assessmentBatches, packetsFromPosts } from "../lib/editorial/packet";
import { assessmentRecords, editorialSystem, editorialUser, parseEditorialAssessment, rankReadings, type EditorialReading } from "../lib/editorial/reading";
import { nextAssessmentVersion } from "../lib/editorial/model";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

function env(): AiEnv {
  return {
    groqKey: true,
    openrouterKey: true,
    geminiKey: true,
    groqModel: null,
    openrouterModel: null,
    geminiModel: null,
    groqModelInvalid: false,
    openrouterModelInvalid: false,
    geminiModelInvalid: false,
    paidUsage: false,
    daily: { groq: 40, openrouter: 50, gemini: 8 },
  };
}

function result(partial: Partial<ProviderCallResult> & Pick<ProviderCallResult, "ok">): ProviderCallResult {
  return {
    data: undefined,
    failureReason: partial.ok ? null : "failed",
    diagnostic: null,
    inputTokens: null,
    reasoningTokens: null,
    outputTokens: null,
    totalTokens: null,
    estimatedCostUsd: 0,
    ...partial,
  };
}

function reading(partial: Partial<EditorialReading> & Pick<EditorialReading, "conversationId" | "worthTalkingAbout">): EditorialReading {
  return {
    contentType: partial.worthTalkingAbout ? "opinion" : null,
    priority: partial.worthTalkingAbout ? "medium" : null,
    timeliness: "medium",
    researchNeed: "no",
    reason: partial.worthTalkingAbout ? "There is a specific contribution." : "Insufficient context",
    angle: partial.worthTalkingAbout ? "Say something specific about the stored conversation without inventing a belief." : "",
    factualFoundation: [],
    claimExtractionNeeded: false,
    contextSummary: "A stored conversation with enough surrounding posts to understand it.",
    confidence: "medium",
    ...partial,
  };
}

const airport = "Met a lady at the Abuja Airport this morning.";
const airportRest = "She said the ministry awarded a ₦2 billion contract for the new terminal screens and no award notice has been published.";
const packets = packetsFromPosts([
  {
    text: airportRest,
    username: "reporter",
    postedAt: "2026-11-05T09:00:00.000Z",
    conversationId: "airport",
    referenced: [{ type: "replied_to" }],
    contentPillar: "politics",
  },
  {
    text: airport,
    username: "reporter",
    postedAt: "2026-11-05T08:00:00.000Z",
    conversationId: "airport",
    contentPillar: "politics",
  },
  {
    text: "Greatness recognizes greatness.",
    username: "fan",
    postedAt: "2026-11-05T08:05:00.000Z",
    conversationId: "praise",
    contentPillar: "politics",
  },
  {
    text: "Foreign companies are investing because the economy has never been better.",
    username: "markets",
    postedAt: "2026-11-05T08:10:00.000Z",
    conversationId: "investment",
    contentPillar: "finance",
  },
  {
    text: "Tinubu will not survive the tsunami coming in 2027.",
    username: "street",
    postedAt: "2026-11-05T08:12:00.000Z",
    conversationId: "forecast",
    contentPillar: "politics",
  },
  {
    text: "Atiku visited the Sultan with ADC leaders. People are reading the visit as a coalition signal.",
    username: "desk",
    postedAt: "2026-11-05T08:20:00.000Z",
    conversationId: "visit",
    contentPillar: "politics",
  },
]);

const prompt = editorialUser(packets);
check("complete conversation context reaches the assessor", prompt.includes(airport) && prompt.includes(airportRest) && prompt.includes("@reporter") && prompt.includes("2026-11-05T08:00:00.000Z") && prompt.includes("replied_to"));
check("the packet keeps post order", packets[0]?.posts[0]?.text === airport && packets[0]?.posts[1]?.text === airportRest);
check("the prompt does not hardcode the current queue judgments", !editorialSystem().includes(airport) && !editorialSystem().includes("Greatness recognizes greatness"));

const ten = Array.from({ length: 10 }, (_, index) => ({
  id: `c${index}`,
  pillar: "politics" as const,
  posts: [{ text: `Stored post ${index} about a public argument.`, handle: "@desk", postedAt: null, relationship: null }],
}));
check("a 10-post scan stays one assessment request", assessmentBatches(ten).length === 1);
const huge = [
  { id: "big", pillar: "politics" as const, posts: [{ text: "a".repeat(20_000), handle: null, postedAt: null, relationship: null }] },
  { id: "next", pillar: "finance" as const, posts: [{ text: "b".repeat(10_000), handle: null, postedAt: null, relationship: null }] },
];
check("an oversized scan splits only when it must", assessmentBatches(huge).length === 2);

function wire(item: EditorialReading) {
  return {
    conversation_id: item.conversationId,
    worth_talking_about: item.worthTalkingAbout,
    content_type: item.contentType,
    priority: item.priority,
    timeliness: item.timeliness,
    research_need: item.researchNeed,
    reason: item.reason,
    angle: item.angle,
    factual_foundation: item.factualFoundation,
    claim_extraction_needed: item.claimExtractionNeeded,
    context_summary: item.contextSummary,
    confidence: item.confidence,
  };
}

const model = {
  assessments: [
    reading({
      conversationId: "airport",
      worthTalkingAbout: true,
      contentType: "check",
      priority: "high",
      researchNeed: "yes",
      contextSummary: airport,
      factualFoundation: ["A ₦2 billion terminal-screen contract was awarded."],
      claimExtractionNeeded: true,
      angle: "Check the award against the notice that should exist.",
    }),
    reading({ conversationId: "praise", worthTalkingAbout: false, contentType: "opinion", contextSummary: "Greatness recognizes greatness." }),
    reading({
      conversationId: "investment",
      worthTalkingAbout: true,
      contentType: "opinion",
      priority: "medium",
      researchNeed: "no",
      factualFoundation: ["foreign investment levels", "change over time", "economic performance", "causal attribution"],
      contextSummary: "A speaker credits new foreign investment and record economic performance to the current government.",
      angle: "Separate the praise from the investment and performance claims it depends on.",
    }),
    reading({
      conversationId: "forecast",
      worthTalkingAbout: true,
      contentType: "check",
      priority: "low",
      researchNeed: "yes",
      contextSummary: "A speaker predicts a 2027 wave against the president.",
      angle: "Check whether Tinubu will win in 2027.",
      reason: "The sentence forecasts the election.",
    }),
    reading({
      conversationId: "visit",
      worthTalkingAbout: true,
      contentType: "analysis",
      priority: "medium",
      researchNeed: "recommended",
      claimExtractionNeeded: false,
      factualFoundation: [],
      contextSummary: "Atiku and ADC leaders visited the Sultan, and the visit is being read as a coalition signal.",
      angle: "Describe the visit and the reading people are giving it. Do not invent a motive.",
    }),
  ].map(wire),
};

check("a partial classification is not accepted", parseEditorialAssessment({ assessments: model.assessments.slice(0, 4) }, packets.map((item) => item.id)) === null);
const ranked = rankReadings(packets, parseEditorialAssessment(model, packets.map((item) => item.id)) ?? []);
const byId = (id: string) => ranked.find((item) => item.id === id);
check("multiple opportunities can survive", ranked.filter((item) => item.worthTalkingAbout).length >= 2);
check("opinion alone does not guarantee retention", byId("praise")?.worthTalkingAbout === false && byId("praise")?.rank === null);
check("factual premises inside an opinion require research", byId("investment")?.researchNeed === "yes" && (byId("investment")?.factualFoundation?.length ?? 0) >= 2);
check("a prediction does not become an election forecast", byId("forecast")?.opportunityType === "question" && /do not forecast/i.test(byId("forecast")?.possibleAngle ?? ""));
check("a contextless fragment is not promoted", byId("praise")?.passReason === "Insufficient context");
check("the card uses the full conversation when the summary is only the opening line", (byId("airport")?.title ?? "").includes("₦2 billion") && (byId("airport")?.title ?? "").includes("Abuja Airport"));
check("a worthwhile visit can survive without an extracted claim", byId("visit")?.worthTalkingAbout === true && byId("visit")?.claimExtractionNeeded === false);
check("ranking happens after assessment", ranked.filter((item) => item.worthTalkingAbout).every((item, index, list) => item.rank === index + 1 || list.some((other) => (other.rank ?? 0) < (item.rank ?? 0))));
const keptRanks = ranked.filter((item) => item.worthTalkingAbout).map((item) => item.rank).sort((left, right) => (left ?? 0) - (right ?? 0));
check("one passed item does not remove the others", keptRanks.join(",") === keptRanks.map((_, index) => String(index + 1)).join(",") && byId("praise")?.worthTalkingAbout === false);
check("a stronger specific item ranks above a weaker one", (byId("airport")?.rank ?? 99) < (byId("forecast")?.rank ?? 0));

const version = nextAssessmentVersion(1);
const records = assessmentRecords(byId("visit")!, "scan", version);
check("an assessment creates a new version", version === 2 && records.assessment.version === 2 && records.assessment.source === "model" && records.assessment.model_called === true && records.assessment.x_requests === 0);
check("the new card does not require a claim row", records.opportunity.claim_id === null && records.opportunity.what_happened.includes("Sultan"));

async function main() {
const used: Record<ProviderId, number> = { groq: 0, openrouter: 0, gemini: 0 };
const called: string[] = [];
const seenModes: string[] = [];
const run = await assessPackets({
  requestId: "33333333-3333-4333-8333-333333333333",
  packets,
  plans: planExtractionProviders(env(), used),
  call: async (plan: ProviderPlan, request: ProviderRequest) => {
    called.push(plan.id);
    seenModes.push(request.mode);
    check("the request carries the full stored text", request.userPrompt.includes(airportRest) && request.schema === null);
    if (plan.id === "groq") return result({ ok: true, data: { assessments: model.assessments.slice(0, 2) } });
    return result({ ok: true, data: model });
  },
});
check("a malformed provider falls through and one success stops the chain", called.join(",") === "groq,openrouter" && run.ok && run.provider === "openrouter");
check("editorial assessment uses the local JSON path", seenModes.every((mode) => mode === "editorial"));
check("one scan estimates one successful model request", run.modelCalls === 2 && run.xRequests === 0 && run.researchCalls === 0 && run.posted === false);

const transport = readFileSync("lib/ai/transport.ts", "utf8");
const payload = readFileSync("lib/ai/payload.ts", "utf8");
check("editorial requests do not use provider JSON mode", transport.includes('request.mode === "extraction" || request.mode === "editorial"') && transport.includes("geminiEditorialBody") && !payload.slice(payload.indexOf("function geminiEditorialBody"), payload.indexOf("function geminiBody")).includes("responseSchema"));
const db = readFileSync("lib/db/editorial.ts", "utf8");
check("reassessment does not call X, research, or publish", !/searchRecent|tavily|brave|@\/lib\/research\/execute|@\/lib\/x\/publish/.test(db) && /xRequests: 0/.test(db) && /researchCalls: 0/.test(db));
const discover = readFileSync("components/desk/discover.tsx", "utf8");
check("the reassessment confirmation names the model", discover.includes("Uses stored posts.") && discover.includes("X requests: 0") && discover.includes("up to 1 provider request") && discover.includes("Research requests: 0") && discover.includes("Publishing: No"));
}

main().then(() => {
if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("editorial ai checks passed");
});
