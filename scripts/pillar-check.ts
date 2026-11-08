import { readFileSync } from "node:fs";
import { draftPrompt, type DraftBrief } from "../lib/drafts/rules";
import { plannedScanRequest, scanBudget } from "../lib/intel/budget";
import {
  financeDiscovery,
  manchesterDiscovery,
  maySuggestEditorialTag,
  pillarVoice,
  politicsDiscovery,
  preservedPoliticsQuery,
  queriesStaySeparate,
  researchExpectation,
  withOptionalTag,
} from "../lib/pillars/catalog";
import { pickSearchGroup } from "../lib/pillars/groups";
import { carriesPillar, chooseScan, contentMix, pillarProgress, rankByQuality, type PillarSignal } from "../lib/pillars/scan";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

function signal(partial: Partial<PillarSignal> & Pick<PillarSignal, "pillar">): PillarSignal {
  return {
    share: 0,
    hoursSinceScan: 24,
    hoursSincePost: 24,
    queued: 0,
    timeliness: "medium",
    ...partial,
  };
}

const separate = queriesStaySeparate();
check("politics query is preserved", separate.onePoliticsQuery && politicsDiscovery.queries[0]?.query === preservedPoliticsQuery);
check("finance queries stay off United", separate.financeSkipsUnited);
check("united queries stay off INEC", separate.unitedSkipsInec);
check("queries are not one combined string", separate.noCombinedQuery && separate.politics.length === 1 && financeDiscovery.queries.length >= 1 && manchesterDiscovery.queries.length >= 1);

const empty = chooseScan("smart", [], 0);
check("smart scan with no mix picks one pillar", empty.pillarsSearched === 1 && empty.pillar === "politics");
check("one smart scan estimates one X request", empty.estimatedRequests === 1 && empty.estimatedRequests === scanBudget.maxXRequestsPerScan && empty.maximumPosts === 10);

const under: PillarSignal[] = [
  signal({ pillar: "politics", share: 80 }),
  signal({ pillar: "finance", share: 20 }),
  signal({ pillar: "manchester_united", share: 0 }),
];
const smart = chooseScan("smart", under, 20);
check("smart scan selects one underrepresented pillar", smart.pillar === "manchester_united" && smart.pillarsSearched === 1);
check("underrepresented reason is shown before the request", smart.reason === "Manchester United is currently underrepresented in your recent content.");
check("that scan still estimates one request", smart.estimatedRequests === 1 && smart.maximumPosts === scanBudget.maxPostsPerScan);

const politics = chooseScan("politics", under, 20);
const finance = chooseScan("finance", under, 20);
const united = chooseScan("manchester_united", under, 20);
check("manual politics selection", politics.pillar === "politics" && politics.mode === "politics" && politics.pillarsSearched === 1);
check("manual finance selection", finance.pillar === "finance" && finance.estimatedRequests === 1);
check("manual manchester united selection", united.pillar === "manchester_united" && united.scope === "Manchester United");

const queued = chooseScan("smart", [
  signal({ pillar: "politics", share: 80, queued: 0 }),
  signal({ pillar: "finance", share: 20, queued: 0 }),
  signal({ pillar: "manchester_united", share: 0, queued: 3 }),
], 20);
check("a full queue keeps an underrepresented pillar from being forced", queued.pillar !== "manchester_united");

const missingUnited = chooseScan("smart", [
  signal({ pillar: "politics", share: 80, configured: true }),
  signal({ pillar: "finance", share: 20, configured: true }),
  signal({ pillar: "manchester_united", share: 0, configured: false }),
], 20);
check("an unconfigured pillar is named and not selected", missingUnited.pillar !== "manchester_united" && missingUnited.unconfigured.includes("manchester_united") && /unconfigured/i.test(missingUnited.reason));
const manualMissing = chooseScan("finance", [
  signal({ pillar: "finance", share: 0, configured: false }),
], 20);
check("a manual pillar with no search group does not run", manualMissing.pillar === "finance" && manualMissing.runnable === false && /unconfigured/i.test(manualMissing.reason));

const stocked = chooseScan("smart", [
  signal({ pillar: "politics", share: 40, readyDrafts: 0, hoursSinceScan: 2 }),
  signal({ pillar: "finance", share: 0, readyDrafts: 3, hoursSinceScan: 48 }),
  signal({ pillar: "manchester_united", share: 60, readyDrafts: 0, hoursSinceScan: 2 }),
], 20);
check("a pillar with drafts waiting is not the next scan", stocked.pillar !== "finance");

const blocked = chooseScan("politics", under, 20, { requestsRemaining: 0, postsRemaining: 40, known: true });
check("a used daily request budget blocks the scan", blocked.runnable === false && /daily X request limit/i.test(blocked.reason) && blocked.estimatedRequests === 1);
const plan = plannedScanRequest();
check("the request stays inside the recent-search endpoint", plan.requests === 1 && plan.posts === scanBudget.maxPostsPerScan && plan.posts >= 10 && plan.posts <= 100 && plan.paginates === false);
check("the confirmation does not promise a larger page", !plan.note.includes("25") && !plan.note.includes("50") && plan.note.includes(String(plan.posts)));

const financeGroup = pickSearchGroup([
  { slug: "finance-markets", name: "Markets", query: financeDiscovery.queries[2].query, pillar: "finance", enabled: true, lastUsedAt: "2026-11-01T00:00:00.000Z", rotation: 2 },
  { slug: "finance-cbn", name: "CBN", query: financeDiscovery.queries[0].query, pillar: "finance", enabled: true, lastUsedAt: null, rotation: 1 },
  { slug: "united-match", name: "Match", query: manchesterDiscovery.queries[0].query, pillar: "football", enabled: true, lastUsedAt: null, rotation: 1 },
], "finance");
check("finance selection stays on an unused finance group", financeGroup?.slug === "finance-cbn");
check("a pillar with no usable group is empty", pickSearchGroup([], "football") === null);
check("search groups do not pin one person", [...financeDiscovery.queries, ...manchesterDiscovery.queries].every((item) => !/amorim/i.test(item.query) && item.query.includes("-is:retweet")));

const posts = [
  ...Array.from({ length: 12 }, () => ({ pillar: "politics" as const })),
  ...Array.from({ length: 4 }, () => ({ pillar: "finance" as const })),
  ...Array.from({ length: 4 }, () => ({ pillar: "manchester_united" as const })),
  { pillar: "politics" as const },
];
const mix = contentMix(posts, 20);
check("published posts contribute to the last 20", mix.counted === 20 && mix.items.find((item) => item.pillar === "politics")?.share === 60);
check("finance and united shares come from published posts", mix.items.find((item) => item.pillar === "finance")?.share === 20 && mix.items.find((item) => item.pillar === "manchester_united")?.share === 20);
check("targets stay visible", mix.items.every((item) => item.target === (item.pillar === "politics" ? 60 : 20)));

const ranked = rankByQuality([
  { id: "weak-united", quality: 10, timeliness: 90, pillar: "manchester_united" },
  { id: "strong-politics", quality: 80, timeliness: 40, pillar: "politics" },
]);
check("quality ranks above the target mix", ranked[0]?.id === "strong-politics");

const politicalCheck = pillarProgress({ pillar: "politics", type: "check", factual: true });
check("a political check routes to evidence", politicalCheck.researchNeed === "yes" && politicalCheck.stages.includes("RESEARCHING") && politicalCheck.stages.includes("EVIDENCE_READY") && politicalCheck.executed === false);

const financeAnalysis = pillarProgress({ pillar: "finance", type: "analysis", factual: true });
check("a finance factual analysis routes to evidence", financeAnalysis.researchNeed === "yes" && financeAnalysis.next === "RESEARCHING");

const matchReaction = pillarProgress({ pillar: "manchester_united", type: "reaction", factual: false });
check("a football reaction can go toward drafting", matchReaction.researchNeed === "no" && matchReaction.next === "ANGLE_READY" && !matchReaction.stages.includes("RESEARCHING") && matchReaction.stages.includes("DRAFTING") && matchReaction.stages.includes("READY_FOR_EDITOR"));
check("routing makes no external call", matchReaction.externalCalls.length === 0 && financeAnalysis.externalCalls.length === 0);

const carried = carriesPillar("manchester_united");
check("pillar persists from opportunity to draft to published post", carried.opportunity === "football" && carried.draft === "football" && carried.published === "football" && carried.text === "unchanged");
check("united does not get a forced editorial tag", maySuggestEditorialTag("manchester_united") === false && maySuggestEditorialTag("politics") && maySuggestEditorialTag("finance"));
check("a tag is never appended", withOptionalTag("Good second half.") === "Good second half.");
check("one voice across pillars", (["politics", "finance", "manchester_united"] as const).every((pillar) => pillarVoice[pillar].includes("The same person")));
check("finance refuses named investment advice", pillarVoice.finance.includes("Do not give investment advice"));
check("a check is not the only politics type", researchExpectation("politics", "reaction", false) === "no");

const voiceBrief: DraftBrief = {
  claim: "The second half was better.",
  postText: "That second half.",
  verdict: "",
  confidence: "",
  angleTitle: "The performance",
  anglePoints: [],
  take: null,
  evidence: [],
  contentPillar: "football",
};
const voice = draftPrompt(voiceBrief);
check("united drafts use the supporter voice", voice.system.includes("A supporter") && voice.system.includes("Do not add #CheckAm"));
check("a politics draft without a pillar is unchanged", !draftPrompt({ ...voiceBrief, contentPillar: null }).system.includes("A supporter"));
const scanRoute = readFileSync("app/api/intel/scan/route.ts", "utf8");
check("an unconfigured or over-budget choice returns before a scan", scanRoute.indexOf("if (!choice.runnable)") >= 0 && scanRoute.indexOf("if (!choice.runnable)") < scanRoute.indexOf("runScan("));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("pillar checks passed");
