import "server-only";

/** Conservative Phase 1 ceilings. A scan cannot raise these. */
export const scanLimits = {
  maxPostsPerScan: 10,
  maxXRequestsPerScan: 1,
  minEngagement: 0,
  lookbackHours: 24,
  dailyXRequests: 4,
  dailyPosts: 40,
  dailyGeminiRequests: 8,
} as const;

/** Published X pay-per-use rates as of October 2026. Not a live invoice. */
export const publishedRates = {
  asOf: "October 2026",
  postReadUsd: 0.005,
  userReadUsd: 0.01,
} as const;

export function lookbackStart(hours: number) {
  const span = Math.min(48, Math.max(1, hours));
  return new Date(Date.now() - span * 60 * 60 * 1000).toISOString();
}

export function lagosDayStart(now = new Date()) {
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${day}T00:00:00+01:00`).toISOString();
}

export function lagosDayLabel(now = new Date()) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(now);
}

export function usd(amount: number) {
  if (amount > 0 && amount < 0.01) return `$${amount.toFixed(3)}`;
  return `$${amount.toFixed(2)}`;
}
