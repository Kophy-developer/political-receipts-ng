import "server-only";
import { readAiEnv } from "@/lib/ai/runtime";
import { recordEvent } from "@/lib/db/events";
import {
  existingPostIds,
  finishScan,
  intelReady,
  knownEntities,
  nextSearchGroupForPillar,
  openScan,
  releaseStaleScans,
  savePosts,
  termRules,
  touchGroup,
} from "@/lib/db/intel";
import { loadEngagement } from "@/lib/db/engagement";
import { recordUsage, usageSince } from "@/lib/db/usage";
import { engagementMiss, withEngagement } from "@/lib/intel/engagement";
import { judgePost } from "@/lib/intel/classify";
import type { ExtractionReport } from "@/lib/intel/extract-posts";
import { extractFromPosts } from "@/lib/intel/extract-posts";
import { fileDiscussions } from "@/lib/intel/file";
import { syncModelOpportunities } from "@/lib/db/opportunities";
import { lagosDayStart, lookbackStart, publishedRates, scanLimits, usd } from "@/lib/intel/limits";
import { claimDeskLock, releaseDeskLock } from "@/lib/intel/lock";
import type { ExtractionOutcome } from "@/lib/intel/outcome";
import type { WorkingPost } from "@/lib/intel/posts";
import { cleanUsername, sanitizeText } from "@/lib/intel/text";
import { searchRecent } from "@/lib/x/search";

export type ScanEstimate = {
  ready: boolean;
  message: string | null;
  groupName: string | null;
  maxXRequests: number;
  maxPosts: number;
  maxGeminiRequests: number;
  lookbackHours: number;
  minEngagement: number;
  xRemaining: number;
  postsRemaining: number;
  geminiRemaining: number;
  postCeilingUsd: string;
  authorCeilingUsd: string;
  rateNote: string;
};

export type ScanReport = {
  ok: boolean;
  stopped: string | null;
  xRequests: number;
  postsReturned: number;
  postsStored: number;
  relevantPosts: number;
  actionablePosts: number;
  discussionPosts: number;
  noisePosts: number;
  conversations: number;
  newConversations: number;
  claims: number;
  claimsDropped: number;
  extraction: ExtractionOutcome | null;
  extractionDetail: string | null;
  model: string | null;
  geminiRequests: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  errors: string[];
  posted: false;
  polling: false;
  found: Array<{ id: string; title: string; action: string }>;
  opportunities: number;
};

function blockedEstimate(message: string, partial?: Partial<ScanEstimate>): ScanEstimate {
  return {
    ready: false,
    message,
    groupName: null,
    maxXRequests: scanLimits.maxXRequestsPerScan,
    maxPosts: scanLimits.maxPostsPerScan,
    maxGeminiRequests: 0,
    lookbackHours: scanLimits.lookbackHours,
    minEngagement: scanLimits.minEngagement,
    xRemaining: 0,
    postsRemaining: 0,
    geminiRemaining: 0,
    postCeilingUsd: usd(scanLimits.maxPostsPerScan * publishedRates.postReadUsd),
    authorCeilingUsd: usd(scanLimits.maxPostsPerScan * publishedRates.userReadUsd),
    rateNote: `X’s published pay-per-use rate in ${publishedRates.asOf} was ${usd(publishedRates.postReadUsd)} per post read. Author records, if billed, were listed at ${usd(publishedRates.userReadUsd)} each. This scan does not paginate.`,
    ...partial,
  };
}

async function gate(storagePillar: "politics" | "finance" | "football" = "politics") {
  const ready = await intelReady();
  if (!ready.ok) return { ok: false as const, estimate: blockedEstimate(ready.message) };
  const usage = await usageSince(lagosDayStart());
  if (!usage.ok) return { ok: false as const, estimate: blockedEstimate("Usage tracking is not readable. No X request was made.") };
  const group = await nextSearchGroupForPillar(storagePillar);
  if (!group) {
    const message = storagePillar === "politics"
      ? "No search group is enabled. No X request was made."
      : "That pillar has no discovery query yet. No X request was made.";
    return { ok: false as const, estimate: blockedEstimate(message) };
  }
  const engagement = await loadEngagement();
  if (!engagement.ok) return { ok: false as const, estimate: blockedEstimate(engagement.message) };
  const built = withEngagement(group.query, engagement.setting);
  if (!built.ok) return { ok: false as const, estimate: blockedEstimate(built.message) };
  const xRemaining = Math.max(0, scanLimits.dailyXRequests - usage.totals.xRequests);
  const postsRemaining = Math.max(0, scanLimits.dailyPosts - usage.totals.posts);
  const geminiRemaining = Math.max(0, scanLimits.dailyGeminiRequests - usage.totals.geminiRequests);
  const estimate = blockedEstimate(null as unknown as string, {
    ready: true,
    message: null,
    groupName: group.name,
    maxGeminiRequests: readAiEnv().geminiKey && geminiRemaining > 0 ? 1 : 0,
    xRemaining,
    postsRemaining,
    geminiRemaining,
  });
  if (xRemaining < 1) {
    return { ok: false as const, estimate: { ...estimate, ready: false, message: "The daily X request limit is reached. No search was sent." } };
  }
  if (postsRemaining < scanLimits.maxPostsPerScan) {
    return {
      ok: false as const,
      estimate: { ...estimate, ready: false, message: "The daily post ceiling leaves fewer than 10 reads. No search was sent." },
    };
  }
  return { ok: true as const, estimate, group, requestQuery: built.query, operator: built.operator, geminiRemaining };
}

export async function previewScan() {
  const result = await gate();
  return result.estimate;
}

function emptyReport(stopped: string | null, extra?: Partial<ScanReport>): ScanReport {
  return {
    ok: !stopped,
    stopped,
    xRequests: 0,
    postsReturned: 0,
    postsStored: 0,
    relevantPosts: 0,
    actionablePosts: 0,
    discussionPosts: 0,
    noisePosts: 0,
    conversations: 0,
    newConversations: 0,
    claims: 0,
    claimsDropped: 0,
    extraction: null,
    extractionDetail: stopped,
    model: null,
    geminiRequests: 0,
    inputTokens: null,
    outputTokens: null,
    durationMs: 0,
    errors: [],
    posted: false,
    polling: false,
    found: [],
    opportunities: 0,
    ...extra,
  };
}

function skippedExtraction(outcome: ExtractionOutcome, detail: string): ExtractionReport {
  return {
    outcome,
    detail,
    claims: [],
    dropped: 0,
    geminiRequests: 0,
    inputTokens: null,
    outputTokens: null,
    model: null,
    provider: null,
    classification: null,
  };
}

export async function runScan(input?: { storagePillar?: "politics" | "finance" | "football" }): Promise<ScanReport> {
  const started = Date.now();
  if (!claimDeskLock()) return emptyReport("A scan is already running. No second X request was made.");
  let scanId: string | null = null;
  let xCalls = 0;
  let retrievalSaved = false;
  try {
    const storagePillar = input?.storagePillar ?? "politics";
    const gated = await gate(storagePillar);
    if (!gated.ok) return emptyReport(gated.estimate.message, { durationMs: Date.now() - started });
    await releaseStaleScans();
    const opened = await openScan({
      groupId: gated.group.id,
      groupName: gated.group.name,
      query: gated.requestQuery,
      engagement: gated.operator,
      maxPosts: scanLimits.maxPostsPerScan,
      lookbackHours: scanLimits.lookbackHours,
      contentPillar: storagePillar,
      estimatedXRequests: 1,
    });
    if (!opened.ok) return emptyReport(opened.message, { durationMs: Date.now() - started });
    scanId = opened.id;

    const searched = await searchRecent({
      query: gated.requestQuery,
      maxResults: scanLimits.maxPostsPerScan,
      startTime: lookbackStart(scanLimits.lookbackHours),
    });
    xCalls = 1;
    await recordUsage({
      provider: "x",
      operation: "search_recent",
      requests: 1,
      units: searched.ok ? searched.posts.length : 0,
      scanId,
    });
    if (!searched.ok) {
      const message = searched.message || "X did not return a search page.";
      await finishScan(scanId, {
        status: "failed",
        finished_at: new Date().toISOString(),
        x_requests: 1,
        error: message,
        duration_ms: Date.now() - started,
      });
      return emptyReport(message, { ok: false, xRequests: 1, durationMs: Date.now() - started, errors: [message] });
    }

    await touchGroup(gated.group.id);
    if (searched.posts.length === 0) {
      await finishScan(scanId, {
        status: "completed",
        finished_at: new Date().toISOString(),
        x_requests: 1,
        posts_returned: 0,
        posts_stored: 0,
        error: engagementMiss,
        stage: "COMPLETE",
        duration_ms: Date.now() - started,
        detail: {
          groupId: gated.group.id,
          groupName: gated.group.name,
          contentPillar: storagePillar,
          query: gated.requestQuery,
          engagement: gated.operator,
        },
      });
      return emptyReport(engagementMiss, {
        ok: false,
        xRequests: 1,
        postsReturned: 0,
        durationMs: Date.now() - started,
        errors: [engagementMiss],
      });
    }
    const rules = await termRules();
    const posts: WorkingPost[] = searched.posts.map((post) => {
      const judged = judgePost(post.text, rules);
      const kept = storagePillar !== "politics" && judged.deskClass === "noise"
        ? { relevance: "possibly_political" as const, deskClass: "discussion" as const }
        : { relevance: judged.relevance, deskClass: judged.deskClass };
      return {
        id: post.id,
        text: sanitizeText(post.text),
        authorId: post.authorId,
        username: post.username,
        displayName: post.displayName,
        createdAt: post.createdAt,
        metrics: post.metrics,
        conversationId: post.conversationId,
        referenced: post.referenced,
        lang: post.lang,
        source: gated.group.name,
        relevance: kept.relevance,
        deskClass: kept.deskClass,
        matchedTerm: judged.matchedTerm,
        reason: judged.reason,
      };
    });
    const storedCount = await persistPosts(posts, scanId, storagePillar);
    retrievalSaved = true;
    await finishScan(scanId, { stage: "X_RETRIEVAL_COMPLETE", x_requests: 1, posts_returned: searched.posts.length, posts_stored: storedCount });
    await finishScan(scanId, { stage: "AI_PROCESSING" });
    const candidates = posts.filter((post) => post.deskClass !== "noise" && post.relevance !== "not_political");
    let extraction: ExtractionReport;
    if (candidates.length === 0) {
      extraction = skippedExtraction("not_run", "Extraction did not run. No actionable or discussion post was sent to the model.");
    } else {
      extraction = await extractFromPosts(posts, scanId);
    }

    const filed = await fileDiscussions({
      posts,
      claims: extraction.claims,
      outcome: extraction.outcome,
      entities: await knownEntities(),
      topicSlugFor: () => gated.group.topicSlug,
      deskNote: "Filed by a manual scan. This is not a verdict, and it is not a candidate ranking.",
      pillar: storagePillar,
    });
    const opportunities = extraction.claims.length > 0 ? await syncModelOpportunities(filed.links, scanId, storagePillar) : { found: 0, created: 0, updated: 0, cards: [] };
    const aiFailed = extraction.outcome === "failed" || extraction.outcome === "invalid";
    const errors = extraction.outcome === "extracted" && extraction.dropped === 0 ? [] : [extraction.detail];
    const actionablePosts = posts.filter((post) => post.deskClass === "actionable").length;
    const discussionPosts = posts.filter((post) => post.deskClass === "discussion").length;
    const noisePosts = posts.filter((post) => post.deskClass === "noise").length;
    await finishScan(scanId, {
      status: aiFailed ? "stopped" : "completed",
      finished_at: new Date().toISOString(),
      x_requests: 1,
      posts_returned: searched.posts.length,
      posts_stored: storedCount,
      relevant_posts: posts.filter((post) => post.relevance === "political").length,
      conversations_created: filed.conversations,
      claims_extracted: filed.claims,
      gemini_requests: extraction.geminiRequests,
      input_tokens: extraction.inputTokens,
      output_tokens: extraction.outputTokens,
      duration_ms: Date.now() - started,
      stage: aiFailed ? "PARTIAL_FAILURE" : "COMPLETE",
      error: aiFailed ? extraction.detail : null,
      detail: {
        groupId: gated.group.id,
        groupName: gated.group.name,
        query: gated.requestQuery,
        engagement: gated.operator,
        contentPillar: storagePillar,
        extraction: extraction.outcome,
        extractionDetail: extraction.detail,
        actionablePosts,
        discussionPosts,
        noisePosts,
        claimsRejected: extraction.dropped,
        extractionProvider: extraction.provider,
        extractionClass: extraction.classification,
      },
    });
    await recordEvent({
      action: "intelligence scan",
      actor: "editor",
      subjectType: "scan",
      subjectId: scanId,
      detail: {
        xRequests: 1,
        posts: searched.posts.length,
        claims: filed.claims,
        geminiRequests: extraction.geminiRequests,
        extraction: extraction.outcome,
      },
    });
    return emptyReport(aiFailed ? extraction.detail : null, {
      ok: !aiFailed,
      xRequests: 1,
      postsReturned: searched.posts.length,
      postsStored: storedCount,
      relevantPosts: posts.filter((post) => post.relevance !== "not_political").length,
      actionablePosts,
      discussionPosts,
      noisePosts,
      conversations: filed.conversationIds.length,
      newConversations: filed.conversations,
      claims: filed.claims,
      claimsDropped: extraction.dropped,
      extraction: extraction.outcome,
      extractionDetail: extraction.detail,
      model: extraction.model,
      geminiRequests: extraction.geminiRequests,
      inputTokens: extraction.inputTokens,
      outputTokens: extraction.outputTokens,
      durationMs: Date.now() - started,
      errors,
      found: opportunities.cards.length > 0
        ? opportunities.cards.map((item) => ({ id: item.id, claimId: item.claimId, title: item.title, action: "Open story" }))
        : filed.filedClaims.map((item) => ({ id: item.id, title: item.title, action: "Open story" })),
      opportunities: opportunities.found,
    });
  } catch {
    if (scanId) {
      await finishScan(scanId, {
        status: retrievalSaved ? "stopped" : "failed",
        stage: retrievalSaved ? "PARTIAL_FAILURE" : null,
        finished_at: new Date().toISOString(),
        x_requests: xCalls,
        error: "The scan stopped before it could finish.",
        duration_ms: Date.now() - started,
      });
    }
    return emptyReport("The scan stopped before it could finish.", { xRequests: xCalls, durationMs: Date.now() - started });
  } finally {
    releaseDeskLock();
  }
}

async function persistPosts(posts: WorkingPost[], scanId: string, storagePillar: "politics" | "finance" | "football") {
  const known = await existingPostIds(posts.map((post) => post.id));
  const rows = posts.map((post) => ({
    x_post_id: post.id,
    text: post.text,
    author_id: post.authorId,
    username: cleanUsername(post.username),
    display_name: post.displayName,
    posted_at: post.createdAt,
    public_metrics: post.metrics,
    x_conversation_id: post.conversationId,
    referenced: post.referenced,
    language: post.lang,
    source_query: post.source,
    retrieved_at: new Date().toISOString(),
    relevance: post.relevance,
    relevance_reason: post.reason,
    desk_class: post.deskClass,
    content_pillar: storagePillar,
    scan_id: scanId,
  }));
  const saved = await savePosts(rows);
  return saved ? posts.filter((post) => !known.has(post.id)).length : 0;
}
