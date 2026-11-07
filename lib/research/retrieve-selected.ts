import "server-only";
import { markSearchResults, loadSearchResults } from "@/lib/db/search-results";
import { fileRetrievedEvidence } from "@/lib/db/research";
import { recordUsage, usageSince } from "@/lib/db/usage";
import { serviceClient } from "@/lib/db/client";
import { isUuid } from "@/lib/db/labels";
import { lagosDayStart } from "@/lib/intel/limits";
import { fetchDocument } from "@/lib/research/fetch-document";
import { hostInDomains } from "@/lib/research/filter";
import { researchLimits } from "@/lib/research/limits";
import { sourceCategories, tierForHost } from "@/lib/research/plan";
import type { Pillar } from "@/lib/research/types";

export async function retrieveStoredResults(claimId: string, resultIds: string[]) {
  if (!isUuid(claimId)) return { ok: false as const, retrieved: 0, message: "That claim is not on the desk." };
  const ids = [...new Set(resultIds.filter((id) => isUuid(id)))];
  if (!ids.length) return { ok: false as const, retrieved: 0, message: "Choose a document from the search results. Nothing was retrieved." };
  if (ids.length > researchLimits.maxDocumentsPerRun) {
    return { ok: false as const, retrieved: 0, message: `Choose at most ${researchLimits.maxDocumentsPerRun} documents. Nothing was retrieved.` };
  }
  const db = serviceClient();
  if (!db) return { ok: false as const, retrieved: 0, message: "The database is not configured." };
  const inventory = await loadSearchResults(claimId);
  if (!inventory.ok && inventory.reason === "unconfigured") return { ok: false as const, retrieved: 0, message: "The database is not configured." };
  const chosen = inventory.results.filter((row) => ids.includes(row.id));
  if (chosen.length !== ids.length) return { ok: false as const, retrieved: 0, message: "Those results are not on this claim. Nothing was retrieved." };
  const blocked = chosen.filter((row) => row.retrievalStatus === "rejected" || !row.inDomain);
  if (blocked.length) return { ok: false as const, retrieved: 0, message: "A result outside this stage was not opened." };
  const pending = chosen.filter((row) => row.retrievalStatus === "not_retrieved" || row.retrievalStatus === "failed");
  if (!pending.length) return { ok: true as const, retrieved: 0, message: "Those documents are already retrieved. No new page was opened." };

  const usage = await usageSince(lagosDayStart());
  if (!usage.ok) return { ok: false as const, retrieved: 0, message: "Document usage could not be read. Nothing was retrieved." };
  if (usage.totals.retrievals + pending.length > researchLimits.dailyRetrievals) {
    return { ok: false as const, retrieved: 0, message: "The daily document limit is reached. Nothing was retrieved." };
  }

  const claim = await db.from("claims").select("id, content_pillar").eq("id", claimId).maybeSingle();
  if (claim.error || !claim.data) return { ok: false as const, retrieved: 0, message: "That claim is not on the desk." };
  const pillar: Pillar = claim.data.content_pillar === "football" || claim.data.content_pillar === "finance" ? claim.data.content_pillar : "politics";
  const categories = await sourceCategories(pillar);
  const seen = new Map<string, { ok: boolean; message?: string }>();
  let retrieved = 0;
  const errors: string[] = [];

  for (const row of pending) {
    const earlier = seen.get(row.url);
    if (earlier) {
      await markSearchResults([row.id], earlier.ok ? "retrieved" : "failed", earlier.ok ? undefined : earlier.message);
      if (!earlier.ok && earlier.message) errors.push(earlier.message);
      continue;
    }
    const page = await fetchDocument(row.url);
    await recordUsage({ provider: "retrieval", operation: "document", requests: 1, units: page.ok ? 1 : 0 });
    if (!page.ok) {
      seen.set(row.url, { ok: false, message: page.message });
      await markSearchResults([row.id], "failed", page.message);
      errors.push(page.message);
      continue;
    }
    seen.set(row.url, { ok: true });
    const tier = tierForHost(page.domain, categories);
    const sameUrl = pending.filter((item) => item.url === row.url).map((item) => item.id);
    const filed = await fileRetrievedEvidence({
      claimId,
      pillar,
      url: page.url,
      domain: page.domain,
      title: page.title,
      organization: page.domain,
      published: page.published ?? row.published,
      passage: page.passage,
      pageLabel: page.pageLabel,
      tierRank: tier.rank,
      tierName: tier.name,
      problem: null,
      question: row.question,
      notes: `Retrieved for “${row.question}”. The passage is context until an editor accepts a reading. A search result is not evidence until this page is opened and read.`,
    });
    if (!filed.ok) {
      await markSearchResults(sameUrl, "failed", filed.message);
      errors.push(filed.message);
      continue;
    }
    await markSearchResults(sameUrl, "retrieved");
    retrieved += 1;
    if (hostInDomains(page.domain, categories.find((item) => item.rank === 1)?.domains ?? [])) {
      const run = await db.from("research_runs").select("id, documents_retrieved, detail").eq("id", row.researchRunId).maybeSingle();
      if (run.data?.id) {
        const detail = run.data.detail && typeof run.data.detail === "object" ? run.data.detail as Record<string, unknown> : {};
        await db.from("research_runs").update({
          documents_retrieved: (typeof run.data.documents_retrieved === "number" ? run.data.documents_retrieved : 0) + 1,
          detail: { ...detail, outcome: "PRIMARY SOURCE FOUND" },
        }).eq("id", run.data.id);
      }
    }
  }

  if (!retrieved && errors.length) return { ok: false as const, retrieved: 0, message: errors[0] };
  const lead = retrieved === 1 ? "1 document retrieved." : `${retrieved} documents retrieved.`;
  return {
    ok: errors.length === 0,
    retrieved,
    message: `${lead} ${errors[0] ?? "The passage is an evidence candidate, not a verdict."}`,
  };
}
