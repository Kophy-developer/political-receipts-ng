import "server-only";
import { fileRetrievedEvidence } from "@/lib/db/research";
import { recordUsage, researchMonthTotals, usageSince } from "@/lib/db/usage";
import { columnMissing, serviceClient } from "@/lib/db/client";
import { lagosDayStart } from "@/lib/intel/limits";
import { chooseProvider, type ResearchProviderId } from "@/lib/research/choose";
import { hashOfPlan, runAlreadyCompleted } from "@/lib/research/canonical";
import { executeStage } from "@/lib/research/execute";
import { fetchDocument, readOfficialHtml } from "@/lib/research/fetch-document";
import { hostInDomains, hostname, isSocialHost } from "@/lib/research/filter";
import { researchBudget, researchLimits } from "@/lib/research/limits";
import { loadStoredPlan, sourceCategories, tierForHost } from "@/lib/research/plan";
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
  let provider = choice.provider;
  let reason = choice.reason;
  let fallback = choice.fallback;
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
  const primaryDomains = plan.stage === "primary" ? plan.domains : loaded.categories.find((item) => item.rank === 1)?.domains ?? [];
  const usageIds = new Map<string, string>();
  let retrievals = 0;
  let switched = false;
  let offset = 0;
  const documents: Awaited<ReturnType<typeof executeStage>>["documents"] = [];
  const outside: Array<{ url: string; reason: string }> = [];
  const errors: string[] = [];
  let outcome: "PRIMARY SOURCE FOUND" | "PRIMARY SOURCE NOT FOUND" | null = null;
  let searchCount = 0;

  const retrieve = async (url: string) => {
    if (usage.totals.retrievals + retrievals >= researchLimits.dailyRetrievals) {
      return { ok: false as const, message: "The daily document limit is reached." };
    }
    const page = await fetchDocument(url);
    if (page.attempted) {
      retrievals += 1;
      await recordUsage({ provider: "retrieval", operation: "document", requests: 1, units: page.ok ? 1 : 0 });
    }
    if (!page.ok) return { ok: false as const, message: page.message };
    return { ok: true as const, url: page.url, domain: page.domain, title: page.title, published: page.published, passage: page.passage };
  };
  const readHtml = async (url: string) => {
    const host = hostname(url);
    if (!host || !hostInDomains(host, plan.direct.domains)) return { ok: false as const, message: "That host is outside the official domain." };
    if (usage.totals.retrievals + retrievals >= researchLimits.dailyRetrievals) {
      return { ok: false as const, message: "The daily document limit is reached." };
    }
    const page = await readOfficialHtml(url);
    if (page.attempted) {
      retrievals += 1;
      await recordUsage({ provider: "retrieval", operation: "official_index", requests: 1, units: page.ok ? 1 : 0 });
    }
    if (!page.ok) return { ok: false as const, message: page.message };
    return { ok: true as const, url: page.url, html: page.html };
  };

  try {
    while (offset < searches.length) {
      const result = await executeStage({
        stage: plan.stage,
        domains: plan.domains,
        primaryDomains,
        searches: searches.slice(offset),
        search: (query, domains) => searchWeb(provider, query, 5, domains),
        retrieve,
        readHtml,
        direct: plan.direct,
        maxDocuments: researchLimits.maxDocumentsPerRun - documents.length,
        onSearch: async (metric) => {
          searchCount += 1;
          const recorded = await recordSearch(provider, metric, reason, fallback, plan.stage);
          if (recorded.id) usageIds.set(metric.query, recorded.id);
        },
      });
      documents.push(...result.documents);
      outside.push(...result.outside);
      errors.push(...result.errors);
      if (result.outcome) outcome = result.outcome;
      if (result.stop === "unavailable" && !switched && intent === "auto") {
        const failedIndex = offset + Math.max(0, result.attempted - 1);
        const next = chooseProvider({
          preference: budget.preference,
          tavilyConfigured: keys.tavily,
          braveConfigured: keys.brave,
          tavilyUsed: month.tavily + (provider === "tavily" ? searchCount : 0),
          braveUsed: month.brave + (provider === "brave" ? searchCount : 0),
          tavilyCeiling: budget.tavilyCeiling,
          braveCeiling: budget.braveCeiling,
          intent: "outage",
          previous: provider,
        });
        if (next.ok) {
          provider = next.provider;
          reason = next.reason;
          fallback = next.fallback;
          switched = true;
          offset = failedIndex;
          continue;
        }
      }
      break;
    }

    for (const document of documents) {
      const social = document.social || isSocialHost(document.domain);
      const tier = social ? { rank: 4, name: "Context" } : tierForHost(document.domain, categories);
      const filed = await fileRetrievedEvidence({
        claimId,
        pillar: loaded.pillar,
        url: document.url,
        domain: document.domain,
        title: document.title,
        organization: document.domain,
        published: document.published,
        passage: document.passage,
        tierRank: tier.rank,
        tierName: tier.name,
        problem: document.problem,
        usageId: usageIds.get(document.query) ?? null,
        stance: document.problem === "attribution" ? "attribution_only" : "contextualizes",
        notes: social
          ? `Retrieved for “${document.question}”. A social page can show circulation. It does not establish the fact.`
          : `Retrieved for “${document.question}”. The passage is context until an editor accepts a reading. It is not marked as support or contradiction.`,
      });
      if (!filed.ok) errors.push(filed.message);
    }

    const finished = {
      status: errors.length ? "stopped" : "completed",
      provider: providerName(provider),
      operations_used: searchCount,
      documents_retrieved: documents.length,
      finished_at: new Date().toISOString(),
      detail: { errors: errors.slice(0, 4), reason, fallback, hash, stage: plan.stage, outcome, outside: outside.slice(0, 8) },
    };
    const updated = await db.from("research_runs").update({ ...finished, plan_hash: hash, stage: plan.stage }).eq("id", runId);
    if (updated.error && columnMissing(updated.error.message)) {
      await db.from("research_runs").update(finished).eq("id", runId);
    }
    await db.from("claims").update({ status: "researching" }).eq("id", claimId).eq("status", "new");
    const found = outcome === "PRIMARY SOURCE FOUND";
    const lead = plan.stage === "primary" ? (found ? "Primary source found." : "Primary source not found.") : "This stage is filed.";
    return {
      ok: errors.length === 0,
      started: true,
      searches: searchCount,
      documents: documents.length,
      message: `${lead} ${errors[0] ?? "Review the passages before any verdict."}`,
    };
  } catch {
    await db.from("research_runs").update({
      status: "failed",
      operations_used: searchCount,
      documents_retrieved: documents.length,
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
    return { ok: false as const, started: true, message: "Research stopped. Passages already retrieved were kept." };
  }
}
