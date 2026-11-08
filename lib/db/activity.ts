import "server-only";
import { serviceClient } from "@/lib/db/client";
import { savePosts, existingPostIds } from "@/lib/db/intel";
import { isUuid } from "@/lib/db/labels";
import { usageSince, recordUsage } from "@/lib/db/usage";
import { conversationActivity, type ActivityInput, type ActivityModel } from "@/lib/intel/activity";
import { scanBudget } from "@/lib/intel/budget";
import { lagosDayStart } from "@/lib/intel/limits";
import { metricsFromStored } from "@/lib/intel/metrics";
import { lookupPosts } from "@/lib/x/search";

const postColumns = "x_post_id, text, author_id, username, display_name, posted_at, retrieved_at, public_metrics, x_conversation_id, referenced, scan_id, conversation_id, content_pillar, relevance";

function referencedOf(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const row = item as { type?: unknown; id?: unknown };
    if (typeof row.type !== "string" || typeof row.id !== "string" || !/^\d{1,25}$/.test(row.id)) return [];
    return [{ type: row.type, id: row.id }];
  });
}

function postFrom(row: Record<string, unknown>): ActivityInput {
  return {
    id: String(row.x_post_id),
    text: typeof row.text === "string" ? row.text : "",
    authorId: typeof row.author_id === "string" ? row.author_id : null,
    username: typeof row.username === "string" ? row.username : null,
    displayName: typeof row.display_name === "string" ? row.display_name : null,
    createdAt: typeof row.posted_at === "string" ? row.posted_at : null,
    retrievedAt: typeof row.retrieved_at === "string" ? row.retrieved_at : null,
    scanId: typeof row.scan_id === "string" ? row.scan_id : null,
    deskConversationId: typeof row.conversation_id === "string" ? row.conversation_id : null,
    xConversationId: typeof row.x_conversation_id === "string" ? row.x_conversation_id : null,
    referenced: referencedOf(row.referenced),
    metrics: metricsFromStored(row.public_metrics),
    pillar: typeof row.content_pillar === "string" ? row.content_pillar : null,
  };
}

async function allowance() {
  const usage = await usageSince(lagosDayStart());
  if (!usage.ok) return { requestsRemaining: 0, postsRemaining: 0, known: false };
  return {
    requestsRemaining: Math.max(0, scanBudget.dailyXRequests - usage.totals.xRequests),
    postsRemaining: Math.max(0, scanBudget.dailyPosts - usage.totals.posts),
    known: true,
  };
}

async function postsFor(deskConversationId: string | null, scanId: string | null) {
  const db = serviceClient();
  if (!db) return [] as ActivityInput[];
  const rows: Record<string, unknown>[] = [];
  if (deskConversationId && isUuid(deskConversationId)) {
    const desk = await db.from("x_posts").select(postColumns).eq("conversation_id", deskConversationId).limit(40);
    rows.push(...((desk.data ?? []) as Record<string, unknown>[]));
  }
  if (scanId && isUuid(scanId)) {
    const scan = await db.from("x_posts").select(postColumns).eq("scan_id", scanId).limit(40);
    rows.push(...((scan.data ?? []) as Record<string, unknown>[]));
  }
  const conversationIds = [...new Set(rows.map((row) => row.x_conversation_id).filter((id): id is string => typeof id === "string" && /^\d{1,25}$/.test(id)))];
  if (conversationIds.length > 0) {
    const same = await db.from("x_posts").select(postColumns).in("x_conversation_id", conversationIds.slice(0, 20)).limit(80);
    rows.push(...((same.data ?? []) as Record<string, unknown>[]));
  }
  return rows.map(postFrom);
}

export async function loadStoryActivity(opportunityId: string): Promise<ActivityModel | null> {
  const db = serviceClient();
  if (!db || !isUuid(opportunityId)) return null;
  const row = await db.from("opportunities").select("conversation_id, scan_id, content_pillar, understanding, claim_id").eq("id", opportunityId).maybeSingle();
  if (row.error || !row.data) return null;
  const understanding = row.data.understanding && typeof row.data.understanding === "object" ? row.data.understanding as { sourceText?: unknown } : null;
  const claimId = typeof row.data.claim_id === "string" ? row.data.claim_id : null;
  const claim = claimId && isUuid(claimId) ? await db.from("claims").select("original_post_id").eq("id", claimId).maybeSingle() : null;
  const posts = await postsFor(typeof row.data.conversation_id === "string" ? row.data.conversation_id : null, typeof row.data.scan_id === "string" ? row.data.scan_id : null);
  return conversationActivity(posts, {
    postId: typeof claim?.data?.original_post_id === "string" ? claim.data.original_post_id : null,
    text: typeof understanding?.sourceText === "string" ? understanding.sourceText : null,
    deskConversationId: typeof row.data.conversation_id === "string" ? row.data.conversation_id : null,
    pillar: typeof row.data.content_pillar === "string" ? row.data.content_pillar : null,
  }, await allowance());
}

export async function loadClaimActivity(claimId: string): Promise<{ opportunityId: string | null; activity: ActivityModel } | null> {
  const db = serviceClient();
  if (!db || !isUuid(claimId)) return null;
  const claim = await db.from("claims").select("conversation_id, original_post_id, content_pillar").eq("id", claimId).maybeSingle();
  if (claim.error || !claim.data) return null;
  const opportunity = await db.from("opportunities").select("id, scan_id").eq("claim_id", claimId).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const posts = await postsFor(
    typeof claim.data.conversation_id === "string" ? claim.data.conversation_id : null,
    typeof opportunity.data?.scan_id === "string" ? opportunity.data.scan_id : null,
  );
  const activity = conversationActivity(posts, {
    postId: typeof claim.data.original_post_id === "string" ? claim.data.original_post_id : null,
    deskConversationId: typeof claim.data.conversation_id === "string" ? claim.data.conversation_id : null,
    pillar: typeof claim.data.content_pillar === "string" ? claim.data.content_pillar : null,
  }, await allowance());
  return { opportunityId: typeof opportunity.data?.id === "string" ? opportunity.data.id : null, activity };
}

export async function confirmConversationLookup(opportunityId: string, confirm: boolean) {
  const db = serviceClient();
  if (!db || !isUuid(opportunityId)) return { ok: false as const, called: false as const, message: "That story is not on the desk." };
  const current = await loadStoryActivity(opportunityId);
  if (!current?.lookup || !current.absentId) return { ok: false as const, called: false as const, message: "This story has no missing original post. Nothing was requested." };
  if (confirm !== true) return { ok: true as const, called: false as const, message: current.lookup.note };
  if (!current.lookup.allowed) return { ok: false as const, called: false as const, message: current.lookup.note };
  const known = await existingPostIds([current.absentId]);
  if (known.has(current.absentId)) return { ok: true as const, called: false as const, message: "That post is already stored. No X request was made." };
  const story = await db.from("opportunities").select("conversation_id, scan_id, content_pillar").eq("id", opportunityId).maybeSingle();
  const looked = await lookupPosts([current.absentId]);
  if (!looked.ok && looked.status === 503) return { ok: false as const, called: false as const, message: looked.message };
  await recordUsage({
    provider: "x",
    operation: "tweet_lookup",
    requests: 1,
    units: looked.ok ? looked.posts.length : 0,
    scanId: typeof story.data?.scan_id === "string" ? story.data.scan_id : null,
  });
  if (!looked.ok || looked.posts.length === 0 || looked.posts[0]?.id !== current.absentId) {
    return { ok: false as const, called: true as const, message: looked.ok ? "X did not return that post. Nothing was added to the story." : looked.message };
  }
  const post = looked.posts[0];
  const pillar = story.data?.content_pillar === "finance" || story.data?.content_pillar === "football" || story.data?.content_pillar === "politics" ? story.data.content_pillar : "politics";
  const saved = await savePosts([{
    x_post_id: post.id,
    text: post.text,
    author_id: post.authorId,
    username: post.username,
    display_name: post.displayName,
    posted_at: post.createdAt,
    public_metrics: post.metrics,
    x_conversation_id: post.conversationId,
    referenced: post.referenced,
    language: post.lang,
    source_query: "conversation lookup",
    retrieved_at: new Date().toISOString(),
    relevance: "possibly_political",
    relevance_reason: "Looked up because the original post was not in the scan.",
    desk_class: "discussion",
    content_pillar: pillar,
    scan_id: typeof story.data?.scan_id === "string" ? story.data.scan_id : null,
    conversation_id: typeof story.data?.conversation_id === "string" ? story.data.conversation_id : null,
  }]);
  if (!saved) return { ok: false as const, called: true as const, message: "X returned the post, but it could not be stored. It was not requested again." };
  return { ok: true as const, called: true as const, message: "The original post is stored with this story. No reply was sent, and no opportunity was created." };
}
