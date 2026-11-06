import { readFileSync } from "node:fs";
import { planExtractionProviders, type AiEnv, type ProviderId } from "../lib/ai/catalog";
import type { ProviderCallResult, ProviderPlan, ProviderRequest } from "../lib/ai/route";
import { assessmentBatches, type ConversationPacket } from "../lib/editorial/packet";
import { readUnderstandTrace, rejectedUnderstandingResponse, withUnderstandVersions } from "../lib/editorial/trace";
import { understandPackets } from "../lib/editorial/understand-ai";
import {
  cannotUnderstand,
  inboxRecords,
  parseConversationUnderstanding,
  routeAll,
  understandConfirmation,
  understandSystem,
  understandingFailureMessage,
  type ConversationUnderstanding,
} from "../lib/editorial/understand";
import { queueLifecycle } from "../lib/editorial/model";

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

function reading(partial: Partial<ConversationUnderstanding> & Pick<ConversationUnderstanding, "conversationId" | "primaryKind" | "understood">): ConversationUnderstanding {
  return {
    summary: "A stored conversation.",
    subjects: ["public life"],
    checkableFacts: [],
    dataOrNumbersInvolved: false,
    eventOrDevelopment: false,
    predictionPresent: false,
    opinionPresent: false,
    possibleRoutes: [],
    researchNeed: "no",
    reasonForResearchNeed: "The model noted the signal.",
    ...partial,
  };
}

function packet(id: string, text: string, postedAt: string | null = "2026-11-05T08:00:00.000Z"): ConversationPacket {
  return {
    id,
    pillar: "politics",
    posts: [{ text, handle: "@desk", postedAt, relationship: null }],
  };
}

const now = Date.parse("2026-11-05T12:00:00.000Z");
const system = understandSystem();
check("understanding does not ask for an editorial verdict", !system.includes("worth_talking_about") && /only job is to understand/i.test(system));
check("understood is not a quality score", /not a quality score/i.test(system));
check(
  "the prompt keeps PREDICTION as a classification and not a route",
  system.includes("factual_assertion, event, opinion, prediction, question, reaction, humour, rhetoric, unclear")
    && system.includes("CHECK, ANALYSIS, REACTION, OPINION, QUESTION, HUMOUR, ORIGINAL_INSIGHT")
    && system.includes("PREDICTION is a primary_kind. It is not a possible_route.")
    && system.includes("not a forecast of an election result"),
);
check("the confirmation for the saved ten is explicit", understandConfirmation(10).join("\n") === [
  "Stored conversations: 10",
  "X requests: 0",
  "AI understanding: up to 1 provider request",
  "Research: 0",
  "Publishing: No",
].join("\n"));

const themed = [
  packet("fact", "APC is said to have paid ₦4 billion for the state billboards."),
  packet("names", "PDP is said to have paid ₦4 billion for the state billboards."),
  packet("economy", "The presidency says Nigeria attracted $10 billion in foreign investment this quarter."),
  packet("event", "Atiku visited the Sultan with ADC leaders."),
  packet("opinion", "Peter Obi is the deepest politician in two generations."),
  packet("prediction", "2027 will be a tsunami. Tinubu cannot survive that wave."),
  packet("joke", "The budget presentation had one joke and a spreadsheet."),
  packet("insult", "Foolish criminal idiot. Useless man. Nothing else."),
  packet("unclear", "performance, the jury is out."),
];
function wire(item: ConversationUnderstanding) {
  return {
    conversation_id: item.conversationId,
    summary: item.summary,
    subjects: item.subjects,
    primary_kind: item.primaryKind,
    checkable_facts: item.checkableFacts,
    data_or_numbers_involved: item.dataOrNumbersInvolved,
    event_or_development: item.eventOrDevelopment,
    prediction_present: item.predictionPresent,
    opinion_present: item.opinionPresent,
    possible_routes: item.possibleRoutes,
    research_need: item.researchNeed,
    reason_for_research_need: item.reasonForResearchNeed,
    understood: item.understood,
  };
}

const readings = [
  reading({ conversationId: "fact", understood: true, primaryKind: "factual_assertion", checkableFacts: ["APC paid ₦4 billion for billboards."], dataOrNumbersInvolved: true, summary: "A spending claim about billboards." }),
  reading({ conversationId: "names", understood: true, primaryKind: "factual_assertion", checkableFacts: ["PDP paid ₦4 billion for billboards."], dataOrNumbersInvolved: true, summary: "The same kind of spending claim about another party." }),
  reading({ conversationId: "economy", understood: true, primaryKind: "factual_assertion", checkableFacts: ["Nigeria attracted $10 billion in foreign investment."], dataOrNumbersInvolved: true, summary: "An investment figure is being used as an economic claim." }),
  reading({ conversationId: "event", understood: true, primaryKind: "event", eventOrDevelopment: true, summary: "A political visit is being reported." }),
  reading({ conversationId: "opinion", understood: true, primaryKind: "opinion", opinionPresent: true, summary: "A speaker praises one politician." }),
  reading({ conversationId: "prediction", understood: true, primaryKind: "prediction", predictionPresent: true, possibleRoutes: ["CHECK"], summary: "A speaker predicts an election wave." }),
  reading({ conversationId: "joke", understood: true, primaryKind: "humour", summary: "A joke about a budget presentation." }),
  reading({ conversationId: "insult", understood: true, primaryKind: "rhetoric", summary: "The post is only an insult." }),
  reading({ conversationId: "unclear", understood: false, primaryKind: "unclear", summary: "The fragment does not say what performance is being judged." }),
];
const model = { conversations: readings.map(wire) };
const partial = parseConversationUnderstanding({ conversations: model.conversations.slice(0, 3) }, themed.map((item) => item.id));
check("a partial understanding names the missing conversation", partial.success === false && partial.errors.some((error) => error.message === "missing conversation_id" && error.conversation_id === "event"));
const parsed = parseConversationUnderstanding(model, themed.map((item) => item.id));
check("every conversation must validate", parsed.success === true && parsed.validated_output?.length === themed.length);
const routed = routeAll(themed, parsed.validated_output ?? [], now);
const byId = (id: string) => routed.find((item) => item.id === id);
check("a checkable assertion stays in the queue and asks for research", Boolean(byId("fact")?.lifecycle === "RANKED" && byId("fact")?.routes.includes("CHECK") && byId("fact")?.researchNeed === "yes" && queueLifecycle(byId("fact")?.lifecycle ?? "")));
check("a figure can also support analysis or an original insight", byId("economy")?.routes.includes("ORIGINAL_INSIGHT") === true && byId("economy")?.researchNeed === "yes");
check("an event stays available with research recommended", Boolean(byId("event")?.lifecycle === "RANKED" && byId("event")?.routes.includes("REACTION") && byId("event")?.routes.includes("ANALYSIS") && byId("event")?.researchNeed === "recommended"));
check("a clear opinion is kept and does not require research", byId("opinion")?.lifecycle === "RANKED" && byId("opinion")?.researchNeed === "no" && byId("opinion")?.routes.includes("OPINION") === true);
check("a prediction is not turned into an election check", Boolean(byId("prediction")?.lifecycle === "RANKED" && byId("prediction")?.routes.includes("CHECK") === false && byId("prediction")?.routes.includes("QUESTION") && byId("prediction")?.researchNeed === "no" && /not a result/i.test(byId("prediction")?.reasonForResearchNeed ?? "")));
check("humour stays available", byId("joke")?.routes.includes("HUMOUR") === true && byId("joke")?.lifecycle === "RANKED");
check("rhetoric is kept and marked low value", byId("insult")?.understood === true && byId("insult")?.lowValue === true && byId("insult")?.lifecycle === "RANKED" && byId("insult")?.researchNeed === "no");
check("unclear text is passed over", byId("unclear")?.lifecycle === "PASSED" && byId("unclear")?.passReason === cannotUnderstand && byId("unclear")?.rank === null);
check("party names do not change the order", (byId("fact")?.band === byId("names")?.band) && (byId("fact")?.rank ?? 0) < (byId("names")?.rank ?? 0));
check("low value sits after the other understood items", (byId("insult")?.rank ?? 0) > (byId("opinion")?.rank ?? 99));
const factCard = inboxRecords(byId("fact")!, "scan", 3);
check("a check enters the inbox without an evidence row", factCard.opportunity.claim_id === null && factCard.opportunity.lifecycle === "RANKED" && factCard.opportunity.understanding.primaryKind === "factual_assertion");
check("ten stored conversations stay one provider request", assessmentBatches(Array.from({ length: 10 }, (_, index) => packet(`c${index}`, `Stored post ${index}.`))).length === 1);

function opinionRow(id: string, primary = " Opinion ") {
  return {
    conversation_id: id,
    summary: "A judgment.",
    primary_kind: primary,
    research_need: " NO ",
    reason_for_research_need: "No record is required.",
    understood: true,
    possible_routes: ["opinion", " opinion ", "OPINION"],
    commentary: "ignored extra field",
  };
}
const normalized = parseConversationUnderstanding({ readings: [opinionRow("one")] }, ["one"]);
check(
  "casing, duplicate routes, missing arrays, and extra fields normalize",
  normalized.success === true
    && normalized.validated_output?.[0]?.primaryKind === "opinion"
    && normalized.validated_output[0].researchNeed === "no"
    && normalized.validated_output[0].subjects.length === 0
    && normalized.validated_output[0].checkableFacts.length === 0
    && normalized.validated_output[0].dataOrNumbersInvolved === false
    && normalized.validated_output[0].possibleRoutes.join(",") === "OPINION",
);
const wrapped = parseConversationUnderstanding({ data: { readings: [opinionRow("one")] } }, ["one"]);
const listed = parseConversationUnderstanding({ result: [opinionRow("one")] }, ["one"]);
check("a documented wrapper can hold the readings", wrapped.success === true && listed.success === true);
const ids = ["a", "b", "c", "d"];
const unknownKind = parseConversationUnderstanding({
  conversations: ids.map((id, index) => opinionRow(id, index === 3 ? "news" : "opinion")),
}, ids);
check(
  "an unknown kind names the field and value",
  unknownKind.success === false
    && understandingFailureMessage("Groq", unknownKind.errors) === "Groq returned JSON but validation failed at readings[3].primary_kind: unsupported value \"news\".",
);
const badNeed = parseConversationUnderstanding({ readings: [{ ...opinionRow("one"), research_need: "none" }] }, ["one"]);
check("research_need is not coerced", badNeed.success === false && badNeed.errors.some((error) => error.field_path === "readings[0].research_need" && error.message === "unsupported value \"none\""));
const badUnderstood = parseConversationUnderstanding({ readings: [{ ...opinionRow("one"), understood: "true" }] }, ["one"]);
check("understood is not coerced from a string", badUnderstood.success === false && badUnderstood.errors.some((error) => error.field_path === "readings[0].understood" && error.received_type === "string"));
const paddedId = parseConversationUnderstanding({ readings: [{ ...opinionRow("one"), conversation_id: " one" }] }, ["one"]);
check("conversation ids are not trimmed into a match", paddedId.success === false && paddedId.errors.some((error) => error.message === "unknown conversation_id") && paddedId.errors.some((error) => error.message === "missing conversation_id"));
const duplicated = parseConversationUnderstanding({ readings: [opinionRow("a"), opinionRow("a")] }, ["a", "b"]);
check("duplicate and missing ids are named", duplicated.success === false && duplicated.errors.some((error) => error.message === "duplicate conversation_id" && error.conversation_id === "a") && duplicated.errors.some((error) => error.message === "missing conversation_id" && error.conversation_id === "b"));
const badSummary = parseConversationUnderstanding({ readings: [{ ...opinionRow("one"), summary: 12 }] }, ["one"]);
check("a malformed required value names its field", badSummary.success === false && badSummary.errors.some((error) => error.field_path === "readings[0].summary" && error.received_type === "number"));
function predictionRow(routes: string[], extra: Record<string, unknown> = {}) {
  return {
    conversation_id: "forecast",
    summary: "A speaker says a later result will be a wave.",
    primary_kind: "prediction",
    research_need: "no",
    reason_for_research_need: "This is a prediction, not a result.",
    understood: true,
    possible_routes: routes,
    prediction_present: true,
    ...extra,
  };
}
const predictionOnly = parseConversationUnderstanding({ conversations: [predictionRow(["PREDICTION"])] }, ["forecast"]);
check(
  "a prediction route named PREDICTION becomes QUESTION",
  predictionOnly.success === true && predictionOnly.validated_output?.[0]?.primaryKind === "prediction" && predictionOnly.validated_output[0].possibleRoutes.join(",") === "QUESTION",
);
const queuedPrediction = routeAll([packet("forecast", "2027 will be a tsunami.")], predictionOnly.validated_output ?? [], now);
check(
  "queue routing of a prediction stays a question rather than a forecast",
  queuedPrediction[0]?.routes.join(",") === "QUESTION,ANALYSIS,REACTION" && queuedPrediction[0]?.researchNeed === "no" && queuedPrediction[0]?.routes.includes("CHECK") === false,
);
const predictionAndQuestion = parseConversationUnderstanding({ conversations: [predictionRow(["PREDICTION", "QUESTION"])] }, ["forecast"]);
check(
  "PREDICTION is removed and QUESTION stays",
  predictionAndQuestion.success === true && predictionAndQuestion.validated_output?.[0]?.possibleRoutes.join(",") === "QUESTION",
);
const opinionWithPrediction = parseConversationUnderstanding({
  conversations: [{ ...opinionRow("forecast"), possible_routes: ["PREDICTION"], prediction_present: false }],
}, ["forecast"]);
check(
  "PREDICTION on a non-prediction record stays an error",
  opinionWithPrediction.success === false
    && opinionWithPrediction.errors.some((error) => error.field_path === "readings[0].possible_routes" && error.message === "unsupported value \"PREDICTION\""),
);
const predictionWithNews = parseConversationUnderstanding({ conversations: [predictionRow(["PREDICTION", "NEWS"])] }, ["forecast"]);
check(
  "an unrelated unsupported route is still reported",
  predictionWithNews.success === false
    && predictionWithNews.errors.some((error) => error.field_path === "readings[0].possible_routes" && error.message === "unsupported value \"NEWS\"")
    && !predictionWithNews.errors.some((error) => error.message.includes("PREDICTION")),
);
const predictionRoutes = parseConversationUnderstanding({ conversations: [predictionRow(["QUESTION", "ANALYSIS", "REACTION"])] }, ["forecast"]);
check(
  "valid prediction routes stay as given",
  predictionRoutes.success === true && predictionRoutes.validated_output?.[0]?.possibleRoutes.join(",") === "QUESTION,ANALYSIS,REACTION",
);
const signalOnly = parseConversationUnderstanding({
  conversations: [predictionRow(["PREDICTION"], { primary_kind: "opinion", prediction_present: true })],
}, ["forecast"]);
check(
  "prediction_present allows PREDICTION to be removed",
  signalOnly.success === true && signalOnly.validated_output?.[0]?.possibleRoutes.join(",") === "QUESTION",
);
const rejected = rejectedUnderstandingResponse({
  provider: "groq",
  model: "openai/gpt-oss-20b",
  requestId: "req",
  errors: unknownKind.errors,
  parsed: { conversations: [{ summary: "bearer abcdefghijklmnop", api_key: "secret-value" }] },
});
check(
  "rejected JSON is redacted before it is stored",
  rejected.kind === "conversation-understand-v1-rejected"
    && rejected.errors[0]?.field_path === "readings[3].primary_kind"
    && JSON.stringify(rejected.parsed).includes("[redacted]")
    && !JSON.stringify(rejected.parsed).includes("abcdefghijklmnop")
    && !JSON.stringify(rejected.parsed).includes("secret-value"),
);
const bulky = rejectedUnderstandingResponse({
  provider: "groq",
  model: "openai/gpt-oss-20b",
  requestId: "req",
  errors: unknownKind.errors,
  parsed: { conversations: Array.from({ length: 30 }, () => Object.fromEntries(Array.from({ length: 40 }, (_, index) => [`field${index}`, "x".repeat(400)]))) },
});
check("an oversized rejected object is truncated and the field error remains", bulky.truncated === true && (bulky.parsed as { truncated?: boolean }).truncated === true && bulky.errors.length > 0);

const wires = model.conversations;
async function main() {
  const called: ProviderId[] = [];
  const run = await understandPackets({
    requestId: "33333333-3333-4333-8333-333333333333",
    packets: themed,
    plans: planExtractionProviders(env(), { groq: 0, openrouter: 0, gemini: 0 }),
    now: () => now,
    call: async (plan: ProviderPlan, request: ProviderRequest) => {
      called.push(plan.id);
      check("understanding does not use a provider schema", request.schema === null && request.mode === "editorial");
      check("the full stored sentence is sent", request.userPrompt.includes("₦4 billion") && request.userPrompt.includes("Useless man"));
      if (plan.id === "groq") return result({ ok: true, data: { conversations: wires.slice(0, 2) } });
      return result({
        ok: true,
        data: { conversations: wires },
        finishReason: "stop",
        providerRequestId: "req_understand_1",
        inputTokens: 100,
        reasoningTokens: 4,
        outputTokens: 80,
      });
    },
  });
  check("provider order stays Groq then OpenRouter and one success stops", called.join(",") === "groq,openrouter" && run.ok && run.provider === "openrouter");
  check("the run does not research or post", run.xRequests === 0 && run.researchCalls === 0 && run.posted === false && run.modelCalls === 2);
  const saved = run.attempts.find((attempt) => attempt.status === "success");
  const trace = readUnderstandTrace(saved?.response);
  check(
    "the parsed understanding can be inspected later",
    trace?.kind === "conversation-understand-v1"
      && trace.parsed.conversations.length === themed.length
      && trace.finishReason === "stop"
      && trace.providerRequestId === "req_understand_1"
      && trace.parsed.conversations.some((item) => item.primary_kind === "rhetoric" && item.understood === true),
  );
  const versioned = readUnderstandTrace(withUnderstandVersions(saved?.response, { fact: 4, missing: 9 }));
  check("versions attach only to conversations in the reading", versioned?.assessmentVersions.fact === 4 && versioned.assessmentVersions.missing == null);
  const failed = run.attempts.find((attempt) => attempt.provider === "groq");
  const failedBody = failed?.response as { kind?: string; errors?: Array<{ message?: string }> } | null;
  check(
    "a rejected object is stored with the missing conversation",
    failed?.status === "failure"
      && failedBody?.kind === "conversation-understand-v1-rejected"
      && failed?.failureReason?.includes("missing conversation_id") === true
      && failedBody.errors?.some((error) => error.message === "missing conversation_id") === true,
  );
}

const active = readFileSync("lib/db/editorial.ts", "utf8");
const discover = readFileSync("components/desk/discover.tsx", "utf8");
check("the active path understands stored posts", active.includes("understandPackets") && !active.includes("assessPackets("));
check("understanding does not call X, research, or publish", !/searchRecent|tavily|brave|@\/lib\/research\/execute|@\/lib\/x\/publish/.test(active));
check("the desk shows the understanding confirmation", discover.includes("understandConfirmation") && discover.includes("Understand saved conversations"));
check("the desk separates understanding from historical extraction", discover.includes("Historical extraction") && discover.includes("Latest understanding") && !discover.includes("conversation-understand-v1-rejected"));
check("settings shows the field error without the rejected body", readFileSync("components/settings/panel.tsx", "utf8").includes("Latest understanding failure") && readFileSync("components/settings/panel.tsx", "utf8").includes("not shown here"));
check("the queue is an inbox", readFileSync("components/desk/pipeline.tsx", "utf8").includes("Low value") && readFileSync("components/desk/pipeline.tsx", "utf8").includes("Possible routes"));

main().then(() => {
  if (failures.length) {
    console.error(failures.join("\n"));
    process.exit(1);
  }
  console.log("understand checks passed");
});
