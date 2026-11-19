/** Ceilings shared by the intelligence scan and the Desk confirmation. A scan cannot raise these. */
export const scanBudget = {
  maxPostsPerRequest: 10,
  maxPostsPerScan: 10,
  maxXRequestsPerScan: 12,
  minEngagement: 0,
  lookbackHours: 24,
  dailyXRequests: 24,
  dailyPosts: 120,
  dailyGeminiRequests: 16,
} as const;

/** Published X pay-per-use rates as of October 2026. Not a live invoice. */
export const publishedRates = {
  asOf: "October 2026",
  postReadUsd: 0.005,
  userReadUsd: 0.01,
} as const;

/** X recent search accepts 10 to 100 results per request. This desk does not paginate. */
export const recentSearchEndpoint = {
  minResults: 10,
  maxResults: 100,
} as const;

export function plannedScanRequest(requestedPosts = scanBudget.maxPostsPerRequest, requestedQueries = 1) {
  const posts = Math.min(recentSearchEndpoint.maxResults, Math.max(recentSearchEndpoint.minResults, requestedPosts));
  const requests = Math.max(1, Math.min(scanBudget.maxXRequestsPerScan, requestedQueries));
  return {
    requests,
    posts,
    postsPerRequest: posts,
    paginates: false as const,
    note: `X recent search returns ${recentSearchEndpoint.minResults} to ${recentSearchEndpoint.maxResults} posts in one request. A multi-pillar run may send up to ${scanBudget.maxXRequestsPerScan} requests (keyword groups plus account-roster from: batches) and asks for ${posts} posts each without pagination. The daily ceiling is ${scanBudget.dailyXRequests} requests and ${scanBudget.dailyPosts} post reads.`,
  };
}
