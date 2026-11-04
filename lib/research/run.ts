import "server-only";
import { fileRetrievedEvidence, storeVerdict } from "@/lib/db/research";
import { recordUsage, usageSince } from "@/lib/db/usage";
import { serviceClient } from "@/lib/db/client";
import { lagosDayStart } from "@/lib/intel/limits";
import { fetchDocument } from "@/lib/research/fetch-document";
import { researchLimits } from "@/lib/research/limits";
import { sourceCategories, tierForHost } from "@/lib/research/plan";
import { searchProvider } from "@/lib/research/provider";
import type { Pillar, StatementKind } from "@/lib/research/types";

export async function beginResearch(claimId: string) {
  const provider = searchProvider();
  if (!provider.configured) {
    return { ok: false as const, started: false, message: `No search was sent. Set ${provider.credential} on the server.` };
  }
  const db = serviceClient();
  if (!db) return { ok: false as const, started: false, message: "The database is not configured." };
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
  const opened = await db.from("research_runs").insert({ claim_id: claimId, status: "planned", provider: provider.name, max_operations: room }).select("id").single();
  if (opened.error || !opened.data) return { ok: false as const, started: false, message: "The research run could not be opened. No search was sent." };
  const categories = await sourceCategories(pillar);
  let searches = 0;
  let documents = 0;
  const errors: string[] = [];
  try {
    for (const query of queries.slice(0, room)) {
      const searched = await provider.search(query, 5);
      searches += 1;
      await recordUsage({ provider: "search", operation: "web_search", requests: 1, units: searched.ok ? searched.hits.length : 0 });
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
      operations_used: searches,
      documents_retrieved: documents,
      finished_at: new Date().toISOString(),
      detail: { errors: errors.slice(0, 4) },
    }).eq("id", opened.data.id);
    await db.from("claims").update({ status: "researching" }).eq("id", claimId).eq("status", "new");
    return { ok: errors.length === 0, started: true, searches, documents, message: errors[0] ?? "Research stopped after the planned searches. Review the passages before any verdict." };
  } catch {
    await db.from("research_runs").update({ status: "failed", operations_used: searches, documents_retrieved: documents, finished_at: new Date().toISOString() }).eq("id", opened.data.id);
    return { ok: false as const, started: true, message: "Research stopped. Passages already retrieved were kept." };
  }
}
