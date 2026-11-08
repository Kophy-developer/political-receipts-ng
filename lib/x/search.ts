import "server-only";
import { recentSearchEndpoint } from "@/lib/intel/budget";
import { xUserGet } from "@/lib/x/oauth1";
import { cleanUsername, sanitizeText } from "@/lib/intel/text";

export type RetrievedPost = {
  id: string;
  text: string;
  authorId: string | null;
  username: string | null;
  displayName: string | null;
  createdAt: string | null;
  metrics: { replies: number; reposts: number; likes: number; quotes: number; views: number | null };
  conversationId: string | null;
  referenced: Array<{ type: string; id: string }>;
  lang: string | null;
};

function count(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number) || number < 0) return 0;
  return Math.min(Math.floor(number), 1_000_000_000);
}

function asRecord(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export async function searchRecent(input: { query: string; maxResults: number; startTime: string }) {
  const maxResults = Math.min(recentSearchEndpoint.maxResults, Math.max(recentSearchEndpoint.minResults, input.maxResults));
  const result = await xUserGet("https://api.twitter.com/2/tweets/search/recent", {
    query: input.query,
    max_results: String(maxResults),
    start_time: input.startTime,
    "tweet.fields": "created_at,public_metrics,conversation_id,lang,referenced_tweets,author_id",
    expansions: "author_id",
    "user.fields": "username,name",
  });
  if (!result.ok) return { ok: false as const, status: result.status, message: result.message, posts: [] as RetrievedPost[] };
  const body = asRecord(result.data);
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
    const metrics = asRecord(record.public_metrics);
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
      metrics: {
        replies: count(metrics?.reply_count),
        reposts: count(metrics?.retweet_count),
        likes: count(metrics?.like_count),
        quotes: count(metrics?.quote_count),
        views: metrics && "impression_count" in metrics ? count(metrics.impression_count) : null,
      },
      conversationId: typeof record.conversation_id === "string" && /^\d{1,25}$/.test(record.conversation_id) ? record.conversation_id : null,
      referenced: referenced.slice(0, 5),
      lang: typeof record.lang === "string" ? record.lang.slice(0, 12) : null,
    });
  }
  return { ok: true as const, posts: posts.slice(0, maxResults) };
}
