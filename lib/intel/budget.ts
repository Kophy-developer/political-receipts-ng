/** Ceilings shared by the intelligence scan and the Desk confirmation. A scan cannot raise these. */
export const scanBudget = {
  maxPostsPerScan: 10,
  maxXRequestsPerScan: 1,
  minEngagement: 0,
  lookbackHours: 24,
  dailyXRequests: 4,
  dailyPosts: 40,
  dailyGeminiRequests: 8,
} as const;

/** X recent search accepts 10 to 100 results per request. This desk does not paginate. */
export const recentSearchEndpoint = {
  minResults: 10,
  maxResults: 100,
} as const;

export function plannedScanRequest(requestedPosts = scanBudget.maxPostsPerScan) {
  const posts = Math.min(recentSearchEndpoint.maxResults, Math.max(recentSearchEndpoint.minResults, requestedPosts));
  return {
    requests: scanBudget.maxXRequestsPerScan,
    posts,
    paginates: false as const,
    note: `X recent search returns ${recentSearchEndpoint.minResults} to ${recentSearchEndpoint.maxResults} posts in one request. This scan asks for ${posts} and does not paginate. The daily ceiling is ${scanBudget.dailyXRequests} requests and ${scanBudget.dailyPosts} post reads.`,
  };
}
