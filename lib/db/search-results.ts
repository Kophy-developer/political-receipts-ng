import "server-only";
import { columnMissing, schemaMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import type { RankedResult, RetrievalStatus, SearchResultDraft, StoredSearchResult } from "@/lib/research/inventory";
import { sanitizeStoredText } from "@/lib/research/passage";

function statusOf(value: unknown): RetrievalStatus {
  if (value === "retrieved" || value === "rejected" || value === "failed" || value === "not_retrieved") return value;
  return "not_retrieved";
}

function rowFrom(row: Record<string, unknown>): StoredSearchResult | null {
  if (typeof row.id !== "string" || typeof row.url !== "string" || typeof row.query !== "string") return null;
  return {
    id: row.id,
    researchRunId: typeof row.research_run_id === "string" ? row.research_run_id : "",
    claimId: typeof row.claim_id === "string" ? row.claim_id : "",
    provider: typeof row.provider === "string" ? row.provider : "",
    question: typeof row.question === "string" ? row.question : "",
    query: row.query,
    resultRank: typeof row.result_rank === "number" ? row.result_rank : 0,
    title: typeof row.title === "string" ? row.title : row.url,
    url: row.url,
    domain: typeof row.domain === "string" ? row.domain : "",
    snippet: typeof row.snippet === "string" ? row.snippet : null,
    published: typeof row.published_label === "string" ? row.published_label : null,
    targetTier: typeof row.target_tier === "string" ? row.target_tier : null,
    inDomain: row.in_domain === true,
    retrievalStatus: statusOf(row.retrieval_status),
    rejectionReason: typeof row.rejection_reason === "string" ? row.rejection_reason : null,
    score: typeof row.relevance_score === "number" ? row.relevance_score : 0,
    reason: typeof row.relevance_reason === "string" ? row.relevance_reason : null,
    recommended: row.recommended === true,
  };
}

export async function insertSearchResults(input: {
  runId: string;
  claimId: string;
  provider: string;
  usageId: string | null;
  rows: Array<SearchResultDraft & { score?: number; reason?: string; recommended?: boolean }>;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  if (!input.rows.length) return { ok: true as const, count: 0 };
  const payload = input.rows.map((row) => ({
    research_run_id: input.runId,
    claim_id: input.claimId,
    usage_id: input.usageId,
    provider: input.provider,
    question: sanitizeStoredText(row.question, 400),
    query: sanitizeStoredText(row.query, 240),
    result_rank: row.resultRank,
    title: sanitizeStoredText(row.title, 180) || row.url,
    url: row.url,
    domain: row.domain || null,
    snippet: row.snippet ? sanitizeStoredText(row.snippet, 500) : null,
    published_label: row.published ? sanitizeStoredText(row.published, 40) : null,
    target_tier: row.targetTier,
    in_domain: row.inDomain,
    retrieval_status: row.retrievalStatus,
    rejection_reason: row.rejectionReason ? sanitizeStoredText(row.rejectionReason, 240) : null,
    relevance_score: row.score ?? 0,
    relevance_reason: row.reason ? sanitizeStoredText(row.reason, 400) : null,
    recommended: row.recommended === true,
  }));
  const inserted = await db.from("search_results").insert(payload).select("id");
  if (inserted.error) {
    if (schemaMissing(inserted.error.message) || columnMissing(inserted.error.message)) {
      return { ok: false as const, message: "Search results could not be stored because the inventory table is not installed." };
    }
    return { ok: false as const, message: scrubDbMessage(inserted.error.message) };
  }
  return { ok: true as const, count: inserted.data?.length ?? payload.length };
}

export async function loadSearchResults(claimId: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const, results: [] as StoredSearchResult[], note: null as string | null };
  const listed = await db.from("search_results").select("*").eq("claim_id", claimId).order("query").order("result_rank");
  if (listed.error) {
    if (schemaMissing(listed.error.message) || columnMissing(listed.error.message)) {
      return { ok: true as const, results: [] as StoredSearchResult[], note: null as string | null };
    }
    return { ok: false as const, reason: "unreachable" as const, results: [] as StoredSearchResult[], note: null };
  }
  const results = (listed.data ?? []).flatMap((row) => {
    const mapped = rowFrom(row as Record<string, unknown>);
    return mapped ? [mapped] : [];
  });
  const run = await db.from("research_runs").select("detail").eq("claim_id", claimId).order("started_at", { ascending: false }).limit(1).maybeSingle();
  const detail = run.data?.detail;
  const note = detail && typeof detail === "object" && typeof (detail as { inventoryNote?: unknown }).inventoryNote === "string"
    ? (detail as { inventoryNote: string }).inventoryNote
    : null;
  return { ok: true as const, results, note };
}

export async function saveSearchRanking(runId: string, rows: RankedResult[]) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  for (const row of rows) {
    const updated = await db
      .from("search_results")
      .update({
        relevance_score: row.score,
        relevance_reason: sanitizeStoredText(row.reason, 400),
        recommended: row.recommended,
      })
      .eq("research_run_id", runId)
      .eq("query", row.query)
      .eq("result_rank", row.resultRank);
    if (updated.error) return { ok: false as const, message: scrubDbMessage(updated.error.message) };
  }
  return { ok: true as const };
}

export async function markSearchResults(ids: string[], status: RetrievalStatus, reason?: string | null) {
  const db = serviceClient();
  if (!db) return { ok: false as const, message: "The database is not configured." };
  const patch: { retrieval_status: RetrievalStatus; rejection_reason?: string | null; recommended?: boolean } = { retrieval_status: status };
  if (reason !== undefined) patch.rejection_reason = reason;
  if (status === "retrieved") patch.recommended = false;
  const updated = await db.from("search_results").update(patch).in("id", ids);
  if (updated.error) return { ok: false as const, message: scrubDbMessage(updated.error.message) };
  return { ok: true as const };
}
