import "server-only";
import type { ResearchProviderId } from "@/lib/research/choose";

/** Research ceilings. A run cannot raise these, and nothing starts without an editor. */
export const researchLimits = {
  maxSearchesPerRun: 3,
  maxDocumentsPerRun: 2,
  dailySearches: 12,
  dailyRetrievals: 20,
} as const;

function ceiling(name: string, fallback: number) {
  const raw = Number(process.env[name]);
  if (!Number.isFinite(raw) || raw < 1) return fallback;
  return Math.min(5000, Math.floor(raw));
}

export function researchBudget() {
  const day = Number(process.env.RESEARCH_BILLING_DAY);
  const preference: ResearchProviderId = process.env.RESEARCH_PROVIDER?.trim().toLowerCase() === "brave" ? "brave" : "tavily";
  return {
    preference,
    tavilyCeiling: ceiling("TAVILY_MONTHLY_CEILING", 900),
    braveCeiling: ceiling("BRAVE_MONTHLY_CEILING", 900),
    billingDay: Number.isFinite(day) && day >= 1 && day <= 28 ? Math.floor(day) : 1,
  };
}
