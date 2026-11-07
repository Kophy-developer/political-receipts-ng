import { createHash } from "node:crypto";
import { queryTerms } from "@/lib/research/official";
import { interleaveVariants, primaryTarget, queryVariants, researchProblems, scheduleVariants, targetForStage } from "@/lib/research/queries";
import type { ClaimType, Pillar, PlannedSearch, SearchStage, SourceCategory, StoredResearchPlan } from "@/lib/research/types";

export function stageLabel(stage: SearchStage) {
  if (stage === "primary") return "Stage 1 · Primary source";
  if (stage === "independent") return "Stage 2 · Independent sources";
  return "Stage 3 · Broader context";
}

export function nextStage(stage: SearchStage): SearchStage | null {
  if (stage === "primary") return "independent";
  if (stage === "independent") return "context";
  return null;
}

export function planHash(input: { claim: string; questions: string[]; provider: string; domains: string[]; queries: string[]; stage: string; planner?: string }) {
  const parts = [
    input.claim.trim(),
    input.stage,
    input.provider,
    [...input.domains].map((domain) => domain.toLowerCase()).sort().join(","),
    input.questions.map((question) => question.trim()).join("\n"),
    input.queries.map((query) => query.trim()).join("\n"),
  ];
  if (input.planner) parts.push(input.planner);
  return createHash("sha256").update(parts.join("\n---\n")).digest("hex");
}

export function hashOfPlan(plan: Pick<StoredResearchPlan, "claim" | "stage" | "domains" | "questions" | "searches"> & { planner?: string }, provider: string) {
  return planHash({
    claim: plan.claim,
    stage: plan.stage,
    provider,
    domains: plan.domains,
    questions: plan.questions.map((item) => item.question),
    queries: plan.searches.map((item) => item.query),
    planner: plan.planner,
  });
}

export function runAlreadyCompleted(input: {
  hash: string;
  provider: "tavily" | "brave";
  runs: Array<{ hash: string | null; provider: string | null; status: string; operations: number }>;
}) {
  const name = input.provider === "tavily" ? "Tavily" : "Brave Search";
  return input.runs.some(
    (run) =>
      run.hash === input.hash &&
      (run.provider === name || run.provider === input.provider) &&
      run.operations > 0 &&
      (run.status === "completed" || run.status === "stopped"),
  );
}

export function composeStoredPlan(input: {
  claim: string;
  pillar: Pillar;
  claimTypes: ClaimType[];
  categories: SourceCategory[];
  stage: SearchStage;
  providerId: "tavily" | "brave";
  cursor: number;
  maxOperations: number;
  awaitingReview: boolean;
}): StoredResearchPlan {
  const primary = primaryTarget(input.claim, input.categories);
  const stageTarget = targetForStage(input.claim, input.categories, input.stage);
  const questions = researchProblems(input.claim, primary.authority, input.pillar, input.claimTypes);
  const variants = interleaveVariants(queryVariants(input.claim, primary.authority, questions));
  const pool = input.stage === "context" ? variants : variants.filter((item) => item.problem !== "attribution");
  const cursor = pool.length ? ((input.cursor % pool.length) + pool.length) % pool.length : 0;
  const chosen = scheduleVariants(variants, cursor, input.maxOperations, input.stage);
  const searches: PlannedSearch[] = chosen.map((item) => ({
    problem: item.problem,
    question: item.question,
    query: item.query,
    authority: item.problem === "attribution" ? "The person who first published the accusation" : stageTarget.authority,
    domains: [...stageTarget.domains],
    stage: input.stage,
    stageLabel: stageLabel(input.stage),
  }));
  const directDomains = input.stage === "primary" ? stageTarget.domains.slice(0, 1) : [];
  return {
    version: 1,
    claim: input.claim,
    stage: input.stage,
    cursor,
    awaitingReview: input.awaitingReview,
    authority: stageTarget.authority,
    domains: [...stageTarget.domains],
    providerId: input.providerId,
    questions,
    variants,
    searches,
    direct: {
      domains: directDomains,
      terms: queryTerms(searches.map((item) => item.query)),
      maxEntryPages: 1,
      maxFollowedLinks: 1,
    },
  };
}

export function readStoredPlan(value: unknown): StoredResearchPlan | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<StoredResearchPlan>;
  if (row.version !== 1 || typeof row.claim !== "string") return null;
  if (row.stage !== "primary" && row.stage !== "independent" && row.stage !== "context") return null;
  if (!Array.isArray(row.questions) || !Array.isArray(row.searches) || !Array.isArray(row.domains)) return null;
  if (!row.searches.every((item) => item && typeof item.query === "string" && typeof item.question === "string")) return null;
  if (typeof row.cursor !== "number" || typeof row.awaitingReview !== "boolean") return null;
  return row as StoredResearchPlan;
}
