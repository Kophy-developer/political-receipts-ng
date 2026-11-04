import "server-only";
import { geminiConfigured, geminiModelName } from "@/lib/ai/env";
import { geminiHealth } from "@/lib/ai/gemini";
import { recordEvent } from "@/lib/db/events";
import {
  closeOrphanConversations,
  finishScan,
  intelReady,
  knownEntities,
  listSearchGroups,
  loadStoredPosts,
  openScan,
  releaseStaleScans,
  saveAnalysis,
  termRules,
  updateStoredPost,
} from "@/lib/db/intel";
import { recordUsage, usageSince } from "@/lib/db/usage";
import { judgePost } from "@/lib/intel/classify";
import type { ExtractionReport } from "@/lib/intel/extract-posts";
import { extractFromPosts } from "@/lib/intel/extract-posts";
import { fileDiscussions } from "@/lib/intel/file";
import { lagosDayStart, scanLimits } from "@/lib/intel/limits";
import { claimDeskLock, releaseDeskLock } from "@/lib/intel/lock";
import type { ExtractionOutcome } from "@/lib/intel/outcome";
import type { PostMetrics, WorkingPost } from "@/lib/intel/posts";
import { sanitizeText } from "@/lib/intel/text";

export type ReprocessReport = {
  ok: boolean;
  xRequests: 0;
  posts: number;
  actionable: number;
  discussion: number;
  noise: number;
  conversations: number;
  claimsExtracted: number;
  claimsRejected: number;
  geminiCalls: number;
  extraction: ExtractionOutcome;
  detail: string;
  model: string | null;
  posted: false;
  polling: false;
  errors: string[];
};

function blank(outcome: ExtractionOutcome, detail: string, model: string | null = null): ExtractionReport {
  return { outcome, detail, claims: [], dropped: 0, geminiRequests: 0, inputTokens: null, outputTokens: null, model };
}

function metricsOf(value: unknown): PostMetrics {
  const row = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const num = (key: string) => (typeof row[key] === "number" && Number.isFinite(row[key]) ? (row[key] as number) : 0);
  return {
    replies: num("replies"),
    reposts: num("reposts"),
    likes: num("likes"),
    quotes: num("quotes"),
    views: typeof row.views === "number" ? row.views : null,
  };
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

export async function reprocessStoredPosts(): Promise<ReprocessReport> {
  const started = Date.now();
  const fail = (detail: string, extra?: Partial<ReprocessReport>): ReprocessReport => ({
    ok: false,
    xRequests: 0,
    posts: 0,
    actionable: 0,
    discussion: 0,
    noise: 0,
    conversations: 0,
    claimsExtracted: 0,
    claimsRejected: 0,
    geminiCalls: 0,
    extraction: "failed",
    detail,
    model: null,
    posted: false,
    polling: false,
    errors: [detail],
    ...extra,
  });
  if (!claimDeskLock()) return fail("A desk job is already running. No X request was made.");
  let scanId: string | null = null;
  try {
    const ready = await intelReady();
    if (!ready.ok) return fail(ready.message);
    const loaded = await loadStoredPosts();
    if (!loaded.ok) return fail(loaded.message);
    if (loaded.rows.length === 0) {
      return fail("No stored posts to reprocess.", { ok: true, extraction: "not_run", errors: [] });
    }
    await releaseStaleScans();
    const opened = await openScan({ kind: "reprocess", groupName: "Stored posts", maxPosts: 0, lookbackHours: 0 });
    if (!opened.ok) return fail(opened.message);
    scanId = opened.id;

    const rules = await termRules();
    const posts: WorkingPost[] = [];
    const errors: string[] = [];
    for (const row of loaded.rows) {
      const text = sanitizeText(typeof row.text === "string" ? row.text : "");
      const judged = judgePost(text, rules);
      const updated = await updateStoredPost(row.x_post_id, {
        text,
        relevance: judged.relevance,
        relevance_reason: judged.reason,
        desk_class: judged.deskClass,
      });
      if (!updated) errors.push("One stored post could not be updated. It was not deleted.");
      posts.push({
        id: row.x_post_id,
        text,
        authorId: row.author_id,
        username: row.username,
        displayName: row.display_name,
        createdAt: row.posted_at,
        metrics: metricsOf(row.public_metrics),
        conversationId: row.x_conversation_id,
        referenced: referencedOf(row.referenced),
        lang: row.language,
        source: row.source_query,
        relevance: judged.relevance,
        deskClass: judged.deskClass,
        matchedTerm: judged.matchedTerm,
        reason: judged.reason,
      });
    }

    const usage = await usageSince(lagosDayStart());
    const remaining = usage.ok ? Math.max(0, scanLimits.dailyGeminiRequests - usage.totals.geminiRequests) : 0;
    const candidates = posts.filter((post) => post.deskClass !== "noise" && post.relevance !== "not_political");
    let healthCalls = 0;
    let extraction: ExtractionReport;
    if (!usage.ok) {
      extraction = blank("failed", "AI extraction failed: usage tracking is not readable.");
    } else if (candidates.length === 0) {
      extraction = blank("not_run", "Extraction did not run. No actionable or discussion post was sent to the model.");
    } else if (remaining < 1) {
      extraction = blank("not_run", "Gemini’s daily allowance is spent. Desk rules classified the stored posts. The model was not called.");
    } else if (remaining < 2) {
      extraction = await extractFromPosts(posts, scanId);
    } else if (!geminiConfigured()) {
      extraction = blank("failed", "AI extraction failed: Gemini is not configured.", geminiModelName());
    } else {
      const health = await geminiHealth();
      if (health.called) {
        healthCalls = 1;
        await recordUsage({
          provider: "gemini",
          operation: "health",
          requests: 1,
          units: 0,
          inputTokens: health.usage.inputTokens,
          outputTokens: health.usage.outputTokens,
          scanId,
        });
        await saveAnalysis({ provider: "gemini", model: health.model, promptVersion: "health-v1", scanId });
      }
      if (!health.ok) {
        extraction = blank("failed", `AI extraction failed: ${health.message}`, health.model);
      } else if (remaining - healthCalls < 1) {
        extraction = blank("failed", "AI extraction failed: the daily Gemini limit is reached after the model check.", health.model);
      } else {
        extraction = await extractFromPosts(posts, scanId);
      }
    }

    const groups = await listSearchGroups();
    const topics = new Map(groups.map((group) => [group.name, group.topicSlug]));
    const entities = await knownEntities();
    const filed = await fileDiscussions({
      posts,
      claims: extraction.claims,
      outcome: extraction.outcome,
      entities,
      topicSlugFor: (source) => (source && topics.get(source)) || "desk-elections",
      deskNote: "Reclustered from stored posts. No new X request was made. This is not a verdict, and it is not a candidate ranking.",
    });
    if (filed.conversationIds.length > 0) await closeOrphanConversations(filed.conversationIds);

    const aiFailed = extraction.outcome === "failed" || extraction.outcome === "invalid";
    const actionable = posts.filter((post) => post.deskClass === "actionable").length;
    const discussion = posts.filter((post) => post.deskClass === "discussion").length;
    const noise = posts.filter((post) => post.deskClass === "noise").length;
    const geminiCalls = healthCalls + extraction.geminiRequests;
    if (aiFailed) errors.unshift(extraction.detail);
    else if (extraction.dropped > 0 || extraction.outcome === "rejected") errors.push(extraction.detail);

    await finishScan(scanId, {
      status: aiFailed ? "stopped" : "completed",
      finished_at: new Date().toISOString(),
      x_requests: 0,
      posts_returned: posts.length,
      posts_stored: posts.length,
      relevant_posts: posts.filter((post) => post.relevance === "political").length,
      conversations_created: filed.conversations,
      claims_extracted: filed.claims,
      gemini_requests: geminiCalls,
      input_tokens: extraction.inputTokens,
      output_tokens: extraction.outputTokens,
      duration_ms: Date.now() - started,
      error: aiFailed ? extraction.detail : null,
      detail: {
        kind: "reprocess",
        extraction: extraction.outcome,
        extractionDetail: extraction.detail,
        actionable,
        discussion,
        noise,
        claimsRejected: extraction.dropped,
      },
    });
    await recordEvent({
      action: "posts reprocessed",
      actor: "editor",
      subjectType: "scan",
      subjectId: scanId,
      detail: {
        posts: posts.length,
        actionable,
        discussion,
        noise,
        conversations: filed.conversationIds.length,
        claims: filed.claims,
        rejected: extraction.dropped,
        geminiCalls,
        xRequests: 0,
      },
    });
    return {
      ok: !aiFailed,
      xRequests: 0,
      posts: posts.length,
      actionable,
      discussion,
      noise,
      conversations: filed.conversationIds.length,
      claimsExtracted: filed.claims,
      claimsRejected: extraction.dropped,
      geminiCalls,
      extraction: extraction.outcome,
      detail: extraction.detail,
      model: extraction.model ?? geminiModelName(),
      posted: false,
      polling: false,
      errors,
    };
  } catch {
    if (scanId) {
      await finishScan(scanId, {
        status: "failed",
        finished_at: new Date().toISOString(),
        x_requests: 0,
        error: "Reprocessing stopped before it could finish. Stored posts were not deleted.",
        duration_ms: Date.now() - started,
      });
    }
    return fail("Reprocessing stopped before it could finish. Stored posts were not deleted.");
  } finally {
    releaseDeskLock();
  }
}
