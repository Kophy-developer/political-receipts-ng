import "server-only";
import type { UsageView } from "@/lib/desk/types";
import { columnMissing, schemaMissing, scrubDbMessage, serviceClient } from "@/lib/db/client";
import { lagosDayLabel, lagosDayStart, publishedRates, scanLimits, usd } from "@/lib/intel/limits";
import { billingPeriodStart } from "@/lib/research/choose";
import { researchBudget, researchLimits } from "@/lib/research/limits";
import { researchKeys, searchProvider } from "@/lib/research/provider";

export type UsageTotals = {
  xRequests: number;
  posts: number;
  geminiRequests: number;
  inputTokens: number;
  outputTokens: number;
  searches: number;
  retrievals: number;
};

const emptyTotals: UsageTotals = { xRequests: 0, posts: 0, geminiRequests: 0, inputTokens: 0, outputTokens: 0, searches: 0, retrievals: 0 };

export async function usageSince(startIso: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, reason: "unconfigured" as const, totals: emptyTotals };
  const { data, error } = await db
    .from("api_usage")
    .select("provider, requests, units, input_tokens, output_tokens")
    .gte("occurred_at", startIso);
  if (error) {
    return {
      ok: false as const,
      reason: schemaMissing(error.message) ? ("schema" as const) : ("unreachable" as const),
      message: scrubDbMessage(error.message),
      totals: emptyTotals,
    };
  }
  const totals = { ...emptyTotals };
  for (const row of data ?? []) {
    const requests = typeof row.requests === "number" ? row.requests : 0;
    const units = typeof row.units === "number" ? row.units : 0;
    if (row.provider === "x") {
      totals.xRequests += requests;
      totals.posts += units;
    }
    if (row.provider === "gemini") {
      totals.geminiRequests += requests;
      totals.inputTokens += typeof row.input_tokens === "number" ? row.input_tokens : 0;
      totals.outputTokens += typeof row.output_tokens === "number" ? row.output_tokens : 0;
    }
    if (row.provider === "search" || row.provider === "tavily" || row.provider === "brave") totals.searches += requests;
    if (row.provider === "retrieval") totals.retrievals += requests;
  }
  return { ok: true as const, totals };
}

export async function recordUsage(input: {
  provider: "x" | "gemini" | "search" | "retrieval" | "tavily" | "brave";
  operation: string;
  requests: number;
  units: number;
  inputTokens?: number | null;
  outputTokens?: number | null;
  scanId?: string | null;
  selectionReason?: string | null;
  fallbackReason?: string | null;
  creditsReported?: number | null;
  targetTier?: string | null;
  targetDomains?: string[] | null;
  resultsReturned?: number | null;
  inDomainResults?: number | null;
  outOfDomainResults?: number | null;
  documentsSelected?: number | null;
  primarySourcesFound?: number | null;
  editorAccepted?: number | null;
}) {
  const db = serviceClient();
  if (!db) return { ok: false as const, id: null };
  const row = {
    provider: input.provider,
    operation: input.operation,
    requests: input.requests,
    units: input.units,
    input_tokens: input.inputTokens ?? null,
    output_tokens: input.outputTokens ?? null,
    scan_id: input.scanId ?? null,
    selection_reason: input.selectionReason ?? null,
    fallback_reason: input.fallbackReason ?? null,
    credits_reported: input.creditsReported ?? null,
    target_tier: input.targetTier ?? null,
    target_domains: input.targetDomains ?? null,
    results_returned: input.resultsReturned ?? null,
    in_domain_results: input.inDomainResults ?? null,
    out_of_domain_results: input.outOfDomainResults ?? null,
    documents_selected: input.documentsSelected ?? null,
    primary_sources_found: input.primarySourcesFound ?? null,
    editor_accepted: input.editorAccepted ?? null,
  };
  const inserted = await db.from("api_usage").insert(row).select("id").single();
  if (inserted.error && columnMissing(inserted.error.message)) {
    const plain = await db.from("api_usage").insert({
      provider: row.provider,
      operation: row.operation,
      requests: row.requests,
      units: row.units,
      input_tokens: row.input_tokens,
      output_tokens: row.output_tokens,
      scan_id: row.scan_id,
      selection_reason: row.selection_reason,
      fallback_reason: row.fallback_reason,
      credits_reported: row.credits_reported,
    }).select("id").single();
    return { ok: !plain.error, id: (plain.data?.id as string | undefined) ?? null };
  }
  return { ok: !inserted.error, id: (inserted.data?.id as string | undefined) ?? null };
}

const spendNote = `ESTIMATED from recorded post reads at the ${publishedRates.asOf} published rate of ${usd(publishedRates.postReadUsd)} per post. X has not provided a billed amount.`;

async function postReadUnits(sinceIso?: string) {
  const db = serviceClient();
  if (!db) return null;
  let query = db.from("api_usage").select("units").eq("provider", "x").eq("operation", "search_recent");
  if (sinceIso) query = query.gte("occurred_at", sinceIso);
  const { data, error } = await query;
  if (error) return null;
  return (data ?? []).reduce((sum, row) => sum + (typeof row.units === "number" ? row.units : 0), 0);
}

function spendLabel(units: number | null) {
  if (units === null) return "Not available";
  return usd(units * publishedRates.postReadUsd);
}

function durationLabel(value: number | null) {
  if (value === null || !Number.isFinite(value)) return null;
  if (value < 1000) return `${value} ms`;
  return `${(value / 1000).toFixed(1)} s`;
}

export async function usageView(): Promise<UsageView> {
  const base: UsageView = {
    installed: false,
    dayLabel: lagosDayLabel(),
    xRequests: 0,
    xRequestLimit: scanLimits.dailyXRequests,
    posts: 0,
    postLimit: scanLimits.dailyPosts,
    geminiRequests: 0,
    geminiLimit: scanLimits.dailyGeminiRequests,
    inputTokens: null,
    outputTokens: null,
    lastDuration: null,
    groups: 0,
    perScanPosts: scanLimits.maxPostsPerScan,
    perScanRequests: scanLimits.maxXRequestsPerScan,
    lookbackHours: scanLimits.lookbackHours,
    minEngagement: scanLimits.minEngagement,
    estimatedXSpendToday: "Not available",
    estimatedXSpendAll: "Not available",
    spendLabel: "ESTIMATED",
    spendNote,
    searches: 0,
    searchLimit: researchLimits.dailySearches,
    retrievals: 0,
    retrievalLimit: researchLimits.dailyRetrievals,
    searchProvider: "Tavily",
    searchCredential: "TAVILY_API_KEY",
    researchPeriod: "Not available",
    tavilyUsed: 0,
    tavilyRemaining: 900,
    tavilyCeiling: 900,
    braveUsed: 0,
    braveRemaining: 900,
    braveCeiling: 900,
    researchRuns: 0,
    researchDocuments: 0,
    researchCostNote: "Research allowances are not loaded.",
    tavilyConfigured: false,
    braveConfigured: false,
  };
  const db = serviceClient();
  if (!db) return base;
  const usage = await usageSince(lagosDayStart());
  if (!usage.ok) return base;
  base.installed = true;
  base.xRequests = usage.totals.xRequests;
  base.posts = usage.totals.posts;
  base.geminiRequests = usage.totals.geminiRequests;
  base.inputTokens = usage.totals.inputTokens;
  base.outputTokens = usage.totals.outputTokens;
  const [{ count }, last] = await Promise.all([
    db.from("search_groups").select("id", { count: "exact", head: true }).eq("enabled", true),
    db.from("scan_runs").select("duration_ms").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  base.groups = count ?? 0;
  base.lastDuration = durationLabel(typeof last.data?.duration_ms === "number" ? last.data.duration_ms : null);
  const [todayUnits, allUnits] = await Promise.all([postReadUnits(lagosDayStart()), postReadUnits()]);
  base.estimatedXSpendToday = spendLabel(todayUnits);
  base.estimatedXSpendAll = spendLabel(allUnits);
  base.searches = usage.totals.searches;
  base.retrievals = usage.totals.retrievals;
  const provider = searchProvider();
  base.searchProvider = provider.name;
  base.searchCredential = provider.credential;
  const month = await researchMonthView();
  base.researchPeriod = month.period;
  base.tavilyUsed = month.tavilyUsed;
  base.tavilyRemaining = month.tavilyRemaining;
  base.tavilyCeiling = month.tavilyCeiling;
  base.braveUsed = month.braveUsed;
  base.braveRemaining = month.braveRemaining;
  base.braveCeiling = month.braveCeiling;
  base.researchRuns = month.runs;
  base.researchDocuments = month.documents;
  base.researchCostNote = month.costNote;
  base.tavilyConfigured = month.tavilyConfigured;
  base.braveConfigured = month.braveConfigured;
  return base;
}

export async function researchMonthTotals() {
  const budget = researchBudget();
  const start = billingPeriodStart(new Date(), budget.billingDay);
  const empty = { tavily: 0, brave: 0, documents: 0, runs: 0, start };
  const db = serviceClient();
  if (!db) return empty;
  const [usage, runs] = await Promise.all([
    db.from("api_usage").select("provider, units").gte("occurred_at", start).in("provider", ["tavily", "brave", "retrieval"]),
    db.from("research_runs").select("id", { count: "exact", head: true }).gte("started_at", start),
  ]);
  let tavily = 0;
  let brave = 0;
  let documents = 0;
  for (const row of usage.data ?? []) {
    const units = typeof row.units === "number" ? row.units : 0;
    if (row.provider === "tavily") tavily += units;
    if (row.provider === "brave") brave += units;
    if (row.provider === "retrieval") documents += units;
  }
  return { tavily, brave, documents, runs: runs.count ?? 0, start };
}

async function researchMonthView() {
  const budget = researchBudget();
  const keys = researchKeys();
  const month = await researchMonthTotals();
  const start = new Date(month.start);
  const period = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(start);
  return {
    period: `${period} UTC`,
    tavilyUsed: month.tavily,
    tavilyRemaining: Math.max(0, budget.tavilyCeiling - month.tavily),
    tavilyCeiling: budget.tavilyCeiling,
    braveUsed: month.brave,
    braveRemaining: Math.max(0, budget.braveCeiling - month.brave),
    braveCeiling: budget.braveCeiling,
    runs: month.runs,
    documents: month.documents,
    tavilyConfigured: keys.tavily,
    braveConfigured: keys.brave,
    costNote: "Ceilings are application credits for this billing period. A dollar amount is not invented. The period starts on RESEARCH_BILLING_DAY (UTC), which should match the provider reset day.",
  };
}
