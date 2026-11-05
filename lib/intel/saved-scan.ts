import "server-only";
import { randomUUID } from "crypto";
import { syncModelOpportunities } from "@/lib/db/opportunities";
import {
  finishScan,
  knownEntities,
  listSearchGroups,
  loadScanPosts,
} from "@/lib/db/intel";
import { claimReprocessJob, saveReprocessJob } from "@/lib/db/reprocess-jobs";
import { serviceClient } from "@/lib/db/client";
import { extractFromPosts } from "@/lib/intel/extract-posts";
import { fileDiscussions } from "@/lib/intel/file";
import type { DeskClass } from "@/lib/intel/classify";
import type { PostMetrics, WorkingPost } from "@/lib/intel/posts";
import type { Relevance } from "@/lib/intel/relevance";
import { noteFinished, noteTrying, type ReprocessJob } from "@/lib/intel/progress";
import { analysisFailureReason, providerDisplay, reprocessSummary, scanNeedsReprocess } from "@/lib/intel/stage";
import { freshClaimAction } from "@/lib/desk/discover";

export type SavedScanView = {
  scanId: string;
  postsSaved: number;
  provider: string;
  reason: string;
};

export type SavedScanReport = {
  ok: boolean;
  xRequests: 0;
  posts: number;
  conversations: number;
  opportunities: number;
  summary: { posts: string; conversations: string; opportunities: string };
  found: Array<{ id: string; title: string; action: string }>;
  provider: string | null;
  reason: string | null;
  posted: false;
  polling: false;
  detail: string;
  job: ReprocessJob | null;
};

function metricsOf(value: unknown): PostMetrics {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const num = (key: string) => (typeof row[key] === "number" && Number.isFinite(row[key]) ? (row[key] as number) : 0);
  return { replies: num("replies"), reposts: num("reposts"), likes: num("likes"), quotes: num("quotes"), views: typeof row.views === "number" ? row.views : null };
}

function referencedOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { type?: unknown; id?: unknown };
    if (typeof row.type !== "string" || typeof row.id !== "string") return [];
    return [{ type: row.type, id: row.id }];
  });
}

function relevanceOf(value: unknown): Relevance {
  if (value === "political" || value === "possibly_political" || value === "not_political") return value;
  return "possibly_political";
}

function classOf(value: unknown): DeskClass {
  if (value === "actionable" || value === "discussion" || value === "noise") return value;
  return "discussion";
}

function postsFrom(rows: Array<Record<string, unknown>>): WorkingPost[] {
  return rows.map((row) => ({
    id: String(row.x_post_id),
    text: typeof row.text === "string" ? row.text : "",
    authorId: typeof row.author_id === "string" ? row.author_id : null,
    username: typeof row.username === "string" ? row.username : null,
    displayName: typeof row.display_name === "string" ? row.display_name : null,
    createdAt: typeof row.posted_at === "string" ? row.posted_at : null,
    metrics: metricsOf(row.public_metrics),
    conversationId: typeof row.x_conversation_id === "string" ? row.x_conversation_id : null,
    referenced: referencedOf(row.referenced),
    lang: typeof row.language === "string" ? row.language : null,
    source: typeof row.source_query === "string" ? row.source_query : null,
    relevance: relevanceOf(row.relevance),
    deskClass: classOf(row.desk_class),
    matchedTerm: "",
    reason: typeof row.relevance_reason === "string" ? row.relevance_reason : "",
  }));
}

export async function latestDeskScan(): Promise<SavedScanView | null> {
  const db = serviceClient();
  if (!db) return null;
  const scan = await db
    .from("scan_runs")
    .select("id, status, stage, posts_stored, claims_extracted, error")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (scan.error || !scan.data) return null;
  const row = scan.data;
  const postsStored = typeof row.posts_stored === "number" ? row.posts_stored : 0;
  const analysis = await db.from("ai_analyses").select("provider").eq("subject_id", row.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const provider = typeof analysis.data?.provider === "string" ? analysis.data.provider : null;
  return {
    scanId: String(row.id),
    postsSaved: postsStored,
    provider: providerDisplay(provider),
    reason: analysisFailureReason(typeof row.error === "string" ? row.error : null),
  };
}

export async function latestPartialScan(): Promise<SavedScanView | null> {
  const db = serviceClient();
  if (!db) return null;
  const scan = await db
    .from("scan_runs")
    .select("id, status, stage, posts_stored, claims_extracted, error")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (scan.error || !scan.data) return null;
  const row = scan.data;
  const postsStored = typeof row.posts_stored === "number" ? row.posts_stored : 0;
  const claims = typeof row.claims_extracted === "number" ? row.claims_extracted : 0;
  if (!scanNeedsReprocess({
    stage: typeof row.stage === "string" ? row.stage : null,
    status: String(row.status),
    postsStored,
    claims,
  })) return null;
  const analysis = await db.from("ai_analyses").select("provider").eq("subject_id", row.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const provider = typeof analysis.data?.provider === "string" ? analysis.data.provider : null;
  return {
    scanId: String(row.id),
    postsSaved: postsStored,
    provider: providerDisplay(provider),
    reason: analysisFailureReason(typeof row.error === "string" ? row.error : null),
  };
}

function reportFrom(job: ReprocessJob, found: SavedScanReport["found"], detail: string): SavedScanReport {
  return {
    ok: job.phase === "complete",
    xRequests: 0,
    posts: job.posts,
    conversations: job.conversations,
    opportunities: job.opportunities,
    summary: reprocessSummary({ posts: job.posts, conversations: job.conversations, opportunities: job.opportunities }),
    found,
    provider: providerDisplay(job.provider),
    reason: job.phase === "failed" ? "AI analysis could not be completed." : null,
    posted: false,
    polling: false,
    detail,
    job,
  };
}

export async function reprocessSavedScan(scanId: string): Promise<SavedScanReport> {
  const fail = (detail: string): SavedScanReport => ({
    ok: false,
    xRequests: 0,
    posts: 0,
    conversations: 0,
    opportunities: 0,
    summary: reprocessSummary({ posts: 0, conversations: 0, opportunities: 0 }),
    found: [],
    provider: null,
    reason: analysisFailureReason(detail),
    posted: false,
    polling: false,
    detail,
    job: null,
  });
  if (!/^[0-9a-f-]{36}$/i.test(scanId)) return fail("That scan is not on the desk.");
  const loaded = await loadScanPosts(scanId);
  if (!loaded.ok) return fail(loaded.message);
  if (loaded.rows.length === 0) return fail("That scan has no stored posts.");
  const posts = postsFrom(loaded.rows as Array<Record<string, unknown>>);
  const claim = await claimReprocessJob(scanId, randomUUID(), posts.length);
  if (!claim.ok) return fail(claim.message);
  if (!claim.claimed) return reportFrom(claim.job, [], "This scan is already being reprocessed. No second request was made.");
  const job = claim.job;
  let steps = job.steps;
  try {
    await finishScan(scanId, { stage: "AI_PROCESSING" });
    await saveReprocessJob(job.id, { phase: "extraction", posts: posts.length, steps });
    const extraction = await extractFromPosts(posts, scanId, {
      requestId: job.requestId,
      onStart: async (plan) => {
        steps = noteTrying(steps, plan.id);
        await saveReprocessJob(job.id, { phase: "extraction", steps, provider: plan.id });
      },
      onAttempt: async (attempt) => {
        if (!attempt.called) return;
        steps = noteFinished(steps, attempt.provider, attempt.status === "success" ? "succeeded" : "failed", attempt.diagnostic?.classification ?? null);
        await saveReprocessJob(job.id, { phase: "extraction", steps, provider: attempt.provider });
      },
    });
    await saveReprocessJob(job.id, { phase: "classifying", steps });
    const groups = await listSearchGroups();
    const topics = new Map(groups.map((group) => [group.name, group.topicSlug]));
    const filed = await fileDiscussions({
      posts,
      claims: extraction.claims,
      outcome: extraction.outcome,
      entities: await knownEntities(),
      topicSlugFor: (source) => (source && topics.get(source)) || "desk-elections",
      deskNote: "Reprocessed from the stored scan. No new X request was made.",
    });
    await saveReprocessJob(job.id, { phase: "opportunities", conversations: filed.conversationIds.length, steps });
    const opportunities = extraction.claims.length > 0
      ? await syncModelOpportunities(filed.links, scanId)
      : { found: 0, created: 0, updated: 0, cards: [] as Array<{ id: string; title: string; claimId: string | null }> };
    const aiFailed = extraction.outcome === "failed" || extraction.outcome === "invalid";
    const db = serviceClient();
    const previous = db ? await db.from("scan_runs").select("detail").eq("id", scanId).maybeSingle() : { data: null };
    const prior = previous.data?.detail && typeof previous.data.detail === "object" ? previous.data.detail as Record<string, unknown> : {};
    await finishScan(scanId, {
      stage: aiFailed ? "PARTIAL_FAILURE" : "COMPLETE",
      status: aiFailed ? "stopped" : "completed",
      claims_extracted: filed.claims,
      error: aiFailed ? extraction.detail : null,
      detail: {
        ...prior,
        kind: "reprocess-saved",
        extraction: extraction.outcome,
        extractionDetail: extraction.detail,
        extractionProvider: extraction.provider,
        extractionClass: extraction.classification,
        xRequests: 0,
      },
    });
    const finished: ReprocessJob = {
      ...job,
      phase: aiFailed ? "failed" : "complete",
      posts: posts.length,
      conversations: filed.conversationIds.length,
      opportunities: opportunities.found,
      provider: extraction.provider,
      steps,
      finishedAt: new Date().toISOString(),
    };
    await saveReprocessJob(job.id, finished);
    return reportFrom(
      finished,
      opportunities.cards.map((item) => ({ id: item.claimId ?? item.id, title: item.title, action: freshClaimAction() })),
      extraction.detail,
    );
  } catch {
    const failed: ReprocessJob = { ...job, phase: "failed", posts: posts.length, steps, finishedAt: new Date().toISOString() };
    await saveReprocessJob(job.id, { phase: "failed", finishedAt: failed.finishedAt, steps });
    await finishScan(scanId, { stage: "PARTIAL_FAILURE", status: "stopped", error: "AI analysis could not be completed." });
    return reportFrom(failed, [], "AI analysis could not be completed.");
  }
}
