import { metricsFromX, type PostMetrics } from "@/lib/intel/metrics";
import { cleanUsername, sanitizeText } from "@/lib/intel/text";

export const tweetFields = "created_at,public_metrics,conversation_id,lang,referenced_tweets,author_id";

/** The query parameter is the completed recent-search string, including any engagement operator. */
export function recentSearchParams(input: { query: string; maxResults: number; startTime: string }) {
  return {
    query: input.query,
    max_results: String(input.maxResults),
    start_time: input.startTime,
    "tweet.fields": tweetFields,
    expansions: "author_id",
    "user.fields": "username,name",
  };
}

export type RetrievedPost = {
  id: string;
  text: string;
  authorId: string | null;
  username: string | null;
  displayName: string | null;
  createdAt: string | null;
  metrics: PostMetrics;
  conversationId: string | null;
  referenced: Array<{ type: string; id: string }>;
  lang: string | null;
};

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export function postsFromSearchBody(data: unknown): RetrievedPost[] {
  const body = asRecord(data);
  const rows = Array.isArray(body?.data) ? body.data : [];
  const users = new Map<string, { username: string | null; name: string | null }>();
  const included = asRecord(body?.includes);
  if (Array.isArray(included?.users)) {
    for (const user of included.users) {
      const record = asRecord(user);
      if (!record || typeof record.id !== "string") continue;
      users.set(record.id, {
        username: cleanUsername(typeof record.username === "string" ? record.username : null),
        name: typeof record.name === "string" ? sanitizeText(record.name, 80) : null,
      });
    }
  }
  const posts: RetrievedPost[] = [];
  for (const row of rows) {
    const record = asRecord(row);
    if (!record || typeof record.id !== "string" || !/^\d{1,25}$/.test(record.id) || typeof record.text !== "string") continue;
    const authorId = typeof record.author_id === "string" ? record.author_id : null;
    const user = authorId ? users.get(authorId) : undefined;
    const referenced = Array.isArray(record.referenced_tweets)
      ? record.referenced_tweets.flatMap((item) => {
          const ref = asRecord(item);
          if (!ref || typeof ref.id !== "string" || typeof ref.type !== "string") return [];
          if (!/^\d{1,25}$/.test(ref.id)) return [];
          return [{ type: ref.type.slice(0, 32), id: ref.id }];
        })
      : [];
    posts.push({
      id: record.id,
      text: sanitizeText(record.text),
      authorId,
      username: user?.username ?? null,
      displayName: user?.name ?? null,
      createdAt: typeof record.created_at === "string" ? record.created_at : null,
      metrics: metricsFromX(asRecord(record.public_metrics)),
      conversationId: typeof record.conversation_id === "string" && /^\d{1,25}$/.test(record.conversation_id) ? record.conversation_id : null,
      referenced: referenced.slice(0, 5),
      lang: typeof record.lang === "string" ? record.lang.slice(0, 12) : null,
    });
  }
  return posts;
}
