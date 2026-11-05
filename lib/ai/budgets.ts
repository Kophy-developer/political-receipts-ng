/**
 * Output budgets are per task. The health check must not reuse the draft budget,
 * and drafting must not reuse the health budget.
 * Values outside 64–8192 fall back to the task default.
 */

export const defaultOutputBudgets = {
  health: 1024,
  extraction: 2048,
  draft: 4096,
} as const;

export type OutputTask = keyof typeof defaultOutputBudgets;

export function tokenBudget(raw: string | undefined, fallback: number) {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 64 || parsed > 8192) return fallback;
  return parsed;
}

export function readOutputBudgets() {
  return {
    health: tokenBudget(process.env.AI_HEALTH_MAX_TOKENS, defaultOutputBudgets.health),
    extraction: tokenBudget(process.env.AI_EXTRACTION_MAX_TOKENS, defaultOutputBudgets.extraction),
    draft: tokenBudget(process.env.AI_DRAFT_MAX_TOKENS, defaultOutputBudgets.draft),
  };
}

/**
 * The production extraction call was aborted at 20s, before any token count returned.
 * 25s is enough for one 10-post extraction and still leaves room for one fallback
 * inside the 60s server limit. The 2048 output budget is unchanged.
 */
export const defaultExtractionTimeoutMs = 25_000;

export function extractionTimeoutMs() {
  const parsed = Number(process.env.AI_EXTRACTION_TIMEOUT_MS);
  if (!Number.isInteger(parsed) || parsed < 5_000 || parsed > 45_000) return defaultExtractionTimeoutMs;
  return parsed;
}
