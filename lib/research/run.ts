import "server-only";
import { fileRetrievedEvidence, storeVerdict } from "@/lib/db/research";
import { recordUsage, researchMonthTotals, usageSince } from "@/lib/db/usage";
import { serviceClient } from "@/lib/db/client";
import { lagosDayStart } from "@/lib/intel/limits";
import { chooseProvider, type ResearchProviderId } from "@/lib/research/choose";
import { fetchDocument } from "@/lib/research/fetch-document";
import { researchBudget, researchLimits } from "@/lib/research/limits";
import { sourceCategories, tierForHost } from "@/lib/research/plan";
import { researchKeys, searchWeb, type SearchResult } from "@/lib/research/provider";
import type { Pillar, StatementKind } from "@/lib/research/types";

function providerName(id: ResearchProviderId) {
  return id === "tavily" ? "Tavily" : "Brave Search";
}

async function recordSearch(provider: ResearchProviderId, result: SearchResult, reason: string, fallback: string | null) {
  const credits = result.ok ? result.credits : null;
  await recordUsage({
    provider,
    operation: "web_search",
    requests: 1,
    units: credits ?? 1,
    selectionReason: reason,
    fallbackReason: fallback,
    creditsReported: credits,
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

  const claim = await db.from("claims").select("id, claim_text, content_pillar, statement_kind, research_questions").eq("id", claimId).maybeSingle();
  if (claim.error || !claim.data) return { ok: false as const, started: false, message: "That claim is not on the desk." };
  const pillar: Pillar = claim.data.content_pillar === "football" || claim.data.content_pillar === "finance" ? claim.data.content_pillar : "politics";
  const kind: StatementKind = claim.data.statement_kind === "opinion" || claim.data.statement_kind === "analysis" ? claim.data.statement_kind : "fact";
  const usage = await usageSince(lagosDayStart());
  if (!usage.ok) return { ok: false as const, started: false, message: "Research usage could not be read. No search was sent." };
  if (usage.totals.searches >= researchLimits.dailySearches) {
    return { ok: false as const, started: false, message: "The daily research search limit is reached. No search was sent." };
  }
  const questions = (claim.data.research_questions ?? []).slice(0, researchLimits.maxSearchesPerRun);
  const queries = questions.length ? questions : [claim.data.claim_text.slice(0, 180)];
  const room = Math.min(researchLimits.maxSearchesPerRun, researchLimits.dailySearches - usage.totals.searches, queries.length);
  let provider: ResearchProviderId = choice.provider;
  let reason = choice.reason;
  let fallback = choice.fallback;
  const opened = await db.from("research_runs").insert({
    claim_id: claimId,
    status: "planned",
    provider: providerName(provider),
    max_operations: room,
    detail: { reason, fallback },
  }).select("id").single();
  if (opened.error || !opened.data) return { ok: false as const, started: false, message: "The research run could not be opened. No search was sent." };
  const categories = await sourceCategories(pillar);
  let searches = 0;
  let documents = 0;
  let switched = false;
  const errors: string[] = [];
  try {
    for (const query of queries.slice(0, room)) {
      let searched = await searchWeb(provider, query, 5);
      searches += 1;
      await recordSearch(provider, searched, reason, fallback);
      if (!searched.ok && searched.cause === "unavailable" && !switched && intent === "auto") {
        const next = chooseProvider({
          preference: budget.preference,
          tavilyConfigured: keys.tavily,
          braveConfigured: keys.brave,
          tavilyUsed: month.tavily + (provider === "tavily" ? searches : 0),
          braveUsed: month.brave + (provider === "brave" ? searches : 0),
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
          searched = await searchWeb(provider, query, 5);
          searches += 1;
          await recordSearch(provider, searched, reason, fallback);
        }
      }
      if (!searched.ok) {
        errors.push(searched.message);
        break;
      }
      const ranked = [...searched.hits].sort((left, right) => {
        const leftTier = tierForHost(new URL(left.url).hostname, categories).rank;
        const rightTier = tierForHost(new URL(right.url).hostname, categories).rank;
        return leftTier - rightTier;
      });
      for (const hit of ranked) {
        if (documents >= researchLimits.maxDocumentsPerRun) break;
        if (usage.totals.retrievals + documents >= researchLimits.dailyRetrievals) break;
        const page = await fetchDocument(hit.url);
        if (!page.attempted) {
          errors.push(page.message);
          continue;
        }
        documents += 1;
        await recordUsage({ provider: "retrieval", operation: "document", requests: 1, units: page.ok ? 1 : 0 });
        if (!page.ok) {
          errors.push(page.message);
          continue;
        }
        const tier = tierForHost(page.domain, categories);
        const filed = await fileRetrievedEvidence({
          claimId,
          pillar,
          url: page.url,
          domain: page.domain,
          title: page.title || hit.title,
          organization: page.domain,
          published: page.published,
          passage: page.passage,
          tierRank: tier.rank,
          tierName: tier.name,
          notes: "Retrieved for the editor. The passage is not marked as support or contradiction until someone accepts that reading.",
        });
        if (!filed.ok) errors.push(filed.message);
      }
    }
    await storeVerdict(claimId, kind);
    await db.from("research_runs").update({
      status: errors.length ? "stopped" : "completed",
      provider: providerName(provider),
      operations_used: searches,
      documents_retrieved: documents,
      finished_at: new Date().toISOString(),
      detail: { errors: errors.slice(0, 4), reason, fallback },
    }).eq("id", opened.data.id);
    await db.from("claims").update({ status: "researching" }).eq("id", claimId).eq("status", "new");
    return { ok: errors.length === 0, started: true, searches, documents, message: errors[0] ?? "Research stopped after the planned searches. Review the passages before any verdict." };
  } catch {
    await db.from("research_runs").update({ status: "failed", operations_used: searches, documents_retrieved: documents, finished_at: new Date().toISOString() }).eq("id", opened.data.id);
    return { ok: false as const, started: true, message: "Research stopped. Passages already retrieved were kept." };
  }
}
