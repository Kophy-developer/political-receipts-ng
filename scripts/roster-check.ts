import { allRosterAccounts, buildRosterBatches, rosterCoverage, rosterEngagement, rosterHandles } from "../lib/intel/account-roster";
import { deskPickRules, planDiscoveryQueries } from "../lib/intel/discovery-plan";
import { defaultEngagement } from "../lib/intel/engagement";
import { postCreateBody } from "../lib/publish/payload";

const failures: string[] = [];
function check(name: string, ok: boolean) {
  if (!ok) failures.push(name);
}

const coverage = rosterCoverage();
check("shortlist has 45 handles", coverage.accounts === 45 && coverage.handles.includes("ManUtd"));
check("politics finance and man u are all present", coverage.byPillar.politics === 20 && coverage.byPillar.finance === 15 && coverage.byPillar.manchester_united === 10);

for (const pillar of ["politics", "finance", "manchester_united"] as const) {
  const batches = buildRosterBatches(pillar, rosterEngagement);
  check(`${pillar} roster batches build`, batches.ok);
  if (!batches.ok) continue;
  const covered = new Set(batches.batches.flatMap((batch) => batch.handles));
  check(`${pillar} roster covers every handle`, rosterHandles(pillar).every((handle) => covered.has(handle)));
  check(`${pillar} roster uses lower engagement`, batches.batches.every((batch) => batch.operator === "min_replies:3"));
  check(`${pillar} roster queries stay inside the X limit`, batches.batches.every((batch) => batch.requestQuery.length <= 480));
}

const plan = planDiscoveryQueries({
  pillars: ["politics", "finance", "manchester_united"],
  keywords: [
    { pillar: "politics", id: "1", name: "Politics", slug: "politics", topicSlug: "politics", storedQuery: "Nigeria -is:retweet", requestQuery: "Nigeria -is:retweet", reason: "test" },
    { pillar: "finance", id: "2", name: "Finance", slug: "finance", topicSlug: "finance", storedQuery: "naira -is:retweet", requestQuery: "naira -is:retweet", reason: "test" },
    { pillar: "manchester_united", id: "3", name: "United", slug: "united", topicSlug: "united", storedQuery: "Man United -is:retweet", requestQuery: "Man United -is:retweet", reason: "test" },
  ],
  keywordEngagement: defaultEngagement,
});
check("one plan covers all pillars", plan.ok && plan.pillars.length === 3);
if (plan.ok) {
  check("keywords and roster queries run together", plan.queries.some((query) => query.kind === "keyword") && plan.queries.some((query) => query.kind === "roster"));
  check("no shortlist handle is dropped", plan.rosterHandles.length === allRosterAccounts.length);
  check("multi-pillar needs several X requests", plan.estimatedRequests >= 6);
}
check("desk pick rules stay documented", deskPickRules.length >= 4 && deskPickRules.some((rule) => /shortlist handle/i.test(rule)));
check("reply payload still carries evidence media", JSON.stringify(postCreateBody("Receipts.", ["99"], "42")).includes("media_ids") && JSON.stringify(postCreateBody("Receipts.", ["99"], "42")).includes("in_reply_to_tweet_id"));

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("roster checks passed");
