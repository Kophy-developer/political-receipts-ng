import { readFileSync } from "node:fs";
import { readingForPillar } from "../lib/editorial/pillar-reading";
import { describeSource } from "../lib/editorial/quality";
import { automaticStages } from "../lib/editorial/model";
import { inboxRecords, parseConversationUnderstanding, routeUnderstanding, type ConversationUnderstanding } from "../lib/editorial/understand";
import type { ConversationPacket } from "../lib/editorial/packet";
import { rankReadings, type EditorialReading } from "../lib/editorial/reading";
import { investigate } from "../lib/research/investigate";
import { financeDiscovery, manchesterDiscovery, politicsDiscovery, preservedPoliticsQuery } from "../lib/pillars/catalog";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const now = Date.parse("2026-11-08T12:00:00.000Z");

function packet(id: string, pillar: ConversationPacket["pillar"], text: string): ConversationPacket {
  return {
    id,
    pillar,
    posts: [{ text, handle: "@desk", postedAt: "2026-11-08T09:00:00.000Z", relationship: null }],
  };
}

function reading(id: string, kind: ConversationUnderstanding["primaryKind"]): ConversationUnderstanding {
  return {
    conversationId: id,
    summary: "A stored conversation.",
    subjects: [],
    primaryKind: kind,
    checkableFacts: [],
    dataOrNumbersInvolved: false,
    eventOrDevelopment: false,
    predictionPresent: false,
    opinionPresent: kind === "opinion",
    possibleRoutes: ["CHECK"],
    researchNeed: "yes",
    reasonForResearchNeed: "The model asked for a check.",
    understood: true,
  };
}

function opened(item: ReturnType<typeof routeUnderstanding>) {
  return inboxRecords(item, "fixture-scan", 1);
}

const politicsText = "People disagree. APC billboards are being torn down in the north.";
const politics = routeUnderstanding(packet("politics", "politics", politicsText), reading("politics", "opinion"), 0, now);
const politicsCard = opened(politics);
check("a politics scan still creates a research opportunity", politicsCard.opportunity.content_pillar === "politics" && politicsCard.opportunity.lifecycle === "RANKED" && politics.researchNeed === "yes" && politics.routes.includes("CHECK"));

const inflation = "Inflation was 18.2 percent in October, the NBS says.";
const finance = routeUnderstanding(packet("finance", "finance", inflation), reading("finance", "opinion"), 0, now);
const financeCard = opened(finance);
const financePlan = investigate(inflation, readingForPillar("finance", inflation, describeSource(inflation)), "finance");
check("a finance figure becomes an opportunity on the finance pillar", financeCard.opportunity.content_pillar === "finance" && financeCard.opportunity.lifecycle === "RANKED" && finance.researchNeed === "yes");
check("the figure keeps its unit and period", finance.checkableFacts.some((fact) => fact.includes("18.2") && /october/i.test(fact)) && /unit/i.test(finance.reasonForResearchNeed) && /period/i.test(finance.reasonForResearchNeed));
check("finance research asks the office that publishes the series", financePlan.numerical === true && financePlan.preferredHosts.includes("nigerianstat.gov.ng") && financePlan.preferredHosts.includes("cbn.gov.ng") && financePlan.definitions.some((line) => /unit/i.test(line) && /period/i.test(line)) && !/election/i.test(financePlan.questions.map((item) => item.question).join(" ")));

const reactionText = "That second half was embarrassing.";
const reaction = routeUnderstanding(packet("reaction", "manchester_united", reactionText), reading("reaction", "factual_assertion"), 0, now);
const reactionCard = opened(reaction);
const reactionPlan = investigate(reactionText, readingForPillar("manchester_united", reactionText, describeSource(reactionText)), "manchester_united");
const reactionStages = automaticStages({ worthTalkingAbout: true, researchNeed: reaction.researchNeed }, { autoProgressToEditor: true, researchRecommended: false });
check("a football reaction is an opportunity without a political check", reactionCard.opportunity.content_pillar === "football" && reaction.researchNeed === "no" && reaction.routes.includes("CHECK") === false && reactionCard.opportunity.claim_extraction_needed === false);
check("the reaction is not sent through a political fact-check", /not sent through a political fact-check/i.test(reaction.reasonForResearchNeed) && /not sent through a political fact-check/i.test(reactionPlan.attribution) && reactionPlan.questions.every((item) => !/inec|election/i.test(item.question)));
check("the reaction can reach Ready for You without research", reactionCard.assessment.next_stage === "ANGLE_READY" && reactionStages.includes("READY_FOR_EDITOR") && reactionStages.includes("RESEARCHING") === false && reactionStages.includes("PUBLISHED") === false);

const rumourText = "United are linked with a new striker, according to reports.";
const rumour = routeUnderstanding(packet("rumour", "manchester_united", rumourText), reading("rumour", "factual_assertion"), 0, now);
check("a transfer report is not written as a signing", rumour.researchNeed === "no" && /not a completed signing/i.test(rumour.summary) && /do not write it as fact/i.test(rumour.reasonForResearchNeed));

const scoreText = "Manchester United beat Brighton 2-1 at Old Trafford.";
const score = routeUnderstanding(packet("score", "manchester_united", scoreText), reading("score", "opinion"), 0, now);
const scorePlan = investigate(scoreText, readingForPillar("manchester_united", scoreText, describeSource(scoreText)), "football");
check("a reported score stays a club fact", score.researchNeed === "recommended" && /2-1/.test(score.checkableFacts.join(" ")));
check("the score is routed to the club and the competitions", scorePlan.preferredHosts.includes("manutd.com") && scorePlan.preferredHosts.includes("premierleague.com") && scorePlan.preferredHosts.includes("uefa.com") && scorePlan.preferredHosts.includes("thefa.com") && scorePlan.questions.every((item) => !/election/i.test(item.question)));

const duplicate = parseConversationUnderstanding({
  readings: [
    { conversation_id: "same", summary: "A judgment.", primary_kind: "opinion", research_need: "no", reason_for_research_need: "No record is required.", understood: true, possible_routes: ["OPINION"] },
    { conversation_id: "same", summary: "A judgment.", primary_kind: "opinion", research_need: "no", reason_for_research_need: "No record is required.", understood: true, possible_routes: ["OPINION"] },
  ],
}, ["same"]);
check("a duplicate conversation is rejected", duplicate.success === false && duplicate.errors.some((error) => error.message === "duplicate conversation_id"));

const repeated = rankReadings(
  [packet("first", "finance", inflation), packet("second", "finance", inflation)],
  [editorial("first"), editorial("second")],
);
check("the same summary is not queued twice", repeated.filter((item) => item.worthTalkingAbout).length === 1 && repeated.some((item) => item.reason === "Duplicate conversation."));

const publish = readFileSync("lib/x/publish.ts", "utf8");
check("publishing still requires an explicit confirmation", publish.includes("input.confirm !== true") && publish.includes("The post needs an explicit final confirmation."));
check("the installed politics query is still the preserved one", politicsDiscovery.queries[0]?.query === preservedPoliticsQuery);
check("finance and united groups are separate from that query", financeDiscovery.queries.every((item) => !item.query.includes("INEC")) && manchesterDiscovery.queries.length >= 4);

function editorial(id: string): EditorialReading {
  return {
    conversationId: id,
    worthTalkingAbout: true,
    contentType: "analysis",
    priority: "medium",
    timeliness: "high",
    researchNeed: "yes",
    reason: "A figure needs its source.",
    angle: "The October reading.",
    factualFoundation: ["18.2 percent"],
    claimExtractionNeeded: true,
    contextSummary: "Inflation was 18.2 percent in October.",
    confidence: "medium",
    editorialBasis: null,
  };
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("pillar pipeline checks passed");
