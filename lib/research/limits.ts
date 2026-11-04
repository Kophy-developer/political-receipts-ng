import "server-only";

/** Research ceilings. A run cannot raise these, and nothing starts without an editor. */
export const researchLimits = {
  maxSearchesPerRun: 3,
  maxDocumentsPerRun: 2,
  dailySearches: 12,
  dailyRetrievals: 20,
} as const;
