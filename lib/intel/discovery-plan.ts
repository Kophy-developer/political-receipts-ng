import { buildRosterBatches, rosterCoverage, rosterEngagement } from "@/lib/intel/account-roster";
import { plannedScanRequest, scanBudget } from "@/lib/intel/budget";
import { withEngagement, type EngagementSetting } from "@/lib/intel/engagement";
import { contentPillars, storagePillar, type ContentPillar } from "@/lib/pillars/catalog";

export type DiscoveryQueryPlan = {
  kind: "keyword" | "roster";
  pillar: ContentPillar;
  storagePillar: "politics" | "finance" | "football";
  name: string;
  topicQuery: string;
  requestQuery: string;
  operator: string;
  handles: string[];
  selectionReason: string;
  groupSlug: string | null;
  groupId: string | null;
  topicSlug: string | null;
};

export type DiscoveryPlan = {
  ok: true;
  queries: DiscoveryQueryPlan[];
  pillars: ContentPillar[];
  estimatedRequests: number;
  estimatedPosts: number;
  rosterHandles: string[];
  note: string;
} | {
  ok: false;
  message: string;
  dropped: string[];
};

export type KeywordSource = {
  pillar: ContentPillar;
  id: string;
  name: string;
  slug: string;
  topicSlug: string | null;
  storedQuery: string;
  requestQuery: string;
  reason: string;
};

export function planDiscoveryQueries(input: {
  pillars: ContentPillar[];
  keywords: KeywordSource[];
  keywordEngagement: EngagementSetting;
  includeRoster?: boolean;
}): DiscoveryPlan {
  const pillars = contentPillars.filter((pillar) => input.pillars.includes(pillar));
  if (pillars.length === 0) {
    return { ok: false, message: "No content pillar is configured for this scan. No X request was made.", dropped: [] };
  }

  const queries: DiscoveryQueryPlan[] = [];
  const dropped: string[] = [];

  for (const pillar of pillars) {
    const keyword = input.keywords.find((item) => item.pillar === pillar) ?? null;
    if (keyword) {
      const built = withEngagement(keyword.requestQuery, input.keywordEngagement);
      if (!built.ok) {
        return { ok: false, message: built.message, dropped: [] };
      }
      queries.push({
        kind: "keyword",
        pillar,
        storagePillar: storagePillar(pillar),
        name: keyword.name,
        topicQuery: keyword.storedQuery,
        requestQuery: built.query,
        operator: built.operator,
        handles: [],
        selectionReason: keyword.reason,
        groupSlug: keyword.slug,
        groupId: keyword.id,
        topicSlug: keyword.topicSlug,
      });
    }

    if (input.includeRoster !== false) {
      const batches = buildRosterBatches(pillar, rosterEngagement);
      if (!batches.ok) {
        return { ok: false, message: batches.message, dropped: batches.dropped };
      }
      for (const [index, batch] of batches.batches.entries()) {
        queries.push({
          kind: "roster",
          pillar,
          storagePillar: storagePillar(pillar),
          name: `${pillar} account roster ${index + 1}`,
          topicQuery: batch.topicQuery,
          requestQuery: batch.requestQuery,
          operator: batch.operator,
          handles: batch.handles,
          selectionReason: `Account roster from: batch ${index + 1} for ${pillar}. Engagement uses min_replies:${rosterEngagement.minimum} so claim-dense posts are not filtered out early.`,
          groupSlug: null,
          groupId: keyword?.id ?? null,
          topicSlug: keyword?.topicSlug ?? null,
        });
      }
    }
  }

  if (queries.length === 0) {
    return { ok: false, message: "No keyword group or account-roster query is ready. No X request was made.", dropped: [] };
  }
  if (queries.length > scanBudget.maxXRequestsPerScan) {
    return {
      ok: false,
      message: `This run needs ${queries.length} X search requests, above the per-scan ceiling of ${scanBudget.maxXRequestsPerScan}. No X request was made.`,
      dropped,
    };
  }

  const coverage = rosterCoverage(pillars);
  const planned = plannedScanRequest(scanBudget.maxPostsPerRequest, queries.length);
  return {
    ok: true,
    queries,
    pillars,
    estimatedRequests: queries.length,
    estimatedPosts: queries.length * planned.postsPerRequest,
    rosterHandles: coverage.handles,
    note: planned.note,
  };
}

export const deskPickRules = [
  "Keep keyword discovery and search every shortlist handle in the same pipeline run across politics, finance, and Manchester United.",
  "Account-roster queries use from: batches. Handles are never silently dropped; an over-long batch fails the plan instead.",
  "Roster searches use a lower min_replies threshold than keyword discovery so claim-dense posts from watched accounts are not lost to engagement filters.",
  "Prefer posts with checkable or implied factual premises, numbers, comparisons, or official-sounding assertions over pure insults or empty slogans.",
  "Do not treat missing research evidence as a reason to pass a clear claim — research is the next stage.",
  "Citation Sources in Settings stay the institutional evidence library. This roster is backend watchlist intake only.",
] as const;
