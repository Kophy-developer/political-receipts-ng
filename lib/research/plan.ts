import "server-only";
import { chooseProvider, type ResearchProviderId } from "@/lib/research/choose";
import { composeStoredPlan, hashOfPlan, nextStage, readStoredPlan, runAlreadyCompleted, stageLabel } from "@/lib/research/canonical";
import { inferClaimTypes, inferStatementKind } from "@/lib/research/claim-types";
import { hostname } from "@/lib/research/filter";
import { researchBudget, researchLimits } from "@/lib/research/limits";
import { primaryTarget } from "@/lib/research/queries";
import { evidenceQuality, problemReadings } from "@/lib/research/quality";
import { researchKeys, searchProvider } from "@/lib/research/provider";
import type { ClaimType, Pillar, ResearchPlan, SearchStage, SourceCategory, StatementKind, StoredResearchPlan } from "@/lib/research/types";
import { columnMissing, serviceClient } from "@/lib/db/client";
import { researchMonthTotals } from "@/lib/db/usage";

const claimTypes = new Set<ClaimType>([
  "quotation",
  "economic statistic",
  "government spending",
  "budget/public finance",
  "election rule/process",
  "election result",
  "legislative/voting record",
  "government policy",
  "political appointment",
  "court/legal claim",
  "security statistic",
  "historical claim",
  "public-office record",
  "match fact",
  "football opinion",
  "market fact",
  "financial analysis",
  "other verifiable factual claim",
]);

export { tierForHost } from "@/lib/research/tiers";

export async function sourceCategories(pillar: Pillar): Promise<SourceCategory[]> {
  const db = serviceClient();
  if (!db) return [];
  const { data } = await db.from("source_tiers").select("rank, name, notes, domains").eq("pillar", pillar).order("rank");
  return (data ?? []).map((row) => ({
    rank: row.rank as number,
    name: row.name as string,
    notes: row.notes as string,
    domains: Array.isArray(row.domains) ? row.domains.filter((item: unknown): item is string => typeof item === "string") : [],
  }));
}

type RunRecord = {
  hash: string | null;
  provider: string | null;
  status: string;
  operations: number;
  stage: string | null;
  detail: Record<string, unknown> | null;
};

function asDetail(value: unknown) {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function samePlan(left: StoredResearchPlan, right: StoredResearchPlan) {
  return JSON.stringify({
    claim: left.claim,
    stage: left.stage,
    cursor: left.cursor,
    awaitingReview: left.awaitingReview,
    domains: left.domains,
    searches: left.searches.map((item) => item.query),
    questions: left.questions.map((item) => item.question),
  }) === JSON.stringify({
    claim: right.claim,
    stage: right.stage,
    cursor: right.cursor,
    awaitingReview: right.awaitingReview,
    domains: right.domains,
    searches: right.searches.map((item) => item.query),
    questions: right.questions.map((item) => item.question),
  });
}

export async function storeResearchPlan(claimId: string, plan: StoredResearchPlan) {
  const db = serviceClient();
  if (!db) return false;
  const saved = await db.from("claims").update({
    research_plan: plan,
    research_questions: plan.questions.map((item) => item.question),
  }).eq("id", claimId);
  return !saved.error;
}

async function savePlan(claimId: string, plan: StoredResearchPlan) {
  return storeResearchPlan(claimId, plan);
}

function present(input: {
  claimId: string;
  claim: string;
  pillar: Pillar;
  statementKind: StatementKind;
  claimTypes: ClaimType[];
  categories: SourceCategory[];
  stored: StoredResearchPlan;
  providerId: ResearchProviderId;
  providerName: string;
  configured: boolean;
  credential: string | null;
  runs: RunRecord[];
  sources: Array<{ domain: string; tierRank: number }>;
}): ResearchPlan {
  const primary = primaryTarget(input.claim, input.categories);
  const hash = hashOfPlan(input.stored, input.providerId);
  const alreadyRun = runAlreadyCompleted({ hash, provider: input.providerId, runs: input.runs });
  const primaryRun = input.runs.find((run) => run.stage === "primary" && run.operations > 0);
  const outcomeValue = primaryRun?.detail?.outcome;
  const outcome = outcomeValue === "PRIMARY SOURCE FOUND" || outcomeValue === "PRIMARY SOURCE NOT FOUND" ? outcomeValue : null;
  const matched = input.runs.find((run) => run.hash === hash);
  const outsideRaw = matched?.detail?.outside;
  const outside = Array.isArray(outsideRaw)
    ? outsideRaw.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const row = item as { url?: unknown; reason?: unknown };
        if (typeof row.url !== "string" || typeof row.reason !== "string") return [];
        return [{ url: row.url, reason: row.reason }];
      }).slice(0, 8)
    : [];
  const quality = evidenceQuality({ authority: primary.authority, primaryDomains: primary.domains, sources: input.sources });
  const directDomains = input.stored.direct?.domains ?? [];
  return {
    claimId: input.claimId,
    claim: input.claim,
    pillar: input.pillar,
    statementKind: input.statementKind,
    claimTypes: input.claimTypes,
    questions: input.stored.questions,
    searches: input.stored.searches,
    sourceCategories: input.categories,
    stage: input.stored.stage,
    stageLabel: stageLabel(input.stored.stage),
    authority: input.stored.authority,
    domains: input.stored.domains,
    maxSearchOperations: researchLimits.maxSearchesPerRun,
    maxDocumentOperations: researchLimits.maxDocumentsPerRun,
    providerName: input.providerName,
    providerId: input.providerId,
    providerConfigured: input.configured,
    credential: input.credential,
    hash,
    awaitingReview: input.stored.awaitingReview,
    alreadyRun,
    outcome,
    nextStage: alreadyRun && !input.stored.awaitingReview ? nextStage(input.stored.stage) : null,
    quality,
    problems: problemReadings(input.stored.questions, quality.label),
    directNote: directDomains.length
      ? `Search results stay on ${directDomains.join(", ")}. A result is not opened unless you choose it. Choosing a result fetches that address directly and does not run another search.`
      : "This stage does not open an official site directly.",
    outside,
  };
}

async function contextFor(claimId: string) {
  const db = serviceClient();
  if (!db) return null;
  const rich = await db.from("claims").select("id, claim_text, content_pillar, statement_kind, claim_types, research_plan").eq("id", claimId).maybeSingle();
  let claim = rich.data;
  let writable = true;
  if (rich.error && columnMissing(rich.error.message)) {
    const plain = await db.from("claims").select("id, claim_text, content_pillar, statement_kind, claim_types").eq("id", claimId).maybeSingle();
    if (plain.error || !plain.data) return null;
    claim = { ...plain.data, research_plan: null };
    writable = false;
  } else if (rich.error || !rich.data) return null;
  if (!claim) return null;
  const pillar: Pillar = claim.content_pillar === "football" || claim.content_pillar === "finance" ? claim.content_pillar : "politics";
  const statementKind: StatementKind =
    claim.statement_kind === "opinion" || claim.statement_kind === "analysis" || claim.statement_kind === "fact"
      ? claim.statement_kind
      : inferStatementKind(pillar, claim.claim_text);
  const storedTypes = (claim.claim_types ?? []).filter((item: unknown): item is ClaimType => typeof item === "string" && claimTypes.has(item as ClaimType));
  const types = storedTypes.length ? storedTypes : inferClaimTypes(claim.claim_text, pillar);
  const categories = await sourceCategories(pillar);
  const keys = researchKeys();
  const budget = researchBudget();
  const month = await researchMonthTotals();
  const choice = chooseProvider({
    preference: budget.preference,
    tavilyConfigured: keys.tavily,
    braveConfigured: keys.brave,
    tavilyUsed: month.tavily,
    braveUsed: month.brave,
    tavilyCeiling: budget.tavilyCeiling,
    braveCeiling: budget.braveCeiling,
    intent: "auto",
  });
  const providerId: ResearchProviderId = choice.ok ? choice.provider : budget.preference;
  const listed = searchProvider();
  const providerName = providerId === "brave" ? "Brave Search" : "Tavily";
  const evidence = await db.from("evidence").select("sources ( domain, url, tier_rank )").eq("claim_id", claimId);
  const sources = (evidence.data ?? []).flatMap((row) => {
    const source = Array.isArray(row.sources) ? row.sources[0] : row.sources;
    if (!source) return [];
    const domain = typeof source.domain === "string" && source.domain
      ? source.domain
      : typeof source.url === "string"
        ? hostname(source.url) || ""
        : "";
    return [{ domain, tierRank: typeof source.tier_rank === "number" ? source.tier_rank : 4 }];
  });
  const runQuery = await db.from("research_runs").select("plan_hash, provider, status, operations_used, stage, detail, started_at").eq("claim_id", claimId).order("started_at", { ascending: false });
  const runs: RunRecord[] = runQuery.error
    ? []
    : (runQuery.data ?? []).map((row) => ({
        hash: typeof row.plan_hash === "string" ? row.plan_hash : null,
        provider: typeof row.provider === "string" ? row.provider : null,
        status: row.status as string,
        operations: typeof row.operations_used === "number" ? row.operations_used : 0,
        stage: typeof row.stage === "string" ? row.stage : null,
        detail: asDetail(row.detail),
      }));
  return {
    claimId,
    claim: claim.claim_text as string,
    pillar,
    statementKind,
    types,
    categories,
    stored: readStoredPlan(claim.research_plan),
    writable,
    providerId,
    providerName,
    configured: listed.configured,
    credential: listed.credential,
    runs,
    sources,
  };
}

function freshPlan(ctx: NonNullable<Awaited<ReturnType<typeof contextFor>>>, stage: SearchStage, cursor: number, awaitingReview: boolean) {
  return composeStoredPlan({
    claim: ctx.claim,
    pillar: ctx.pillar,
    claimTypes: ctx.types,
    categories: ctx.categories,
    stage,
    providerId: ctx.providerId,
    cursor,
    maxOperations: researchLimits.maxSearchesPerRun,
    awaitingReview,
  });
}

export async function loadPlan(claimId: string): Promise<ResearchPlan | null> {
  const ctx = await contextFor(claimId);
  if (!ctx) return null;
  let stored = ctx.stored && ctx.stored.claim === ctx.claim ? ctx.stored : null;
  if (!stored) {
    stored = freshPlan(ctx, "primary", 0, Boolean(ctx.stored));
    if (ctx.writable) await savePlan(claimId, stored);
  }
  return present({ ...ctx, stored, claimTypes: ctx.types });
}

export async function loadStoredPlan(claimId: string) {
  const ctx = await contextFor(claimId);
  if (!ctx) return null;
  let stored = ctx.stored && ctx.stored.claim === ctx.claim ? ctx.stored : null;
  if (!stored) {
    stored = freshPlan(ctx, "primary", 0, false);
    if (ctx.writable) await savePlan(claimId, stored);
  }
  return { ...ctx, stored };
}

export async function reviseResearchPlan(claimId: string, action: "change" | "advance" | "accept") {
  const loaded = await loadStoredPlan(claimId);
  if (!loaded) return { ok: false as const, message: "That claim is not on the desk." };
  if (!loaded.writable) return { ok: false as const, message: "The research plan could not be stored. No search was sent." };
  if (action === "accept") {
    const next = { ...loaded.stored, awaitingReview: false };
    await savePlan(claimId, next);
    return { ok: true as const, message: "This plan is the one Begin research will run. No search was sent." };
  }
  if (action === "advance") {
    const hash = hashOfPlan(loaded.stored, loaded.providerId);
    const ran = runAlreadyCompleted({ hash, provider: loaded.providerId, runs: loaded.runs });
    const following = nextStage(loaded.stored.stage);
    if (!ran) return { ok: false as const, message: "Run this stage before opening the next one. No search was sent." };
    if (!following) return { ok: false as const, message: "There is no later source tier. No search was sent." };
    const next = freshPlan(loaded, following, 0, true);
    await savePlan(claimId, next);
    return { ok: true as const, message: "The next source tier is on the plan. Review it before another search. No search was sent." };
  }
  const rotated = freshPlan(loaded, loaded.stored.stage, loaded.stored.cursor + loaded.stored.searches.length, true);
  if (samePlan({ ...rotated, awaitingReview: true }, { ...loaded.stored, awaitingReview: true })) {
    return { ok: true as const, message: "The query list has no further variant. No search was sent." };
  }
  await savePlan(claimId, rotated);
  return { ok: true as const, message: "The plan changed. Review it before another search. No search was sent." };
}
