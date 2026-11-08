import "server-only";
import { recentSearchEndpoint } from "@/lib/intel/budget";
import { xUserGet } from "@/lib/x/oauth1";
import { postsFromSearchBody, recentSearchParams, tweetFields, type RetrievedPost } from "@/lib/x/parse";

export { tweetFields, type RetrievedPost };

export async function searchRecent(input: { query: string; maxResults: number; startTime: string }) {
  const maxResults = Math.min(recentSearchEndpoint.maxResults, Math.max(recentSearchEndpoint.minResults, input.maxResults));
  const result = await xUserGet("https://api.twitter.com/2/tweets/search/recent", recentSearchParams({
    query: input.query,
    maxResults,
    startTime: input.startTime,
  }));
  if (!result.ok) return { ok: false as const, status: result.status, message: result.message, posts: [] as RetrievedPost[] };
  return { ok: true as const, posts: postsFromSearchBody(result.data).slice(0, maxResults) };
}

export async function lookupPosts(ids: string[]) {
  const unique = [...new Set(ids.filter((id) => /^\d{1,25}$/.test(id)))].slice(0, 1);
  if (unique.length === 0) return { ok: false as const, status: 400, message: "That post id is not an X id.", posts: [] as RetrievedPost[] };
  const result = await xUserGet("https://api.twitter.com/2/tweets", {
    ids: unique.join(","),
    "tweet.fields": tweetFields,
    expansions: "author_id",
    "user.fields": "username,name",
  });
  if (!result.ok) return { ok: false as const, status: result.status, message: result.message, posts: [] as RetrievedPost[] };
  return { ok: true as const, posts: postsFromSearchBody(result.data).slice(0, 1) };
}
