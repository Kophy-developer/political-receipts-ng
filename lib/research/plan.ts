import "server-only";
import { inferClaimTypes, inferStatementKind, questionsFor } from "@/lib/research/claim-types";
import { researchLimits } from "@/lib/research/limits";
import { searchProvider } from "@/lib/research/provider";
import type { ClaimType, Pillar, ResearchPlan, SourceCategory, StatementKind } from "@/lib/research/types";
import { serviceClient } from "@/lib/db/client";

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

export function tierForHost(domain: string, categories: SourceCategory[]) {
  const host = domain.replace(/^www\./, "").toLowerCase();
  const ranked = [...categories].sort((left, right) => left.rank - right.rank);
  for (const category of ranked) {
    if (category.domains.some((item) => host === item || host.endsWith(`.${item}`))) return category;
  }
  return ranked.find((category) => category.rank === 4) ?? { rank: 4, name: "Context", notes: "", domains: [] as string[] };
}

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

export async function buildPlan(input: {
  claimId: string;
  claim: string;
  pillar: Pillar;
  statementKind: StatementKind;
  claimTypes: ResearchPlan["claimTypes"];
}): Promise<ResearchPlan> {
  const provider = searchProvider();
  const categories = await sourceCategories(input.pillar);
  return {
    ...input,
    questions: questionsFor(input.claimTypes, input.pillar).map((item) => item.question),
    sourceCategories: categories,
    maxSearchOperations: researchLimits.maxSearchesPerRun,
    providerName: provider.name,
    providerConfigured: provider.configured,
    credential: provider.credential,
  };
}

export async function loadPlan(claimId: string): Promise<ResearchPlan | null> {
  const db = serviceClient();
  if (!db) return null;
  const claim = await db
    .from("claims")
    .select("id, claim_text, content_pillar, statement_kind, claim_types")
    .eq("id", claimId)
    .maybeSingle();
  if (claim.error || !claim.data) return null;
  const pillar: Pillar = claim.data.content_pillar === "football" || claim.data.content_pillar === "finance" ? claim.data.content_pillar : "politics";
  const statementKind: StatementKind =
    claim.data.statement_kind === "opinion" || claim.data.statement_kind === "analysis" || claim.data.statement_kind === "fact"
      ? claim.data.statement_kind
      : inferStatementKind(pillar, claim.data.claim_text);
  const stored = (claim.data.claim_types ?? []).filter((item: unknown): item is ClaimType => typeof item === "string" && claimTypes.has(item as ClaimType));
  return buildPlan({
    claimId,
    claim: claim.data.claim_text,
    pillar,
    statementKind,
    claimTypes: stored.length ? stored : inferClaimTypes(claim.data.claim_text, pillar),
  });
}
