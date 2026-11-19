import "server-only";
import { readAiEnv } from "@/lib/ai/runtime";
import { recordEvent } from "@/lib/db/events";
import {
  existingPostIds,
  finishScan,
  intelReady,
  knownEntities,
  openScan,
  releaseStaleScans,
  savePosts,
  termRules,
  touchGroup,
} from "@/lib/db/intel";
import { loadEngagement } from "@/lib/db/engagement";
import { selectedSearchGroup } from "@/lib/db/query-selection";
import { recordUsage, usageSince } from "@/lib/db/usage";
import { engagementMiss } from "@/lib/intel/engagement";
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
import { planDiscoveryQueries, type DiscoveryQueryPlan, type KeywordSource } from "@/lib/intel/discovery-plan";
import { contentPillars, storagePillar, type ContentPillar } from "@/lib/pillars/catalog";

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
  estimatedRequests?: number;
  pillars?: ContentPillar[];
  rosterHandles?: number;
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
  pillarsSearched?: number;
  queriesRun?: number;
  rosterHandlesCovered?: number;
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

async function loadKeywordSources(pillars: ContentPillar[]): Promise<KeywordSource[]> {
  const sources: KeywordSource[] = [];
  for (const pillar of pillars) {
    const chosen = await selectedSearchGroup(storagePillar(pillar));
    if (!chosen) continue;
    sources.push({
      pillar,
      id: chosen.group.id,
      name: chosen.group.name,
      slug: chosen.group.slug,
      topicSlug: chosen.group.topicSlug,
      storedQuery: chosen.selection.storedQuery,
      requestQuery: chosen.selection.requestQuery,
      reason: chosen.selection.reason,
    });
  }
  return sources;
}

async function gate(pillars: ContentPillar[]) {
  const ready = await intelReady();
  if (!ready.ok) return { ok: false as const, estimate: blockedEstimate(ready.message) };
  const usage = await usageSince(lagosDayStart());
  if (!usage.ok) return { ok: false as const, estimate: blockedEstimate("Usage tracking is not readable. No X request was made.") };
  const engagement = await loadEngagement();
  if (!engagement.ok) return { ok: false as const, estimate: blockedEstimate(engagement.message) };
  const keywords = await loadKeywordSources(pillars);
  const plan = planDiscoveryQueries({
    pillars,
    keywords,
    keywordEngagement: engagement.setting,
    includeRoster: true,
  });
  if (!plan.ok) return { ok: false as const, estimate: blockedEstimate(plan.message) };

  const xRemaining = Math.max(0, scanLimits.dailyXRequests - usage.totals.xRequests);
  const postsRemaining = Math.max(0, scanLimits.dailyPosts - usage.totals.posts);
  const geminiRemaining = Math.max(0, scanLimits.dailyGeminiRequests - usage.totals.geminiRequests);
  const estimate = blockedEstimate(null as unknown as string, {
    ready: true,
    message: null,
    groupName: plan.queries.map((query) => query.name).join(" · "),
    maxXRequests: plan.estimatedRequests,
    maxPosts: plan.estimatedPosts,
    maxGeminiRequests: readAiEnv().geminiKey && geminiRemaining > 0 ? Math.min(pillars.length, geminiRemaining) : 0,
    xRemaining,
    postsRemaining,
    geminiRemaining,
    estimatedRequests: plan.estimatedRequests,
    pillars: plan.pillars,
    rosterHandles: plan.rosterHandles.length,
    postCeilingUsd: usd(plan.estimatedPosts * publishedRates.postReadUsd),
    authorCeilingUsd: usd(plan.estimatedPosts * publishedRates.userReadUsd),
  });
  if (xRemaining < plan.estimatedRequests) {
    return {
      ok: false as const,
      estimate: {
        ...estimate,
        ready: false,
        message: `The daily X request limit leaves ${xRemaining}, and this run needs ${plan.estimatedRequests} searches covering ${plan.rosterHandles.length} shortlist handles. No search was sent.`,
      },
    };
  }
  if (postsRemaining < plan.estimatedPosts) {
    return {
      ok: false as const,
      estimate: {
        ...estimate,
        ready: false,
        message: `The daily post ceiling leaves ${postsRemaining} reads, and this multi-pillar run asks for up to ${plan.estimatedPosts}. No search was sent.`,
      },
    };
  }
  return { ok: true as const, estimate, plan, geminiRemaining };
}

export async function previewScan(pillars: ContentPillar[] = [...contentPillars]) {
  const result = await gate(pillars);
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

function contentPillarFromStorage(value: "politics" | "finance" | "football"): ContentPillar {
  return value === "football" ? "manchester_united" : value;
}

export async function runScan(input?: {
  storagePillar?: "politics" | "finance" | "football";
  storagePillars?: Array<"politics" | "finance" | "football">;
  pillars?: ContentPillar[];
}): Promise<ScanReport> {
  const started = Date.now();
  if (!claimDeskLock()) return emptyReport("A scan is already running. No second X request was made.");
  let scanId: string | null = null;
  let xCalls = 0;
  let retrievalSaved = false;
  try {
    const pillars: ContentPillar[] = input?.pillars?.length
      ? input.pillars
      : input?.storagePillars?.length
        ? input.storagePillars.map(contentPillarFromStorage)
        : input?.storagePillar
          ? [contentPillarFromStorage(input.storagePillar)]
          : [...contentPillars];
    const gated = await gate(pillars);
    if (!gated.ok) return emptyReport(gated.estimate.message, { durationMs: Date.now() - started });
    await releaseStaleScans();
    const opened = await openScan({
      groupId: gated.plan.queries.find((query) => query.groupId)?.groupId ?? null,
      groupName: gated.plan.queries.map((query) => query.name).join(" · "),
      query: gated.plan.queries.map((query) => query.requestQuery).join(" || "),
      storedQuery: gated.plan.queries.map((query) => query.topicQuery).join(" || "),
      selectionReason: `Multi-pillar discovery: ${gated.plan.pillars.join(", ")}. Keywords plus ${gated.plan.rosterHandles.length} shortlist handles.`,
      engagement: gated.plan.queries.map((query) => query.operator).join(", "),
      maxPosts: gated.plan.estimatedPosts,
      lookbackHours: scanLimits.lookbackHours,
      contentPillar: "multi",
      pillars: gated.plan.pillars,
      estimatedXRequests: gated.plan.estimatedRequests,
      rosterHandles: gated.plan.rosterHandles,
    });
    if (!opened.ok) return emptyReport(opened.message, { durationMs: Date.now() - started });
    scanId = opened.id;

    const rules = await termRules();
    const entities = await knownEntities();
    const seen = new Set<string>();
    const postsByPillar = new Map<ContentPillar, WorkingPost[]>();
    const queryResults: Array<{ query: DiscoveryQueryPlan; returned: number }> = [];
    const errors: string[] = [];

    for (const query of gated.plan.queries) {
      const searched = await searchRecent({
        query: query.requestQuery,
        maxResults: scanLimits.maxPostsPerRequest ?? scanLimits.maxPostsPerScan,
        startTime: lookbackStart(scanLimits.lookbackHours),
      });
      xCalls += 1;
      await recordUsage({
        provider: "x",
        operation: "search_recent",
        requests: 1,
        units: searched.ok ? searched.posts.length : 0,
        scanId,
      });
      if (!searched.ok) {
        const message = searched.message || "X did not return a search page.";
        errors.push(`${query.name}: ${message}`);
        await finishScan(scanId, {
          status: "failed",
          finished_at: new Date().toISOString(),
          x_requests: xCalls,
          error: `Stopped after ${xCalls} request(s). Remaining roster/keyword queries were not sent so handles are not silently skipped. ${message}`,
          duration_ms: Date.now() - started,
        });
        return emptyReport(
          `Stopped after ${xCalls} request(s). Remaining roster/keyword queries were not sent so handles are not silently skipped. ${message}`,
          { ok: false, xRequests: xCalls, durationMs: Date.now() - started, errors, queriesRun: xCalls, pillarsSearched: gated.plan.pillars.length },
        );
      }
      if (query.groupId) await touchGroup(query.groupId);
      queryResults.push({ query, returned: searched.posts.length });
      const bucket = postsByPillar.get(query.pillar) ?? [];
      for (const post of searched.posts) {
        if (seen.has(post.id)) continue;
        seen.add(post.id);
        const judged = judgePost(post.text, rules);
        const kept = query.storagePillar !== "politics" && judged.deskClass === "noise"
          ? { relevance: "possibly_political" as const, deskClass: "discussion" as const }
          : { relevance: judged.relevance, deskClass: judged.deskClass };
        bucket.push({
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
          source: query.name,
          relevance: kept.relevance,
          deskClass: kept.deskClass,
          matchedTerm: judged.matchedTerm,
          reason: judged.reason,
        });
      }
      postsByPillar.set(query.pillar, bucket);
    }

    const allPosts = [...postsByPillar.values()].flat();
    if (allPosts.length === 0) {
      await finishScan(scanId, {
        status: "completed",
        finished_at: new Date().toISOString(),
        x_requests: xCalls,
        posts_returned: 0,
        posts_stored: 0,
        error: engagementMiss,
        stage: "COMPLETE",
        duration_ms: Date.now() - started,
        detail: {
          pillars: gated.plan.pillars,
          queries: queryResults.map((item) => ({ name: item.query.name, kind: item.query.kind, handles: item.query.handles, returned: item.returned })),
          rosterHandles: gated.plan.rosterHandles,
        },
      });
      return emptyReport(engagementMiss, {
        ok: false,
        xRequests: xCalls,
        postsReturned: 0,
        durationMs: Date.now() - started,
        errors: [engagementMiss],
        queriesRun: xCalls,
        pillarsSearched: gated.plan.pillars.length,
        rosterHandlesCovered: gated.plan.rosterHandles.length,
      });
    }

    let storedCount = 0;
    let conversations = 0;
    let newConversations = 0;
    let claims = 0;
    let claimsDropped = 0;
    let geminiRequests = 0;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let model: string | null = null;
    let extractionOutcome: ExtractionOutcome | null = null;
    let extractionDetail: string | null = null;
    const found: Array<{ id: string; title: string; action: string }> = [];
    let opportunities = 0;
    let actionablePosts = 0;
    let discussionPosts = 0;
    let noisePosts = 0;
    let relevantPosts = 0;
    const extractionErrors: string[] = [];

    for (const pillar of gated.plan.pillars) {
      const posts = postsByPillar.get(pillar) ?? [];
      if (posts.length === 0) continue;
      storedCount += await persistPosts(posts, scanId, storagePillar(pillar));
      retrievalSaved = true;
      actionablePosts += posts.filter((post) => post.deskClass === "actionable").length;
      discussionPosts += posts.filter((post) => post.deskClass === "discussion").length;
      noisePosts += posts.filter((post) => post.deskClass === "noise").length;
      relevantPosts += posts.filter((post) => post.relevance !== "not_political").length;

      const candidates = posts.filter((post) => post.deskClass !== "noise" && post.relevance !== "not_political");
      let extraction: ExtractionReport;
      if (candidates.length === 0) {
        extraction = skippedExtraction("not_run", `Extraction did not run for ${pillar}. No actionable or discussion post was sent to the model.`);
      } else {
        extraction = await extractFromPosts(posts, scanId);
      }
      geminiRequests += extraction.geminiRequests;
      if (extraction.inputTokens != null) inputTokens = (inputTokens ?? 0) + extraction.inputTokens;
      if (extraction.outputTokens != null) outputTokens = (outputTokens ?? 0) + extraction.outputTokens;
      if (extraction.model) model = extraction.model;
      extractionOutcome = extraction.outcome;
      extractionDetail = extraction.detail;
      if (extraction.outcome !== "extracted" || extraction.dropped > 0) extractionErrors.push(extraction.detail);
      claimsDropped += extraction.dropped;

      const filed = await fileDiscussions({
        posts,
        claims: extraction.claims,
        outcome: extraction.outcome,
        entities,
        topicSlugFor: () => gated.plan.queries.find((query) => query.pillar === pillar)?.topicSlug ?? "multi",
        deskNote: "Filed by a multi-pillar scan. Keyword discovery and shortlist handles ran in the same pipeline run.",
        pillar: storagePillar(pillar),
      });
      conversations += filed.conversationIds.length;
      newConversations += filed.conversations;
      claims += filed.claims;
      const synced = extraction.claims.length > 0
        ? await syncModelOpportunities(filed.links, scanId, storagePillar(pillar))
        : { found: 0, created: 0, updated: 0, cards: [] as Array<{ id: string; claimId: string | null; title: string }> };
      opportunities += synced.found;
      for (const card of synced.cards) {
        found.push({ id: card.id, title: card.title, action: "Open story" });
      }
      if (synced.cards.length === 0) {
        for (const item of filed.filedClaims) {
          found.push({ id: item.id, title: item.title, action: "Open story" });
        }
      }
    }

    const aiFailed = extractionOutcome === "failed" || extractionOutcome === "invalid";
    await finishScan(scanId, {
      status: aiFailed ? "stopped" : "completed",
      finished_at: new Date().toISOString(),
      x_requests: xCalls,
      posts_returned: allPosts.length,
      posts_stored: storedCount,
      relevant_posts: relevantPosts,
      conversations_created: newConversations,
      claims_extracted: claims,
      gemini_requests: geminiRequests,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: Date.now() - started,
      stage: aiFailed ? "PARTIAL_FAILURE" : "COMPLETE",
      error: aiFailed ? extractionDetail : null,
      detail: {
        pillars: gated.plan.pillars,
        queries: queryResults.map((item) => ({
          name: item.query.name,
          kind: item.query.kind,
          pillar: item.query.pillar,
          handles: item.query.handles,
          returned: item.returned,
          query: item.query.requestQuery,
        })),
        rosterHandles: gated.plan.rosterHandles,
        extraction: extractionOutcome,
        extractionDetail,
        actionablePosts,
        discussionPosts,
        noisePosts,
        claimsRejected: claimsDropped,
      },
    });
    await recordEvent({
      action: "intelligence scan",
      actor: "editor",
      subjectType: "scan",
      subjectId: scanId,
      detail: {
        xRequests: xCalls,
        posts: allPosts.length,
        claims,
        geminiRequests,
        extraction: extractionOutcome,
        pillars: gated.plan.pillars,
        rosterHandles: gated.plan.rosterHandles.length,
      },
    });
    return emptyReport(aiFailed ? extractionDetail : null, {
      ok: !aiFailed,
      xRequests: xCalls,
      postsReturned: allPosts.length,
      postsStored: storedCount,
      relevantPosts,
      actionablePosts,
      discussionPosts,
      noisePosts,
      conversations,
      newConversations,
      claims,
      claimsDropped,
      extraction: extractionOutcome,
      extractionDetail,
      model,
      geminiRequests,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - started,
      errors: extractionErrors,
      found,
      opportunities,
      pillarsSearched: gated.plan.pillars.length,
      queriesRun: xCalls,
      rosterHandlesCovered: gated.plan.rosterHandles.length,
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

async function persistPosts(posts: WorkingPost[], scanId: string, storage: "politics" | "finance" | "football") {
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
    content_pillar: storage,
    scan_id: scanId,
  }));
  const saved = await savePosts(rows);
  return saved ? posts.filter((post) => !known.has(post.id)).length : 0;
}
