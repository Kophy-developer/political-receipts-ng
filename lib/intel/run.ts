import "server-only";
import { aiProvider } from "@/lib/ai/provider";
import { extractionSystem, extractionUser, parseExtraction, promptVersion } from "@/lib/ai/extract";
import { recordEvent } from "@/lib/db/events";
import {
  attachPosts,
  claimExists,
  existingPostIds,
  finishScan,
  intelReady,
  knownEntities,
  nextSearchGroup,
  openScan,
  releaseStaleScans,
  saveAnalysis,
  saveClaim,
  saveConversation,
  savePosts,
  termRules,
  topicIdFor,
  touchGroup,
} from "@/lib/db/intel";
import { recordUsage, usageSince } from "@/lib/db/usage";
import { lagosDayStart, lookbackStart, publishedRates, scanLimits, usd } from "@/lib/intel/limits";
import { rankClaim } from "@/lib/intel/rank";
import { classifyPost, type Relevance } from "@/lib/intel/relevance";
import {
  cleanModelNote,
  cleanUsername,
  clusterKey,
  engagementOf,
  groundedClaim,
  groundedSpeaker,
  looksCheckable,
  publicPostUrl,
  sanitizeText,
} from "@/lib/intel/text";
import { searchRecent, type RetrievedPost } from "@/lib/x/search";

type ScanLock = { __prngScan?: boolean };

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
  conversations: number;
  claims: number;
  claimsDropped: number;
  geminiRequests: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  errors: string[];
  posted: false;
  polling: false;
};

type FiledPost = RetrievedPost & {
  relevance: Relevance;
  matchedTerm: string;
  reason: string;
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

async function gate() {
  const ready = await intelReady();
  if (!ready.ok) return { ok: false as const, estimate: blockedEstimate(ready.message) };
  const usage = await usageSince(lagosDayStart());
  if (!usage.ok) return { ok: false as const, estimate: blockedEstimate("Usage tracking is not readable. No X request was made.") };
  const group = await nextSearchGroup();
  if (!group) return { ok: false as const, estimate: blockedEstimate("No search group is enabled. No X request was made.") };
  if (group.query.length > 480) return { ok: false as const, estimate: blockedEstimate("The next search query is too long. No X request was made.") };
  const xRemaining = Math.max(0, scanLimits.dailyXRequests - usage.totals.xRequests);
  const postsRemaining = Math.max(0, scanLimits.dailyPosts - usage.totals.posts);
  const geminiRemaining = Math.max(0, scanLimits.dailyGeminiRequests - usage.totals.geminiRequests);
  const estimate = blockedEstimate(null as unknown as string, {
    ready: true,
    message: null,
    groupName: group.name,
    maxGeminiRequests: aiProvider() && geminiRemaining > 0 ? 1 : 0,
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
  return { ok: true as const, estimate, group, geminiRemaining };
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
    conversations: 0,
    claims: 0,
    claimsDropped: 0,
    geminiRequests: 0,
    inputTokens: null,
    outputTokens: null,
    durationMs: 0,
    errors: [],
    posted: false,
    polling: false,
    ...extra,
  };
}

export async function runScan(): Promise<ScanReport> {
  const started = Date.now();
  const lock = globalThis as typeof globalThis & ScanLock;
  if (lock.__prngScan) return emptyReport("A scan is already running. No second X request was made.");
  lock.__prngScan = true;
  let scanId: string | null = null;
  let xCalls = 0;
  try {
    const gated = await gate();
    if (!gated.ok) return emptyReport(gated.estimate.message, { durationMs: Date.now() - started });
    await releaseStaleScans();
    const opened = await openScan({
      groupId: gated.group.id,
      groupName: gated.group.name,
      maxPosts: scanLimits.maxPostsPerScan,
      lookbackHours: scanLimits.lookbackHours,
    });
    if (!opened.ok) return emptyReport(opened.message, { durationMs: Date.now() - started });
    scanId = opened.id;

    const searched = await searchRecent({
      query: gated.group.query,
      maxResults: scanLimits.maxPostsPerScan,
      startTime: lookbackStart(scanLimits.lookbackHours),
    });
    const xRequests = 1;
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
      return emptyReport(message, { ok: false, xRequests, durationMs: Date.now() - started, errors: [message] });
    }

    await touchGroup(gated.group.id);
    const rules = await termRules();
    const posts: FiledPost[] = searched.posts.map((post) => {
      const judged = classifyPost(post.text, rules);
      return { ...post, ...judged };
    });
    const errors: string[] = [];
    let geminiRequests = 0;
    let inputTokens: number | null = null;
    let outputTokens: number | null = null;
    let claimsDropped = 0;
    const provider = aiProvider();
    const candidates = posts.filter((post) => post.relevance !== "not_political" && engagementOf(post.metrics) >= scanLimits.minEngagement);

    if (candidates.length === 0) {
      errors.push("No post cleared the relevance rules, so Gemini was not called.");
    } else if (!provider) {
      errors.push("Gemini is not configured. Posts were stored. No claims were extracted.");
    } else if (gated.geminiRemaining < 1) {
      errors.push("The daily Gemini limit is reached. Posts were stored. No claims were extracted.");
    } else {
      geminiRequests = 1;
      const completion = await provider.completeJson({
        promptVersion,
        system: extractionSystem,
        user: extractionUser(candidates.map((post) => ({ id: post.id, text: post.text, username: post.username, relevance: post.relevance }))),
      });
      inputTokens = completion.usage.inputTokens;
      outputTokens = completion.usage.outputTokens;
      await recordUsage({
        provider: "gemini",
        operation: "claim_extract",
        requests: 1,
        units: 1,
        inputTokens,
        outputTokens,
        scanId,
      });
      await saveAnalysis({ provider: completion.provider, model: completion.model, promptVersion, scanId });
      const parsed = completion.ok ? parseExtraction(completion.data) : null;
      if (!completion.ok || !parsed) {
        errors.push(completion.ok ? "The model response was not usable. No claims were stored." : completion.message);
      } else {
        const byId = new Map(posts.map((post) => [post.id, post]));
        for (const row of parsed.posts) {
          const post = byId.get(row.postId);
          if (!post || post.relevance !== "possibly_political") continue;
          if (row.relevance === "not_political") {
            post.relevance = "not_political";
            post.reason = "Rules were uncertain, and the model did not treat the post as political.";
          } else if (row.relevance === "political") {
            post.relevance = "political";
            post.reason = "Rules were uncertain. The model marked the post political from its text.";
          }
        }
        const accepted = acceptClaims(parsed.claims, byId);
        claimsDropped = accepted.dropped;
        const report = await persistPosts(posts, gated.group.name, scanId);
        const stored = await fileClusters({
          posts: posts.filter((post) => post.relevance !== "not_political" && engagementOf(post.metrics) >= scanLimits.minEngagement),
          claims: accepted.claims,
          group: gated.group,
        });
        await finishScan(scanId, {
          status: "completed",
          finished_at: new Date().toISOString(),
          x_requests: xRequests,
          posts_returned: searched.posts.length,
          posts_stored: report.stored,
          relevant_posts: posts.filter((post) => post.relevance === "political").length,
          conversations_created: stored.conversations,
          claims_extracted: stored.claims,
          gemini_requests: geminiRequests,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          duration_ms: Date.now() - started,
          error: errors[0] ?? null,
        });
        await recordEvent({
          action: "intelligence scan",
          actor: "editor",
          subjectType: "scan",
          subjectId: scanId,
          detail: { xRequests, posts: searched.posts.length, claims: stored.claims, geminiRequests },
        });
        return emptyReport(null, {
          ok: true,
          xRequests,
          postsReturned: searched.posts.length,
          postsStored: report.stored,
          relevantPosts: posts.filter((post) => post.relevance !== "not_political").length,
          conversations: stored.conversations,
          claims: stored.claims,
          claimsDropped,
          geminiRequests,
          inputTokens,
          outputTokens,
          durationMs: Date.now() - started,
          errors,
        });
      }
    }

    const report = await persistPosts(posts, gated.group.name, scanId);
    const stored = await fileClusters({
      posts: posts.filter((post) => post.relevance !== "not_political" && engagementOf(post.metrics) >= scanLimits.minEngagement),
      claims: [],
      group: gated.group,
    });
    await finishScan(scanId, {
      status: "completed",
      finished_at: new Date().toISOString(),
      x_requests: xRequests,
      posts_returned: searched.posts.length,
      posts_stored: report.stored,
      relevant_posts: posts.filter((post) => post.relevance === "political").length,
      conversations_created: stored.conversations,
      claims_extracted: 0,
      gemini_requests: geminiRequests,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      duration_ms: Date.now() - started,
      error: errors[0] ?? null,
    });
    await recordEvent({
      action: "intelligence scan",
      actor: "editor",
      subjectType: "scan",
      subjectId: scanId,
      detail: { xRequests, posts: searched.posts.length, claims: 0, geminiRequests },
    });
    return emptyReport(null, {
      ok: true,
      xRequests,
      postsReturned: searched.posts.length,
      postsStored: report.stored,
      relevantPosts: posts.filter((post) => post.relevance !== "not_political").length,
      conversations: stored.conversations,
      claims: 0,
      claimsDropped,
      geminiRequests,
      inputTokens,
      outputTokens,
      durationMs: Date.now() - started,
      errors,
    });
  } catch {
    if (scanId) {
      await finishScan(scanId, {
        status: "failed",
        finished_at: new Date().toISOString(),
        error: "The scan stopped before it could finish.",
        duration_ms: Date.now() - started,
      });
    }
    return emptyReport("The scan stopped before it could finish.", { xRequests: xCalls, durationMs: Date.now() - started });
  } finally {
    lock.__prngScan = false;
  }
}

function acceptClaims(
  claims: Array<{
    postId: string;
    claim: string;
    speaker: string;
    entities: string[];
    whyVerifiable: string;
    evidenceNeeded: string;
    confidence: "low" | "moderate" | "high";
  }>,
  posts: Map<string, FiledPost>,
) {
  const accepted: Array<{
    post: FiledPost;
    claim: string;
    speaker: string;
    role: string;
    entities: string[];
    why: string;
    needed: string;
    confidence: "low" | "moderate" | "high";
  }> = [];
  let dropped = 0;
  for (const row of claims) {
    if (accepted.length >= 8) {
      dropped += 1;
      continue;
    }
    const post = posts.get(row.postId);
    const claim = sanitizeText(row.claim, 400);
    const why = post ? cleanModelNote(row.whyVerifiable, post.text) : null;
    const needed = post ? cleanModelNote(row.evidenceNeeded, post.text) : null;
    if (!post || post.relevance === "not_political" || !why || !needed || !looksCheckable(claim) || !groundedClaim(claim, post.text)) {
      dropped += 1;
      continue;
    }
    const speaker = groundedSpeaker(row.speaker, post.text, post.displayName, post.username);
    const entities = Array.from(
      new Set(
        row.entities
          .map((entity) => sanitizeText(entity, 60))
          .filter((entity) => entity && post.text.toLowerCase().includes(entity.toLowerCase())),
      ),
    ).slice(0, 8);
    accepted.push({
      post,
      claim,
      speaker: speaker ?? post.displayName ?? "Unknown account",
      role: speaker ? "Named in the post" : "Account that posted it",
      entities,
      why,
      needed,
      confidence: row.confidence,
    });
  }
  return { claims: accepted, dropped };
}

async function persistPosts(posts: FiledPost[], source: string, scanId: string) {
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
    source_query: source,
    retrieved_at: new Date().toISOString(),
    relevance: post.relevance,
    relevance_reason: post.reason,
    scan_id: scanId,
  }));
  const saved = await savePosts(rows);
  return { stored: saved ? posts.filter((post) => !known.has(post.id)).length : 0 };
}

async function fileClusters(input: {
  posts: FiledPost[];
  claims: Awaited<ReturnType<typeof acceptClaims>>["claims"];
  group: { name: string; slug: string; topicSlug: string };
}) {
  const topic = await topicIdFor(input.group.topicSlug);
  const entities = await knownEntities();
  const buckets = new Map<string, FiledPost[]>();
  for (const post of input.posts) {
    const key = clusterKey(input.group.slug, { conversationId: post.conversationId, text: post.text, matchedTerm: post.matchedTerm });
    buckets.set(key, [...(buckets.get(key) ?? []), post]);
  }
  let conversations = 0;
  let claims = 0;
  for (const [key, posts] of buckets) {
    const ids = new Set(posts.map((post) => post.id));
    const clusterClaims = input.claims.filter((claim) => ids.has(claim.post.id));
    const term = posts.find((post) => post.matchedTerm)?.matchedTerm || input.group.name;
    const engagement = posts.reduce((sum, post) => sum + engagementOf(post.metrics), 0);
    const replies = posts.reduce((sum, post) => sum + post.metrics.replies, 0);
    const reposts = posts.reduce((sum, post) => sum + post.metrics.reposts, 0);
    const likes = posts.reduce((sum, post) => sum + post.metrics.likes, 0);
    const quotes = posts.reduce((sum, post) => sum + post.metrics.quotes, 0);
    const times = posts.map((post) => post.createdAt).filter((value): value is string => Boolean(value)).sort();
    const names = entities.filter((entity) => posts.some((post) => post.text.toLowerCase().includes(entity.name.toLowerCase())));
    const lead = clusterClaims[0]?.claim;
    const saved = await saveConversation({
      externalId: key,
      topicId: topic?.id ?? null,
      title: `${input.group.name} · ${term}`.slice(0, 140),
      summary: `${posts.length} post${posts.length === 1 ? "" : "s"} in this cluster. ${lead ? `Checkable line: ${lead}` : "No checkable claim was extracted."}`.slice(0, 500),
      narrative: posts.slice(0, 4).map((post) => `@${post.username ?? "account"}: ${post.text}`.slice(0, 320)),
      startedAt: times[0] ?? new Date().toISOString(),
      lastDetectedAt: times[times.length - 1] ?? null,
      postCount: posts.length,
      engagement: {
        volume: engagement,
        postCount: posts.length,
        replies,
        reposts,
        likes,
        quotes,
        velocityNote: "Engagement is the sum of replies, reposts, likes, and quotes on the posts in this cluster.",
      },
      entityIds: names.map((entity) => entity.id),
    });
    if (!saved) continue;
    if (saved.created) conversations += 1;
    await attachPosts(posts.map((post) => post.id), saved.id);
    const accounts = new Set(posts.map((post) => post.authorId || post.id)).size;
    for (const claim of clusterClaims) {
      if (await claimExists(claim.post.id, claim.claim)) continue;
      const ranked = rankClaim({
        accounts,
        engagement,
        hasFigure: /\d/.test(claim.claim),
        publicIssue: true,
      });
      const mentioned = Array.from(new Set([...claim.entities, ...names.map((entity) => entity.name).filter((name) => claim.post.text.toLowerCase().includes(name.toLowerCase()))])).slice(0, 8);
      const id = await saveClaim({
        conversation_id: saved.id,
        topic_id: topic?.id ?? null,
        claim_text: claim.claim,
        original_post_id: claim.post.id,
        original_post_url: publicPostUrl(claim.post.id, claim.post.username),
        original_author: claim.speaker,
        original_author_username: claim.post.username,
        original_author_role: claim.role,
        original_post_text: claim.post.text,
        detected_at: claim.post.createdAt ?? new Date().toISOString(),
        engagement: {
          replies: claim.post.metrics.replies,
          reposts: claim.post.metrics.reposts,
          likes: claim.post.metrics.likes,
          quotes: claim.post.metrics.quotes,
          views: claim.post.metrics.views,
          volume: engagement,
          conversationPosts: posts.length,
        },
        status: "new",
        importance: ranked.importance,
        importance_reason: ranked.reason,
        verifiability_reason: claim.why,
        evidence_needed: claim.needed,
        ai_confidence: claim.confidence,
        mentioned_entities: mentioned,
        origin: "live",
      });
      if (id) claims += 1;
    }
  }
  return { conversations, claims };
}
