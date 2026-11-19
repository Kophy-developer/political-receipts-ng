import "server-only";
import { serviceClient } from "@/lib/db/client";
import { publicPostUrl } from "@/lib/intel/text";

export type SourcePostRef = {
  id: string;
  username: string | null;
  text: string | null;
  url: string | null;
};

export async function resolveConversationSourcePost(conversationId: string | null): Promise<SourcePostRef | null> {
  if (!conversationId) return null;
  const db = serviceClient();
  if (!db) return null;
  const listed = await db
    .from("x_posts")
    .select("x_post_id, username, text, posted_at, x_conversation_id")
    .eq("conversation_id", conversationId)
    .order("posted_at", { ascending: true })
    .limit(40);
  if (listed.error || !listed.data?.length) return null;
  const rows = listed.data;
  const root = rows.find((row) => typeof row.x_post_id === "string" && typeof row.x_conversation_id === "string" && row.x_post_id === row.x_conversation_id)
    ?? rows.find((row) => typeof row.x_post_id === "string" && row.x_post_id === conversationId)
    ?? rows[0];
  if (!root || typeof root.x_post_id !== "string") return null;
  const username = typeof root.username === "string" ? root.username : null;
  return {
    id: root.x_post_id,
    username,
    text: typeof root.text === "string" ? root.text : null,
    url: publicPostUrl(root.x_post_id, username),
  };
}

export async function loadClaimReplyTarget(claimId: string): Promise<SourcePostRef | null> {
  const db = serviceClient();
  if (!db) return null;
  const claim = await db
    .from("claims")
    .select("original_post_id, original_post_url, original_author_username, original_post_text, conversation_id")
    .eq("id", claimId)
    .maybeSingle();
  if (claim.error || !claim.data) return null;
  if (typeof claim.data.original_post_id === "string" && /^\d{1,25}$/.test(claim.data.original_post_id)) {
    const username = typeof claim.data.original_author_username === "string" ? claim.data.original_author_username : null;
    return {
      id: claim.data.original_post_id,
      username,
      text: typeof claim.data.original_post_text === "string" ? claim.data.original_post_text : null,
      url: typeof claim.data.original_post_url === "string"
        ? claim.data.original_post_url
        : publicPostUrl(claim.data.original_post_id, username),
    };
  }
  return resolveConversationSourcePost(typeof claim.data.conversation_id === "string" ? claim.data.conversation_id : null);
}
