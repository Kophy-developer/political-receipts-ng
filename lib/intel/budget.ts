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
