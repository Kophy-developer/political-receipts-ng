import "server-only";
import { attachPosts, findClaimId, saveClaim, saveConversation, topicIdFor } from "@/lib/db/intel";
import { attentionOf } from "@/lib/intel/attention";
import { clusterPosts, type ClusterEntity } from "@/lib/intel/cluster";
import type { AcceptedClaim } from "@/lib/intel/extract-posts";
import type { ExtractionOutcome } from "@/lib/intel/outcome";
import type { WorkingPost } from "@/lib/intel/posts";
import { rankClaim } from "@/lib/intel/rank";
import { engagementOf, publicPostUrl } from "@/lib/intel/text";
import { inferClaimTypes, inferStatementKind, questionsFor } from "@/lib/research/claim-types";
import type { Pillar } from "@/lib/research/types";

export async function fileDiscussions(input: {
  posts: WorkingPost[];
  claims: AcceptedClaim[];
  outcome: ExtractionOutcome;
  entities: Array<{ id: string; name: string; aliases: string[] }>;
  topicSlugFor: (source: string | null) => string;
  deskNote: string;
  pillar?: Pillar;
}) {
  const political = input.posts.filter((post) => post.relevance !== "not_political");
  const clusterEntities: ClusterEntity[] = input.entities.map((entity) => ({ name: entity.name, aliases: entity.aliases }));
  const clusters = clusterPosts(political, clusterEntities);
  const topicCache = new Map<string, string | null>();
  let conversations = 0;
  let claims = 0;
  const conversationIds: string[] = [];
  const filedClaims: Array<{ id: string; title: string }> = [];
  const links: Array<{ conversationId: string; claimId: string | null; title: string; why: string; needed: string }> = [];
  for (const cluster of clusters) {
    const posts = cluster.posts;
    const ids = new Set(posts.map((post) => post.id));
    const clusterClaims = input.claims.filter((claim) => ids.has(claim.post.id));
    const source = majority(posts.map((post) => post.source));
    const slug = input.topicSlugFor(source);
    if (!topicCache.has(slug)) {
      const topic = await topicIdFor(slug);
      topicCache.set(slug, topic?.id ?? null);
    }
    const topicId = topicCache.get(slug) ?? null;
    const engagement = posts.reduce((sum, post) => sum + engagementOf(post.metrics), 0);
    const accounts = new Set(posts.map((post) => post.authorId || post.username || post.id)).size;
    const attention = attentionOf({ engagement, accounts });
    const deskClass = posts.some((post) => post.deskClass === "actionable")
      ? "actionable"
      : posts.some((post) => post.deskClass === "discussion")
        ? "discussion"
        : "noise";
    const names = mentioned(posts, input.entities);
    const times = posts.map((post) => post.createdAt).filter((value): value is string => Boolean(value)).sort();
    const lead = clusterClaims[0]?.claim;
    const saved = await saveConversation({
      externalId: cluster.key,
      topicId,
      title: cluster.title,
      summary: clusterSummary(posts.length, lead, input.outcome),
      narrative: posts.slice(0, 4).map((post) => `@${post.username ?? "account"}: ${post.text}`.slice(0, 320)),
      startedAt: times[0] ?? new Date().toISOString(),
      lastDetectedAt: times[times.length - 1] ?? null,
      postCount: posts.length,
      engagement: {
        volume: engagement,
        postCount: posts.length,
        replies: posts.reduce((sum, post) => sum + post.metrics.replies, 0),
        reposts: posts.reduce((sum, post) => sum + post.metrics.reposts, 0),
        likes: posts.reduce((sum, post) => sum + post.metrics.likes, 0),
        quotes: posts.reduce((sum, post) => sum + post.metrics.quotes, 0),
        attention: attention.label,
        deskClass,
        velocityNote: attention.note,
      },
      entityIds: names.map((entity) => entity.id),
      deskNote: input.deskNote,
    });
    if (!saved) continue;
    conversationIds.push(saved.id);
    if (saved.created) conversations += 1;
    await attachPosts(posts.map((post) => post.id), saved.id);
    for (const claim of clusterClaims) {
      const existingId = await findClaimId(claim.post.id, claim.claim);
      if (existingId) {
        links.push({ conversationId: saved.id, claimId: existingId, title: claim.claim, why: claim.why, needed: claim.needed });
        continue;
      }
      const ranked = rankClaim({
        accounts,
        engagement,
        hasFigure: /\d/.test(claim.claim),
        publicIssue: true,
        deskClass: claim.post.deskClass,
      });
      const mentionedNames = Array.from(
        new Set([
          ...claim.entities,
          ...names.map((entity) => entity.name).filter((name) => claim.post.text.toLowerCase().includes(name.toLowerCase())),
        ]),
      ).slice(0, 8);
      const pillar = input.pillar ?? "politics";
      const kind = inferStatementKind(pillar, claim.claim);
      const types = inferClaimTypes(claim.claim, pillar);
      const id = await saveClaim({
        conversation_id: saved.id,
        topic_id: topicId,
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
        mentioned_entities: mentionedNames,
        desk_class: claim.post.deskClass,
        origin: "live",
        content_pillar: pillar,
        statement_kind: kind,
        claim_types: types,
        research_questions: questionsFor(types, pillar).map((item) => item.question),
      });
      if (id) {
        claims += 1;
        filedClaims.push({ id, title: claim.claim });
        links.push({ conversationId: saved.id, claimId: id, title: claim.claim, why: claim.why, needed: claim.needed });
      }
    }
  }
  return { conversations, claims, conversationIds, filedClaims, links };
}

function majority(values: Array<string | null>) {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
}

function mentioned(posts: WorkingPost[], entities: Array<{ id: string; name: string; aliases: string[] }>) {
  return entities.filter((entity) =>
    posts.some((post) => {
      const haystack = post.text.toLowerCase();
      return [entity.name, ...entity.aliases].some((label) => label.length > 1 && haystack.includes(label.toLowerCase()));
    }),
  );
}

function clusterSummary(count: number, lead: string | undefined, outcome: ExtractionOutcome) {
  const head = `${count} post${count === 1 ? "" : "s"}.`;
  if (lead) return `${head} Checkable line: ${lead}`.slice(0, 500);
  if (outcome === "failed" || outcome === "invalid") return `${head} Extraction failed, so no claim was filed.`.slice(0, 500);
  if (outcome === "rejected") return `${head} Validation rejected the candidate claims.`.slice(0, 500);
  if (outcome === "not_run") return `${head} Reclassified from stored posts. The model was not called.`.slice(0, 500);
  if (outcome === "no_claims") return `${head} No checkable claims existed.`.slice(0, 500);
  return `${head} No checkable claim was filed from these posts.`.slice(0, 500);
}
