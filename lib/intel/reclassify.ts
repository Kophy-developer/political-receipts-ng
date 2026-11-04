import "server-only";
import {
  closeOrphanConversations,
  knownEntities,
  listSearchGroups,
  loadStoredPosts,
  termRules,
  updateStoredPost,
} from "@/lib/db/intel";
import { judgePost } from "@/lib/intel/classify";
import { fileDiscussions } from "@/lib/intel/file";
import { claimDeskLock, releaseDeskLock } from "@/lib/intel/lock";
import type { PostMetrics, WorkingPost } from "@/lib/intel/posts";
import { sanitizeText } from "@/lib/intel/text";

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

export async function reclassifyStoredPosts() {
  if (!claimDeskLock()) return { ok: false as const, message: "A desk job is already running. No X request was made." };
  try {
    const loaded = await loadStoredPosts();
    if (!loaded.ok) return { ok: false as const, message: loaded.message };
    const rules = await termRules();
    const groups = await listSearchGroups();
    const topics = new Map(groups.map((group) => [group.name, group.topicSlug]));
    const posts: WorkingPost[] = [];
    const rescued: Array<{ username: string | null; deskClass: string }> = [];
    for (const row of loaded.rows) {
      const text = sanitizeText(typeof row.text === "string" ? row.text : "");
      const previous = row.desk_class;
      const judged = judgePost(text, rules);
      if (previous === "noise" && (judged.deskClass === "actionable" || judged.deskClass === "discussion")) {
        rescued.push({ username: typeof row.username === "string" ? row.username : null, deskClass: judged.deskClass });
      }
      await updateStoredPost(row.x_post_id, {
        text,
        relevance: judged.relevance,
        relevance_reason: judged.reason,
        desk_class: judged.deskClass,
      });
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
    const filed = await fileDiscussions({
      posts,
      claims: [],
      outcome: "not_run",
      entities: await knownEntities(),
      topicSlugFor: (source) => (source && topics.get(source)) || "desk-elections",
      deskNote: "Reclassified from stored posts. No new X request was made. The model was not called.",
    });
    if (filed.conversationIds.length > 0) await closeOrphanConversations(filed.conversationIds);
    return {
      ok: true as const,
      posts: posts.length,
      rescued: rescued.length,
      rescuedPosts: rescued,
      actionable: posts.filter((post) => post.deskClass === "actionable").length,
      discussion: posts.filter((post) => post.deskClass === "discussion").length,
      noise: posts.filter((post) => post.deskClass === "noise").length,
      conversations: filed.conversationIds.length,
    };
  } finally {
    releaseDeskLock();
  }
}
