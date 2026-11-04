import "server-only";
import { insertSearchResults, saveSearchRanking } from "@/lib/db/search-results";
import { recordUsage, researchMonthTotals, usageSince } from "@/lib/db/usage";
import { columnMissing, serviceClient } from "@/lib/db/client";
import { lagosDayStart } from "@/lib/intel/limits";
import { chooseProvider, type ResearchProviderId } from "@/lib/research/choose";
import { hashOfPlan, runAlreadyCompleted } from "@/lib/research/canonical";
import { executeStage } from "@/lib/research/execute";
import { rankSearchResults } from "@/lib/research/inventory";
import { researchBudget, researchLimits } from "@/lib/research/limits";
import { loadStoredPlan, sourceCategories } from "@/lib/research/plan";
import { researchKeys, searchWeb } from "@/lib/research/provider";
import type { SearchMetric } from "@/lib/research/execute";

function providerName(id: ResearchProviderId) {
  return id === "tavily" ? "Tavily" : "Brave Search";
}

async function recordSearch(provider: ResearchProviderId, metric: SearchMetric, reason: string, fallback: string | null, stage: string) {
  const credits = metric.ok ? metric.credits : null;
  return recordUsage({
    provider,
    operation: "web_search",
    requests: 1,
    units: credits ?? 1,
    selectionReason: reason,
    fallbackReason: fallback,
    creditsReported: credits,
    targetTier: stage,
    targetDomains: metric.domains,
    resultsReturned: metric.resultsReturned,
    inDomainResults: metric.inDomain,
    outOfDomainResults: metric.outOfDomain,
    documentsSelected: metric.documentsSelected,
    primarySourcesFound: metric.primarySourcesFound,
    editorAccepted: 0,
  });
}

export async function beginResearch(claimId: string, intent: "auto" | "second" = "auto") {
  const keys = researchKeys();
  const budget = researchBudget();
  const month = await researchMonthTotals();
  const db = serviceClient();
  if (!db) return { ok: false as const, started: false, message: "The database is not configured." };
  let previous: ResearchProviderId | null = null;
  if (intent === "second") {
    const prior = await db.from("research_runs").select("provider").eq("claim_id", claimId).order("started_at", { ascending: false }).limit(1).maybeSingle();
    previous = prior.data?.provider === "Brave Search" ? "brave" : prior.data?.provider === "Tavily" ? "tavily" : null;
    if (!previous) return { ok: false as const, started: false, message: "Search the first provider before asking for a second. No search was sent." };
  }
  const choice = chooseProvider({
    preference: budget.preference,
    tavilyConfigured: keys.tavily,
    braveConfigured: keys.brave,
    tavilyUsed: month.tavily,
    braveUsed: month.brave,
    tavilyCeiling: budget.tavilyCeiling,
    braveCeiling: budget.braveCeiling,
    intent: intent === "second" ? "second" : "auto",
    previous,
  });
  if (!choice.ok) return { ok: false as const, started: false, message: choice.message };

  const loaded = await loadStoredPlan(claimId);
  if (!loaded) return { ok: false as const, started: false, message: "That claim is not on the desk." };
  const plan = loaded.stored;
  if (plan.awaitingReview) return { ok: false as const, started: false, message: "Review the research plan before another search. No search was sent." };
  const hash = hashOfPlan(plan, choice.provider);
  if (runAlreadyCompleted({ hash, provider: choice.provider, runs: loaded.runs })) {
    return { ok: false as const, started: false, message: "This research plan has already been run." };
  }
  if (!plan.searches.length) return { ok: false as const, started: false, message: "This plan has no search to run. No search was sent." };
  if (plan.stage !== "context" && plan.domains.length === 0) {
    return { ok: false as const, started: false, message: "No target domain is configured for this stage. No search was sent." };
  }

  const usage = await usageSince(lagosDayStart());
  if (!usage.ok) return { ok: false as const, started: false, message: "Research usage could not be read. No search was sent." };
  if (usage.totals.searches >= researchLimits.dailySearches) {
    return { ok: false as const, started: false, message: "The daily research search limit is reached. No search was sent." };
  }
  const room = Math.min(plan.searches.length, researchLimits.maxSearchesPerRun, researchLimits.dailySearches - usage.totals.searches);
  const searches = plan.searches.slice(0, room);
  const provider = choice.provider;
  const reason = choice.reason;
  const fallback = choice.fallback;
  const opened = await db.from("research_runs").insert({
    claim_id: claimId,
    status: "planned",
    provider: providerName(provider),
    max_operations: room,
    plan_hash: hash,
    stage: plan.stage,
    detail: { reason, fallback, hash, stage: plan.stage },
  }).select("id").single();
  let runId = opened.data?.id as string | undefined;
  if (opened.error && columnMissing(opened.error.message)) {
    const plain = await db.from("research_runs").insert({
      claim_id: claimId,
      status: "planned",
      provider: providerName(provider),
      max_operations: room,
      detail: { reason, fallback, hash, stage: plan.stage },
    }).select("id").single();
    runId = plain.data?.id as string | undefined;
    if (plain.error || !runId) return { ok: false as const, started: false, message: "The research run could not be opened. No search was sent." };
  } else if (opened.error || !runId) {
    return { ok: false as const, started: false, message: "The research run could not be opened. No search was sent." };
  }

  const categories = await sourceCategories(loaded.pillar);
  const usageIds = new Map<string, string>();
  const outside: Array<{ url: string; reason: string }> = [];
  const errors: string[] = [];
  let searchCount = 0;
  let resultCount = 0;

  try {
    const result = await executeStage({
      stage: plan.stage,
      domains: plan.domains,
      categories,
      searches,
      search: (query, domains) => searchWeb(provider, query, 5, domains),
      onSearch: async (metric) => {
        searchCount += 1;
        const recorded = await recordSearch(provider, metric, reason, fallback, plan.stage);
        if (recorded.id) usageIds.set(metric.query, recorded.id);
      },
      onInventory: async (rows) => {
        resultCount += rows.length;
        const saved = await insertSearchResults({
          runId,
          claimId,
          provider: providerName(provider),
          usageId: usageIds.get(rows[0]?.query ?? "") ?? null,
          rows,
        });
        if (!saved.ok) errors.push(saved.message);
      },
    });
    outside.push(...result.outside);
    errors.push(...result.errors);
    const ranked = rankSearchResults({
      claim: plan.claim,
      questions: plan.questions.map((item) => item.question),
      results: result.inventory,
      recommend: researchLimits.maxDocumentsPerRun,
    });
    const rankedSave = await saveSearchRanking(runId, ranked);
    if (!rankedSave.ok) errors.push(rankedSave.message);
    const recommended = ranked.filter((item) => item.recommended).length;

    const finished = {
      status: errors.length ? "stopped" : "completed",
      provider: providerName(provider),
      operations_used: searchCount,
      documents_retrieved: 0,
      finished_at: new Date().toISOString(),
      detail: {
        errors: errors.slice(0, 4),
        reason,
        fallback,
        hash,
        stage: plan.stage,
        outcome: null,
        outside: outside.slice(0, 8),
        resultsReturned: result.inventory.length,
        recommended,
      },
    };
    const updated = await db.from("research_runs").update({ ...finished, plan_hash: hash, stage: plan.stage }).eq("id", runId);
    if (updated.error && columnMissing(updated.error.message)) {
      await db.from("research_runs").update(finished).eq("id", runId);
    }
    await db.from("claims").update({ status: "researching" }).eq("id", claimId).eq("status", "new");
    const lead = `${searchCount} searches filed ${resultCount} results. No document was opened.`;
    return {
      ok: errors.length === 0,
      started: true,
      searches: searchCount,
      documents: 0,
      message: `${lead} ${errors[0] ?? "Choose a document candidate when you want a page retrieved."}`,
    };
  } catch {
    await db.from("research_runs").update({
      status: "failed",
      operations_used: searchCount,
      documents_retrieved: 0,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return { ok: false as const, started: true, message: "Research stopped. Search results already stored were kept. No document was opened." };
  }
}
